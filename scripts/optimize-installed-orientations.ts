import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import {
  calculateAuthoredRouteCableLength,
  optimizeInstalledAddressTransforms,
} from "../src/sculpture/InstalledAddressTransformOptimizer.ts";

const source = "sculptures/rhombicosidodecahedron/sculpture.json";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = await loadPanelAssemblyProjectFromFile(source, repoRoot);
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
  path.join(repoRoot, source),
  JSON.stringify(optimized, null, 2) + "\n",
);
console.log(
  `Saved 41 route-optimized panel orientations; estimated inter-panel data cable ${before.toFixed(1)} mm -> ${after.toFixed(1)} mm.`,
);
