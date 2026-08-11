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

const project = loadCanonicalSculptureProject();
const generated = await emitCadArtifacts(project, { rootDirectory });
const verificationDirectory = resolve(rootDirectory, "build", "verify-cad");
await mkdir(verificationDirectory, { recursive: true });

const canonicalSource = resolve(
  rootDirectory,
  project.sculpture.openings.triangleFaces.closure.canonicalSource,
);
const canonicalStl = resolve(verificationDirectory, "triangle-canonical.stl");
const generatedStl = resolve(verificationDirectory, "triangle-generated.stl");
const assemblyPng = resolve(verificationDirectory, "triangle-assembly.png");
const canonicalCsg = resolve(verificationDirectory, "triangle-canonical.csg");
const generatedCsg = resolve(verificationDirectory, "triangle-generated.csg");

run(openScad, ["--hardwarnings", "-o", canonicalStl, canonicalSource]);
run(openScad, [
  "--hardwarnings",
  "-o",
  generatedStl,
  generated.entrypointPath,
]);
run(openScad, ["--hardwarnings", "-o", canonicalCsg, canonicalSource]);
run(openScad, [
  "--hardwarnings",
  "-o",
  generatedCsg,
  generated.entrypointPath,
]);

const canonicalHash = sha256(canonicalCsg);
const generatedHash = sha256(generatedCsg);
if (canonicalHash !== generatedHash) {
  throw new Error(
    `Generated triangle CSG differs from canonical geometry: ${canonicalHash} != ${generatedHash}.`,
  );
}

if (statSync(canonicalStl).size < 1_000 || statSync(generatedStl).size < 1_000) {
  throw new Error("A rendered triangle STL is unexpectedly empty.");
}
run("xvfb-run", [
  "-a",
  openScad,
  "--imgsize=1200,900",
  "--camera=0,0,0,55,0,25,220",
  "--projection=o",
  "-D",
  `mode="${project.sculpture.openings.triangleFaces.closure.modes.assembly}"`,
  "-o",
  assemblyPng,
  generated.entrypointPath,
]);
if (statSync(assemblyPng).size < 1_000) {
  throw new Error("Assembly preview PNG is unexpectedly empty.");
}

console.log(
  `Verified generated triangle against canonical CSG ${canonicalHash.slice(0, 12)}; ` +
    `assembly preview: ${relative(rootDirectory, assemblyPng)}.`,
);
