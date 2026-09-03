import { describe, expect, it } from "vitest";
import {
  DdpFrameAssembler,
  parseDdpPacket,
} from "../scripts/ddp-frame-assembler.ts";

function ddp(
  offset: number,
  data: Uint8Array,
  push = false,
  sequence = 1,
): Uint8Array {
  const packet = new Uint8Array(10 + data.byteLength);
  packet.set([push ? 0x41 : 0x40, sequence, 0x0b, 0x01]);
  const view = new DataView(packet.buffer);
  view.setUint32(4, offset, false);
  view.setUint16(8, data.byteLength, false);
  packet.set(data, 10);
  return packet;
}

describe("DDP frame assembler", () => {
  it("parses one bounded RGB packet", () => {
    expect(parseDdpPacket(ddp(3, Uint8Array.from([1, 2, 3]), true, 15))).toEqual({
      sequence: 15,
      push: true,
      offset: 3,
      data: Uint8Array.from([1, 2, 3]),
    });
    expect(parseDdpPacket(ddp(1, Uint8Array.from([1, 2, 3])))).toBeUndefined();
    expect(parseDdpPacket(ddp(0, new Uint8Array(1_443)))).toBeUndefined();
  });

  it("emits only one complete logical frame after the push packet", () => {
    const assembler = new DdpFrameAssembler({ pixelCount: 481 });
    expect(assembler.push(ddp(0, new Uint8Array(1_440).fill(11)), "192.168.1.4", 1)).toBeUndefined();
    const frame = assembler.push(
      ddp(1_440, Uint8Array.from([21, 22, 23]), true, 2),
      "192.168.1.4",
      2,
    );
    expect(frame?.pixels).toHaveLength(1_443);
    expect(frame?.pixels.slice(1_440)).toEqual(Uint8Array.from([21, 22, 23]));
    expect(frame?.sender).toBe("192.168.1.4");
    expect(assembler.statistics.completedFrames).toBe(1);
  });

  it("rejects gaps, overlaps, mixed senders, and late partial frames", () => {
    const assembler = new DdpFrameAssembler({ pixelCount: 4, partialFrameTimeoutMs: 50 });
    assembler.push(ddp(0, Uint8Array.from([1, 2, 3])), "10.0.0.2", 1);
    assembler.push(ddp(6, Uint8Array.from([4, 5, 6]), true), "10.0.0.2", 2);
    assembler.push(ddp(0, Uint8Array.from([1, 2, 3])), "10.0.0.2", 3);
    assembler.push(ddp(3, Uint8Array.from([4, 5, 6])), "10.0.0.3", 4);
    assembler.push(ddp(3, Uint8Array.from([4, 5, 6])), "10.0.0.2", 5);
    assembler.push(ddp(3, Uint8Array.from([7, 8, 9])), "10.0.0.2", 6);
    assembler.push(ddp(0, Uint8Array.from([1, 2, 3])), "10.0.0.2", 10);
    assembler.expire(61);
    expect(assembler.statistics).toMatchObject({
      packetsRejected: 2,
      incompleteFrames: 3,
      completedFrames: 0,
    });
  });

  it("lets a new sender take control at a frame boundary", () => {
    const assembler = new DdpFrameAssembler({ pixelCount: 2 });
    assembler.push(ddp(0, Uint8Array.from([1, 2, 3])), "10.0.0.2", 1);
    const frame = assembler.push(
      ddp(0, Uint8Array.from([4, 5, 6, 7, 8, 9]), true),
      "10.0.0.3",
      2,
    );
    expect(frame?.pixels).toEqual(Uint8Array.from([4, 5, 6, 7, 8, 9]));
    expect(assembler.statistics.senderChanges).toBe(1);
  });
});
