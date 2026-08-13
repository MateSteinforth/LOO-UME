import { Unzip, UnzipInflate, zipSync } from "fflate";
import {
  loadPanelAssemblyProject,
  parsePanelAssemblyDefinition,
  type PanelAssemblyDefinition,
  type PanelAssemblyProject,
  type ProjectAssetReference,
} from "../../src/sculpture/PanelAssembly.ts";
import {
  assertPortableProjectAssetSource,
  verifyProjectAssetBytes,
} from "../../src/sculpture/GeneratedMechanics.ts";
import { sculptureJson } from "../../src/sculpture/SculptureEditor.ts";

export interface PortableProjectFile {
  path: string;
  bytes: Uint8Array;
}

export interface PortableProjectAsset {
  source: string;
  bytes: Uint8Array;
  sha256: string;
  objectUrl: string;
  mediaType: "model/gltf-binary" | "model/stl";
}

export interface PortableProjectBundle {
  project: PanelAssemblyProject;
  assets: ReadonlyMap<string, PortableProjectAsset>;
  assetUrls: ReadonlyMap<string, string>;
  dispose(): void;
}

export type LoadPortablePanelProfile = (
  reference: PanelAssemblyDefinition["panelProfile"],
  sculptureSource: string,
) => Promise<unknown>;

export interface PortableObjectUrlFactory {
  create(bytes: Uint8Array, mediaType: string): string;
  revoke(url: string): void;
}

export interface PortableDirectoryHandle {
  getDirectoryHandle(
    name: string,
    options: { create: true },
  ): Promise<PortableDirectoryHandle>;
  getFileHandle(
    name: string,
    options: { create: true },
  ): Promise<{
    createWritable(): Promise<{
      write(data: Blob): Promise<void>;
      close(): Promise<void>;
    }>;
  }>;
}

const defaultObjectUrlFactory: PortableObjectUrlFactory = {
  create: (bytes, mediaType) => URL.createObjectURL(
    new Blob([Uint8Array.from(bytes)], { type: mediaType }),
  ),
  revoke: (url) => URL.revokeObjectURL(url),
};

function mediaType(source: string): PortableProjectAsset["mediaType"] {
  return source.toLowerCase().endsWith(".glb")
    ? "model/gltf-binary"
    : "model/stl";
}

function projectAssetReferences(
  definition: PanelAssemblyDefinition,
): Array<{ label: string; reference: ProjectAssetReference }> {
  const references: Array<{
    label: string;
    reference: ProjectAssetReference;
  }> = [];
  if (definition.designSurface) {
    references.push({
      label: "Design surface",
      reference: definition.designSurface,
    });
  }
  if (definition.generatedMechanics) {
    references.push({
      label: "Generated boundary",
      reference: definition.generatedMechanics.boundary,
    });
    for (const part of definition.generatedMechanics.parts) {
      references.push({ label: `Generated part ${part.id}`, reference: part });
    }
  }
  return references;
}

function safeContainerPath(path: string, label: string): string {
  const withoutDirectorySuffix = path.endsWith("/") ? path.slice(0, -1) : path;
  assertPortableProjectAssetSource(withoutDirectorySuffix, label);
  return withoutDirectorySuffix;
}

function locateProjectFiles(files: readonly PortableProjectFile[]): {
  sculpture: PortableProjectFile;
  byRelativePath: Map<string, Uint8Array>;
} {
  const byContainerPath = new Map<string, PortableProjectFile>();
  for (const file of files) {
    const path = safeContainerPath(file.path, "Project container entry");
    if (byContainerPath.has(path)) {
      throw new Error(`Project container has duplicate file ${path}.`);
    }
    byContainerPath.set(path, {
      path,
      bytes: Uint8Array.from(file.bytes),
    });
  }
  const sculptureFiles = [...byContainerPath.values()].filter(({ path }) =>
    path === "sculpture.json" || path.endsWith("/sculpture.json")
  );
  if (sculptureFiles.length === 0) {
    throw new Error("Portable project is missing sculpture.json.");
  }
  if (sculptureFiles.length !== 1) {
    throw new Error("Portable project contains duplicate sculpture.json files.");
  }
  const sculpture = sculptureFiles[0]!;
  const rootPrefix = sculpture.path.slice(0, -"sculpture.json".length);
  const byRelativePath = new Map<string, Uint8Array>();
  for (const [path, file] of byContainerPath) {
    if (!path.startsWith(rootPrefix)) continue;
    const relativePath = path.slice(rootPrefix.length);
    if (!relativePath) continue;
    if (byRelativePath.has(relativePath)) {
      throw new Error(`Portable project has duplicate file ${relativePath}.`);
    }
    byRelativePath.set(relativePath, file.bytes);
  }
  return { sculpture, byRelativePath };
}

