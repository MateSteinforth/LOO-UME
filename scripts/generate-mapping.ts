import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import { sculptureJson } from "../src/sculpture/SculptureEditor.ts";
import {
  createHardwareMappingContract,
  validateLedmapEquivalence,
} from "../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";
import {
  createWledDeploymentBundle,
} from "../src/wled/DeploymentContract.ts";

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
if (hardwareExport && !contract.readiness.mappingReady) {
  throw new Error(
    "Refusing mapping ledmap.json export:\n- " +
      contract.readiness.blockers.join("\n- "),
  );
}

const layoutDirectory = path.join(repoRoot, "layout");
mkdirSync(layoutDirectory, { recursive: true });

const panelMap = {
  schemaVersion: "1.0.0",
  id: contract.mapping.id,
  topology: contract.mapping.topology,
  panelPixelGrid: contract.mapping.panelPixelGrid,
  notes: contract.mapping.notes,
  status: contract.mapping.status,
  hardwareReady: contract.readiness.ready,
  mappingReady: contract.readiness.mappingReady,
  ledmapFingerprint: contract.fingerprint,
  readinessBlockers: contract.readiness.blockers,
  wiringLifecycle: contract.readiness.wiringLifecycle,
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

const deployment = createWledDeploymentBundle(
  contract,
  sculptureJson(project.sculpture),
  hardwareExport ? "installation" : "diagnostic",
);
for (const [relativePath, bytes] of deployment.files) {
  const destination = path.join(repoRoot, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
}
console.log(
  `${deployment.mode === "installation" ? "Installation" : "Diagnostic"} deployment identity ${deployment.deploymentIdentity}.`,
);

console.log(
  "Generated layout/panel-map.json and " +
    [...deployment.files.keys()].join(", ") +
    " (" +
    contract.ledmap.map.length +
    " LEDs, fingerprint " +
    contract.fingerprint +
    ").",
);
if (contract.readiness.mappingReady && !contract.readiness.ready) {
  console.log(
    "Mapping is ready under the selected assumptions; electrical protection remains separate.",
  );
}
