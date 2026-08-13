import { relative, resolve } from "node:path";
import {
  createOpenScadRenderer,
  generatePanelBoundaryParts,
} from "../src/cad/GeneratePanelBoundaryParts.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";

const rootDirectory = process.cwd();
const sculptureFlag = process.argv.indexOf("--sculpture");
const outputFlag = process.argv.indexOf("--output");
const source = sculptureFlag >= 0 ? process.argv[sculptureFlag + 1] : undefined;
if (!source) {
  throw new Error(
    "Pass the source of truth with --sculpture <path-to-sculpture.json>.",
  );
}
const project = await loadPanelAssemblyProjectFromFile(source, rootDirectory);
const outputDirectory = outputFlag >= 0
  ? process.argv[outputFlag + 1]
  : `build/generated-panel-boundary/${project.sculpture.id}`;
if (!outputDirectory) throw new Error("--output requires a directory.");

const result = await generatePanelBoundaryParts(project, {
  rootDirectory,
  outputDirectory,
  renderScad: createOpenScadRenderer(rootDirectory),
});
console.log(
  `Generated ${result.partAssets.length} printable parts from ` +
    `${result.boundary.metadata.counts.caps} validated gaps into ` +
    `${relative(rootDirectory, resolve(rootDirectory, outputDirectory))}.`,
);
console.log(
  `Boundary SHA-256 ${result.boundaryAsset.sha256}; source fingerprint ` +
    `${result.definition.generatedMechanics!.sourceFingerprint.value}.`,
);
for (const part of result.partAssets) {
  console.log(
    `${part.id}: ${part.inspection.triangles} triangles, ${part.sha256}`,
  );
}
