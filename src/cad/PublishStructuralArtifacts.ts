import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import {
  assertPortableProjectAssetSource,
  sha256Bytes,
} from "../sculpture/GeneratedMechanics.ts";
import {
  type CompiledStructuralArtifactBundle,
  type StructuralArtifactFile,
  type StructuralArtifactManifest,
  validateStructuralArtifactBundle,
} from "./CompileStructuralArtifacts.ts";

type MoveDirectory = (source: string, destination: string) => Promise<void>;

async function atomicReplaceStructuralDirectory(
  pendingDirectory: string,
  outputDirectory: string,
  move: MoveDirectory = rename,
): Promise<void> {
  const backupDirectory = `${outputDirectory}.previous-${randomUUID()}`;
  const hadPrevious = existsSync(outputDirectory);
  if (hadPrevious) await move(outputDirectory, backupDirectory);
  try {
    await move(pendingDirectory, outputDirectory);
  } catch (error) {
    if (hadPrevious && existsSync(backupDirectory)) {
      await move(backupDirectory, outputDirectory);
    }
    throw error;
  }
  if (hadPrevious) await rm(backupDirectory, { recursive: true, force: true });
}

export interface PublishedStructuralArtifacts {
  outputDirectory: string;
  manifestPath: string;
  artifactPaths: string[];
}

export interface PublishStructuralArtifactOptions {
  artifactRootDirectory: string;
  directoryName: string;
  /** Test seam for proving rollback after the prior directory is backed up. */
  moveDirectory?: MoveDirectory;
}

function stagedPath(root: string, source: string): string {
  assertPortableProjectAssetSource(source, "Structural artifact");
  const path = resolve(root, source);
  const relativePath = relative(root, path);
  if (relativePath === "" || relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) || resolve(path) !== path) {
    throw new Error(`Structural artifact path ${source} escapes its output directory.`);
  }
  return path;
}

async function listedFiles(root: string, directory = root): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listedFiles(root, path));
    else if (entry.isFile()) result.push(relative(root, path).split(sep).join("/"));
    else throw new Error(`Structural artifact output contains unsupported entry ${path}.`);
  }
  return result.sort();
}

async function assertOwnedExistingOutput(
  outputDirectory: string,
  manifestSource: string,
): Promise<void> {
  try {
    const manifestPath = stagedPath(outputDirectory, manifestSource);
    const manifestBytes = new Uint8Array(await readFile(manifestPath));
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as StructuralArtifactManifest;
    if (!Array.isArray(manifest.artifacts)) throw new Error("manifest has no artifact list");
    const files: StructuralArtifactFile[] = await Promise.all(manifest.artifacts.map(async (reference) => {
      const bytes = new Uint8Array(await readFile(stagedPath(outputDirectory, reference.source)));
      return {
        id: reference.id,
        role: reference.role,
        format: reference.format,
        source: reference.source,
        bytes,
        sha256: reference.sha256,
      };
    }));
    validateStructuralArtifactBundle({
      manifest,
      manifestSource: "structure/artifacts.json",
      manifestBytes,
      files,
    });
    const expectedFiles = [manifestSource, ...files.map(({ source }) => source)].sort();
    const actualFiles = await listedFiles(outputDirectory);
    if (actualFiles.join("\n") !== expectedFiles.join("\n")) {
      throw new Error("output contains files outside its validated manifest");
    }
  } catch (error) {
    throw new Error(
      `Refusing to replace ${outputDirectory}: it is not a complete generator-owned structural artifact directory (${error instanceof Error ? error.message : String(error)}).`,
    );
  }
}

/** Writes a complete validated set to a sibling directory, then swaps it atomically. */
export async function publishStructuralArtifactBundle(
  bundle: CompiledStructuralArtifactBundle,
  options: PublishStructuralArtifactOptions,
): Promise<PublishedStructuralArtifacts> {
  validateStructuralArtifactBundle(bundle);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(options.directoryName) ||
    options.directoryName === "." || options.directoryName === "..") {
    throw new Error("Structural artifact directoryName must be one safe path segment.");
  }
  const artifactRootDirectory = resolve(options.artifactRootDirectory);
  await mkdir(artifactRootDirectory, { recursive: true });
  const outputDirectory = resolve(artifactRootDirectory, options.directoryName);
  if (dirname(outputDirectory) !== artifactRootDirectory) {
    throw new Error("Structural artifact output must be one direct child of its authorized root.");
  }
  if (existsSync(outputDirectory)) {
    const status = await lstat(outputDirectory);
    if (!status.isDirectory() || status.isSymbolicLink()) {
      throw new Error("Existing structural artifact output must be a real directory, not a file or link.");
    }
    await assertOwnedExistingOutput(outputDirectory, bundle.manifestSource);
  }
  const pendingDirectory = `${outputDirectory}.pending-${process.pid}-${randomUUID()}`;
  try {
    for (const file of [...bundle.files].sort((left, right) =>
      left.source < right.source ? -1 : left.source > right.source ? 1 : 0
    )) {
      const path = stagedPath(pendingDirectory, file.source);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.bytes);
      const stagedBytes = new Uint8Array(await readFile(path));
      if (stagedBytes.byteLength !== file.bytes.byteLength ||
        sha256Bytes(stagedBytes) !== file.sha256) {
        throw new Error(`Staged structural artifact ${file.source} failed exact-byte verification.`);
      }
    }
    const manifestPath = stagedPath(pendingDirectory, bundle.manifestSource);
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, bundle.manifestBytes);
    const stagedManifest = new Uint8Array(await readFile(manifestPath));
    if (sha256Bytes(stagedManifest) !== sha256Bytes(bundle.manifestBytes)) {
      throw new Error("Staged structural artifact manifest failed exact-byte verification.");
    }
    await atomicReplaceStructuralDirectory(
      pendingDirectory,
      outputDirectory,
      options.moveDirectory ?? rename,
    );
    return {
      outputDirectory,
      manifestPath: resolve(outputDirectory, bundle.manifestSource),
      artifactPaths: bundle.files.map(({ source }) => resolve(outputDirectory, source)),
    };
  } catch (error) {
    await rm(pendingDirectory, { recursive: true, force: true });
    throw error;
  }
}
