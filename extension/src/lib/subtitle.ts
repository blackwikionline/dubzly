export interface SubtitleCue {
  text: string;
  start: number;
  end: number;
  speaker?: string;
  style?: string;
}

export type SubtitleFormat = "vtt" | "ass";

const VTT_TIMESTAMP_RE =
  /^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})/;

const ASS_TIME_RE = /^(\d+):(\d{2}):(\d{2})\.(\d{2,3})$/;

function vttToSeconds(h: string | undefined, m: string, s: string, ms: string): number {
  return (h ? +h * 3600 : 0) + +m * 60 + +s + +ms / 1000;
}

function stripTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\\N|\\n/g, " ")
    .replace(/\\h/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseVtt(vtt: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const lines = vtt.replace(/\r/g, "").split("\n");
  let i = 0;
  while (i < lines.length) {
    const m = VTT_TIMESTAMP_RE.exec(lines[i]);
    if (!m) {
      i++;
      continue;
    }
    const start = vttToSeconds(m[1], m[2], m[3], m[4]);
    const end = vttToSeconds(m[5], m[6], m[7], m[8]);
    i++;
    const parts: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      parts.push(lines[i]);
      i++;
    }
    const text = stripTags(parts.join(" "));
    if (text && end > start) cues.push({ text, start, end });
    i++;
  }
  return cues;
}

function parseAssTime(t: string): number {
  const m = ASS_TIME_RE.exec(t.trim());
  if (!m) return NaN;
  const ms = m[4].length === 2 ? +m[4] * 10 : +m[4];
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + ms / 1000;
}

export function parseAss(ass: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  const lines = ass.replace(/\r/g, "").split("\n");
  let inEvents = false;
  let format: string[] | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("[")) {
      inEvents = line.toLowerCase() === "[events]";
      format = null;
      continue;
    }
    if (!inEvents) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const key = line.substring(0, colonIdx).trim().toLowerCase();
    const value = line.substring(colonIdx + 1);

    if (key === "format") {
      format = value.split(",").map((s) => s.trim().toLowerCase());
      continue;
    }
    if (key !== "dialogue" || !format) continue;

    const fieldCount = format.length;
    let idx = 0;
    let commas = 0;
    while (commas < fieldCount - 1) {
      const next = value.indexOf(",", idx);
      if (next < 0) break;
      idx = next + 1;
      commas++;
    }
    if (commas < fieldCount - 1) continue;
    const head = value.substring(0, idx - 1).split(",");
    const textRaw = value.substring(idx);

    const startIdx = format.indexOf("start");
    const endIdx = format.indexOf("end");
    const nameIdx = format.indexOf("name");
    const styleIdx = format.indexOf("style");
    if (startIdx < 0 || endIdx < 0) continue;

    const start = parseAssTime(head[startIdx]);
    const end = parseAssTime(head[endIdx]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

    const text = stripTags(textRaw);
    if (!text) continue;
    const speaker = nameIdx >= 0 ? head[nameIdx]?.trim() : undefined;
    const style = styleIdx >= 0 ? head[styleIdx]?.trim() : undefined;
    cues.push({ text, start, end, speaker: speaker || undefined, style: style || undefined });
  }
  return cues;
}

export function parseSubtitle(text: string, format: SubtitleFormat): SubtitleCue[] {
  switch (format) {
    case "vtt":
      return parseVtt(text);
    case "ass":
      return parseAss(text);
  }
}

export function guessFormat(url: string): SubtitleFormat | null {
  const lower = url.toLowerCase();
  if (lower.includes(".vtt")) return "vtt";
  if (lower.includes(".ass")) return "ass";
  return null;
}
