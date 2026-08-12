import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import { validateMapping } from "../web/src/LedMapping.ts";
import {
  createProvisionalWiringPreview,
  validateWiringPreview,
} from "../web/src/WiringPreview.ts";

const project = await loadPanelAssemblyProjectFromFile(
  "sculptures/rhombicosidodecahedron/sculpture.json",
);
const mapping = createPanelAssemblyMapping(project);
const mappingValidation = validateMapping(mapping, mapping.entries.length);
if (!mappingValidation.valid) {
  throw new Error(mappingValidation.errors.join("\n"));
}

const wiring = createProvisionalWiringPreview(
  mapping,
  project.sculpture,
  project.panelProfile,
);
const wiringValidation = validateWiringPreview(wiring, mapping);
if (!wiringValidation.valid) {
  throw new Error(wiringValidation.errors.join("\n"));
}

const contract = createHardwareMappingContract(
  mapping,
  wiring,
  project.panelProfile,
);
console.log(
  `Validated ${project.sculpture.id}: ${mapping.panels.length} panels, ` +
    `${mapping.entries.length} LEDs, ${wiring.outputs.length} outputs, ` +
    "manual authored-part mechanics, " +
    `fingerprint ${contract.fingerprint}.`,
);
if (!contract.readiness.ready) {
  console.log(
    `Hardware export remains blocked by ${contract.readiness.blockers.length} ` +
      "measured-data requirements.",
  );
}
