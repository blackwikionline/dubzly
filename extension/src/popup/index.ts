import {
  fetchCommunityPreset,
  fetchCommunityPresets,
  fetchVoices,
  uploadCommunityPreset,
  type CommunityPresetSummary,
} from "../lib/api";
import {
  buildPreset,
  downloadPreset,
  parsePreset,
  PresetError,
  readPresetFile,
  summarizePreset,
  type Preset,
} from "../lib/preset";
import {
  getCurrentSpeakers,
  getSettings,
  setSettings,
  setVoiceOverride,
  type Provider,
  type Settings,
} from "../lib/settings";
import { ELEVENLABS_VOICES, MUTE_VOICE_ID, SAY_VOICES, type Voice } from "../lib/voices";

const providerSelect = document.getElementById("provider") as HTMLSelectElement;
const keyInput = document.getElementById("elevenLabsKey") as HTMLInputElement;
const savedFlag = document.getElementById("saved") as HTMLDivElement;
const speakersEl = document.getElementById("speakers") as HTMLDivElement;
const speakersEmptyEl = document.getElementById("speakersEmpty") as HTMLDivElement;
const presetNameInput = document.getElementById("presetName") as HTMLInputElement;
const exportBtn = document.getElementById("exportBtn") as HTMLButtonElement;
const importBtn = document.getElementById("importBtn") as HTMLButtonElement;
const uploadBtn = document.getElementById("uploadBtn") as HTMLButtonElement;
const importFileInput = document.getElementById("importFile") as HTMLInputElement;
const presetMsg = document.getElementById("presetMsg") as HTMLDivElement;
const communityEl = document.getElementById("community") as HTMLDivElement;

let savedFlagTimer: number | undefined;
const voicesCache: Partial<Record<"elevenlabs" | "say", Voice[]>> = {};
const dismissedSlugs = new Set<string>();

function flashSaved(): void {
  savedFlag.classList.add("show");
  if (savedFlagTimer) window.clearTimeout(savedFlagTimer);
  savedFlagTimer = window.setTimeout(() => savedFlag.classList.remove("show"), 1200);
}

