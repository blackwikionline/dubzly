import asyncio
import os
from typing import Literal

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.config import get_settings

router = APIRouter(prefix="/voices", tags=["voices"])

ELEVENLABS_VOICES_URL = "https://api.elevenlabs.io/v1/voices"
SAY_BIN = "/usr/bin/say"

Provider = Literal["elevenlabs", "say"]


class VoiceItem(BaseModel):
    id: str
    label: str


class VoicesResponse(BaseModel):
    provider: Provider
    voices: list[VoiceItem]


def _format_elevenlabs_label(name: str, labels: dict[str, str] | None) -> str:
    if not labels:
        return name
    parts: list[str] = []
    for key in ("gender", "age", "accent", "description", "use case"):
        v = labels.get(key)
        if v:
            parts.append(v)
    if not parts:
        return name
    return f"{name} · {', '.join(parts)}"


async def _fetch_elevenlabs(api_key: str) -> list[VoiceItem]:
    headers = {"xi-api-key": api_key, "accept": "application/json"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(ELEVENLABS_VOICES_URL, headers=headers)
    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="ElevenLabs key invalid")
    resp.raise_for_status()
    raw = resp.json().get("voices", [])
    return [
        VoiceItem(
            id=v["voice_id"],
            label=_format_elevenlabs_label(v.get("name", v["voice_id"]), v.get("labels")),
        )
        for v in raw
        if v.get("voice_id")
    ]


async def _list_say_voices() -> list[VoiceItem]:
    if not os.path.exists(SAY_BIN):
        return []
    proc = await asyncio.create_subprocess_exec(
        SAY_BIN, "-v", "?",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    stdout, _ = await proc.communicate()
    if proc.returncode != 0:
        return []
    voices: list[VoiceItem] = []
    for line in stdout.decode("utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line:
            continue
        # Lines look like:  "Albert              en_US    # Hello! My name is Albert."
        before_comment = line.split("#", 1)[0].rstrip()
        parts = before_comment.split()
        if len(parts) < 2:
            continue
        locale = parts[-1]
        name = " ".join(parts[:-1]).strip()
        voices.append(VoiceItem(id=name, label=f"{name} · {locale}"))
    return voices


@router.get("")
async def list_voices(
    provider: Provider,
    x_elevenlabs_key: str | None = Header(default=None),
) -> VoicesResponse:
    if provider == "elevenlabs":
        settings = get_settings()
        api_key = x_elevenlabs_key or settings.elevenlabs_api_key
        if not api_key:
            raise HTTPException(status_code=400, detail="ElevenLabs key required")
        return VoicesResponse(provider="elevenlabs", voices=await _fetch_elevenlabs(api_key))
    return VoicesResponse(provider="say", voices=await _list_say_voices())
