import { unzipSync, zipSync } from "fflate";
import {
  createGeneratedStructureZip,
  type VerifiedGeneratedStructure,
} from "./GeneratedStructuralAssets.ts";
import {
  createGeneratedMechanicsZip,
  type VerifiedGeneratedMechanics,
} from "./GeneratedMechanicsAssets.ts";
import { createHerma4385PanelLabelsPdf } from "./PanelLabelSheet.ts";

export const FABRICATION_LABEL_PDF = "panel-labels-herma-4385.pdf";
export const FABRICATION_MANUAL_PDF = "manufacturing-manual.pdf";

export interface FabricationPackageContents {
  manufacturingManualPdf: Uint8Array;
  mechanics?: Pick<VerifiedGeneratedMechanics, "boundary" | "parts">;
  structure?: Pick<VerifiedGeneratedStructure, "artifacts">;
}

function addEntries(
  target: Record<string, Uint8Array>,
  additions: Record<string, Uint8Array>,
): void {
  for (const [path, bytes] of Object.entries(additions)) {
    if (target[path]) {
      throw new Error(`Fabrication ZIP contains duplicate path ${path}.`);
    }
    target[path] = Uint8Array.from(bytes);
  }
}

export function createFabricationPackageZip(
  panelIds: readonly string[],
  contents: FabricationPackageContents,
): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  if (contents.mechanics) {
    addEntries(entries, unzipSync(createGeneratedMechanicsZip(contents.mechanics)));
  }
  if (contents.structure) {
    addEntries(entries, unzipSync(createGeneratedStructureZip(contents.structure)));
  }
  if (entries[FABRICATION_LABEL_PDF] || entries[FABRICATION_MANUAL_PDF]) {
    throw new Error("Generated fabrication assets conflict with reserved PDF paths.");
  }
  entries[FABRICATION_LABEL_PDF] = Uint8Array.from(
    createHerma4385PanelLabelsPdf(panelIds),
  );
  entries[FABRICATION_MANUAL_PDF] = Uint8Array.from(
    contents.manufacturingManualPdf,
  );
  return zipSync(entries, {
    level: 6,
    mtime: new Date("1980-01-01T00:00:00.000Z"),
  });
}