function slugToTitle(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function showPresetMsg(text: string, kind: "info" | "warn" | "error"): void {
  presetMsg.textContent = text;
  presetMsg.className = `preset-msg show ${kind}`;
}

function clearPresetMsg(): void {
  presetMsg.className = "preset-msg";
}

function fallbackPool(provider: Provider): Voice[] {
  if (provider === "say") return SAY_VOICES;
  return ELEVENLABS_VOICES;
}

async function loadVoicePool(provider: Provider, apiKey: string): Promise<Voice[]> {
  const resolved: "elevenlabs" | "say" = provider === "say" ? "say" : "elevenlabs";
  if (voicesCache[resolved]) return voicesCache[resolved]!;
  try {
    const voices = await fetchVoices(resolved, apiKey);
    voicesCache[resolved] = voices;
    return voices;
  } catch (e) {
    console.warn("[anime-dub popup] voices fetch failed, using fallback", e);
    return fallbackPool(provider);
  }
}

function renderSpeakers(speakers: string[], settings: Settings, pool: Voice[]): void {
  speakersEl.innerHTML = "";
  if (speakers.length === 0) {
    speakersEmptyEl.style.display = "block";
    return;
  }
  speakersEmptyEl.style.display = "none";
  for (const speaker of speakers) {
    const nameEl = document.createElement("div");
    nameEl.className = "name";
    nameEl.textContent = speaker;
    nameEl.title = speaker;

    const select = document.createElement("select");
    const autoOpt = document.createElement("option");
    autoOpt.value = "";
    autoOpt.textContent = "Auto (hashed)";
    select.appendChild(autoOpt);
    const muteOpt = document.createElement("option");
    muteOpt.value = MUTE_VOICE_ID;
    muteOpt.textContent = "Mute (don't voice)";
    select.appendChild(muteOpt);
    for (const v of pool) {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.label;
      select.appendChild(opt);
    }
    select.value = settings.voiceOverrides[speaker] ?? "";
    select.addEventListener("change", () => {
      void setVoiceOverride(speaker, select.value || null).then(flashSaved);
    });

    speakersEl.appendChild(nameEl);
    speakersEl.appendChild(select);
  }
}

const TOP_PRESET_COUNT = 3;

function clearCommunityBanner(): void {
  communityEl.style.display = "none";
  communityEl.innerHTML = "";
}

function presetRow(slug: string, p: CommunityPresetSummary): HTMLLIElement {
  const li = document.createElement("li");
  const info = document.createElement("div");
  const name = document.createElement("div");
  name.textContent = p.name;
  const meta = document.createElement("div");
  meta.className = "meta";
  const parts: string[] = [];
  if (p.author) parts.push(`by ${p.author}`);
  parts.push(`${p.speakerCount} ${p.speakerCount === 1 ? "voice" : "voices"}`);
  if (typeof p.downloads === "number") {
    parts.push(`${p.downloads} ${p.downloads === 1 ? "load" : "loads"}`);
  }
  if (p.provider) parts.push(p.provider);
  meta.textContent = parts.join(" · ");
  info.appendChild(name);
  info.appendChild(meta);

  const loadBtn = document.createElement("button");
  loadBtn.textContent = "Load";
  loadBtn.addEventListener("click", () => {
    void onLoadCommunityPreset(slug, p.id);
  });

  li.appendChild(info);
  li.appendChild(loadBtn);
  return li;
}

function matchesQuery(p: CommunityPresetSummary, q: string): boolean {
  const needle = q.toLowerCase();
  if (p.name.toLowerCase().includes(needle)) return true;
  if (p.author && p.author.toLowerCase().includes(needle)) return true;
  return false;
}

function renderCommunityBanner(
  slug: string,
  presets: CommunityPresetSummary[],
  totalCount: number,
  showTitle: string,
): void {
  communityEl.innerHTML = "";
  if (presets.length === 0 || dismissedSlugs.has(slug)) {
    communityEl.style.display = "none";
    return;
  }
  communityEl.style.display = "block";

  const heading = document.createElement("div");
  heading.className = "heading";
  heading.textContent = `${totalCount} community ${totalCount === 1 ? "preset" : "presets"} for "${showTitle}"`;
  communityEl.appendChild(heading);

  const listsContainer = document.createElement("div");
  communityEl.appendChild(listsContainer);

  const showSearch = presets.length > TOP_PRESET_COUNT;
  let query = "";

  const renderLists = () => {
    listsContainer.innerHTML = "";

    if (query) {
      const matches = presets.filter((p) => matchesQuery(p, query));
      if (matches.length === 0) {
        const empty = document.createElement("div");
        empty.className = "no-match";
        empty.textContent = `No presets match "${query}".`;
        listsContainer.appendChild(empty);
        return;
      }
      const ul = document.createElement("ul");
      for (const p of matches) ul.appendChild(presetRow(slug, p));
      listsContainer.appendChild(ul);
      return;
    }

    const top = presets.slice(0, TOP_PRESET_COUNT);
    const rest = presets.slice(TOP_PRESET_COUNT);

    const topUl = document.createElement("ul");
    for (const p of top) topUl.appendChild(presetRow(slug, p));
    listsContainer.appendChild(topUl);

    if (rest.length > 0) {
      const restUl = document.createElement("ul");
      restUl.style.display = "none";
      for (const p of rest) restUl.appendChild(presetRow(slug, p));

      const toggle = document.createElement("button");
      toggle.className = "dismiss";
      let expanded = false;
      const setLabel = () => {
        toggle.textContent = expanded ? "Show less" : `Show ${rest.length} more`;
      };
      setLabel();
      toggle.addEventListener("click", () => {
        expanded = !expanded;
        restUl.style.display = expanded ? "block" : "none";
        setLabel();
      });
      listsContainer.appendChild(restUl);
      listsContainer.appendChild(toggle);
    }
  };

  if (showSearch) {
    const search = document.createElement("input");
    search.type = "text";
    search.className = "search";
    search.placeholder = `Search ${presets.length} presets by name or author…`;
    search.addEventListener("input", () => {
      query = search.value.trim();
      renderLists();
    });
    communityEl.insertBefore(search, listsContainer);
  }

  renderLists();

  const dismiss = document.createElement("button");
  dismiss.className = "dismiss";
  dismiss.textContent = "Dismiss";
  dismiss.style.marginLeft = "8px";
  dismiss.addEventListener("click", () => {
    dismissedSlugs.add(slug);
    clearCommunityBanner();
  });
  communityEl.appendChild(dismiss);
}

async function onLoadCommunityPreset(slug: string, id: string): Promise<void> {
  clearPresetMsg();
  let preset: Preset;
  try {
    const raw = await fetchCommunityPreset(slug, id);
    preset = parsePreset(raw);
  } catch (e) {
    showPresetMsg(`Could not load community preset: ${(e as Error).message}`, "error");
    return;
  }
  const settings = await getSettings();
  const summary = summarizePreset(preset, settings.voiceOverrides, settings.provider);
  const lines = [
    `Load "${preset.name}" with ${summary.speakerCount} voice overrides?`,
    `${summary.newSpeakers.length} new, ${summary.changedSpeakers.length} will change, ${summary.unchangedSpeakers.length} already match.`,
  ];
  if (summary.providerMismatch) {
    lines.push(
      `Heads up: preset is for ${preset.provider} but you're on ${settings.provider}.`,
    );
  }
  if (!window.confirm(lines.join("\n\n"))) {
    showPresetMsg("Cancelled.", "info");
    return;
  }
  const merged = { ...settings.voiceOverrides, ...preset.voiceOverrides };
  await setSettings({ voiceOverrides: merged });
  presetNameInput.value = preset.name;
  await refresh();
  showPresetMsg(`Loaded community preset "${preset.name}".`, "info");
}

async function refresh(): Promise<void> {
  const [settings, speakers] = await Promise.all([getSettings(), getCurrentSpeakers()]);
  providerSelect.value = settings.provider;
  keyInput.value = settings.elevenLabsApiKey;
  const pool = await loadVoicePool(settings.provider, settings.elevenLabsApiKey);
  renderSpeakers(speakers?.speakers ?? [], settings, pool);
  if (!presetNameInput.value && speakers?.showSlug) {
    presetNameInput.value = slugToTitle(speakers.showSlug);
  }
  if (speakers?.showSlug) {
    void loadCommunityPresets(speakers.showSlug);
  } else {
    clearCommunityBanner();
  }
}

async function loadCommunityPresets(slug: string): Promise<void> {
  if (dismissedSlugs.has(slug)) {
    clearCommunityBanner();
    return;
  }
  try {
    const { presets, totalCount } = await fetchCommunityPresets(slug);
    renderCommunityBanner(slug, presets, totalCount, slugToTitle(slug));
  } catch (e) {
    console.warn("[anime-dub popup] community presets fetch failed", e);
    clearCommunityBanner();
  }
}

async function onExport(): Promise<void> {
  clearPresetMsg();
  const [settings, speakers] = await Promise.all([getSettings(), getCurrentSpeakers()]);
  const overrideCount = Object.keys(settings.voiceOverrides).length;
  if (overrideCount === 0) {
    showPresetMsg("No voice overrides set yet. Pick voices for at least one character first.", "warn");
    return;
  }
  const preset: Preset = buildPreset({
    name: presetNameInput.value.trim() || "Untitled preset",
    provider: settings.provider,
    voiceOverrides: settings.voiceOverrides,
    metadata: {
      episodeIdHint: speakers?.episodeId,
    },
  });
  downloadPreset(preset);
  showPresetMsg(
    `Exported ${overrideCount} voice ${overrideCount === 1 ? "override" : "overrides"} as JSON.`,
    "info",
  );
}

async function onImportFile(file: File): Promise<void> {
  clearPresetMsg();
  let preset: Preset;
  try {
    preset = await readPresetFile(file);
  } catch (e) {
    showPresetMsg(`Could not load preset: ${(e as PresetError).message}`, "error");
    return;
  }
  const settings = await getSettings();
  const summary = summarizePreset(preset, settings.voiceOverrides, settings.provider);
  const lines = [
    `Loaded "${preset.name}" with ${summary.speakerCount} voice overrides.`,
    `${summary.newSpeakers.length} new, ${summary.changedSpeakers.length} will change, ${summary.unchangedSpeakers.length} already match.`,
  ];
  if (summary.providerMismatch) {
    lines.push(
      `Heads up: preset is for ${preset.provider} but you're on ${settings.provider}.`,
    );
  }
  if (!window.confirm(`${lines.join("\n\n")}\n\nMerge into your current overrides?`)) {
    showPresetMsg("Import cancelled.", "info");
    return;
  }
  const merged = { ...settings.voiceOverrides, ...preset.voiceOverrides };
  await setSettings({ voiceOverrides: merged });
  presetNameInput.value = preset.name;
  await refresh();
  showPresetMsg(
    `Applied ${summary.newSpeakers.length + summary.changedSpeakers.length} overrides from "${preset.name}".`,
    "info",
  );
}

async function onUploadCommunity(): Promise<void> {
  clearPresetMsg();
  const [settings, speakers] = await Promise.all([getSettings(), getCurrentSpeakers()]);
  if (!speakers?.showSlug) {
    showPresetMsg("Open a Crunchyroll episode first so we know which show to share for.", "warn");
    return;
  }
  const overrideCount = Object.keys(settings.voiceOverrides).length;
  if (overrideCount === 0) {
    showPresetMsg("Pick voices for at least one character first.", "warn");
    return;
  }
  const name = presetNameInput.value.trim() || slugToTitle(speakers.showSlug);
  const author = window.prompt(
    `Share "${name}" for "${speakers.showSlug}" to the community library?\n\nOptional: your name (leave blank to stay anonymous)`,
    "",
  );
  if (author === null) {
    showPresetMsg("Upload cancelled.", "info");
    return;
  }
  try {
    const res = await uploadCommunityPreset({
      slug: speakers.showSlug,
      name,
      provider: settings.provider,
      voiceOverrides: settings.voiceOverrides,
      author: author.trim() || undefined,
    });
    showPresetMsg(
      `Shared as community preset ${res.id}. Other viewers of "${speakers.showSlug}" will see it.`,
      "info",
    );
    void loadCommunityPresets(speakers.showSlug);
  } catch (e) {
    showPresetMsg(`Upload failed: ${(e as Error).message}`, "error");
  }
}

providerSelect.addEventListener("change", () => {
  void setSettings({ provider: providerSelect.value as Provider })
    .then(flashSaved)
    .then(refresh);
});

let keyDebounce: number | undefined;
keyInput.addEventListener("input", () => {
  if (keyDebounce) window.clearTimeout(keyDebounce);
  keyDebounce = window.setTimeout(() => {
    void setSettings({ elevenLabsApiKey: keyInput.value.trim() }).then(() => {
      voicesCache.elevenlabs = undefined;
      flashSaved();
      void refresh();
    });
  }, 400);
});

exportBtn.addEventListener("click", () => {
  void onExport();
});
importBtn.addEventListener("click", () => {
  importFileInput.click();
});
importFileInput.addEventListener("change", () => {
  const file = importFileInput.files?.[0];
  if (file) void onImportFile(file);
  importFileInput.value = "";
});
uploadBtn.addEventListener("click", () => {
  void onUploadCommunity();
});

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === "local") void refresh();
});

void refresh();
