import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { emitPanelClosureCadArtifacts } from "../src/cad/GeneratePanelClosureCad.ts";
import {
  compilePanelAssembly,
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
} from "../src/sculpture/PanelAssembly.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import {
  createProvisionalWiringPreview,
  validateWiringPreview,
} from "../web/src/WiringPreview.ts";

const rootDirectory = process.cwd();
const sculptureFlag = process.argv.indexOf("--sculpture");
const source = sculptureFlag >= 0 ? process.argv[sculptureFlag + 1] : undefined;
if (!source) throw new Error("Pass the source of truth with --sculpture <path-to-sculpture.json>.");
const sculpturePath = resolve(rootDirectory, source);
const sculptureInput: unknown = JSON.parse(await readFile(sculpturePath, "utf8"));
const project = createPanelAssemblyProject(
  sculptureInput,
  relative(rootDirectory, sculpturePath),
);
const assembly = compilePanelAssembly(project);
const geometry = createPanelAssemblyMapping(project, assembly);
const wiring = createProvisionalWiringPreview(
  geometry,
  project.sculpture,
  project.panelProfile,
);
const validation = validateWiringPreview(wiring, geometry);
if (!validation.valid) throw new Error(validation.errors.join("\n"));
const contract = createHardwareMappingContract(
  geometry,
  wiring,
  project.panelProfile,
);
const outputDirectory = resolve(
  rootDirectory,
  "build",
  "generated",
  project.sculpture.id,
);
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(
    resolve(outputDirectory, "compiled-assembly.json"),
    `${JSON.stringify(assembly, null, 2)}\n`,
    "utf8",
  ),
  writeFile(
    resolve(outputDirectory, "panel-map.json"),
    `${JSON.stringify(
      {
        schemaVersion: "1.0.0",
        id: contract.mapping.id,
        topology: contract.mapping.topology,
        notes: contract.mapping.notes,
        status: contract.mapping.status,
        hardwareReady: contract.readiness.ready,
        ledmapFingerprint: contract.fingerprint,
        readinessBlockers: contract.readiness.blockers,
        outputs: contract.outputs,
        wiring: contract.wiring,
        panels: contract.mapping.panels,
        surfaceFaces: contract.mapping.surfaceFaces,
        mechanicalMounts: contract.mapping.mechanicalMounts,
        printableClosures: contract.mapping.printableClosures,
        leds: contract.mapping.entries,
      },
      null,
      2,
    )}\n`,
    "utf8",
  ),
  writeFile(
    resolve(outputDirectory, "wled-ledmap.provisional.json"),
    `${JSON.stringify(contract.ledmap)}\n`,
    "utf8",
  ),
]);
const cad = await emitPanelClosureCadArtifacts(project, {
  rootDirectory,
  outputDirectory: resolve(outputDirectory, "cad"),
});

console.log(
  `Generated panel-driven ${project.sculpture.name}: ${assembly.counts.panels} panels, ` +
    `${assembly.counts.closures} integrated closures, ` +
    `${assembly.counts.closureConnectors} real-hole tabs, ` +
    `${contract.mapping.entries.length} LEDs in ` +
    `${relative(rootDirectory, outputDirectory)}.`,
);
console.log(
  `Hardware output remains blocked by ${contract.readiness.blockers.length} calibration requirements; ` +
    `${cad.manifest.parts.length} closure STLs are ready to render.`,
);
