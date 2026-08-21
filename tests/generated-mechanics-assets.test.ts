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

    const first = createGeneratedMechanicsZip(mechanics);
    const second = createGeneratedMechanicsZip(mechanics);
    expect(first).toEqual(second);
    expect(unzipSync(first)).toEqual({
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
  });
});
