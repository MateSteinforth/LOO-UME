import { describe, expect, it } from "vitest";
import {
  DdpPreviewRecordParser,
  logicalRgbToPixels,
} from "../web/src/DdpPreview.ts";

function record(payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(28 + payload.byteLength);
  bytes.set([0x4c, 0x55, 0x44, 0x44, 1, 9]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 12, false);
  view.setUint32(12, 3, false);
  view.setUint32(16, 4, false);
  view.setUint32(20, 5, false);
  view.setUint32(24, payload.byteLength, false);
  bytes.set(payload, 28);
  return bytes;
}

describe("browser DDP preview", () => {
  it("parses records split at arbitrary stream boundaries", () => {
    const parser = new DdpPreviewRecordParser();
    const bytes = record(Uint8Array.from([1, 2, 3, 4, 5, 6]));
    expect(parser.push(bytes.slice(0, 12))).toEqual([]);
    expect(parser.push(bytes.slice(12))).toEqual([{
      sequence: 9,
      completedFrames: 12,
      incompleteFrames: 3,
      rejectedPackets: 4,
      senderChanges: 5,
      logicalRgb: Uint8Array.from([1, 2, 3, 4, 5, 6]),
    }]);
  });

  it("keeps DDP pixels in logical renderer order", () => {
    expect(logicalRgbToPixels(
      Uint8Array.from([10, 20, 30, 40, 50, 60]),
      2,
    )).toEqual(Uint32Array.from([0x0a141e, 0x28323c]));
  });
});
