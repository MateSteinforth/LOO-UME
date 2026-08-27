import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const rootDirectory = process.cwd();
const sourceDirectory = resolve(rootDirectory, "sculptures");
const artifactDirectory = resolve(rootDirectory, "artifacts", "sculptures");
const catalogDirectory = resolve(rootDirectory, "catalog");
const publicCatalogDirectory = resolve(rootDirectory, "web", "public", "catalog");
const publicSculptureDirectory = resolve(
  rootDirectory,
  "web",
  "public",
  "sculptures",
);
const publicCadDirectory = resolve(
  rootDirectory,
  "web",
  "public",
  "generated-cad",
);
const publicPreviewDirectory = resolve(
  rootDirectory,
  "web",
  "public",
  "generated-previews",
);

async function copyTree(source, destination) {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const sourcePath = resolve(source, entry.name);
      const destinationPath = resolve(destination, entry.name);
      if (entry.isDirectory()) {
        await copyTree(sourcePath, destinationPath);
      } else if (entry.isFile()) {
        const temporaryPath = `${destinationPath}.stage-${process.pid}-${randomUUID()}`;
        try {
          await copyFile(sourcePath, temporaryPath);
          await rename(temporaryPath, destinationPath);
        } finally {
          await rm(temporaryPath, { force: true });
        }
      }
    }),
  );
}

function isStagingSibling(name) {
  return /\.stage-\d+-[0-9a-f-]+$/i.test(name);
}

async function pruneTree(source, destination) {
  const [sourceEntries, destinationEntries] = await Promise.all([
    readdir(source, { withFileTypes: true }),
    readdir(destination, { withFileTypes: true }),
  ]);
  const sourceByName = new Map(sourceEntries.map((entry) => [entry.name, entry]));
  await Promise.all(destinationEntries.map(async (entry) => {
    if (isStagingSibling(entry.name)) return;
    const sourceEntry = sourceByName.get(entry.name);
    const destinationPath = resolve(destination, entry.name);
    if (!sourceEntry) {
      await rm(destinationPath, { recursive: true, force: true });
      return;
    }
    if (entry.isDirectory() && sourceEntry.isDirectory()) {
      await pruneTree(resolve(source, entry.name), destinationPath);
    }
  }));
}

async function pruneTopLevelDirectories(destination, retainedNames) {
  const entries = await readdir(destination, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    if (isStagingSibling(entry.name) || retainedNames.has(entry.name)) return;
    await rm(resolve(destination, entry.name), { recursive: true, force: true });
  }));
}

const registry = JSON.parse(
  await readFile(resolve(sourceDirectory, "manifest.json"), "utf8"),
);
if (
  registry.schemaVersion !== "1.0.0" ||
  !Array.isArray(registry.sculptures) ||
  registry.sculptures.length === 0
) {
  throw new Error("sculptures/manifest.json is invalid.");
}

await Promise.all([
  copyTree(sourceDirectory, publicSculptureDirectory),
  copyTree(catalogDirectory, publicCatalogDirectory),
  mkdir(publicCadDirectory, { recursive: true }),
  mkdir(publicPreviewDirectory, { recursive: true }),
]);

const stagedArtifactIds = new Set();
for (const sculpture of registry.sculptures) {
  if (
    typeof sculpture.id !== "string" ||
    typeof sculpture.source !== "string" ||
    !sculpture.source.startsWith("./sculptures/")
  ) {
    throw new Error("Sculpture registry entries require an ID and local source.");
  }
  const sourceRelativePath = sculpture.source.slice("./sculptures/".length);
  await readFile(resolve(sourceDirectory, sourceRelativePath), "utf8");
  if (
    sculpture.artifactStatus === "authoring-only" ||
    sculpture.artifactStatus === "manual-parts"
  ) continue;
  stagedArtifactIds.add(sculpture.id);
  const sculptureArtifacts = resolve(artifactDirectory, sculpture.id);
  const cadSource = resolve(sculptureArtifacts, "3d");
  const cadDestination = resolve(publicCadDirectory, sculpture.id);
  const previewSource = resolve(sculptureArtifacts, "previews");
  const previewDestination = resolve(publicPreviewDirectory, sculpture.id);
  await Promise.all([
    copyTree(cadSource, cadDestination),
    copyTree(previewSource, previewDestination),
  ]);
  await Promise.all([
    pruneTree(cadSource, cadDestination),
    pruneTree(previewSource, previewDestination),
  ]);
}

await Promise.all([
  pruneTree(sourceDirectory, publicSculptureDirectory),
  pruneTree(catalogDirectory, publicCatalogDirectory),
  pruneTopLevelDirectories(publicCadDirectory, stagedArtifactIds),
  pruneTopLevelDirectories(publicPreviewDirectory, stagedArtifactIds),
]);

console.log(
  "Staged " +
    registry.sculptures.length +
    " sculpture JSON documents plus available STL sets and previews for the simulator.",
);
