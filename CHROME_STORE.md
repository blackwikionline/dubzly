# Chrome Web Store submission — copy-paste pack

Everything you'll need to paste into the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## Pre-submission checklist

- [ ] Pay $5 one-time developer registration fee at https://chrome.google.com/webstore/devconsole
- [ ] Production build: `npm run build --prefix extension` → produces `extension/dist/`
- [ ] Zip the build: `cd extension && zip -r ../dubzly-v0.1.1.zip dist/` (the zip itself, not the dist folder)
- [ ] Take 1-5 screenshots (1280×800 PNG, see "Screenshots" section below)
- [ ] Have privacy policy URL ready: `https://dubzly.com/privacy.html`

## Listing fields

### Name
```
Dubzly — AI dub for subtitled anime
```

### Short description (max 132 chars)
```
Mutes Crunchyroll's audio and reads every subtitle aloud with a distinct AI voice per character. Bring your own ElevenLabs key.
```

### Detailed description
```
Dubzly is a Chrome extension that turns subtitled anime into auto-dubbed anime — without leaving the page.

When you play an episode on Crunchyroll, Dubzly:
• reads the subtitle file the player has already loaded
• sends each line to a text-to-speech service
• plays the synthesized audio in sync with the video, with a different voice for every named character
• mutes the original audio so you hear the dub cleanly

Key features:
✦ Per-character voices — Aki gets one voice, Joe gets another. Override any character from the popup.
✦ Save and share — export your voice mapping as JSON, or upload it to the community library so other viewers of the same show can load it in one click.
✦ Bring your own ElevenLabs key — paste it in the popup; it's stored locally in your browser. Skip the key and Dubzly falls back to a free synthesized voice.
✦ Works on both VTT and ASS subtitle formats.
✦ Open source — github.com/blackwikionline/dubzly

Privacy: settings are stored locally in your browser. Subtitle text is sent to the Dubzly backend only to render audio. Your ElevenLabs key is passed through per request; it is never stored server-side. See https://dubzly.com/privacy.html for full details.

Not affiliated with or endorsed by Crunchyroll, LLC.
```

### Category
- Primary: **Entertainment**
- Secondary: **Accessibility** (optional)

### Language
- English (United States)

### Single-purpose statement (required)
```
Dubzly's single purpose is to read aloud the subtitle track of a subtitled video on a supported streaming site (currently Crunchyroll), using AI-generated voices, so viewers can listen to anime instead of reading subtitles.
```

## Permission justifications

The dashboard asks you to justify each permission inline. Use these:

### `storage`
```
Stores user preferences (voice provider choice, optional ElevenLabs API key, per-character voice overrides, preset name) locally on the user's device via chrome.storage.local. Settings persist across browser restarts and never leave the device unless the user explicitly exports or uploads a preset.
```

### `activeTab`
```
Lets the popup UI know which Crunchyroll tab is active so it can display the character list and voice overrides for the show the user is currently watching.
```

### Host permission `https://www.crunchyroll.com/*`
```
Required to: (1) inject a content script on episode pages so we can read the subtitle stream the player has loaded, (2) read the video element's currentTime to schedule synthesized audio in sync, (3) mute the original video audio while the dub is active. The extension does not modify Crunchyroll's UI, capture login credentials, or transmit any account data.
```

### Host permission `https://*.crunchyrollcdn.com/*`
```
Required to fetch the subtitle file (e.g. closed-caption-*.vtt or subtitle-*.ass) from Crunchyroll's CDN host. The subtitle URL is provided by the player via a signed/HMAC-authenticated query string; the extension never reads any other CDN content.
```

### Host permission `https://api.dubzly.com/*`
```
Required to send each subtitle cue to Dubzly's text-to-speech backend, which forwards it to ElevenLabs (using the user-supplied API key passed in an X-Elevenlabs-Key header per request) and returns the generated audio. Same backend hosts the optional community preset library.
```

