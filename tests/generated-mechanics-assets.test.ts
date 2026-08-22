import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import {
  createGeneratedMechanicsZip,
} from "../web/src/GeneratedMechanicsAssets.ts";

describe("generated mechanics STL ZIP", () => {
  it("keeps canonical paths and exact verified bytes in one deterministic ZIP", () => {
    const mechanics = {
      boundary: {
        source: "mechanics/boundary.stl",
        bytes: Uint8Array.of(1, 2, 3),
      },
      parts: [
        {
          source: "mechanics/parts/part-002.stl",
          bytes: Uint8Array.of(7, 8, 9),
        },
        {
          source: "mechanics/parts/part-001.stl",
          bytes: Uint8Array.of(4, 5, 6),
        },
      ],
    };

    const supplements = [{
      path: "assembly-manual.html",
      bytes: new TextEncoder().encode("<!doctype html><title>Manual</title>"),
    }];
    const first = createGeneratedMechanicsZip(mechanics, supplements);
    const second = createGeneratedMechanicsZip(mechanics, supplements);
    expect(first).toEqual(second);
    expect(unzipSync(first)).toEqual({
      "assembly-manual.html": supplements[0]!.bytes,
      "mechanics/boundary.stl": Uint8Array.of(1, 2, 3),
      "mechanics/parts/part-001.stl": Uint8Array.of(4, 5, 6),
      "mechanics/parts/part-002.stl": Uint8Array.of(7, 8, 9),
    });
  });

  it("rejects duplicate, unsafe, and non-STL entries", () => {
    const boundary = {
      source: "mechanics/boundary.stl",
      bytes: Uint8Array.of(1),
    };
    expect(() => createGeneratedMechanicsZip({
      boundary,
      parts: [{ ...boundary }],
    })).toThrow(/duplicate path mechanics\/boundary\.stl/);
    expect(() => createGeneratedMechanicsZip({
      boundary,
      parts: [{ source: "../escape.stl", bytes: Uint8Array.of(2) }],
    })).toThrow(/safe portable path/);
    expect(() => createGeneratedMechanicsZip({
      boundary,
      parts: [{ source: "mechanics/part.obj", bytes: Uint8Array.of(2) }],
    })).toThrow(/must be an STL file/);
    expect(() => createGeneratedMechanicsZip(
      { boundary, parts: [] },
      [{ path: boundary.source, bytes: Uint8Array.of(2) }],
    )).toThrow(/duplicate path mechanics\/boundary\.stl/);
  });
});
