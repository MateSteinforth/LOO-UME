import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadVerifiedEsp32Firmware } from "../scripts/esp32-firmware-handler.ts";

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

async function fixture(corrupt = false): Promise<{
  receiptPath: string;
  firmwarePath: string;
  bytes: Uint8Array;
}> {
  const root = resolve("/tmp", `loo-ume-firmware-handler-${randomUUID()}`);
  temporaryPaths.push(root);
  await mkdir(root, { recursive: true });
  const bytes = new Uint8Array([0xff, 0x01, 0x02, 0x03, 0x04]);
  const receiptPath = resolve(root, "receipt.json");
  const firmwarePath = resolve(root, "wled-orbital-esp32dev-full-flash.bin");
  await writeFile(receiptPath, JSON.stringify({
    schemaVersion: "1.2.0",
    status: "built-not-flashed",
    target: {
      board: "ESP32-DevKitC V4",
      module: "ESP32-WROOM-32E-N4",
      platformioEnvironment: "orbital_esp32dev",
      wledCommit: "d9b9a846561227351ad929e3109781daadb7bed2",
      capabilities: { serialProvisioning: "improv-v1" },
    },
    fullFlashArtifact: {
      name: "wled-orbital-esp32dev-full-flash.bin",
      byteLength: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      flashAddress: 0,
      eraseAll: true,
      flashMode: "dio",
      flashFrequency: "40m",
      flashSize: "4MB",
    },
  }));
  await writeFile(firmwarePath, corrupt ? new Uint8Array([9, 9, 9]) : bytes);
  return { receiptPath, firmwarePath, bytes };
}

describe("ESP32 firmware receipt gate", () => {
  it("loads only receipt-matching complete flash bytes", async () => {
    const paths = await fixture();
    const verified = await loadVerifiedEsp32Firmware(
      paths.receiptPath,
      paths.firmwarePath,
    );
    expect(verified.receipt.fullFlashArtifact.sha256).toBe(
      createHash("sha256").update(paths.bytes).digest("hex"),
    );
    expect(new Uint8Array(verified.bytes)).toEqual(paths.bytes);
  });

  it("fails closed when the staged bytes do not match the receipt", async () => {
    const paths = await fixture(true);
    await expect(loadVerifiedEsp32Firmware(
      paths.receiptPath,
      paths.firmwarePath,
    )).rejects.toThrow(/does not match/);
  });

  it("fails closed when the receipt does not bind serial Improv", async () => {
    const paths = await fixture();
    const receipt = JSON.parse(await readFile(paths.receiptPath, "utf8")) as {
      target: { capabilities?: { serialProvisioning: string } };
    };
    delete receipt.target.capabilities;
    await writeFile(paths.receiptPath, JSON.stringify(receipt));
    await expect(loadVerifiedEsp32Firmware(
      paths.receiptPath,
      paths.firmwarePath,
    )).rejects.toThrow(/receipt is invalid/);
  });
});
