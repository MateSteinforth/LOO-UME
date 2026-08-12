import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { delimiter, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { emitCadArtifacts } from "../src/cad/GenerateCad.ts";
import { loadCanonicalSculptureProject } from "../src/sculpture/Definition.ts";

const rootDirectory = process.cwd();
const localOpenScad = resolve(
  rootDirectory,
  ".tools/openscad-2021.01/squashfs-root/AppRun",
);
const localDependencyDirectory = resolve(
  rootDirectory,
  ".tools/openscad-2021.01/local-deps/usr/lib/x86_64-linux-gnu",
);
const localXauthDirectory = resolve(
  rootDirectory,
  ".tools/xauth/root/usr/bin",
);
const localXauthLibraryDirectory = resolve(
  rootDirectory,
  ".tools/xauth/root/usr/lib/x86_64-linux-gnu",
);
const openScad =
  process.env.OPENSCAD ??
  (existsSync(localOpenScad) ? localOpenScad : "openscad");
const executableDirectories = [
  existsSync(localXauthDirectory) ? localXauthDirectory : undefined,
  process.env.PATH,
].filter(Boolean);
const libraryDirectories = [
  existsSync(localDependencyDirectory) ? localDependencyDirectory : undefined,
  existsSync(localXauthLibraryDirectory)
    ? localXauthLibraryDirectory
    : undefined,
  process.env.LD_LIBRARY_PATH,
].filter(Boolean);
const openScadEnvironment = {
  ...process.env,
  PATH: executableDirectories.join(delimiter),
  LD_LIBRARY_PATH: libraryDirectories.join(delimiter),
};

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    cwd: rootDirectory,
    encoding: "utf8",
    env: openScadEnvironment,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.join(" ")} exited with ${result.status}.`,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function verifyPrintable(
  label: string,
  canonicalSource: string,
  generatedSource: string,
  verificationDirectory: string,
): string {
  const canonicalStl = resolve(verificationDirectory, `${label}-canonical.stl`);
  const generatedStl = resolve(verificationDirectory, `${label}-generated.stl`);
  const canonicalCsg = resolve(verificationDirectory, `${label}-canonical.csg`);
  const generatedCsg = resolve(verificationDirectory, `${label}-generated.csg`);

  run(openScad, ["--hardwarnings", "-o", canonicalStl, canonicalSource]);
  run(openScad, ["--hardwarnings", "-o", generatedStl, generatedSource]);
  run(openScad, ["--hardwarnings", "-o", canonicalCsg, canonicalSource]);
  run(openScad, ["--hardwarnings", "-o", generatedCsg, generatedSource]);

  const canonicalHash = sha256(canonicalCsg);
  const generatedHash = sha256(generatedCsg);
  if (canonicalHash !== generatedHash) {
    throw new Error(
      `Generated ${label} CSG differs from canonical geometry: ` +
        `${canonicalHash} != ${generatedHash}.`,
    );
  }
  if (statSync(canonicalStl).size < 1_000 || statSync(generatedStl).size < 1_000) {
    throw new Error(`A rendered ${label} STL is unexpectedly empty.`);
  }
  return canonicalHash;
}

const project = loadCanonicalSculptureProject();
const generated = await emitCadArtifacts(project, { rootDirectory });
const verificationDirectory = resolve(rootDirectory, "build", "verify-cad");
await mkdir(verificationDirectory, { recursive: true });

const triangleHash = verifyPrintable(
  "triangle",
  resolve(
    rootDirectory,
    project.sculpture.openings.triangleFaces.closure.canonicalSource,
  ),
  generated.entrypointPaths.triangle,
  verificationDirectory,
);
const pentagonClosure = project.sculpture.openings.pentagonFaces.closure;
const pentagonHash = verifyPrintable(
  "pentagon-u-frame",
  resolve(rootDirectory, pentagonClosure.parts[0].canonicalSource),
  generated.entrypointPaths.pentagonUFrame,
  verificationDirectory,
);
const connectorHash = verifyPrintable(
  "middle-panel-connector",
  resolve(rootDirectory, pentagonClosure.parts[1].canonicalSource),
  generated.entrypointPaths.middlePanelConnector,
  verificationDirectory,
);

const triangleAssemblyPng = resolve(
  verificationDirectory,
  "triangle-assembly.png",
);
run("xvfb-run", [
  "-a",
  openScad,
  "--imgsize=1200,900",
  "--camera=0,0,0,55,0,25,220",
  "--projection=o",
  "-D",
  `mode="${project.sculpture.openings.triangleFaces.closure.modes.assembly}"`,
  "-o",
  triangleAssemblyPng,
  generated.entrypointPaths.triangle,
]);

const pentagonAssemblyPng = resolve(
  verificationDirectory,
  "populated-pentagon-assembly.png",
);
run("xvfb-run", [
  "-a",
  openScad,
  "--imgsize=1200,900",
  "--camera=0,0,0,55,0,25,300",
  "--projection=o",
  "-o",
  pentagonAssemblyPng,
  generated.entrypointPaths.pentagonAssembly,
]);
if (
  statSync(triangleAssemblyPng).size < 1_000 ||
  statSync(pentagonAssemblyPng).size < 1_000
) {
  throw new Error("A generated assembly preview PNG is unexpectedly empty.");
}

console.log(
  `Verified triangle ${triangleHash.slice(0, 12)}, ` +
    `U-frame ${pentagonHash.slice(0, 12)}, and connector ` +
    `${connectorHash.slice(0, 12)} against canonical CSG; pentagon preview: ` +
    `${relative(rootDirectory, pentagonAssemblyPng)}.`,
);
