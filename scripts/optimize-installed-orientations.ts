import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateAuthoredRouteCableLength,
  optimizeInstalledAddressTransforms,
  prepareInstalledAddressTransformsForReoptimization,
} from "../src/sculpture/InstalledAddressTransformOptimizer.ts";
import {
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";

const source = "sculptures/rhombicosidodecahedron/sculpture.json";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(repoRoot, source);
const rawDefinition = parsePanelAssemblyDefinition(
  JSON.parse(readFileSync(sourcePath, "utf8")),
);
const profileSource = rawDefinition.panelProfile?.source;
if (typeof profileSource !== "string" || profileSource.length === 0) {
  throw new Error("The assembly must reference a panel profile source.");
}
const profilePath = path.resolve(path.dirname(sourcePath), profileSource);
const profileInput = JSON.parse(readFileSync(profilePath, "utf8"));
const project = createPanelAssemblyProject(
  prepareInstalledAddressTransformsForReoptimization(rawDefinition),
  source,
  profileInput,
);
const before = calculateAuthoredRouteCableLength(
  project.sculpture,
  project.panelProfile,
);
const optimized = optimizeInstalledAddressTransforms(
  project.sculpture,
  project.panelProfile,
);
const after = calculateAuthoredRouteCableLength(optimized, project.panelProfile);

writeFileSync(
  sourcePath,
  JSON.stringify(optimized, null, 2) + "\n",
);
console.log(
  `Saved 41 route-optimized panel orientations; estimated inter-panel data cable ${before.toFixed(1)} mm -> ${after.toFixed(1)} mm.`,
);
