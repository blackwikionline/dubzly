from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import presets as preset_store

router = APIRouter(prefix="/presets", tags=["presets"])

Provider = Literal["elevenlabs", "say", "auto"]


class PresetSummary(BaseModel):
    id: str
    slug: str
    name: str
    provider: Provider | None = None
    speakerCount: int
    author: str | None = None
    createdAt: str | None = None
    note: str | None = None
    downloads: int = 0


class PresetListResponse(BaseModel):
    slug: str
    presets: list[PresetSummary]
    totalCount: int


class UploadPresetRequest(BaseModel):
    slug: str = Field(..., min_length=1, max_length=128, pattern=r"^[a-z0-9][a-z0-9-]*$")
    name: str = Field(..., min_length=1, max_length=200)
    provider: Provider
    voiceOverrides: dict[str, str]
    metadata: dict[str, Any] | None = None


class UploadPresetResponse(BaseModel):
    id: str
    slug: str


@router.get("")
async def list_presets(slug: str, limit: int = 10) -> PresetListResponse:
    if limit < 1:
        limit = 1
    if limit > 50:
        limit = 50
    try:
        all_presets = preset_store.list_for_slug(slug)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return PresetListResponse(
        slug=slug,
        presets=[PresetSummary(**p) for p in all_presets[:limit]],
        totalCount=len(all_presets),
    )


@router.get("/{slug}/{preset_id}")
async def get_preset(slug: str, preset_id: str) -> dict[str, Any]:
    try:
        preset = preset_store.get_preset(slug, preset_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if preset is None:
        raise HTTPException(status_code=404, detail="preset not found")
    try:
        preset_store.increment_downloads(slug, preset_id)
    except Exception:
        pass
    return preset


@router.post("")
async def upload_preset(req: UploadPresetRequest) -> UploadPresetResponse:
    body = {
        "format": "anime-dub-preset",
        "version": 1,
        "name": req.name,
        "provider": req.provider,
        "voiceOverrides": req.voiceOverrides,
        "metadata": req.metadata or {},
    }
    try:
        preset_id = preset_store.save_preset(req.slug, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return UploadPresetResponse(id=preset_id, slug=req.slug)