### MAIN-world content script
```
The page-injector content script (run_at document_start, world MAIN) hooks window.fetch and XMLHttpRequest in the page's JavaScript context to capture the playback configuration JSON that Crunchyroll's player has already fetched with its own auth token. This is the only way to read the subtitle URL list without re-authenticating against an endpoint that requires the player's bearer token. The hooked code only forwards specific Crunchyroll playback/v3 responses to the isolated content script via window.postMessage; it does not modify or block any page network traffic.
```

## Privacy practices form

Chrome asks you to declare what user data the extension handles. Check these boxes:

| Data type | Disclose? | Notes |
|---|---|---|
| Personally identifiable information | No | We don't collect names, emails, addresses |
| Health information | No | — |
| Financial / payment info | No | — |
| Authentication info | **Yes** | The user-supplied ElevenLabs API key, sent per-request to our backend (not stored) |
| Personal communications | No | — |
| Location | No | — |
| Web history | No | — |
| User activity | **Yes** | Episode IDs and subtitle text are sent to our backend to render audio |
| Website content | **Yes** | Subtitle JSON (text + speaker names + timestamps) from the active Crunchyroll page |

For each of the above, when the form asks how the data is used, select:
- **Used for the app's core functionality**
- **NOT sold to third parties**
- **NOT used for personalized advertising**
- **NOT used for creditworthiness / lending**

### Privacy policy URL
```
https://dubzly.com/privacy.html
```

### Data deletion / contact
```
https://github.com/blackwikionline/dubzly/issues
```

## Screenshots

The store expects at least 1, allows up to 5, recommends 4-5. Required size: **1280×800** or **640×400** PNG.

Suggested shots (capture at 1280×800 in Chrome with the window resized):

1. **Hero shot**: a Crunchyroll watch page with a subtitle visible on screen, Dubzly popup open showing the character list with per-character voice dropdowns.
2. **Voice override**: the popup zoomed in showing the Voice Provider dropdown + ElevenLabs key field + Characters section with a few characters voice-mapped.
3. **Community presets**: the popup showing the community preset banner ("3 community presets for 'A Replica Never Dreams'" with Load buttons).
4. **Preset export**: the popup with the "Export preset" button highlighted + a downloaded JSON file alongside.
5. **DevTools console (optional)**: showing the `[anime-dub] parsed N cues` log lines as proof-of-life.

Capture tips:
- Use a clean Chrome profile (no other extensions visible in the toolbar)
- Hide your bookmarks bar (Cmd+Shift+B) so screenshots look clean
- Crop to 1280×800 exactly — Chrome's developer console screenshot tool or macOS's `Cmd+Shift+5` works

## Promotional assets (optional but recommended)

| Asset | Size | Required? |
|---|---|---|
| Small promo tile | 440×280 PNG | Optional, but recommended |
| Marquee promo tile | 1400×560 PNG | Required only if you want to be featured |

We can resize `landing/logo.png` into these later, or design custom tiles with the character art on a colored background.

## Submission process

1. Sign in at https://chrome.google.com/webstore/devconsole with the Google account that paid the $5
2. **New item** → upload the zip file (`dubzly-v0.1.1.zip`)
3. Fill in **Store listing** with the copy above
4. Fill in **Privacy practices** with the disclosure form
5. Fill in **Distribution** (visibility = Public; regions = all)
6. Submit for review

### Expected timeline

- **First submission**: 1-2 weeks typical. Extensions that touch a major streaming site sometimes draw extra scrutiny (subtitle / audio modification).
- **Subsequent updates**: 1-3 days typical.
- If rejected, Chrome sends a specific reason; iterate and resubmit.

## Common rejection reasons (and how this submission avoids them)

| Reason | Mitigation |
|---|---|
| Remote code execution | We don't load any remote JS. All code is bundled in the zip. |
| Misleading branding | "Not affiliated with Crunchyroll" disclosure in description + footer. |
| Inadequate privacy disclosure | We disclose all 3 data categories (Auth info / User activity / Website content) honestly. |
| Vague permission justifications | We provide a specific reason for each permission and host. |
| Doesn't match single-purpose policy | Single, clearly-stated purpose. |
| Manifest V2 | We're on V3. ✓ |
