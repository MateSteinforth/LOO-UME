import { relative } from "node:path";
import {
  createManualCadProject,
  emitCadArtifacts,
} from "../src/cad/GenerateCad.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";

const project = createManualCadProject(
  await loadPanelAssemblyProjectFromFile(
    "sculptures/rhombicosidodecahedron/sculpture.json",
  ),
);
const result = await emitCadArtifacts(project);

console.log(
  `Generated ${result.manifest.artifacts.length} printable CAD entrypoints, ` +
    `${result.manifest.assemblies.length} assembly preview, and manifest in ` +
    `${relative(process.cwd(), result.outputDirectory)}.`,
);
