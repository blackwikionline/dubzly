"""File-based community preset store. Trivial to seed by hand, easy to swap
for Supabase/Postgres later."""

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PRESETS_DIR = Path(__file__).resolve().parents[2] / "presets"
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def _slug_dir(slug: str) -> Path:
    if not SLUG_RE.match(slug) or len(slug) > 128:
        raise ValueError(f"invalid slug: {slug!r}")
    return PRESETS_DIR / slug


def _ensure_dir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def _stats_path(slug: str, preset_id: str) -> Path:
    return _slug_dir(slug) / f"{preset_id}.stats.json"


def _read_downloads(slug: str, preset_id: str) -> int:
    path = _stats_path(slug, preset_id)
    if not path.exists():
        return 0
    try:
        return int(json.loads(path.read_text(encoding="utf-8")).get("downloads", 0))
    except Exception:
        return 0


def increment_downloads(slug: str, preset_id: str) -> int:
    path = _stats_path(slug, preset_id)
    current = _read_downloads(slug, preset_id)
    next_count = current + 1
    _ensure_dir(path.parent)
    path.write_text(json.dumps({"downloads": next_count}), encoding="utf-8")
    return next_count


def list_for_slug(slug: str) -> list[dict[str, Any]]:
    """Return summary objects (no voiceOverrides) for every preset on this slug,
    sorted by download count desc, then createdAt desc."""
    d = _slug_dir(slug)
    if not d.exists():
        return []
    out: list[dict[str, Any]] = []
    for f in d.glob("*.json"):
        if f.name.endswith(".stats.json"):
            continue
        try:
            preset = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        preset_id = f.stem
        out.append(
            {
                "id": preset_id,
                "slug": slug,
                "name": preset.get("name", "Untitled preset"),
                "provider": preset.get("provider"),
                "speakerCount": len(preset.get("voiceOverrides", {}) or {}),
                "author": (preset.get("metadata") or {}).get("author"),
                "createdAt": (preset.get("metadata") or {}).get("createdAt"),
                "note": (preset.get("metadata") or {}).get("note"),
                "downloads": _read_downloads(slug, preset_id),
            }
        )
    out.sort(
        key=lambda p: (p.get("downloads") or 0, p.get("createdAt") or ""),
        reverse=True,
    )
    return out


def get_preset(slug: str, preset_id: str) -> dict[str, Any] | None:
    d = _slug_dir(slug)
    path = d / f"{preset_id}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def save_preset(slug: str, preset: dict[str, Any]) -> str:
    d = _slug_dir(slug)
    _ensure_dir(d)
    preset_id = uuid.uuid4().hex[:12]
    metadata = dict(preset.get("metadata") or {})
    metadata.setdefault("createdAt", datetime.now(timezone.utc).isoformat())
    preset = {**preset, "metadata": metadata}
    path = d / f"{preset_id}.json"
    path.write_text(json.dumps(preset, indent=2, ensure_ascii=False), encoding="utf-8")
    return preset_id
