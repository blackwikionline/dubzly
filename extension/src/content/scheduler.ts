export interface ScheduledCueInput {
  episodeId: string;
  index: number;
  text: string;
  start: number;
  end: number;
  speaker?: string;
}

type CueState = "pending" | "rendering" | "ready" | "played" | "skipped";

interface InternalCue {
  cue: ScheduledCueInput;
  state: CueState;
  audio?: Blob;
  timer?: number;
}

const LOOKAHEAD_SECONDS = 5;
const RENDER_CONCURRENCY = 3;
const LATE_PLAY_TOLERANCE = 0.5;
const TICK_INTERVAL_MS = 200;

export class CueScheduler {
  private cues: InternalCue[] = [];
  private tickHandle: number | null = null;
  private activeRenders = 0;

  constructor(
    private getTime: () => number,
    private isPaused: () => boolean,
    private renderFn: (cue: ScheduledCueInput) => Promise<Blob | null>,
    private playFn: (audio: Blob) => Promise<void>,
  ) {}

  load(cues: ScheduledCueInput[]): void {
    this.stop();
    this.cues = cues.map((c) => ({ cue: c, state: "pending" }));
  }

  start(): void {
    if (this.tickHandle !== null) return;
    this.tick();
    this.tickHandle = window.setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this.tickHandle !== null) {
      window.clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
    for (const sc of this.cues) {
      if (sc.timer !== undefined) {
        window.clearTimeout(sc.timer);
        sc.timer = undefined;
      }
    }
  }

  onSeek(): void {
    const t = this.getTime();
    for (const sc of this.cues) {
      if (sc.timer !== undefined) {
        window.clearTimeout(sc.timer);
        sc.timer = undefined;
      }
      if (sc.cue.end < t) {
        sc.state = "skipped";
      } else if (sc.cue.start <= t && sc.state === "played") {
        sc.state = sc.audio ? "ready" : "pending";
      } else if (sc.state === "played" && sc.cue.start > t) {
        sc.state = sc.audio ? "ready" : "pending";
      }
    }
  }

  private tick(): void {
    if (this.isPaused()) return;
    const t = this.getTime();

    for (const sc of this.cues) {
      if (sc.state === "played" || sc.state === "skipped") continue;

      const startsIn = sc.cue.start - t;

      if (
        sc.state === "pending" &&
        startsIn >= -LATE_PLAY_TOLERANCE &&
        startsIn <= LOOKAHEAD_SECONDS &&
        this.activeRenders < RENDER_CONCURRENCY
      ) {
        sc.state = "rendering";
        this.activeRenders++;
        this.renderFn(sc.cue)
          .then((blob) => {
            if (blob === null) {
              sc.state = "skipped";
              return;
            }
            sc.audio = blob;
            sc.state = "ready";
          })
          .catch((e) => {
            console.warn("[anime-dub] render failed", sc.cue, e);
            sc.state = "skipped";
          })
          .finally(() => {
            this.activeRenders--;
          });
      }

      if (sc.state === "ready" && sc.timer === undefined && sc.audio) {
        const delayMs = (sc.cue.start - this.getTime()) * 1000;
        if (delayMs <= 0) {
          if (sc.cue.end - this.getTime() > -LATE_PLAY_TOLERANCE) {
            const audio = sc.audio;
            sc.state = "played";
            this.playFn(audio).catch((e) => console.warn("[anime-dub] play failed", e));
          } else {
            sc.state = "skipped";
          }
        } else {
          const audio = sc.audio;
          sc.timer = window.setTimeout(() => {
            sc.timer = undefined;
            sc.state = "played";
            this.playFn(audio).catch((e) => console.warn("[anime-dub] play failed", e));
          }, delayMs);
        }
      }
    }
  }
}
