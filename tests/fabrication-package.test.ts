import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import {
  createFabricationPackageZip,
  FABRICATION_LABEL_PDF,
} from "../web/src/FabricationPackage.ts";
import type { VerifiedStructuralAsset } from "../web/src/GeneratedStructuralAssets.ts";

function artifact(source: string, bytes: Uint8Array): VerifiedStructuralAsset {
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

describe("fabrication ZIP", () => {
  it("always contains the printable panel-label PDF", () => {
    const entries = unzipSync(createFabricationPackageZip(["P-01", "P-02"]));
    expect(Object.keys(entries)).toEqual([FABRICATION_LABEL_PDF]);
    expect(new TextDecoder().decode(entries[FABRICATION_LABEL_PDF]!))
      .toContain("%LOOUME-HERMA-4385");
  });

  it("adds every verified connector displayed in the viewport", () => {
    const entries = unzipSync(createFabricationPackageZip(["P-01"], {
      artifacts: [
        artifact("structure/parts/b.stl", Uint8Array.of(4, 5)),
        artifact("structure/parts/a.stl", Uint8Array.of(1, 2, 3)),
      ],
    }));
    expect(entries).toMatchObject({
      [FABRICATION_LABEL_PDF]: expect.any(Uint8Array),
      "structure/parts/a.stl": Uint8Array.of(1, 2, 3),
      "structure/parts/b.stl": Uint8Array.of(4, 5),
    });
  });
});
