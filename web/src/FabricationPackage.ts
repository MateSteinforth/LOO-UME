import { unzipSync, zipSync } from "fflate";
import {
  createGeneratedStructureZip,
  type VerifiedGeneratedStructure,
} from "./GeneratedStructuralAssets.ts";
import { createHerma4385PanelLabelsPdf } from "./PanelLabelSheet.ts";

export const FABRICATION_LABEL_PDF = "panel-labels-herma-4385.pdf";

export function createFabricationPackageZip(
  panelIds: readonly string[],
  structure?: Pick<VerifiedGeneratedStructure, "artifacts">,
): Uint8Array {
  const entries = structure
    ? unzipSync(createGeneratedStructureZip(structure))
    : {};
  if (entries[FABRICATION_LABEL_PDF]) {
    throw new Error(
      `Generated connectors conflict with reserved fabrication path ${FABRICATION_LABEL_PDF}.`,
    );
  }
  entries[FABRICATION_LABEL_PDF] = Uint8Array.from(
    createHerma4385PanelLabelsPdf(panelIds),
  );
  return zipSync(entries, {
    level: 6,
    mtime: new Date("1980-01-01T00:00:00.000Z"),
  });
}
