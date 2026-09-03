import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const UNSIGNED_DMG_URL =
  "https://github.com/MateSteinforth/LOO-UME/releases/download/" +
  "electron-macos-unsigned/LOO-UME-Electron-universal.dmg";

export interface UnsignedUpdateMetadata {
  schemaVersion: "1.0.0";
  version: string;
  commit: string;
  downloadUrl: typeof UNSIGNED_DMG_URL;
  fileName: "LOO-UME-Electron-universal.dmg";
  byteLength: number;
  sha256: string;
}

export async function createUnsignedUpdateMetadata(
  releaseDirectory: string,
  version: string,
  commit: string,
): Promise<UnsignedUpdateMetadata> {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("Unsigned Electron update version must use three numeric parts.");
  }
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error("Unsigned Electron update commit must be a full lowercase SHA-1.");
  }
  const dmgPath = join(releaseDirectory, "LOO-UME-Electron-universal.dmg");
  const bytes = await readFile(dmgPath);
  const metadata: UnsignedUpdateMetadata = {
    schemaVersion: "1.0.0",
    version,
    commit,
    downloadUrl: UNSIGNED_DMG_URL,
    fileName: "LOO-UME-Electron-universal.dmg",
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  await writeFile(
    join(releaseDirectory, "unsigned-update.json"),
    JSON.stringify(metadata, null, 2) + "\n",
  );
  return metadata;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const [, , releaseDirectory, version, commit] = process.argv;
  if (!releaseDirectory || !version || !commit) {
    throw new Error(
      "Usage: create-electron-unsigned-update.ts <release-directory> <version> <commit>",
    );
  }
  await createUnsignedUpdateMetadata(releaseDirectory, version, commit);
}
