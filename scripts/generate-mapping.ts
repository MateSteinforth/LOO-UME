import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import {
  createHardwareMappingContract,
  validateLedmapEquivalence,
} from "../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const hardwareExport = process.argv.includes("--hardware");
const project = await loadPanelAssemblyProjectFromFile(
  "sculptures/rhombicosidodecahedron/sculpture.json",
  repoRoot,
);
const geometry = createPanelAssemblyMapping(project);
const wiring = createProvisionalWiringPreview(
  geometry,
  project.sculpture,
  project.panelProfile,
);
const contract = createHardwareMappingContract(
  geometry,
  wiring,
  project.panelProfile,
);
const equivalenceErrors = validateLedmapEquivalence(
  contract.mapping,
  contract.ledmap,
);

if (equivalenceErrors.length > 0) {
  throw new Error(equivalenceErrors.join("\n"));
}
if (hardwareExport && !contract.readiness.ready) {
  throw new Error(
    "Refusing hardware ledmap.json export:\n- " +
      contract.readiness.blockers.join("\n- "),
  );
}

const layoutDirectory = path.join(repoRoot, "layout");
const wledDirectory = path.join(repoRoot, "wled");
mkdirSync(layoutDirectory, { recursive: true });
mkdirSync(wledDirectory, { recursive: true });

const panelMap = {
  schemaVersion: "1.0.0",
  id: contract.mapping.id,
  topology: contract.mapping.topology,
  notes: contract.mapping.notes,
  status: contract.readiness.ready ? "measured" : "provisional",
  hardwareReady: contract.readiness.ready,
  ledmapFingerprint: contract.fingerprint,
  readinessBlockers: contract.readiness.blockers,
  assumptions: {
    withinPanelOrder: project.panelProfile.pixelGrid.provisionalOrder,
    note: "The panel JSON drives addressing; retain provisional status until a numbered bench test confirms it.",
  },
  outputs: contract.outputs,
  wiring,
  panels: contract.mapping.panels,
  leds: contract.mapping.entries,
};

writeFileSync(
  path.join(layoutDirectory, "panel-map.json"),
  JSON.stringify(panelMap, null, 2) + "\n",
);

const ledmapName = hardwareExport
  ? "ledmap.json"
  : "ledmap.provisional.json";
writeFileSync(
  path.join(wledDirectory, ledmapName),
  JSON.stringify(contract.ledmap) + "\n",
);

console.log(
  "Generated layout/panel-map.json and wled/" +
    ledmapName +
    " (" +
    contract.ledmap.map.length +
    " LEDs, fingerprint " +
    contract.fingerprint +
    ").",
);
if (!contract.readiness.ready) {
  console.log(
    "Hardware export remains blocked by " +
      contract.readiness.blockers.length +
      " measured-data requirements.",
  );
}
