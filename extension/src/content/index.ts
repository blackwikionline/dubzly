import { renderCue } from "../lib/api";
import {
  getSettings,
  onSettingsChanged,
  setCurrentSpeakers,
  type Provider,
} from "../lib/settings";
import { guessFormat, parseSubtitle, type SubtitleFormat } from "../lib/subtitle";
import { MUTE_VOICE_ID } from "../lib/voices";
import { AudioEngine } from "./audio-engine";
import { CueScheduler, type ScheduledCueInput } from "./scheduler";

console.log("[anime-dub] content script loaded on", location.href);

const EPISODE_ID_RE = /\/watch\/([^/]+)/;
const SHOW_SLUG_RE = /\/watch\/[^/]+\/([^/?#]+)/;
const VIDEO_SELECTOR = ".bitmovinplayer-container video";
const PREFERRED_LANGUAGES = ["en-US", "en"];
const ANIME_DUB_MARKER = "__anime_dub_playback__";

const SIGN_STYLE_RE = /sign/i;
const SIGN_SPEAKER_RE =
  /^(sign|title|credits?|nextep|next ep|eyecatch|eptitle|episode|op|ed|logo|chyron|caption|onscreen|on-screen|on screen|board|note)\b/i;

function isSignLikeCue(style: string | undefined, speaker: string | undefined): boolean {
  if (style && SIGN_STYLE_RE.test(style)) return true;
  if (speaker && SIGN_SPEAKER_RE.test(speaker)) return true;
  return false;
}

interface SubtitleEntry {
  url: string;
  format?: string;
  language?: string;
}

interface PlaybackConfig {
  subtitles?: Record<string, SubtitleEntry>;
  captions?: Record<string, SubtitleEntry>;
}

const audioEngine = new AudioEngine();
let scheduler: CueScheduler | null = null;
let currentEpisode: string | null = null;
const seenSubtitleUrls = new Set<string>();
let currentProvider: Provider = "say";
let currentApiKey = "";
let currentVoiceOverrides: Record<string, string> = {};

void getSettings().then((s) => {
  currentProvider = s.provider;
  currentApiKey = s.elevenLabsApiKey;
  currentVoiceOverrides = s.voiceOverrides;
  console.log("[anime-dub] settings loaded; provider:", currentProvider);
});
onSettingsChanged((s) => {
  currentProvider = s.provider;
  currentApiKey = s.elevenLabsApiKey;
  currentVoiceOverrides = s.voiceOverrides;
  console.log("[anime-dub] settings changed; provider:", currentProvider);
});

function getEpisodeId(): string | null {
  const m = location.pathname.match(EPISODE_ID_RE);
  return m ? m[1] : null;
}

function getShowSlug(): string | undefined {
  const m = location.pathname.match(SHOW_SLUG_RE);
  return m ? m[1] : undefined;
}

function getVideo(): HTMLVideoElement | null {
  return document.querySelector<HTMLVideoElement>(VIDEO_SELECTOR);
}

function waitForVideo(timeoutMs = 30000): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const existing = getVideo();
    if (existing) {
      resolve(existing);
      return;
    }
    const observer = new MutationObserver(() => {
      const v = getVideo();
      if (v) {
        clearTimeout(timer);
        observer.disconnect();
        resolve(v);
      }
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error("video element did not appear within timeout"));
    }, timeoutMs);
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function pickSubtitle(config: PlaybackConfig): SubtitleEntry | null {
  for (const source of [config.subtitles, config.captions]) {
    if (!source) continue;
    for (const lang of PREFERRED_LANGUAGES) {
      const entry = source[lang];
      if (entry?.url) return entry;
    }
    const first = Object.values(source).find((e) => e?.url);
    if (first) return first;
  }
  return null;
}

async function handlePlaybackConfig(config: PlaybackConfig): Promise<void> {
  const episodeId = getEpisodeId();
  if (!episodeId) {
    console.warn("[anime-dub] playback config received but no episode ID in path");
    return;
  }

  const entry = pickSubtitle(config);
  if (!entry) {
    console.warn("[anime-dub] no subtitle track in playback config");
    return;
  }
  if (seenSubtitleUrls.has(entry.url)) return;
  seenSubtitleUrls.add(entry.url);

  const format = (entry.format as SubtitleFormat | undefined) ?? guessFormat(entry.url);
  if (!format) {
    console.warn("[anime-dub] could not determine subtitle format", entry);
    return;
  }
  console.log(`[anime-dub] subtitle: ${entry.language ?? "?"} (${format})`, entry.url);

  let subText: string;
  try {
    const resp = await fetch(entry.url);
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    subText = await resp.text();
  } catch (e) {
    console.warn("[anime-dub] subtitle fetch failed", e);
    return;
  }

  const allCues = parseSubtitle(subText, format);
  const cues = allCues.filter((c) => !isSignLikeCue(c.style, c.speaker));
  console.log(
    `[anime-dub] parsed ${allCues.length} cues (${cues.length} after filtering signs) for episode ${episodeId}`,
  );
  if (cues.length === 0) return;

  const speakers = [...new Set(cues.map((c) => c.speaker).filter(Boolean))] as string[];
  console.log("[anime-dub] dialogue speakers:", speakers);
  void setCurrentSpeakers(episodeId, speakers, getShowSlug());

  const scheduledCues: ScheduledCueInput[] = cues.map((c, i) => ({
    episodeId,
    index: i,
    text: c.text,
    start: c.start,
    end: c.end,
    speaker: c.speaker,
  }));

  let video: HTMLVideoElement;
  try {
    video = await waitForVideo();
  } catch (e) {
    console.warn("[anime-dub] gave up waiting for video element", e);
    return;
  }

  scheduler?.stop();
  audioEngine.enable(video);
  scheduler = new CueScheduler(
    () => video.currentTime,
    () => video.paused,
    (cue) => {
      const override = cue.speaker ? currentVoiceOverrides[cue.speaker] : undefined;
      if (override === MUTE_VOICE_ID) {
        return Promise.resolve(null);
      }
      return renderCue(
        { ...cue, voiceId: override },
        { provider: currentProvider, elevenLabsApiKey: currentApiKey },
      );
    },
    (audio) => audioEngine.play(audio),
  );
  scheduler.load(scheduledCues);
  scheduler.start();
  video.addEventListener("seeking", () => scheduler?.onSeek());
  currentEpisode = episodeId;
  console.log("[anime-dub] scheduler started for", episodeId);
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data as { [k: string]: unknown } | null;
  if (!data || data[ANIME_DUB_MARKER] !== true) return;
  const config = data.data as PlaybackConfig | undefined;
  if (config && typeof config === "object") {
    handlePlaybackConfig(config);
  }
});

let lastHref = location.href;
new MutationObserver(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    const ep = getEpisodeId();
    if (ep !== currentEpisode) {
      scheduler?.stop();
      scheduler = null;
      currentEpisode = null;
      seenSubtitleUrls.clear();
      console.log("[anime-dub] episode changed; awaiting new playback config");
    }
  }
}).observe(document.body, { childList: true, subtree: true });
