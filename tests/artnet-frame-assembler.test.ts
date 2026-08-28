import { describe, expect, it } from "vitest";
import {
  ArtNetFrameAssembler,
  parseArtDmx,
} from "../scripts/artnet-frame-assembler.ts";

function artDmx(universe: number, data: Uint8Array, sequence = 1): Uint8Array {
  const packet = new Uint8Array(18 + data.byteLength);
  packet.set([0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00]);
  packet.set([0x00, 0x50, 0x00, 0x0e, sequence, 0x00], 8);
  packet[14] = universe & 0xff;
  packet[15] = universe >> 8;
  packet[16] = data.byteLength >> 8;
  packet[17] = data.byteLength & 0xff;
  packet.set(data, 18);
  return packet;
}

describe("Art-Net frame assembler", () => {
  it("parses an ArtDMX packet with protocol byte order", () => {
    expect(parseArtDmx(artDmx(258, Uint8Array.from([1, 2, 3, 4])))).toEqual({
      sequence: 1,
      universe: 258,
      data: Uint8Array.from([1, 2, 3, 4]),
    });
    const wrongOpcode = artDmx(1, Uint8Array.from([1, 2]));
    wrongOpcode[9] = 0x51;
    expect(parseArtDmx(wrongOpcode)).toBeUndefined();
  });

  it("assembles 2,624 physical RGB pixels from 16 out-of-order universes", () => {
    const assembler = new ArtNetFrameAssembler({ pixelCount: 2_624 });
    let frame;
    for (let universe = 16; universe >= 1; universe -= 1) {
      const pixelCount = universe === 16 ? 74 : 170;
      frame = assembler.push(
        artDmx(universe, new Uint8Array(pixelCount * 3).fill(universe), 42),
        "127.0.0.1",
        1_000 + universe,
      ) ?? frame;
    }
    expect(frame?.sequence).toBe(42);
    expect(frame?.pixels).toHaveLength(2_624 * 3);
    expect(frame?.pixels.slice(0, 3)).toEqual(Uint8Array.from([1, 1, 1]));
    expect(frame?.pixels.slice(2_550 * 3, 2_550 * 3 + 3)).toEqual(
      Uint8Array.from([16, 16, 16]),
    );
    expect(assembler.statistics).toMatchObject({
      packetsReceived: 16,
      completedFrames: 1,
      incompleteFrames: 0,
    });
  });

  it("rejects non-loopback, unexpected, and incorrectly sized packets", () => {
    const assembler = new ArtNetFrameAssembler({ pixelCount: 192 });
    expect(assembler.push(artDmx(1, new Uint8Array(510)), "192.168.1.4")).toBeUndefined();
    expect(assembler.push(artDmx(3, new Uint8Array(66)), "127.0.0.1")).toBeUndefined();
    expect(assembler.push(artDmx(2, new Uint8Array(64)), "127.0.0.1")).toBeUndefined();
    expect(assembler.statistics.packetsRejected).toBe(3);
  });

  it("expires incomplete frames and rejects a late older sequence", () => {
    const assembler = new ArtNetFrameAssembler({
      pixelCount: 192,
      partialFrameTimeoutMs: 50,
    });
    assembler.push(artDmx(1, new Uint8Array(510), 8), "127.0.0.1", 1_000);
    assembler.expire(1_051);
    expect(assembler.statistics.incompleteFrames).toBe(1);

    assembler.push(artDmx(1, new Uint8Array(510), 10), "127.0.0.1", 2_000);
    assembler.push(artDmx(1, new Uint8Array(510), 9), "127.0.0.1", 2_001);
    expect(assembler.statistics.packetsRejected).toBe(1);
  });

  it("uses a repeated universe as the next frame boundary when sequence is zero", () => {
    const assembler = new ArtNetFrameAssembler({ pixelCount: 192 });
    assembler.push(artDmx(1, new Uint8Array(510).fill(1), 0), "127.0.0.1", 1);
    assembler.push(artDmx(1, new Uint8Array(510).fill(2), 0), "127.0.0.1", 2);
    const frame = assembler.push(
      artDmx(2, new Uint8Array(66).fill(3), 0),
      "127.0.0.1",
      3,
    );
    expect(frame?.pixels[0]).toBe(2);
    expect(frame?.pixels[510]).toBe(3);
    expect(assembler.statistics).toMatchObject({
      duplicatePackets: 1,
      incompleteFrames: 1,
      completedFrames: 1,
    });
  });
});
