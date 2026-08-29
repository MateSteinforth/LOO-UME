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
  sha256Bytes,
  verifyProjectAssetBytes,
} from "../../src/sculpture/GeneratedMechanics.ts";
import { generatedStructuralAssetReferences } from "../../src/sculpture/StructuralDesign.ts";
import { sculptureJson } from "../../src/sculpture/SculptureEditor.ts";
import { inspectZipResources } from "./ZipResourceLimits.ts";

export interface PortableProjectFile {
  path: string;
  bytes: Uint8Array;
}

export interface PortableProjectAsset {
  source: string;
  bytes: Uint8Array;
  sha256: string;
  objectUrl: string;
  mediaType: string;
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
  const lower = source.toLowerCase();
  if (lower.endsWith(".glb")) return "model/gltf-binary";
  if (lower.endsWith(".stl")) return "model/stl";
  if (lower.endsWith(".3mf")) {
    return "application/vnd.ms-package.3dmanufacturing-3dmodel+xml";
  }
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".md")) return "text/markdown";
  return "application/octet-stream";
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
  references.push(...generatedStructuralAssetReferences(definition.generatedStructure));
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
    async (reference, sculptureSource) => {
      const bundled = byRelativePath.get(reference.source);
      if (!bundled) return loadPanelProfile(reference, sculptureSource);
      try {
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bundled)) as unknown;
      } catch (error) {
        throw new Error(
          `Portable panel profile ${reference.source} is invalid JSON: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
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
  const bundledProfileBytes = byRelativePath.get(project.sculpture.panelProfile.source);
  if (bundledProfileBytes) {
    validated.unshift({
      source: project.sculpture.panelProfile.source,
      bytes: bundledProfileBytes,
      sha256: sha256Bytes(bundledProfileBytes),
      mediaType: "application/json",
    });
  }

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

export function unzipPortableProjectFiles(zipBytes: Uint8Array): PortableProjectFile[] {
  const expectedEntries = new Map(inspectZipResources(zipBytes));
  const files: PortableProjectFile[] = [];
  const seen = new Set<string>();
  let extractionError: unknown;
  const unzipper = new Unzip((file) => {
    try {
      const expected = expectedEntries.get(file.name);
      if (!expected) throw new Error(`ZIP local entry ${file.name} is not in its central directory.`);
      expectedEntries.delete(file.name);
      if (
        (file.size !== undefined && file.size !== expected.compressedBytes) ||
        (file.originalSize !== undefined && file.originalSize !== expected.expandedBytes)
      ) {
        throw new Error(`ZIP entry ${file.name} disagrees with its central directory.`);
      }
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
      let expandedBytes = 0;
      file.ondata = (error, chunk, final) => {
        if (error) {
          extractionError = error;
          return;
        }
        expandedBytes += chunk.length;
        if (expandedBytes > expected.expandedBytes) {
          extractionError = new Error(`ZIP entry ${path} exceeds its declared expansion size.`);
          file.terminate();
          return;
        }
        chunks.push(Uint8Array.from(chunk));
        if (!final) return;
        if (expandedBytes !== expected.expandedBytes) {
          extractionError = new Error(`ZIP entry ${path} did not match its declared expansion size.`);
          return;
        }
        const bytes = new Uint8Array(expandedBytes);
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
  if (expectedEntries.size > 0) {
    throw new Error("ZIP central directory contains entries that were not extracted.");
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
    unzipPortableProjectFiles(zipBytes),
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
  const profileBytes = availableAssets.get(definition.panelProfile.source);
  if (profileBytes) {
    files.set(definition.panelProfile.source, Uint8Array.from(profileBytes));
  }
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