export async function openPortableProjectFiles(
  files: readonly PortableProjectFile[],
  sourceLabel: string,
  loadPanelProfile: LoadPortablePanelProfile,
  objectUrlFactory: PortableObjectUrlFactory = defaultObjectUrlFactory,
): Promise<PortableProjectBundle> {
  const { sculpture, byRelativePath } = locateProjectFiles(files);
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder().decode(sculpture.bytes));
  } catch (error) {
    throw new Error(
      `Portable sculpture.json is invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const project = await loadPanelAssemblyProject(
    input,
    `local:${sourceLabel}/sculpture.json`,
    loadPanelProfile,
  );
  const validated = projectAssetReferences(project.sculpture).map(
    ({ label, reference }) => {
      const bytes = byRelativePath.get(reference.source);
      if (!bytes) {
        throw new Error(
          `Portable project is missing referenced file ${reference.source}.`,
        );
      }
      const sha256 = verifyProjectAssetBytes(reference, bytes, label);
      return {
        source: reference.source,
        bytes,
        sha256,
        mediaType: mediaType(reference.source),
      };
    },
  );

  const assets = new Map<string, PortableProjectAsset>();
  const assetUrls = new Map<string, string>();
  try {
    for (const asset of validated) {
      const objectUrl = objectUrlFactory.create(asset.bytes, asset.mediaType);
      const portableAsset = { ...asset, objectUrl };
      assets.set(asset.source, portableAsset);
      assetUrls.set(asset.source, objectUrl);
    }
  } catch (error) {
    for (const url of assetUrls.values()) objectUrlFactory.revoke(url);
    throw error;
  }
  let disposed = false;
  return {
    project,
    assets,
    assetUrls,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const url of assetUrls.values()) objectUrlFactory.revoke(url);
    },
  };
}

function unzipProjectFiles(zipBytes: Uint8Array): PortableProjectFile[] {
  const files: PortableProjectFile[] = [];
  const seen = new Set<string>();
  let extractionError: unknown;
  const unzipper = new Unzip((file) => {
    try {
      const path = safeContainerPath(file.name, "ZIP entry");
      if (seen.has(path)) throw new Error(`ZIP contains duplicate file ${path}.`);
      seen.add(path);
      if (file.name.endsWith("/")) {
        file.ondata = (error) => {
          if (error) extractionError = error;
        };
        file.start();
        return;
      }
      const chunks: Uint8Array[] = [];
      file.ondata = (error, chunk, final) => {
        if (error) {
          extractionError = error;
          return;
        }
        chunks.push(Uint8Array.from(chunk));
        if (!final) return;
        const size = chunks.reduce((total, item) => total + item.length, 0);
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const item of chunks) {
          bytes.set(item, offset);
          offset += item.length;
        }
        files.push({ path, bytes });
      };
      file.start();
    } catch (error) {
      extractionError = error;
    }
  });
  unzipper.register(UnzipInflate);
  try {
    unzipper.push(zipBytes, true);
  } catch (error) {
    extractionError ??= error;
  }
  if (extractionError) {
    throw extractionError instanceof Error
      ? extractionError
      : new Error(String(extractionError));
  }
  return files;
}

export async function openPortableProjectZip(
  zipBytes: Uint8Array,
  sourceLabel: string,
  loadPanelProfile: LoadPortablePanelProfile,
  objectUrlFactory: PortableObjectUrlFactory = defaultObjectUrlFactory,
): Promise<PortableProjectBundle> {
  return openPortableProjectFiles(
    unzipProjectFiles(zipBytes),
    sourceLabel,
    loadPanelProfile,
    objectUrlFactory,
  );
}

export function createPortableProjectFiles(
  definition: PanelAssemblyDefinition,
  availableAssets: ReadonlyMap<string, Uint8Array>,
): Map<string, Uint8Array> {
  parsePanelAssemblyDefinition(definition);
  const files = new Map<string, Uint8Array>();
  files.set(
    "sculpture.json",
    new TextEncoder().encode(sculptureJson(definition)),
  );
  for (const { label, reference } of projectAssetReferences(definition)) {
    const bytes = availableAssets.get(reference.source);
    if (!bytes) {
      throw new Error(
        `Cannot export portable project: referenced file ${reference.source} is not available as verified local bytes. Import the complete folder or ZIP first.`,
      );
    }
    verifyProjectAssetBytes(reference, bytes, label);
    files.set(reference.source, Uint8Array.from(bytes));
  }
  return files;
}

export function portableProjectFolderName(
  definition: PanelAssemblyDefinition,
): string {
  const name = definition.id.trim().replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return name && name !== "." && name !== ".."
    ? name
    : "sculpture-project";
}

export function createPortableProjectZip(
  definition: PanelAssemblyDefinition,
  availableAssets: ReadonlyMap<string, Uint8Array>,
  folderName = portableProjectFolderName(definition),
): Uint8Array {
  if (folderName.includes("/")) {
    throw new Error("ZIP project folder name must be one safe path segment.");
  }
  assertPortableProjectAssetSource(folderName, "ZIP project folder");
  const entries: Record<string, Uint8Array> = {};
  for (
    const [path, bytes] of createPortableProjectFiles(
      definition,
      availableAssets,
    )
  ) {
    entries[`${folderName}/${path}`] = bytes;
  }
  return zipSync(entries, {
    level: 6,
    mtime: new Date("1980-01-01T00:00:00.000Z"),
  });
}

export async function writePortableProjectFolder(
  parent: PortableDirectoryHandle,
  definition: PanelAssemblyDefinition,
  availableAssets: ReadonlyMap<string, Uint8Array>,
  folderName = portableProjectFolderName(definition),
): Promise<void> {
  if (folderName.includes("/")) {
    throw new Error("Project folder name must be one safe path segment.");
  }
  assertPortableProjectAssetSource(folderName, "Project folder");
  const files = [...createPortableProjectFiles(definition, availableAssets)]
    .sort(([left], [right]) =>
      left === "sculpture.json" ? 1 : right === "sculpture.json" ? -1 : 0
    );
  const root = await parent.getDirectoryHandle(folderName, { create: true });
  for (const [path, bytes] of files) {
    const segments = path.split("/");
    const filename = segments.pop()!;
    let directory = root;
    for (const segment of segments) {
      directory = await directory.getDirectoryHandle(segment, { create: true });
    }
    const handle = await directory.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();
    await writable.write(new Blob([Uint8Array.from(bytes)]));
    await writable.close();
  }
}
