# Test

How to verify the system works at each layer. Currently all testing is manual; automated test suite is a follow-up.

## Layer 1: backend smoke tests

With the backend running (`uvicorn ... --reload --port 8000`):

```bash
# Health
curl -sS http://127.0.0.1:8000/health
# → {"status":"ok","env":"development"}

# Render one cue with macOS say fallback (no key needed)
curl -sS -X POST http://127.0.0.1:8000/cues/render \
  -H "Content-Type: application/json" \
  -o /tmp/cue.wav -w "%{http_code} %{content_type} %{size_download}\n" \
  -d '{"episode_id":"TEST","index":0,"text":"Hello world.","start":0,"end":2.0,"provider":"say"}'
# → 200 audio/wav <bytes>
file /tmp/cue.wav
# → RIFF (little-endian) data, WAVE audio, ...
afplay /tmp/cue.wav     # should hear "Hello world."

# Render with ElevenLabs (popup-supplied key — no .env needed)
curl -sS -X POST http://127.0.0.1:8000/cues/render \
  -H "Content-Type: application/json" \
  -H "X-Elevenlabs-Key: sk_your_key" \
  -o /tmp/cue.mp3 -w "%{http_code} %{content_type} %{size_download}\n" \
  -d '{"episode_id":"TEST","index":0,"text":"Hello world.","start":0,"end":2.0,"provider":"elevenlabs"}'
afplay /tmp/cue.mp3

# Per-character voice mapping (same speaker → same voice every time)
for run in 1 2; do
  curl -sS -X POST http://127.0.0.1:8000/cues/render \
    -H "Content-Type: application/json" \
    -o "/tmp/aki_$run.wav" -w "%{http_code} provider=$(echo)\n" \
    -D - \
    -d '{"episode_id":"T","index":0,"text":"Hi","start":0,"end":1,"provider":"say","speaker":"Aki"}' \
    | grep X-Provider
done

# Voice listing
curl -sS "http://127.0.0.1:8000/voices?provider=say" | python3 -m json.tool | head -20
curl -sS "http://127.0.0.1:8000/voices?provider=elevenlabs" \
  -H "X-Elevenlabs-Key: sk_your_key" | python3 -m json.tool | head -20
```

Expected: all returns 200, audio playback works, same speaker name produces same audio bytes across runs.

## Layer 2: subtitle parser unit checks

Quick in-Node sanity check (no test framework yet):

```bash
node -e "
const { parseAss, parseVtt } = require('./extension/src/lib/subtitle.ts');
" 2>&1 || echo "(no Node runner for TS; use ts-node or skip)"
```

Until we wire vitest, hand-verify by watching the content-script Console log:

```
[anime-dub] parsed 332 cues (303 after filtering signs) for episode GE...
[anime-dub] dialogue speakers: ['Narrator','Aki','Joe', ...]
```

Sanity-check that:

- Total parsed count is "lots" (hundreds, not 0)
- Filtered count is lower than total (because sign cues are dropped)
- Speakers list contains real character names

## Layer 3: extension end-to-end

Steady-state flow on a real episode.

### Setup

1. Backend running (`uvicorn ... :8000`)
2. Extension watch build running (`npm run dev --prefix extension`)
3. Extension loaded in Chrome via `chrome://extensions` → Load unpacked → `extension/dist/`
4. Crunchyroll signed in to your account
5. (Optional) ElevenLabs API key pasted into popup

### Test path A — canvas-rendered (.ass) show

A show like *Meeting of the Braves* (URL has `JAJP` suffix).

1. Open the episode in a fresh tab
2. Open DevTools → Console → filter `anime-dub`
3. Press play

Expected Console output, in order:

```
[anime-dub] content script loaded on ...
[anime-dub] settings loaded; provider: say
[anime-dub] subtitle: en-US (ass) https://vod-fy.crunchyrollcdn.com/.../subtitle-...ass
[anime-dub] parsed 332 cues (303 after filtering signs) for episode ...
[anime-dub] dialogue speakers: [...]
[anime-dub] scheduler started for ...
```

Then on the audio:

- Original Japanese audio is **muted** (volume slider in player still works but you hear nothing from the original)
- Within ~1 second of each subtitle appearing on screen, you hear the synthesized voice
- Distinct characters get distinct voices

### Test path B — DOM-rendered (.vtt) show

A show like *The Beginning After the End* (URL with `ENUS` suffix). Same expected flow, but the subtitle file is `closed-caption-...vtt` instead of `subtitle-...ass`, and the parser logs format `vtt` instead of `ass`.

### Test path C — voice override

1. Let the show play long enough to populate the popup's character list
2. Open popup → pick a different voice for one character (e.g. Aki → Adam · deep male)
3. Seek to a moment **before** that character's next line, press play
4. When Aki next speaks, you should hear the new voice. Already-rendered audio still uses the old voice (the override applies on next render, not retroactively).

### Test path D — pause / seek

1. Mid-cue, hit space to pause. Synthesized audio should pause too.
2. Hit space to resume. Audio resumes (may briefly overlap with next cue).
3. Click anywhere on the timeline to seek. In-flight audio stops; new cues at the new time start rendering.

## Common failure signatures

| Symptom | Likely cause | Fix |
|---|---|---|
| `Service worker registration failed. Status code: 3` or `15` | `vite dev` HMR (don't use it) or stale crxjs manifest cache | See BUILD.md "Known gotchas" |
| `playback config fetch failed Error: status 401` | Bug: extension is re-fetching `/playback/v3/.../play` instead of using injected response | Page-injector must run at `document_start`, world `MAIN`; verify in dist/manifest.json |
| `[anime-dub] no subtitle track in playback config` | Show only ships hard-subs / different language than `PREFERRED_LANGUAGES` | Adjust `PREFERRED_LANGUAGES` in `content/index.ts` |
| `[anime-dub] gave up waiting for video element` | Player didn't mount within 30s (slow Crunchyroll load, ad pre-roll) | Refresh tab; increase `waitForVideo` timeout if persistent |
| No `[anime-dub]` logs at all | Content script not injected — extension didn't reload after manifest change | Remove + Load unpacked in Chrome |
| Popup shows "No characters yet" indefinitely | Content script never wrote `currentSpeakers` — confirm the `[anime-dub] dialogue speakers` line appears in the page Console | Refresh Crunchyroll tab; check provider toggle hasn't broken cue parsing |
| Audio plays but lags badly | Network or ElevenLabs API slow | Drop to `say` provider; check backend `tail` of logs for slow POSTs |
| Same voice for every character | `speaker` field empty in the ASS — different show's subs may not use Name field | Check `[anime-dub] dialogue speakers` — if `[]` or `['Default']`, that show needs v2 ASR diarization |

## What's still untested (TODO)

- Automated unit tests for `subtitle.ts` parsers (use vitest)
- Backend pytest suite with httpx mocking ElevenLabs
- E2E test with Playwright loading the unpacked extension against a mocked Crunchyroll page
- Load test: render 500 cues in parallel; confirm scheduler concurrency cap holds
- Per-user cache test (when implemented): different users hitting same episode get separate renders
- Stripe metered billing test in test mode

These belong in a CI workflow before the project ships.
