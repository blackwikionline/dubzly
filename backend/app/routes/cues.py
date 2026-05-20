from typing import Literal

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.services.tts import render_cue

router = APIRouter(prefix="/cues", tags=["cues"])

Provider = Literal["elevenlabs", "say", "auto"]


class CueRenderRequest(BaseModel):
    episode_id: str = Field(..., min_length=1)
    index: int = Field(..., ge=0)
    text: str = Field(..., min_length=1)
    start: float = Field(..., ge=0)
    end: float = Field(..., gt=0)
    provider: Provider = "auto"
    speaker: str | None = None
    voice_id: str | None = None


@router.post("/render")
async def render(
    req: CueRenderRequest,
    x_elevenlabs_key: str | None = Header(default=None),
) -> Response:
    duration = req.end - req.start
    if duration <= 0:
        raise HTTPException(status_code=422, detail="end must be greater than start")
    audio = await render_cue(
        text=req.text,
        duration_seconds=duration,
        provider=req.provider,
        elevenlabs_api_key_override=x_elevenlabs_key,
        speaker=req.speaker,
        voice_id_override=req.voice_id,
    )
    return Response(
        content=audio.data,
        media_type=audio.content_type,
        headers={
            "X-Episode-Id": req.episode_id,
            "X-Cue-Index": str(req.index),
            "X-Cue-Start": str(req.start),
            "X-Cue-End": str(req.end),
            "X-Provider": audio.provider,
        },
    )
