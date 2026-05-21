import type { Provider } from "./settings";
import type { Voice } from "./voices";

export interface CueRenderRequest {
  episodeId: string;
  index: number;
  text: string;
  start: number;
  end: number;
  speaker?: string;
  voiceId?: string;
}

export interface RenderOptions {
  provider: Provider;
  elevenLabsApiKey?: string;
}

const API_URL = "https://api.dubzly.com";

export async function fetchVoices(
  provider: "elevenlabs" | "say",
  elevenLabsApiKey?: string,
): Promise<Voice[]> {
  const headers: Record<string, string> = {};
  if (provider === "elevenlabs" && elevenLabsApiKey) {
    headers["X-Elevenlabs-Key"] = elevenLabsApiKey;
  }
  const resp = await fetch(`${API_URL}/voices?provider=${provider}`, { headers });
  if (!resp.ok) throw new Error(`voices fetch ${resp.status}: ${await resp.text()}`);
  const json = (await resp.json()) as { voices: Voice[] };
  return json.voices;
}

/**
 * Community presets are stored on black.wiki:
 *   GET  https://black.wiki/api/apps/dubzly/files?q=<slug>__   (public)
 *   GET  https://black.wiki/api/apps/dubzly/data/<filename>    (public)
 *   POST https://black.wiki/api/apps/dubzly/submit             (Bearer bwk_...)
 *
 * Filename convention for our app: <show-slug>__<random-id>.json
 * Search by slug works because every file uploaded by our extension is
 * prefixed with the slug + "__" delimiter.
 */

const BLACK_WIKI_API = "https://black.wiki/api";
const BLACK_WIKI_APP = "dubzly";

export interface CommunityPresetSummary {
  id: string;        // filename minus .json
  slug: string;
  name: string;      // pulled from the JSON content's "name" field after fetch, or filename fallback
  provider?: "elevenlabs" | "say" | "auto";
  speakerCount: number;
  author?: string | null;
  createdAt?: string | null;
  url: string;       // full URL to fetch the preset JSON
}

export interface CommunityPresetsResult {
  presets: CommunityPresetSummary[];
  totalCount: number;
}

interface BwikiFileEntry {
  filename: string;
  size_bytes: number;
  content_type: string;
  created_at: string;
  updated_at: string;
  url: string;
}

interface BwikiFilesResponse {
  app: { slug: string };
  total: number;
  limit: number;
  offset: number;
  files: BwikiFileEntry[];
}

function slugFromFilename(filename: string): string {
  // filename pattern: <slug>__<id>.json
  const m = filename.match(/^([a-z0-9][a-z0-9-]*)__/);
  return m ? m[1] : "";
}

export async function fetchCommunityPresets(
  slug: string,
  limit = 10,
): Promise<CommunityPresetsResult> {
  const q = `${slug}__`;
  const url = `${BLACK_WIKI_API}/apps/${BLACK_WIKI_APP}/files?q=${encodeURIComponent(q)}&limit=${limit}&sort=updated&dir=desc`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`presets list ${resp.status}: ${await resp.text()}`);
  const json = (await resp.json()) as BwikiFilesResponse;

  // black.wiki returns only file metadata; fetch each preset's content in parallel
  // to populate name, voice count, author, provider for the popup summary.
  const summaries = await Promise.all(
    json.files.map(async (f): Promise<CommunityPresetSummary | null> => {
      try {
        const r = await fetch(f.url);
        if (!r.ok) throw new Error(`fetch ${r.status}`);
        const data = (await r.json()) as Record<string, unknown>;
        const overrides = (data.voiceOverrides as Record<string, string> | undefined) ?? {};
        const meta = (data.metadata as Record<string, unknown> | undefined) ?? {};
        return {
          id: f.filename.replace(/\.json$/, ""),
          slug: slugFromFilename(f.filename) || slug,
          name: (data.name as string | undefined) || f.filename.replace(/\.json$/, ""),
          provider: data.provider as CommunityPresetSummary["provider"],
          speakerCount: Object.keys(overrides).length,
          author: (meta.author as string | undefined) ?? null,
          createdAt: (meta.createdAt as string | undefined) ?? f.created_at,
          url: f.url,
        };
      } catch {
        return null;
      }
    }),
  );
  const presets = summaries.filter((s): s is CommunityPresetSummary => s !== null);
  return { presets, totalCount: json.total };
}

export async function fetchCommunityPreset(url: string): Promise<unknown> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`preset fetch ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function uploadCommunityPreset(args: {
  slug: string;
  name: string;
  provider: "elevenlabs" | "say" | "auto";
  voiceOverrides: Record<string, string>;
  author?: string;
  note?: string;
  bwikiToken: string;
}): Promise<{ submission_id?: string; ok?: boolean; message?: string }> {
  if (!args.bwikiToken) {
    throw new Error("black.wiki API token required to share. Generate one at https://black.wiki/account/tokens");
  }
  const filename = makePresetFilename(args.slug);
  const content = {
    format: "anime-dub-preset",
    version: 1,
    name: args.name,
    provider: args.provider,
    voiceOverrides: args.voiceOverrides,
    metadata: {
      author: args.author,
      note: args.note,
      createdAt: new Date().toISOString(),
    },
  };
  const resp = await fetch(`${BLACK_WIKI_API}/apps/${BLACK_WIKI_APP}/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.bwikiToken}`,
    },
    body: JSON.stringify({ filename, content, message: args.note }),
  });
  if (!resp.ok) {
    throw new Error(`preset upload ${resp.status}: ${await resp.text()}`);
  }
  return resp.json();
}

function makePresetFilename(slug: string): string {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${slug}__${id}.json`;
}

export async function renderCue(cue: CueRenderRequest, opts: RenderOptions): Promise<Blob> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.elevenLabsApiKey) headers["X-Elevenlabs-Key"] = opts.elevenLabsApiKey;
  const resp = await fetch(`${API_URL}/cues/render`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      episode_id: cue.episodeId,
      index: cue.index,
      text: cue.text,
      start: cue.start,
      end: cue.end,
      provider: opts.provider,
      speaker: cue.speaker,
      voice_id: cue.voiceId,
    }),
  });
  if (!resp.ok) {
    throw new Error(`render failed ${resp.status}: ${await resp.text()}`);
  }
  return resp.blob();
}
