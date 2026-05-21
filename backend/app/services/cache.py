"""Content-addressed audio cache backed by S3.

Cache key = sha256(provider|model|voice|text). TTS output is deterministic
for the same inputs, so identical (provider, model, voice, text) tuples
across different users / re-watches all share a single render.

Degrades gracefully when S3_AUDIO_CACHE_BUCKET is unset: `get_cached`
returns None and `put_cached` is a no-op, so the renderer behaves as
before (every cue hits the upstream provider)."""

from __future__ import annotations

import asyncio
import hashlib
import logging
from functools import lru_cache

import boto3
from botocore.exceptions import ClientError

from app.config import get_settings

logger = logging.getLogger(__name__)


def cache_key(text: str, voice_id: str, model_id: str, provider: str) -> str:
    raw = f"{provider}|{model_id}|{voice_id}|{text}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _key_path(digest: str) -> str:
    # Two-level prefix spread improves S3 request throughput on hot keys.
    return f"audio/{digest[:2]}/{digest[2:4]}/{digest}.bin"


@lru_cache(maxsize=1)
def _client():
    return boto3.client("s3")


async def get_cached(digest: str) -> tuple[bytes, str, str] | None:
    """Return (bytes, content_type, provider) if cached, else None."""
    bucket = get_settings().s3_audio_cache_bucket
    if not bucket:
        return None
    key = _key_path(digest)
    try:
        resp = await asyncio.to_thread(_client().get_object, Bucket=bucket, Key=key)
        body = resp["Body"].read()
        meta = resp.get("Metadata") or {}
        return body, meta.get("content-type", "audio/mpeg"), meta.get("provider", "unknown")
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in {"NoSuchKey", "404", "AccessDenied"}:
            return None
        logger.warning("cache get failed for %s: %s", digest[:12], code)
        return None
    except Exception:
        logger.exception("unexpected cache get error for %s", digest[:12])
        return None


async def put_cached(digest: str, data: bytes, content_type: str, provider: str) -> None:
    bucket = get_settings().s3_audio_cache_bucket
    if not bucket:
        return
    key = _key_path(digest)
    try:
        await asyncio.to_thread(
            _client().put_object,
            Bucket=bucket,
            Key=key,
            Body=data,
            Metadata={"content-type": content_type, "provider": provider},
        )
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        logger.warning("cache put failed for %s: %s", digest[:12], code)
    except Exception:
        logger.exception("unexpected cache put error for %s", digest[:12])
