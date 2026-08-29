import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  parsePanelAssemblyDefinition,
  type PanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import { createProjectPackageZip } from "../web/src/ProjectPackage.ts";

interface AuthoredRegistry {
  schemaVersion: "1.0.0";
  defaultSource: string;
  sculptures: Array<{ id: string; name: string; source: string }>;
}

const rootDirectory = process.cwd();
const projectDirectory = resolve(rootDirectory, "projects");
const demoDirectory = resolve(projectDirectory, "demos");
const thumbnailDirectory = resolve(projectDirectory, "thumbnails");
const authoredRegistry = JSON.parse(
  await readFile(resolve(rootDirectory, "sculptures/manifest.json"), "utf8"),
) as AuthoredRegistry;

function assetReferences(input: unknown): string[] {
  const found = new Set<string>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const record = value as Record<string, unknown>;
    if (
      typeof record.source === "string" &&
      typeof record.sha256 === "string"
    ) found.add(record.source);
    for (const nested of Object.values(record)) visit(nested);
  };
  visit(input);
  return [...found].sort();
}

async function availableAssets(
  definition: PanelAssemblyDefinition,
  sculpturePath: string,
): Promise<Map<string, Uint8Array>> {
  const assets = new Map<string, Uint8Array>();
  for (const source of assetReferences(definition)) {
    assets.set(source, new Uint8Array(await readFile(resolve(dirname(sculpturePath), source))));
  }
  return assets;
}

await mkdir(demoDirectory, { recursive: true });
const packages: Array<{ id: string; name: string; source: string }> = [];
for (const entry of authoredRegistry.sculptures) {
  const sculpturePath = resolve(rootDirectory, entry.source.replace(/^\.\//, ""));
  const definition = parsePanelAssemblyDefinition(JSON.parse(
    await readFile(sculpturePath, "utf8"),
  ));
  if (definition.id !== entry.id || definition.name !== entry.name) {
    throw new Error(`Authored registry metadata disagrees with ${entry.source}.`);
  }
  const filename = `${entry.id}.loo.zip`;
  let renderedThumbnail: Uint8Array | undefined;
  try {
    renderedThumbnail = new Uint8Array(await readFile(
      resolve(thumbnailDirectory, `${entry.id}.png`),
    ));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  const bytes = createProjectPackageZip(
    definition,
    await availableAssets(definition, sculpturePath),
    definition.id,
    renderedThumbnail
      ? { bytes: renderedThumbnail, mediaType: "image/png" }
      : undefined,
  );
  await writeFile(resolve(demoDirectory, filename), bytes);
  packages.push({
    id: definition.id,
    name: definition.name,
    source: `./projects/demos/${filename}`,
  });
}

const expected = new Set(packages.map(({ source }) => source.split("/").pop()!));
for (const name of await readdir(demoDirectory)) {
  if (name.endsWith(".loo.zip") && !expected.has(name)) {
    await rm(resolve(demoDirectory, name));
  }
}
const defaultEntry = packages.find((entry) =>
  entry.id === authoredRegistry.sculptures.find((item) =>
    item.source === authoredRegistry.defaultSource
  )?.id
);
if (!defaultEntry) throw new Error("The default authored project has no demo package.");
await writeFile(resolve(projectDirectory, "manifest.json"), `${JSON.stringify({
  schemaVersion: "1.0.0",
  defaultSource: defaultEntry.source,
  projects: packages,
}, null, 2)}\n`);

console.log(
  `Generated ${packages.length} deterministic demo project ZIPs in ${relative(rootDirectory, demoDirectory)}.`,
);
