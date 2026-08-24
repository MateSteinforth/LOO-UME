import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { publishStructuralArtifactBundle } from "../src/cad/PublishStructuralArtifacts.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import { runStructuralPipeline } from "../src/structure/StructuralPipeline.ts";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function safeDirectoryName(value: string): string {
  const result = value.normalize("NFC").replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return result && result !== "." && result !== ".." ? result : "structural-project";
}

const rootDirectory = process.cwd();
const source = argument("--sculpture");
if (!source) {
  throw new Error("Pass the existing Schema 2 source with --sculpture <path-to-sculpture.json>.");
}
const outputRoot = resolve(rootDirectory, argument("--output-root") ?? "build/generated-structure");
const project = await loadPanelAssemblyProjectFromFile(source, rootDirectory);
const directoryName = argument("--directory") ?? safeDirectoryName(project.sculpture.id);
const sourceDirectory = dirname(resolve(rootDirectory, source));
const designSurfaceBytes = project.sculpture.designSurface
  ? new Uint8Array(await readFile(resolve(
    sourceDirectory,
    project.sculpture.designSurface.source,
  )))
  : undefined;
const result = await runStructuralPipeline(project, {
  ...(designSurfaceBytes ? { designSurfaceBytes } : {}),
});
const published = await publishStructuralArtifactBundle(result.bundle, {
  artifactRootDirectory: outputRoot,
  directoryName,
});

console.log(
  `Generated ${result.solids.length} structural parts and ${result.bundle.files.length} validated files in ` +
  `${relative(rootDirectory, published.outputDirectory)}.`,
);
console.log(
  `Advisory optimization ${result.optimization?.status ?? "unavailable"}; ` +
  `${result.optimization?.optimizedCandidate.members.length ?? result.candidate.members.length} retained candidate members; ` +
  `source fingerprint ${result.normalized.sourceFingerprint.value}.`,
);
for (const diagnostic of result.analysis.optimization.diagnostics) {
  console.warn(diagnostic);
}
for (const warning of result.normalized.warnings) {
  console.warn(`${warning.code}: ${warning.message}`);
}
console.warn("Load-path guidance only; not engineering certification.");
