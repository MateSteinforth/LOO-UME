import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
} from "node:fs/promises";
import { resolve } from "node:path";

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
        await copyFile(sourcePath, destinationPath);
      }
    }),
  );
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
  rm(publicCatalogDirectory, { recursive: true, force: true }),
  rm(publicSculptureDirectory, { recursive: true, force: true }),
  rm(publicCadDirectory, { recursive: true, force: true }),
  rm(publicPreviewDirectory, { recursive: true, force: true }),
]);
await Promise.all([
  copyTree(sourceDirectory, publicSculptureDirectory),
  copyTree(catalogDirectory, publicCatalogDirectory),
]);

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
  const sculptureArtifacts = resolve(artifactDirectory, sculpture.id);
  await copyTree(
    resolve(sculptureArtifacts, "3d"),
    resolve(publicCadDirectory, sculpture.id),
  );
  await copyTree(
    resolve(sculptureArtifacts, "previews"),
    resolve(publicPreviewDirectory, sculpture.id),
  );
}

console.log(
  "Staged " +
    registry.sculptures.length +
    " sculpture JSON documents, verified STL sets, and previews for the simulator.",
);
