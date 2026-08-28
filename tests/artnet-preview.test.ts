import { describe, expect, it } from "vitest";
import type { LedMappingEntry } from "../web/src/LedMapping.ts";
import {
  ArtNetPreviewRecordParser,
  physicalRgbToLogicalPixels,
} from "../web/src/ArtNetPreview.ts";

function record(payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(28 + payload.byteLength);
  bytes.set([0x4c, 0x55, 0x4d, 0x46, 1, 9, 0, 2]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 12, false);
  view.setUint32(12, 3, false);
  view.setUint32(16, 4, false);
  view.setUint32(20, 5, false);
  view.setUint32(24, payload.byteLength, false);
  bytes.set(payload, 28);
  return bytes;
}

describe("browser Art-Net preview", () => {
  it("parses records split at arbitrary stream chunk boundaries", () => {
    const parser = new ArtNetPreviewRecordParser();
    const bytes = record(Uint8Array.from([1, 2, 3, 4, 5, 6]));
    expect(parser.push(bytes.slice(0, 7))).toEqual([]);
    expect(parser.push(bytes.slice(7, 30))).toEqual([]);
    expect(parser.push(bytes.slice(30))).toEqual([{
      sequence: 9,
      universeCount: 2,
      completedFrames: 12,
      incompleteFrames: 3,
      rejectedPackets: 4,
      duplicatePackets: 5,
      physicalRgb: Uint8Array.from([1, 2, 3, 4, 5, 6]),
    }]);
  });

  it("maps direct physical RGB addresses into logical renderer order", () => {
    const entries = [
      { physicalIndex: 1, logicalIndex: 0 },
      { physicalIndex: 0, logicalIndex: 1 },
    ] as LedMappingEntry[];
    expect(physicalRgbToLogicalPixels(
      Uint8Array.from([10, 20, 30, 40, 50, 60]),
      entries,
    )).toEqual(Uint32Array.from([0x28323c, 0x0a141e]));
  });
});
