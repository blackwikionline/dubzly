import asyncio
import io
import os
import tempfile
import wave
from dataclasses import dataclass
from typing import Literal

import httpx

from app.config import get_settings
from app.services.cache import cache_key, get_cached, put_cached
from app.services.voices import pick_elevenlabs_voice, pick_say_voice

ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
ELEVENLABS_MODEL_ID = "eleven_v3"
SILENT_WAV_SAMPLE_RATE = 24000

SAY_BIN = "/usr/bin/say"
AFCONVERT_BIN = "/usr/bin/afconvert"

Provider = Literal["elevenlabs", "say", "auto"]


@dataclass
class RenderedAudio:
    data: bytes
    content_type: str
    provider: str
    cache_hit: bool = False


def _silent_wav(duration_seconds: float) -> bytes:
    num_samples = max(1, int(duration_seconds * SILENT_WAV_SAMPLE_RATE))
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SILENT_WAV_SAMPLE_RATE)
        w.writeframes(b"\x00\x00" * num_samples)
    return buf.getvalue()


async def _macos_say_wav(text: str, voice: str | None = None) -> bytes | None:
    if not (os.path.exists(SAY_BIN) and os.path.exists(AFCONVERT_BIN)):
        return None
    fd_aiff, aiff = tempfile.mkstemp(suffix=".aiff")
    fd_wav, wav = tempfile.mkstemp(suffix=".wav")
    os.close(fd_aiff)
    os.close(fd_wav)
    try:
        args = [SAY_BIN, "-o", aiff]
        if voice:
            args.extend(["-v", voice])
        args.append(text)
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        if proc.returncode != 0:
            return None
        proc = await asyncio.create_subprocess_exec(
            AFCONVERT_BIN, "-f", "WAVE", "-d", "LEI16", aiff, wav,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        if proc.returncode != 0:
            return None
        with open(wav, "rb") as f:
            return f.read()
    finally:
        for p in (aiff, wav):
            if os.path.exists(p):
                os.unlink(p)


async def _elevenlabs_call(text: str, api_key: str, voice_id: str) -> RenderedAudio:
    url = ELEVENLABS_TTS_URL.format(voice_id=voice_id)
    headers = {"xi-api-key": api_key, "accept": "audio/mpeg"}
    payload = {
        "text": text,
        "model_id": ELEVENLABS_MODEL_ID,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        return RenderedAudio(data=resp.content, content_type="audio/mpeg", provider="elevenlabs")


async def _from_cache(digest: str) -> RenderedAudio | None:
    cached = await get_cached(digest)
    if cached is None:
        return None
    data, content_type, provider = cached
    return RenderedAudio(data=data, content_type=content_type, provider=provider, cache_hit=True)


async def render_cue(
    text: str,
    duration_seconds: float,
    provider: Provider = "auto",
    elevenlabs_api_key_override: str | None = None,
    speaker: str | None = None,
    voice_id_override: str | None = None,
) -> RenderedAudio:
    settings = get_settings()

    # ----- ElevenLabs path -----
    if provider in ("elevenlabs", "auto"):
        api_key = elevenlabs_api_key_override or settings.elevenlabs_api_key
        if api_key:
            default_voice = settings.elevenlabs_default_voice_id or "21m00Tcm4TlvDq8ikWAM"
            voice_id = voice_id_override or pick_elevenlabs_voice(speaker, default=default_voice)
            digest = cache_key(text, voice_id, ELEVENLABS_MODEL_ID, "elevenlabs")

            hit = await _from_cache(digest)
            if hit is not None:
                return hit

            rendered = await _elevenlabs_call(text, api_key, voice_id)
            await put_cached(digest, rendered.data, rendered.content_type, rendered.provider)
            return rendered

        if provider == "elevenlabs":
            raise RuntimeError("ElevenLabs requested but no API key configured")

    # ----- macOS `say` path (dev only — no `say` binary in production container) -----
    if provider in ("say", "auto"):
        say_voice = voice_id_override or pick_say_voice(speaker) or ""
        digest = cache_key(text, say_voice, "say", "say")
        hit = await _from_cache(digest)
        if hit is not None:
            return hit

        say_bytes = await _macos_say_wav(text, voice=say_voice or None)
        if say_bytes is not None:
            rendered = RenderedAudio(data=say_bytes, content_type="audio/wav", provider="say")
            await put_cached(digest, rendered.data, rendered.content_type, rendered.provider)
            return rendered

    # ----- silent fallback (not cached — cheap to generate) -----
    return RenderedAudio(
        data=_silent_wav(duration_seconds),
        content_type="audio/wav",
        provider="silent",
    )
