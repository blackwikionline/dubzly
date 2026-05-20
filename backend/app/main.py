from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes import cues, presets, voices

settings = get_settings()

app = FastAPI(title="Anime Dub API", version="0.1.0")

allowed_origins = [o for o in [settings.extension_origin] if o]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["*"],
    allow_credentials=bool(allowed_origins),
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Episode-Id", "X-Cue-Index", "X-Cue-Start", "X-Cue-End", "X-Provider"],
)

app.include_router(cues.router)
app.include_router(voices.router)
app.include_router(presets.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.app_env}
