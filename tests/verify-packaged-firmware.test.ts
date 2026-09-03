import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

async function fixture(corrupt: boolean): Promise<[string, string]> {
  const root = resolve("/tmp", `loo-ume-package-firmware-${randomUUID()}`);
  temporaryPaths.push(root);
  await mkdir(root, { recursive: true });
  const firmware = Uint8Array.from([1, 2, 3, 4]);
  const receiptPath = resolve(root, "receipt.json");
  const firmwarePath = resolve(root, "wled-orbital-esp32dev-full-flash.bin");
  await writeFile(receiptPath, JSON.stringify({
    schemaVersion: "1.2.0",
    status: "built-not-flashed",
    target: { capabilities: { serialProvisioning: "improv-v1" } },
    fullFlashArtifact: {
      name: "wled-orbital-esp32dev-full-flash.bin",
      byteLength: firmware.byteLength,
      sha256: createHash("sha256").update(firmware).digest("hex"),
      flashAddress: 0,
      eraseAll: true,
    },
  }));
  await writeFile(
    firmwarePath,
    corrupt ? Uint8Array.from([4, 3, 2, 1]) : firmware,
  );
  return [receiptPath, firmwarePath];
}

describe("packaged firmware verification", () => {
  it("accepts matching firmware", async () => {
    const paths = await fixture(false);
    await expect(execute(process.execPath, [
      "scripts/verify-packaged-firmware.mjs",
      ...paths,
    ])).resolves.toBeDefined();
  });

  it("rejects different firmware", async () => {
    const paths = await fixture(true);
    await expect(execute(process.execPath, [
      "scripts/verify-packaged-firmware.mjs",
      ...paths,
    ])).rejects.toThrow(/does not match/);
  });
});
