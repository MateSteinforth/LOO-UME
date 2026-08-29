import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import {
  createFabricationPackageZip,
  FABRICATION_LABEL_PDF,
  FABRICATION_MANUAL_PDF,
} from "../web/src/FabricationPackage.ts";
import type { VerifiedStructuralAsset } from "../web/src/GeneratedStructuralAssets.ts";
import type { VerifiedGeneratedAsset } from "../web/src/GeneratedMechanicsAssets.ts";

const manualPdf = new TextEncoder().encode("%PDF-1.7\nmanual\n%%EOF\n");

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

function planarAsset(source: string, bytes: Uint8Array): VerifiedGeneratedAsset {
  return {
    id: source,
    source,
    url: `blob:${source}`,
    bytes,
    sha256: "1".repeat(64),
    inspection: {
      format: "ascii",
      triangles: 1,
      bounds: {
        minimum: [0, 0, 0],
        maximum: [1, 1, 1],
      },
    },
  };
}

describe("fabrication ZIP", () => {
  it("always contains the printable panel-label PDF", () => {
    const entries = unzipSync(createFabricationPackageZip(
      ["P-01", "P-02"],
      { manufacturingManualPdf: manualPdf },
    ));
    expect(Object.keys(entries).sort()).toEqual([
      FABRICATION_LABEL_PDF,
      FABRICATION_MANUAL_PDF,
    ].sort());
    expect(new TextDecoder().decode(entries[FABRICATION_LABEL_PDF]!))
      .toContain("%LOOUME-HERMA-4385");
    expect(entries[FABRICATION_MANUAL_PDF]).toEqual(manualPdf);
  });

  it("combines every current verified planar and structural fabrication file", () => {
    const entries = unzipSync(createFabricationPackageZip(["P-01"], {
      manufacturingManualPdf: manualPdf,
      mechanics: {
        boundary: planarAsset("mechanics/boundary.stl", Uint8Array.of(6)),
        parts: [
          planarAsset("mechanics/parts/closure.stl", Uint8Array.of(7, 8)),
        ],
      },
      structure: {
        artifacts: [
          artifact("structure/parts/b.stl", Uint8Array.of(4, 5)),
          artifact("structure/parts/a.stl", Uint8Array.of(1, 2, 3)),
        ],
      },
    }));
    expect(entries).toMatchObject({
      [FABRICATION_LABEL_PDF]: expect.any(Uint8Array),
      [FABRICATION_MANUAL_PDF]: manualPdf,
      "mechanics/boundary.stl": Uint8Array.of(6),
      "mechanics/parts/closure.stl": Uint8Array.of(7, 8),
      "structure/parts/a.stl": Uint8Array.of(1, 2, 3),
      "structure/parts/b.stl": Uint8Array.of(4, 5),
    });
  });

  it("rejects collisions between verified fabrication sets", () => {
    expect(() => createFabricationPackageZip(["P-01"], {
      manufacturingManualPdf: manualPdf,
      mechanics: {
        boundary: planarAsset("shared/file.stl", Uint8Array.of(1)),
        parts: [],
      },
      structure: {
        artifacts: [artifact("shared/file.stl", Uint8Array.of(2))],
      },
    })).toThrow("duplicate path shared/file.stl");
  });
});
