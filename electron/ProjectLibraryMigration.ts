import { constants } from "node:fs";
import { copyFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";

const LIBRARY_STATE = ".library-state.json";

function transferableProjectFile(name: string): boolean {
  return name === LIBRARY_STATE ||
    (/^[A-Za-z0-9][A-Za-z0-9._-]*\.loo\.zip$/.test(name) && name.length <= 180);
}

export async function migrateLegacyProjectLibrary(
  sourceDirectory: string,
  destinationDirectory: string,
): Promise<string[]> {
  await mkdir(destinationDirectory, { recursive: true });
  const existing = await readdir(destinationDirectory).catch(() => []);
  if (existing.some(transferableProjectFile)) return [];
  const sourceNames = (await readdir(sourceDirectory).catch(() => []))
    .filter(transferableProjectFile)
    .sort();
  const copied: string[] = [];
  try {
    for (const name of sourceNames) {
      await copyFile(
        join(sourceDirectory, name),
        join(destinationDirectory, name),
        constants.COPYFILE_EXCL,
      );
      copied.push(name);
    }
  } catch (error) {
    await Promise.all(copied.map((name) =>
      unlink(join(destinationDirectory, name)).catch(() => undefined)
    ));
    throw error;
  }
  return copied;
}
