import { loadCanonicalSculptureProject } from "../src/sculpture/Definition.ts";
import {
  createPanelizedSculptureMapping,
  validateMapping,
} from "../web/src/LedMapping.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import {
  createProvisionalWiringPreview,
  validateWiringPreview,
} from "../web/src/WiringPreview.ts";

const project = loadCanonicalSculptureProject();
const mapping = createPanelizedSculptureMapping(
  project.sculpture,
  project.panelProfile,
);
const mappingValidation = validateMapping(mapping, mapping.entries.length);
if (!mappingValidation.valid) {
  throw new Error(mappingValidation.errors.join("\n"));
}

const wiring = createProvisionalWiringPreview(mapping, project.sculpture);
const wiringValidation = validateWiringPreview(wiring, mapping);
if (!wiringValidation.valid) {
  throw new Error(wiringValidation.errors.join("\n"));
}

const contract = createHardwareMappingContract(
  mapping,
  wiring,
  project.panelProfile,
);
const triangleOpening = project.sculpture.openings.triangleFaces;
const pentagonOpening = project.sculpture.openings.pentagonFaces;
console.log(
  `Validated ${project.sculpture.id}: ${mapping.panels.length} panels, ` +
    `${mapping.entries.length} LEDs, ${wiring.outputs.length} outputs, ` +
    `${triangleOpening.count} ${triangleOpening.closure.partId} closures, ` +
    `${pentagonOpening.population.populatedCount} populated pentagon assemblies, ` +
    `fingerprint ${contract.fingerprint}.`,
);
if (!contract.readiness.ready) {
  console.log(
    `Hardware export remains blocked by ${contract.readiness.blockers.length} ` +
      "measured-data requirements.",
  );
}
