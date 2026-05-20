export class AudioEngine {
  private video: HTMLVideoElement | null = null;
  private originalMuted = false;
  private originalVolume = 1;
  private active: Set<HTMLAudioElement> = new Set();

  enable(video: HTMLVideoElement): void {
    if (this.video === video) return;
    this.disable();
    this.video = video;
    this.originalMuted = video.muted;
    this.originalVolume = video.volume;
    video.muted = true;
    video.addEventListener("pause", this.onPause);
    video.addEventListener("play", this.onPlay);
    video.addEventListener("seeking", this.onSeek);
  }

  disable(): void {
    if (!this.video) return;
    this.video.removeEventListener("pause", this.onPause);
    this.video.removeEventListener("play", this.onPlay);
    this.video.removeEventListener("seeking", this.onSeek);
    this.video.muted = this.originalMuted;
    this.video.volume = this.originalVolume;
    this.stopAll();
    this.video = null;
  }

  async play(blob: Blob): Promise<void> {
    if (!this.video || this.video.paused) return;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    this.active.add(audio);
    audio.addEventListener("ended", () => {
      URL.revokeObjectURL(url);
      this.active.delete(audio);
    });
    try {
      await audio.play();
    } catch (e) {
      console.warn("[anime-dub] audio.play() rejected (autoplay policy?)", e);
      URL.revokeObjectURL(url);
      this.active.delete(audio);
    }
  }

  private onPause = (): void => {
    for (const a of this.active) a.pause();
  };

  private onPlay = (): void => {
    for (const a of this.active) {
      a.play().catch(() => {});
    }
  };

  private onSeek = (): void => {
    this.stopAll();
  };

  private stopAll(): void {
    for (const a of this.active) {
      a.pause();
      a.src = "";
    }
    this.active.clear();
  }
}
