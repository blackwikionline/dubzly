# Build

How to install dependencies and produce runnable artifacts for the backend and the extension.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Python | 3.12+ | Backend uses `str \| None` syntax and matches `requires-python` |
| Node | 20+ | Vite 5 and crxjs require it |
| Google Chrome | 111+ | Needed for `world: "MAIN"` content scripts |
| macOS | optional | For the `say` dev fallback; non-Mac dev works with silent WAV |

Optional but nicer: `uv` instead of `pip` for the backend.

Check:

```bash
python3 --version
node --version
google-chrome --version   # or: open -a "Google Chrome" --args --version
```

## Initial setup

From the repo root:

```bash
# Backend
python3 -m venv backend/.venv
backend/.venv/bin/pip install --upgrade pip
backend/.venv/bin/pip install -e backend
cp backend/.env.example backend/.env       # optional; fill keys if you have them

# Extension
npm install --prefix extension
```

## Building the backend

The backend is plain Python; no compile step. To verify it imports:

```bash
backend/.venv/bin/python -c "from app.main import app; print('ok')"
```

## Building the extension

Two build modes:

### Watch mode (development)

```bash
npm run dev --prefix extension
```

- Runs `vite build --watch --mode development`.
- Auto-rebuilds `extension/dist/` on every source change.
- Note: this is **not** `vite dev` — see "Known gotchas" below.

### One-shot production build

```bash
npm run build --prefix extension
```

Produces a minified `extension/dist/` suitable for packaging into a Chrome Web Store `.zip`.

### Typecheck

```bash
npm run typecheck --prefix extension
```

Runs `tsc --noEmit`. Should be clean.

## Loading the extension in Chrome

1. Open `chrome://extensions`
2. Toggle **Developer mode** on (top-right)
3. **Load unpacked** → pick `extension/dist/` (the *built* output, not the source)
4. Pin from the puzzle menu for convenience

After source changes:

- **JS/TS only:** click the reload icon on the extension card, then refresh the host tab to re-inject the content script.
- **Manifest changed (permissions, content scripts, host permissions):** Remove the extension and Load unpacked again. Chrome doesn't always re-prompt for new permissions on a plain reload.

## Build outputs

| Path | Built by | Description |
|---|---|---|
| `backend/.venv/` | `pip install -e` | Python virtualenv |
| `extension/dist/manifest.json` | crxjs | Final MV3 manifest with hashed asset paths |
| `extension/dist/assets/*.js` | Vite | Bundled content / popup / service-worker / page-injector |
| `extension/dist/src/popup/index.html` | Vite | Built popup HTML |

## Known gotchas

### Do not use `vite dev` for this extension

`vite dev` injects HMR client code into the bundled MV3 service worker that tries to `fetch` from the Vite dev port. Chrome MV3 service workers block this with CORS / no-external-script policies, and registration fails with `Service worker registration failed. Status code: 3` (or 15). Use `vite build --watch` — it auto-rebuilds without HMR. Trade-off: you have to click the reload icon on the extension card on every change.

### crxjs caches the source manifest

After editing `extension/src/manifest.json`, the watch build sometimes doesn't regenerate `extension/dist/manifest.json`. If permissions or content_scripts changes don't appear:

```bash
pkill -f vite
rm -rf extension/dist
npm run build --prefix extension
npm run dev --prefix extension     # restart watch
```

Verify the rebuilt manifest:

```bash
python3 -c "import json; m=json.load(open('extension/dist/manifest.json')); print(m['permissions']); print(m['content_scripts'])"
```

Then **Remove + Load unpacked** in Chrome (not just reload) so it accepts the new permissions.
