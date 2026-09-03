import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const [receiptPath, firmwarePath] = process.argv.slice(2);
if (!receiptPath || !firmwarePath) {
  throw new Error(
    "Use: node scripts/verify-packaged-firmware.mjs <receipt.json> <firmware.bin>",
  );
}

const [receiptText, firmware] = await Promise.all([
  readFile(receiptPath, "utf8"),
  readFile(firmwarePath),
]);
const receipt = JSON.parse(receiptText);
const artifact = receipt?.fullFlashArtifact;
const sha256 = createHash("sha256").update(firmware).digest("hex");

if (
  receipt?.schemaVersion !== "1.2.0" ||
  receipt?.status !== "built-not-flashed" ||
  receipt?.target?.capabilities?.serialProvisioning !== "improv-v1" ||
  artifact?.name !== "wled-orbital-esp32dev-full-flash.bin" ||
  artifact?.byteLength !== firmware.byteLength ||
  artifact?.sha256 !== sha256 ||
  artifact?.flashAddress !== 0 ||
  artifact?.eraseAll !== true
) {
  throw new Error("The packaged ESP32 image does not match its build receipt.");
}

console.log(`${artifact.name}: ${firmware.byteLength} bytes, ${sha256}`);
