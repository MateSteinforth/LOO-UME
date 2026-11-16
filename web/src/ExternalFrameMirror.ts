export type RgbPixel = [number, number, number];

export interface ExternalFrameMirrorStatistics {
  sentFrames: number;
  replacedFrames: number;
}

export interface ExternalFrameMirrorStartOptions {
  minFrameIntervalMs?: number;
  send(pixels: readonly RgbPixel[]): Promise<void>;
  onStatistics?(statistics: ExternalFrameMirrorStatistics): void;
  onError?(error: unknown): void;
}

export function logicalPixelsToRgbFramebuffer(pixels: Uint32Array): RgbPixel[] {
  if (pixels.length < 1 || pixels.length > 2_624) {
    throw new Error(
      "External frame output requires from 1 through 2,624 RGB pixels.",
    );
  }
  return Array.from(pixels, (packed) => [
    (packed >> 16) & 0xff,
    (packed >> 8) & 0xff,
    packed & 0xff,
  ]);
}

export class ExternalFrameMirrorQueue {
  private revision = 0;
  private options: ExternalFrameMirrorStartOptions | undefined;
  private request: Promise<void> | undefined;
  private pending: readonly RgbPixel[] | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private nextSendAt = 0;
  private statisticsValue: ExternalFrameMirrorStatistics = {
    sentFrames: 0,
    replacedFrames: 0,
  };

  get active(): boolean {
    return this.options !== undefined;
  }

  get statistics(): ExternalFrameMirrorStatistics {
    return { ...this.statisticsValue };
  }

  start(options: ExternalFrameMirrorStartOptions): void {
    if (this.options)
      throw new Error("The sculpture mirror is already active.");
    if (
      !Number.isFinite(options.minFrameIntervalMs ?? 0) ||
      (options.minFrameIntervalMs ?? 0) < 0
    )
      throw new Error("Frame interval must be finite and nonnegative.");
    this.revision += 1;
    this.options = options;
    this.pending = undefined;
    this.statisticsValue = { sentFrames: 0, replacedFrames: 0 };
    options.onStatistics?.(this.statistics);
  }

  stop(): void {
    this.revision += 1;
    this.options = undefined;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = undefined;
  }

  async drain(): Promise<void> {
    await this.request?.catch(() => undefined);
  }

  push(pixels: readonly RgbPixel[]): void {
    if (!this.options) return;
    if (this.pending) this.statisticsValue.replacedFrames += 1;
    this.pending = pixels;
    this.options.onStatistics?.(this.statistics);
    this.flush();
  }

  private flush(): void {
    const options = this.options;
    if (!options || this.request || !this.pending || this.timer) return;
    const remaining = this.nextSendAt - performance.now();
    if (remaining > 0) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.flush();
      }, Math.ceil(remaining));
      return;
    }
    const revision = this.revision;
    const pixels = this.pending;
    this.pending = undefined;
    const now = performance.now();
    const interval = options.minFrameIntervalMs ?? 0;
    // Advance from the deadline, not the late timer callback. Skip missed slots.
    this.nextSendAt = Math.max(
      this.nextSendAt + interval,
      now + interval - Math.min(1, interval),
    );
    let request: Promise<void>;
    try {
      request = Promise.resolve(options.send(pixels));
    } catch (error) {
      this.stop();
      options.onError?.(error);
      return;
    }
    this.request = request;
    void request
      .then(() => {
        if (revision !== this.revision || this.options !== options) return;
        this.statisticsValue.sentFrames += 1;
        options.onStatistics?.(this.statistics);
      })
      .catch((error) => {
        if (revision !== this.revision || this.options !== options) return;
        this.stop();
        options.onError?.(error);
      })
      .finally(() => {
        if (this.request !== request) return;
        this.request = undefined;
        this.flush();
      });
  }
}
