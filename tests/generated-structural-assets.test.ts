import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import {
  createGeneratedStructureZip,
  type VerifiedStructuralAsset,
} from "../web/src/GeneratedStructuralAssets.ts";

function artifact(
  source: string,
  bytes: Uint8Array,
): VerifiedStructuralAsset {
  return {
    id: source,
    role: "part",
    format: "stl",
    source,
    url: `blob:${source}`,
    bytes,
    sha256: "0".repeat(64),
  };
}

describe("generated structural ZIP", () => {
  it("downloads the exact displayed artifact set as one deterministic ZIP", () => {
    const structure = {
      artifacts: [
        artifact("structure/parts/connector-b.stl", Uint8Array.of(4, 5)),
        artifact("structure/parts/connector-a.stl", Uint8Array.of(1, 2, 3)),
      ],
    };

    const first = createGeneratedStructureZip(structure);
    const second = createGeneratedStructureZip(structure);
    expect(first).toEqual(second);
    expect(unzipSync(first)).toEqual({
      "structure/parts/connector-a.stl": Uint8Array.of(1, 2, 3),
      "structure/parts/connector-b.stl": Uint8Array.of(4, 5),
    });
  });

  it("rejects unsafe and duplicate paths", () => {
    expect(() => createGeneratedStructureZip({
      artifacts: [artifact("../escape.stl", Uint8Array.of(1))],
    })).toThrow(/safe portable path/);
    expect(() => createGeneratedStructureZip({
      artifacts: [
        artifact("structure/part.stl", Uint8Array.of(1)),
        artifact("structure/part.stl", Uint8Array.of(2)),
      ],
    })).toThrow(/duplicate path structure\/part\.stl/);
  });
});
