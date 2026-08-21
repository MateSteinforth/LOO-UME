import { mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
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
const wledDirectory = path.join(repoRoot, "wled");
mkdirSync(layoutDirectory, { recursive: true });
mkdirSync(wledDirectory, { recursive: true });

const panelMap = {
  schemaVersion: "1.0.0",
  id: contract.mapping.id,
  topology: contract.mapping.topology,
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

const ledmapName = hardwareExport
  ? "ledmap.json"
  : "ledmap.provisional.json";
const ledmapBytes = JSON.stringify(contract.ledmap) + "\n";
writeFileSync(path.join(wledDirectory, ledmapName), ledmapBytes);

if (!hardwareExport) {
  const sculptureBytes = readFileSync(
    path.join(repoRoot, "sculptures/rhombicosidodecahedron/sculpture.json"),
    "utf8",
  );
  const deployment = createWledDeploymentBundle(
    contract,
    ledmapBytes,
    sculptureBytes,
  );
  writeFileSync(
    path.join(wledDirectory, "cfg.provisional.json"),
    deployment.configBytes,
  );
  writeFileSync(
    path.join(wledDirectory, "deployment-manifest.provisional.json"),
    deployment.manifestBytes,
  );
  console.log("Review deployment identity " + deployment.deploymentIdentity + ".");
}

console.log(
  "Generated layout/panel-map.json and wled/" +
    ledmapName +
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
