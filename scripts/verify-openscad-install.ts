import { mkdir, mkdtemp, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveManagedOpenScadCommand } from "../src/cad/OpenScadDistribution.ts";
import {
  createOpenScadRuntime,
  type OpenScadRuntime,
} from "../src/cad/OpenScadRuntime.ts";

const rootDirectory = process.cwd();
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
    runtime.status.detectedVersion !== managed.expectedVersion ||
    runtime.status.supportedVersion !== managed.expectedVersion
  ) {
    throw new Error(
      `Managed OpenSCAD verification failed: ${runtime.status.message}`,
    );
  }

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  const work = await mkdtemp(join(tmpdir(), "verify-openscad-"));
  const inputScad = join(work, "cube.scad");
  const outputStl = resolve(outputDirectory, "cube.stl");
  await writeFile(inputScad, "cube(10);\n");
  await runtime.render(inputScad, outputStl);
  const file = await stat(outputStl);
  if (!file.isFile() || file.size === 0) {
    throw new Error("Managed OpenSCAD did not write a nonempty cube STL.");
  }
  await rm(work, { recursive: true, force: true });

  console.log(
    `Verified ${managed.targetId} managed OpenSCAD ${runtime.status.detectedVersion}: rendered cube.stl in build/verify-managed-openscad.`,
  );
} finally {
  await runtime?.close();
  if (originalOverride === undefined) delete process.env.OPENSCAD;
  else process.env.OPENSCAD = originalOverride;
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
}
