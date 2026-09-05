import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyPackagedFirmware } from "./verify-packaged-firmware.mjs";

const root = resolve(import.meta.dirname, "..");
const receiptPath = resolve(root, "firmware/build-receipt.json");
const outputDirectory = resolve(root, "build/firmware");
const firmwarePath = resolve(
  outputDirectory,
  "wled-orbital-esp32dev-full-flash.bin",
);
const temporaryPath = `${firmwarePath}.${process.pid}.tmp`;
const firmwareUrl =
  "https://github.com/MateSteinforth/LOO-UME/releases/download/esp32-firmware-improv-rmt4-v1/wled-orbital-esp32dev-full-flash.bin";

try {
  await verifyPackagedFirmware(receiptPath, firmwarePath);
  console.log("The verified ESP32 image is current.");
  process.exit(0);
} catch {
  // Continue to the receipt-bound download.
}

await mkdir(outputDirectory, { recursive: true });
try {
  const response = await fetch(firmwareUrl, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Firmware download failed with HTTP ${response.status}.`);
  }
  await writeFile(temporaryPath, Buffer.from(await response.arrayBuffer()), {
    mode: 0o600,
  });
  await verifyPackagedFirmware(receiptPath, temporaryPath);
  await rename(temporaryPath, firmwarePath);
  console.log("Downloaded and verified the receipt-bound ESP32 image.");
} finally {
  await rm(temporaryPath, { force: true });
}
