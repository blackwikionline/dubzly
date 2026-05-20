# Anime AI Dub

Chrome extension that mutes the original Japanese audio on a Crunchyroll episode and overlays an AI-generated voice dub from the existing English subtitle track, with a distinct voice per character.

**Status:** working prototype. Core loop verified end-to-end (extension captures subtitle config → fetches subtitle file → renders TTS via backend → plays in sync with the video, with different voices per speaker, on both DOM-rendered and canvas-rendered shows). Auth, billing, and shared-cache layers are scaffolded but not yet wired.

## How it works (30 seconds)

1. A page-main-world script in the extension intercepts the authenticated `/playback/v3/.../play` response Crunchyroll's player fetches.
2. The extension fetches the referenced subtitle file (WebVTT or ASS) and parses it, including the per-line speaker name.
3. A scheduler renders each cue's text through ElevenLabs (or macOS `say` as a dev fallback), keyed by `hash(speaker) → voice` so each character gets a consistent voice.
4. The extension mutes the original `<video>` audio and plays the synthesized audio in sync with `video.currentTime`.

The user can override any character's voice from the popup. No re-fetches of authenticated Crunchyroll APIs — we observe the player's own responses.

## Quick start

```bash
# Backend
python3 -m venv backend/.venv
backend/.venv/bin/pip install -e backend
backend/.venv/bin/uvicorn app.main:app --app-dir backend --reload --port 8000

# Extension (in another terminal)
npm install --prefix extension
npm run dev --prefix extension

# Load the extension
# Chrome → chrome://extensions → Developer mode → Load unpacked → pick extension/dist/

# Use it
# Sign in to Crunchyroll, open any subtitled episode, press play.
# Open DevTools Console (filter "anime-dub") to watch cue rendering.
# Open the extension popup to pick voices per character.
```

ElevenLabs is optional. Without a key the backend falls back to macOS `say` so you can hear the dub working without paying anything. Paste an ElevenLabs key in the popup for real voice quality.

## Docs

| File | What's in it |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, dependencies, services, PlantUML diagrams of the runtime, repo layout, key design decisions |
| [BUILD.md](BUILD.md) | Prereqs, install, watch vs production builds, loading in Chrome, known gotchas (Vite + MV3, crxjs manifest cache) |
| [DEPLOY.md](DEPLOY.md) | Production deployment plan (Fly.io backend, Cloudflare R2 audio, Supabase auth, Stripe billing, Chrome Web Store) — aspirational |
| [TEST.md](TEST.md) | Backend curl smoke tests, end-to-end test paths per show type, voice-override + pause/seek paths, failure signature table |

## Stack

- **Extension**: TypeScript + Vite + `@crxjs/vite-plugin` (Chrome MV3 with a `world: "MAIN"` content script for intercepting the page's `fetch`)
- **Backend**: Python 3.12 + FastAPI + httpx
- **TTS**: ElevenLabs API (production) + macOS `say` (dev fallback)
- **Planned**: Supabase (auth + Postgres), Stripe (metered billing), Cloudflare R2 (per-user audio cache)

## Repository layout

```
anime/
├── README.md
├── ARCHITECTURE.md
├── BUILD.md
├── DEPLOY.md
├── TEST.md
├── backend/           ← FastAPI service (TTS rendering, voice listing)
└── extension/         ← Chrome MV3 extension (capture, parse, schedule, play)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full layout.

## Legal posture

The extension is a personal-use tool that observes the authenticated subtitle stream a viewer is already entitled to and produces a voice-over for that single viewer's session. Audio renders are intended to be cached per-user (never cross-user) if/when the cache layer ships, to keep the artifact 1-to-1 with the user's own playback rather than a shared derivative work. ElevenLabs key is per-user (popup-stored) so each viewer pays for their own TTS.

## Roadmap

Near-term:

- Per-user audio cache (Cloudflare R2)
- ElevenLabs model toggle in popup (currently hardcoded to `eleven_v3`)
- Language-grouped voice dropdowns (`say` lists 170+ voices, currently flat)
- Cue/render duration mismatch handling (time-stretch or window-extend when TTS is longer than the cue's screen time)

Mid-term (multi-user SaaS):

- Supabase Auth + per-user data isolation (RLS)
- Stripe metered billing on character count
- Chrome Web Store publishing

Long-term (v2):

- ASR + speaker diarization on the Japanese audio, so dubs work on shows whose subs are missing or use empty speaker labels
- Per-show voice mapping memory (so "Aki" in show A and "Aki" in show B can have different overrides)
