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

export interface CommunityPresetSummary {
  id: string;
  slug: string;
  name: string;
  provider?: "elevenlabs" | "say" | "auto";
  speakerCount: number;
  author?: string | null;
  createdAt?: string | null;
  note?: string | null;
  downloads: number;
}

export interface CommunityPresetsResult {
  presets: CommunityPresetSummary[];
  totalCount: number;
}

export async function fetchCommunityPresets(
  slug: string,
  limit = 10,
): Promise<CommunityPresetsResult> {
  const resp = await fetch(
    `${API_URL}/presets?slug=${encodeURIComponent(slug)}&limit=${limit}`,
  );
  if (!resp.ok) throw new Error(`presets list ${resp.status}: ${await resp.text()}`);
  const json = (await resp.json()) as {
    presets: CommunityPresetSummary[];
    totalCount: number;
  };
  return { presets: json.presets, totalCount: json.totalCount };
}

export async function fetchCommunityPreset(slug: string, id: string): Promise<unknown> {
  const resp = await fetch(`${API_URL}/presets/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`);
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
}): Promise<{ id: string; slug: string }> {
  const resp = await fetch(`${API_URL}/presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: args.slug,
      name: args.name,
      provider: args.provider,
      voiceOverrides: args.voiceOverrides,
      metadata: {
        author: args.author,
        note: args.note,
      },
    }),
  });
  if (!resp.ok) throw new Error(`preset upload ${resp.status}: ${await resp.text()}`);
  return resp.json();
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
