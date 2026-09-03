export type RgbPixel = [number, number, number];

export interface MadMapperOutputStatistics {
  sentFrames: number;
  replacedFrames: number;
}

export interface MadMapperOutputStartOptions {
  send(pixels: readonly RgbPixel[]): Promise<void>;
  onStatistics?(statistics: MadMapperOutputStatistics): void;
  onError?(error: unknown): void;
}

export function logicalPixelsToRgbFramebuffer(
  pixels: Uint32Array,
): RgbPixel[] {
  if (pixels.length < 1 || pixels.length > 2_624) {
    throw new Error("MadMapper output requires from 1 through 2,624 RGB pixels.");
  }
  return Array.from(pixels, (packed) => [
    (packed >> 16) & 0xff,
    (packed >> 8) & 0xff,
    packed & 0xff,
  ]);
}

export class MadMapperOutputQueue {
  private revision = 0;
  private options: MadMapperOutputStartOptions | undefined;
  private request: Promise<void> | undefined;
  private pending: readonly RgbPixel[] | undefined;
  private statisticsValue: MadMapperOutputStatistics = {
    sentFrames: 0,
    replacedFrames: 0,
  };

  get active(): boolean {
    return this.options !== undefined;
  }

  get statistics(): MadMapperOutputStatistics {
    return { ...this.statisticsValue };
  }

  start(options: MadMapperOutputStartOptions): void {
    if (this.options) throw new Error("MadMapper sculpture output is already active.");
    this.revision += 1;
    this.options = options;
    this.pending = undefined;
    this.statisticsValue = { sentFrames: 0, replacedFrames: 0 };
    options.onStatistics?.(this.statistics);
  }

  stop(): void {
    this.revision += 1;
    this.options = undefined;
    this.request = undefined;
    this.pending = undefined;
  }

  push(pixels: readonly RgbPixel[]): void {
    if (!this.options) return;
    if (this.request) {
      if (this.pending) this.statisticsValue.replacedFrames += 1;
      this.pending = pixels;
      this.options.onStatistics?.(this.statistics);
      return;
    }
    this.send(pixels, this.revision);
  }

  private send(pixels: readonly RgbPixel[], revision: number): void {
    const options = this.options;
    if (!options || revision !== this.revision) return;
    const request = options.send(pixels);
    this.request = request;
    void request.then(() => {
      if (revision !== this.revision || this.options !== options) return;
      this.statisticsValue.sentFrames += 1;
      options.onStatistics?.(this.statistics);
    }).catch((error) => {
      if (revision !== this.revision || this.options !== options) return;
      this.stop();
      options.onError?.(error);
    }).finally(() => {
      if (this.request !== request) return;
      this.request = undefined;
      if (revision !== this.revision || this.options !== options) return;
      const pending = this.pending;
      this.pending = undefined;
      if (pending) this.send(pending, revision);
    });
  }
}
