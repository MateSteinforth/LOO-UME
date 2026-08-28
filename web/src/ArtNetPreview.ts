import type { LedMappingEntry } from "./LedMapping.ts";

const STREAM_HEADER_BYTES = 28;
const STREAM_MAGIC = [0x4c, 0x55, 0x4d, 0x46] as const;

export interface ArtNetPreviewFrame {
  sequence: number;
  universeCount: number;
  completedFrames: number;
  incompleteFrames: number;
  rejectedPackets: number;
  duplicatePackets: number;
  physicalRgb: Uint8Array;
}

export interface ArtNetPreviewStartOptions {
  pixelCount: number;
  startUniverse: number;
  mappingFingerprint: string;
  onFrame(frame: ArtNetPreviewFrame): void;
}

export class ArtNetPreviewRecordParser {
  private buffered = new Uint8Array();

  push(chunk: Uint8Array): ArtNetPreviewFrame[] {
    const combined = new Uint8Array(this.buffered.byteLength + chunk.byteLength);
    combined.set(this.buffered);
    combined.set(chunk, this.buffered.byteLength);
    this.buffered = combined;
    const frames: ArtNetPreviewFrame[] = [];
    while (this.buffered.byteLength >= STREAM_HEADER_BYTES) {
      if (STREAM_MAGIC.some((byte, index) => this.buffered[index] !== byte)) {
        throw new Error("The Art-Net preview stream has an invalid frame marker.");
      }
      const view = new DataView(
        this.buffered.buffer,
        this.buffered.byteOffset,
        this.buffered.byteLength,
      );
      if (view.getUint8(4) !== 1) {
        throw new Error("The Art-Net preview stream version is not supported.");
      }
      const payloadBytes = view.getUint32(24, false);
      if (payloadBytes < 3 || payloadBytes > 2_624 * 3 || payloadBytes % 3 !== 0) {
        throw new Error("The Art-Net preview stream has an invalid RGB payload size.");
      }
      const recordBytes = STREAM_HEADER_BYTES + payloadBytes;
      if (this.buffered.byteLength < recordBytes) break;
      frames.push({
        sequence: view.getUint8(5),
        universeCount: view.getUint16(6, false),
        completedFrames: view.getUint32(8, false),
        incompleteFrames: view.getUint32(12, false),
        rejectedPackets: view.getUint32(16, false),
        duplicatePackets: view.getUint32(20, false),
        physicalRgb: this.buffered.slice(STREAM_HEADER_BYTES, recordBytes),
      });
      this.buffered = this.buffered.slice(recordBytes);
    }
    return frames;
  }
}

export function physicalRgbToLogicalPixels(
  physicalRgb: Uint8Array,
  entries: readonly LedMappingEntry[],
): Uint32Array {
  if (physicalRgb.byteLength !== entries.length * 3) {
    throw new Error("The Art-Net preview frame does not match the loaded LED count.");
  }
  const logical = new Uint32Array(entries.length);
  for (const entry of entries) {
    if (
      entry.physicalIndex < 0 ||
      entry.physicalIndex >= entries.length ||
      entry.logicalIndex < 0 ||
      entry.logicalIndex >= entries.length
    ) {
      throw new Error("The loaded mapping contains an invalid preview index.");
    }
    const offset = entry.physicalIndex * 3;
    logical[entry.logicalIndex] =
      (physicalRgb[offset]! << 16) |
      (physicalRgb[offset + 1]! << 8) |
      physicalRgb[offset + 2]!;
  }
  return logical;
}

export class ArtNetPreviewClient {
  private abortController: AbortController | undefined;

  get active(): boolean {
    return this.abortController !== undefined;
  }

  stop(): void {
    this.abortController?.abort();
    this.abortController = undefined;
  }

  async start(options: ArtNetPreviewStartOptions): Promise<void> {
    if (this.abortController) {
      throw new Error("The MadMapper preview is already active.");
    }
    const abortController = new AbortController();
    this.abortController = abortController;
    const query = new URLSearchParams({
      pixels: String(options.pixelCount),
      startUniverse: String(options.startUniverse),
      fingerprint: options.mappingFingerprint,
    });
    try {
      const response = await fetch(`./api/artnet-preview/stream?${query}`, {
        headers: { "X-LOO-UME-ArtNet-Preview": "1" },
        signal: abortController.signal,
      });
      if (!response.ok || !response.body) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error ?? `Art-Net preview failed with HTTP ${response.status}.`);
      }
      const parser = new ArtNetPreviewRecordParser();
      const reader = response.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const frame of parser.push(value)) options.onFrame(frame);
      }
      if (!abortController.signal.aborted) {
        throw new Error("The Art-Net preview stream closed unexpectedly.");
      }
    } catch (error) {
      if (!abortController.signal.aborted) throw error;
    } finally {
      if (this.abortController === abortController) this.abortController = undefined;
    }
  }
}
