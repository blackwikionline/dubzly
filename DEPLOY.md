# Deploy

Production deployment plan for the backend and the extension. **Nothing here is live yet** — this is the target state.

## Overview

| Surface | Target | Why |
|---|---|---|
| Backend | Fly.io or Railway | Easy Python ASGI deploy, free tier sufficient for dev, Postgres add-on for Supabase |
| Static audio cache | Cloudflare R2 | Cheap egress (audio is hot-read) |
| Auth + DB | Supabase | One vendor for Postgres + Auth + RLS |
| Billing | Stripe | Metered per-character usage |
| Extension | Chrome Web Store | Distribution; users can sideload during dev |

## Backend

### Hosting

Recommended: **Fly.io** (good Python support, simple HTTPS, generous free tier).

```bash
cd backend
fly launch --no-deploy            # generate fly.toml; pick region near most users
fly secrets set \
  APP_ENV=production \
  EXTENSION_ORIGIN=chrome-extension://<your-extension-id> \
  ELEVENLABS_API_KEY=sk_... \
  ELEVENLABS_DEFAULT_VOICE_ID=21m00Tcm4TlvDq8ikWAM \
  SUPABASE_URL=https://xxx.supabase.co \
  SUPABASE_JWT_SECRET=... \
  SUPABASE_SERVICE_KEY=... \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  STRIPE_METER_ID=... \
  R2_ACCOUNT_ID=... \
  R2_ACCESS_KEY_ID=... \
  R2_SECRET_ACCESS_KEY=... \
  R2_BUCKET=anime-dub-audio \
  R2_PUBLIC_URL=https://audio.your-domain.com
fly deploy
```

Required `Dockerfile` (not yet in repo — add when deploying):

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir -e .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### CORS lock-down

In production, do **not** leave `EXTENSION_ORIGIN` blank. Set it to the deployed extension's id (e.g. `chrome-extension://eadhamfajadhadlphbfhmclbfefihcpg`). This makes `allow_credentials=true` in the CORS middleware (the dev config disables credentials when origins is `["*"]`).

If the extension also calls the backend from `https://www.crunchyroll.com` page context (currently it does), add that origin too — extend `EXTENSION_ORIGIN` handling in `app/main.py` to accept a comma-separated list.

### Health checks

`GET /health` returns `{"status":"ok","env":"production"}` — wire that into Fly's health-check config (or whichever platform).

### Logging

Backend logs to stdout via uvicorn. Forward to whichever observability stack (Fly LogShipper, Datadog, etc.). Avoid logging full subtitle text or audio bytes (those are user content).

## External services

### Supabase

1. Create a project at https://supabase.com.
2. Note the **Project URL**, **anon key**, **service-role key**, and **JWT secret** (Project Settings → API).
3. Create the schema (TBD — auth + per-user cue cache table when implemented).
4. Set secrets on the backend per "Hosting" above.

### Stripe

1. Create products + a **meter** for `cue_characters` (Stripe → Billing → Meters).
2. Webhooks: configure an endpoint at `https://<backend>/billing/webhook` (route not yet implemented).
3. Test mode first; flip to live keys only after end-to-end test.

### Cloudflare R2

1. Create a bucket `anime-dub-audio`.
2. Create an API token with read/write to that bucket.
3. (Optional) Bind a custom domain `audio.your-domain.com` for public read.
4. Cache keys: `<user_id>/<episode_id>/<cue_index>.mp3` (per-user partitioning — never serve cross-user).

### ElevenLabs

Production tier needed for sustained traffic (free tier is ~10k chars/month). Pro is ~$22/mo for 100k chars (~5 episodes), Scale is $330/mo for 2M chars (~100 episodes). User-supplied key (popup) bypasses this entirely.

## Extension

### Chrome Web Store publishing

1. Bump version in `extension/src/manifest.json`.
2. `npm run build --prefix extension` → produces `extension/dist/`.
3. Zip it: `cd extension && zip -r ../anime-dub-v$(jq -r .version src/manifest.json).zip dist/`.
4. Upload at https://chrome.google.com/webstore/devconsole.
5. First submission: pay the one-time $5 developer fee and complete the privacy disclosure (storage of API key, request to crunchyrollcdn.com, calls to backend).
6. Reviews typically take 1–3 business days.

After publishing, update `EXTENSION_ORIGIN` on the backend to match the assigned `chrome-extension://...` id.

### Backend URL configuration

`extension/src/lib/api.ts` currently hardcodes `http://localhost:8000`. Before shipping:

1. Replace with `import.meta.env.VITE_API_URL`.
2. Set `extension/.env.production` with `VITE_API_URL=https://api.your-domain.com`.
3. Add backend domain to `host_permissions` in `src/manifest.json`.

## Pre-launch checklist

- [ ] Backend deployed and `/health` returns 200 from a public URL
- [ ] All secrets set on backend (none committed to git — verify with `grep -r sk_ backend/`)
- [ ] CORS locked to specific origins (not `*`)
- [ ] Per-user audio caching wired (so we don't charge ourselves ElevenLabs N times for re-watches)
- [ ] Supabase RLS policies prevent cross-user reads
- [ ] Stripe in **test mode** end-to-end before flipping to live keys
- [ ] Extension built with production `VITE_API_URL`
- [ ] `host_permissions` includes the production backend domain only
- [ ] Manifest version bumped
- [ ] Chrome Web Store privacy disclosure submitted
