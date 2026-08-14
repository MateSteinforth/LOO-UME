import { stat, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { generatePanelBoundaryParts } from "../src/cad/GeneratePanelBoundaryParts.ts";
import { resolveManagedOpenScadCommand } from "../src/cad/OpenScadDistribution.ts";
import {
  createOpenScadRuntime,
  type OpenScadRuntime,
  SUPPORTED_OPENSCAD_VERSION,
} from "../src/cad/OpenScadRuntime.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";

const rootDirectory = process.cwd();
const fixture = "sculptures/panel-outline-prism/sculpture.json";
const outputDirectory = resolve(rootDirectory, "build/verify-managed-openscad");
const originalOverride = process.env.OPENSCAD;
const originalPath = process.env.PATH;
let runtime: OpenScadRuntime | undefined;

try {
  delete process.env.OPENSCAD;
  const managed = resolveManagedOpenScadCommand(rootDirectory);
  if (!managed) {
    throw new Error(
      "The verified managed OpenSCAD installation is unavailable. Run npm run setup:openscad.",
    );
  }

  // Remove the system fallback so this check cannot pass through a PATH tool.
  process.env.PATH = "";
  runtime = await createOpenScadRuntime(rootDirectory);
  if (
    !runtime.status.available ||
    runtime.status.detectedVersion !== SUPPORTED_OPENSCAD_VERSION
  ) {
    throw new Error(
      `Managed OpenSCAD verification failed: ${runtime.status.message}`,
    );
  }

  await rm(outputDirectory, { recursive: true, force: true });
  const project = await loadPanelAssemblyProjectFromFile(fixture, rootDirectory);
  const result = await generatePanelBoundaryParts(project, {
    rootDirectory,
    outputDirectory,
    renderScad: (inputScad, outputStl) =>
      runtime!.render(inputScad, outputStl),
  });
  const expectedPartIds = ["part-001", "part-002"];
  const actualPartIds = result.partAssets.map(({ id }) => id);
  if (JSON.stringify(actualPartIds) !== JSON.stringify(expectedPartIds)) {
    throw new Error(
      `Expected managed OpenSCAD to generate ${expectedPartIds.join(", ")}; got ${actualPartIds.join(", ") || "no parts"}.`,
    );
  }
  for (const part of result.partAssets) {
    const file = await stat(part.absolutePath);
    if (!file.isFile() || file.size === 0 || part.inspection.triangles < 1) {
      throw new Error(`${part.id} is not a nonempty inspected STL.`);
    }
  }

  console.log(
    `Verified managed OpenSCAD ${runtime.status.detectedVersion}: generated and inspected ${actualPartIds.join(", ")} in build/verify-managed-openscad.`,
  );
} finally {
  await runtime?.close();
  if (originalOverride === undefined) delete process.env.OPENSCAD;
  else process.env.OPENSCAD = originalOverride;
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
}
