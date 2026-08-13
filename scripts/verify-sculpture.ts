import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { delimiter, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { emitPanelClosureCadArtifacts } from "../src/cad/GeneratePanelClosureCad.ts";
import { assertMechanicalShellReady } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";

const rootDirectory = process.cwd();
const sculptureFlag = process.argv.indexOf("--sculpture");
const sculptureSource =
  sculptureFlag >= 0 ? process.argv[sculptureFlag + 1] : undefined;
const ephemeral = process.argv.includes("--ephemeral");
if (!sculptureSource) {
  throw new Error("Pass the source of truth with --sculpture <path-to-sculpture.json>.");
}
const localOpenScad = resolve(
  rootDirectory,
  ".tools/openscad-2021.01/squashfs-root/AppRun",
);
const localDependencyDirectory = resolve(
  rootDirectory,
  ".tools/openscad-2021.01/local-deps/usr/lib/x86_64-linux-gnu",
);
const localXauthDirectory = resolve(rootDirectory, ".tools/xauth/root/usr/bin");
const localXauthLibraryDirectory = resolve(
  rootDirectory,
  ".tools/xauth/root/usr/lib/x86_64-linux-gnu",
);
const openScad =
  process.env.OPENSCAD ??
  (existsSync(localOpenScad) ? localOpenScad : "openscad");
const environment = {
  ...process.env,
  PATH: [
    existsSync(localXauthDirectory) ? localXauthDirectory : undefined,
    process.env.PATH,
  ]
    .filter(Boolean)
    .join(delimiter),
  LD_LIBRARY_PATH: [
    existsSync(localDependencyDirectory) ? localDependencyDirectory : undefined,
    existsSync(localXauthLibraryDirectory)
      ? localXauthLibraryDirectory
      : undefined,
    process.env.LD_LIBRARY_PATH,
  ]
    .filter(Boolean)
    .join(delimiter),
};

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    cwd: rootDirectory,
    encoding: "utf8",
    env: environment,
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

const project = await loadPanelAssemblyProjectFromFile(
  sculptureSource,
  rootDirectory,
);
assertMechanicalShellReady(project);
const outputDirectory = resolve(
  rootDirectory,
  "build",
  "verify-panel-assembly",
  project.sculpture.id,
);
const assemblyRadius = Math.max(
  ...project.sculpture.mechanicalShell!.vertices.map(([x, y, z]) => Math.hypot(x, y, z)),
);
const assemblyCameraDistance = Math.max(700, assemblyRadius * 5);
const generated = await emitPanelClosureCadArtifacts(project, {
  rootDirectory,
  outputDirectory,
});
const artifactDirectory = resolve(
  rootDirectory,
  "artifacts",
  "sculptures",
  project.sculpture.id,
);
const artifactCadDirectory = resolve(artifactDirectory, "3d");
const artifactPreviewDirectory = resolve(artifactDirectory, "previews");
const publicCadDirectory = resolve(
  rootDirectory,
  "web",
  "public",
  "generated-cad",
  project.sculpture.id,
);
const publicPreviewDirectory = resolve(
  rootDirectory,
  "web",
  "public",
  "generated-previews",
  project.sculpture.id,
);
// Publish only after every render succeeds, preserving the last known-good
// versioned snapshot if OpenSCAD fails partway through.
for (const part of generated.manifest.parts) {
  const source = generated.entrypointPaths.closures[part.closureFaceId]!;
  const output = resolve(outputDirectory, part.outputStl);
  run(openScad, ["--hardwarnings", "-o", output, source]);
  if (statSync(output).size < 1_000) {
    throw new Error(`${relative(rootDirectory, output)} is unexpectedly empty.`);
  }
}
const detail = resolve(outputDirectory, "closure-detail.png");
const detailSource = generated.entrypointPaths.closures[
  generated.manifest.parts[0]!.closureFaceId
]!;
run("xvfb-run", [
  "-a",
  openScad,
  "--imgsize=1200,900",
  "--camera=0,0,0,58,0,25,450",
  "--projection=o",
  "--render",
  "-o",
  detail,
  detailSource,
]);
if (statSync(detail).size < 1_000) {
  throw new Error("Generated closure detail is unexpectedly empty.");
}
const preview = resolve(outputDirectory, "assembly-preview.png");
run("xvfb-run", [
  "-a",
  openScad,
  "--imgsize=1400,1100",
  `--camera=0,0,0,68,0,135,${assemblyCameraDistance}`,
  "--projection=o",
  "--render",
  "-o",
  preview,
  generated.entrypointPaths.assemblyPreview,
]);
if (statSync(preview).size < 1_000) {
  throw new Error("Generated panel-and-closure preview is unexpectedly empty.");
}

if (!ephemeral) rmSync(artifactDirectory, { recursive: true, force: true });
rmSync(publicCadDirectory, { recursive: true, force: true });
rmSync(publicPreviewDirectory, { recursive: true, force: true });
if (!ephemeral) {
  mkdirSync(artifactCadDirectory, { recursive: true });
  mkdirSync(artifactPreviewDirectory, { recursive: true });
}
mkdirSync(publicCadDirectory, { recursive: true });
mkdirSync(publicPreviewDirectory, { recursive: true });
if (!ephemeral) {
  copyFileSync(generated.manifestPath, resolve(artifactDirectory, "manifest.json"));
}
for (const part of generated.manifest.parts) {
  const output = resolve(outputDirectory, part.outputStl);
  if (!ephemeral) {
    copyFileSync(output, resolve(artifactCadDirectory, part.outputStl));
  }
  copyFileSync(output, resolve(publicCadDirectory, part.outputStl));
}
if (!ephemeral) {
  copyFileSync(detail, resolve(artifactPreviewDirectory, "closure-detail.png"));
  copyFileSync(preview, resolve(artifactPreviewDirectory, "assembly.png"));
}
copyFileSync(detail, resolve(publicPreviewDirectory, "closure-detail.png"));
copyFileSync(preview, resolve(publicPreviewDirectory, "assembly.png"));
console.log(
  ephemeral
    ? `Rendered ${generated.manifest.parts.length} ephemeral ${project.sculpture.name} closure STLs and previews for the local simulator.`
    : `Rendered ${generated.manifest.parts.length} ${project.sculpture.name} panel-hole closure STLs and previews into ${relative(rootDirectory, artifactDirectory)}.`,
);
