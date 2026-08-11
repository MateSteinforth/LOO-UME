import { relative } from "node:path";
import { emitCadArtifacts } from "../src/cad/GenerateCad.ts";
import { loadCanonicalSculptureProject } from "../src/sculpture/Definition.ts";

const project = loadCanonicalSculptureProject();
const result = await emitCadArtifacts(project);

console.log(
  `Generated ${result.manifest.artifacts.length} CAD entrypoint and manifest in ` +
    `${relative(process.cwd(), result.outputDirectory)}.`,
);
