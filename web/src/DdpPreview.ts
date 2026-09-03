const STREAM_HEADER_BYTES = 28;
const STREAM_MAGIC = [0x4c, 0x55, 0x44, 0x44] as const;

export interface DdpPreviewFrame {
  sequence: number;
  completedFrames: number;
  incompleteFrames: number;
  rejectedPackets: number;
  senderChanges: number;
  logicalRgb: Uint8Array;
}

export interface DdpPreviewStartOptions {
  pixelCount: number;
  mappingFingerprint: string;
  onFrame(frame: DdpPreviewFrame): void;
}

export class DdpPreviewRecordParser {
  private buffered = new Uint8Array();

  push(chunk: Uint8Array): DdpPreviewFrame[] {
    const combined = new Uint8Array(this.buffered.byteLength + chunk.byteLength);
    combined.set(this.buffered);
    combined.set(chunk, this.buffered.byteLength);
    this.buffered = combined;
    const frames: DdpPreviewFrame[] = [];
    while (this.buffered.byteLength >= STREAM_HEADER_BYTES) {
      if (STREAM_MAGIC.some((byte, index) => this.buffered[index] !== byte)) {
        throw new Error("The DDP preview stream has an invalid frame marker.");
      }
      const view = new DataView(
        this.buffered.buffer,
        this.buffered.byteOffset,
        this.buffered.byteLength,
      );
      if (view.getUint8(4) !== 1) {
        throw new Error("The DDP preview stream version is not supported.");
      }
      const payloadBytes = view.getUint32(24, false);
      if (payloadBytes < 3 || payloadBytes > 2_624 * 3 || payloadBytes % 3 !== 0) {
        throw new Error("The DDP preview stream has an invalid RGB payload size.");
      }
      const recordBytes = STREAM_HEADER_BYTES + payloadBytes;
      if (this.buffered.byteLength < recordBytes) break;
      frames.push({
        sequence: view.getUint8(5),
        completedFrames: view.getUint32(8, false),
        incompleteFrames: view.getUint32(12, false),
        rejectedPackets: view.getUint32(16, false),
        senderChanges: view.getUint32(20, false),
        logicalRgb: this.buffered.slice(STREAM_HEADER_BYTES, recordBytes),
      });
      this.buffered = this.buffered.slice(recordBytes);
    }
    return frames;
  }
}

export function logicalRgbToPixels(logicalRgb: Uint8Array, pixelCount: number): Uint32Array {
  if (logicalRgb.byteLength !== pixelCount * 3) {
    throw new Error("The DDP preview frame does not match the loaded LED count.");
  }
  const pixels = new Uint32Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 3;
    pixels[index] =
      (logicalRgb[offset]! << 16) |
      (logicalRgb[offset + 1]! << 8) |
      logicalRgb[offset + 2]!;
  }
  return pixels;
}

export class DdpPreviewClient {
  private abortController: AbortController | undefined;

  get active(): boolean {
    return this.abortController !== undefined;
  }

  stop(): void {
    this.abortController?.abort();
    this.abortController = undefined;
  }

  async start(options: DdpPreviewStartOptions): Promise<void> {
    if (this.abortController) throw new Error("The DDP simulator input is already active.");
    const abortController = new AbortController();
    this.abortController = abortController;
    const query = new URLSearchParams({
      pixels: String(options.pixelCount),
      fingerprint: options.mappingFingerprint,
    });
    try {
      const response = await fetch(`./api/ddp-preview/stream?${query}`, {
        headers: { "X-LOO-UME-DDP-Preview": "1" },
        signal: abortController.signal,
      });
      if (!response.ok || !response.body) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error ?? `DDP preview failed with HTTP ${response.status}.`);
      }
      const parser = new DdpPreviewRecordParser();
      const reader = response.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const frame of parser.push(value)) options.onFrame(frame);
      }
      if (!abortController.signal.aborted) {
        throw new Error("The DDP preview stream closed unexpectedly.");
      }
    } catch (error) {
      if (!abortController.signal.aborted) throw error;
    } finally {
      if (this.abortController === abortController) this.abortController = undefined;
    }
  }
}
