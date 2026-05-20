export type Provider = "elevenlabs" | "say" | "auto";

export interface Settings {
  provider: Provider;
  elevenLabsApiKey: string;
  voiceOverrides: Record<string, string>;
}

const DEFAULTS: Settings = {
  provider: "say",
  elevenLabsApiKey: "",
  voiceOverrides: {},
};

const SETTINGS_KEY = "anime-dub-settings";
const SPEAKERS_KEY = "anime-dub-current-speakers";
const AREA: chrome.storage.AreaName = "local";

export async function getSettings(): Promise<Settings> {
  const got = await chrome.storage[AREA].get(SETTINGS_KEY);
  const stored = got[SETTINGS_KEY] as Partial<Settings> | undefined;
  return { ...DEFAULTS, ...stored };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next: Settings = { ...current, ...patch };
  await chrome.storage[AREA].set({ [SETTINGS_KEY]: next });
  return next;
}

export async function setVoiceOverride(speaker: string, voiceId: string | null): Promise<void> {
  const current = await getSettings();
  const overrides = { ...current.voiceOverrides };
  if (voiceId) overrides[speaker] = voiceId;
  else delete overrides[speaker];
  await setSettings({ voiceOverrides: overrides });
}

export interface CurrentSpeakers {
  episodeId: string;
  speakers: string[];
  updatedAt: number;
  showSlug?: string;
}

export async function getCurrentSpeakers(): Promise<CurrentSpeakers | null> {
  const got = await chrome.storage[AREA].get(SPEAKERS_KEY);
  return (got[SPEAKERS_KEY] as CurrentSpeakers | undefined) ?? null;
}

export async function setCurrentSpeakers(
  episodeId: string,
  speakers: string[],
  showSlug?: string,
): Promise<void> {
  const payload: CurrentSpeakers = {
    episodeId,
    speakers,
    updatedAt: Date.now(),
    showSlug,
  };
  await chrome.storage[AREA].set({ [SPEAKERS_KEY]: payload });
}

export function onSettingsChanged(handler: (s: Settings) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: chrome.storage.AreaName,
  ) => {
    if (areaName !== AREA) return;
    const change = changes[SETTINGS_KEY];
    if (!change) return;
    handler({ ...DEFAULTS, ...(change.newValue as Partial<Settings> | undefined) });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
