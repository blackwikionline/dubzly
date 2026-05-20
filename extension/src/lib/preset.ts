import type { Provider } from "./settings";

export const PRESET_FORMAT = "anime-dub-preset";
export const PRESET_VERSION = 1;

export interface Preset {
  format: typeof PRESET_FORMAT;
  version: number;
  name: string;
  provider: Provider;
  voiceOverrides: Record<string, string>;
  metadata?: {
    author?: string;
    createdAt?: string;
    episodeIdHint?: string;
    showHint?: string;
    note?: string;
  };
}

export interface PresetSummary {
  name: string;
  provider: Provider;
  speakerCount: number;
  newSpeakers: string[];
  changedSpeakers: string[];
  unchangedSpeakers: string[];
  providerMismatch: boolean;
}

export function buildPreset(args: {
  name: string;
  provider: Provider;
  voiceOverrides: Record<string, string>;
  metadata?: Preset["metadata"];
}): Preset {
  return {
    format: PRESET_FORMAT,
    version: PRESET_VERSION,
    name: args.name,
    provider: args.provider,
    voiceOverrides: { ...args.voiceOverrides },
    metadata: {
      createdAt: new Date().toISOString(),
      ...args.metadata,
    },
  };
}

export class PresetError extends Error {}

export function parsePreset(input: unknown): Preset {
  if (!input || typeof input !== "object") throw new PresetError("not a JSON object");
  const obj = input as Record<string, unknown>;
  if (obj.format !== PRESET_FORMAT) {
    throw new PresetError(`format must be "${PRESET_FORMAT}", got ${JSON.stringify(obj.format)}`);
  }
  if (obj.version !== PRESET_VERSION) {
    throw new PresetError(`unsupported version ${JSON.stringify(obj.version)}`);
  }
  const provider = obj.provider;
  if (provider !== "elevenlabs" && provider !== "say" && provider !== "auto") {
    throw new PresetError(`invalid provider ${JSON.stringify(provider)}`);
  }
  const rawOverrides = obj.voiceOverrides;
  if (!rawOverrides || typeof rawOverrides !== "object") {
    throw new PresetError("voiceOverrides missing or not an object");
  }
  const voiceOverrides: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawOverrides as Record<string, unknown>)) {
    if (typeof v === "string" && v) voiceOverrides[k] = v;
  }
  const name = typeof obj.name === "string" && obj.name ? obj.name : "Untitled preset";
  return {
    format: PRESET_FORMAT,
    version: PRESET_VERSION,
    name,
    provider,
    voiceOverrides,
    metadata: (obj.metadata as Preset["metadata"]) ?? undefined,
  };
}

export function summarizePreset(
  preset: Preset,
  currentOverrides: Record<string, string>,
  currentProvider: Provider,
): PresetSummary {
  const newSpeakers: string[] = [];
  const changedSpeakers: string[] = [];
  const unchangedSpeakers: string[] = [];
  for (const [speaker, voice] of Object.entries(preset.voiceOverrides)) {
    const existing = currentOverrides[speaker];
    if (existing === undefined) newSpeakers.push(speaker);
    else if (existing !== voice) changedSpeakers.push(speaker);
    else unchangedSpeakers.push(speaker);
  }
  return {
    name: preset.name,
    provider: preset.provider,
    speakerCount: Object.keys(preset.voiceOverrides).length,
    newSpeakers,
    changedSpeakers,
    unchangedSpeakers,
    providerMismatch: preset.provider !== currentProvider && preset.provider !== "auto",
  };
}

export function downloadPreset(preset: Preset, filename?: string): void {
  const safeName = preset.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const fallback = `anime-dub-preset-${safeName || "untitled"}-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(preset, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? fallback;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readPresetFile(file: File): Promise<Preset> {
  const text = await file.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new PresetError(`not valid JSON: ${(e as Error).message}`);
  }
  return parsePreset(json);
}
