import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RMT_HEADER, ORIGINAL_RMT_SHA256 } from "./patch-rmt.mjs";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "build/firmware-source");
const toolchain = resolve(root, "build/firmware-toolchain/core");
const dependency = resolve(
  source,
  ".pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575",
);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const receipt = JSON.parse(
  await readFile(resolve(root, "firmware/build-receipt.json"), "utf8"),
);
const patch = await readFile(resolve(root, "firmware/patch-rmt.mjs"));
const header = await readFile(resolve(dependency, RMT_HEADER));
const dependencyCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: dependency,
  encoding: "utf8",
}).trim();
if (
  dependencyCommit !== "76afe832f74b0738a3fa1bba0caf389ade9e7693" ||
  sha256(header) !==
    "01189d3266629a6a72e2928faa56977b7536d7cf596f927c7355440036b658f7"
) {
  throw new Error("The compiled LED driver does not match the reviewed patch.");
}
const dependencies = await readFile(
  resolve(source, ".pio/build/orbital_esp32dev/src/bus_manager.cpp.d"),
  "utf8",
);
if (
  !dependencies.includes(
    `NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575/${RMT_HEADER}`,
  )
) {
  throw new Error("The build did not include the patched RMT driver.");
}
for (const [field, file] of [
  ["platformVersion", "platforms/espressif32/platform.json"],
  ["frameworkVersion", "packages/framework-arduinoespressif32/package.json"],
  ["toolchainVersion", "packages/toolchain-xtensa-esp-elf/package.json"],
  ["esptoolVersion", "packages/tool-esptoolpy/package.json"],
]) {
  const metadata = JSON.parse(await readFile(resolve(toolchain, file), "utf8"));
  if (metadata.version !== receipt.target[field])
    throw new Error(`The ${field} changed.`);
}
const override = await readFile(resolve(root, "firmware/wled-platformio.ini"));
if (
  override.includes("WLED_DISABLE_ADALIGHT") ||
  !override.equals(await readFile(resolve(source, "platformio_override.ini")))
) {
  throw new Error("The firmware override or Improv capability does not match.");
}
const requirements = await readFile(resolve(source, "requirements.txt"));
if (sha256(requirements) !== receipt.inputs.upstreamRequirementsSha256)
  throw new Error("The pinned WLED requirements changed.");
receipt.target.releaseName = "ESP32";
receipt.target.buildId = 2609051;
receipt.inputs.platformioOverrideSha256 = sha256(override);
const wledHeader = await readFile(resolve(source, "wled00/wled.h"));
if (
  sha256(wledHeader) !==
  "aed45e3951d581f0b3ca9d6327881e6b3dfc7bb82fb24a36bea794fd0802ea20"
) {
  throw new Error("The WLED build number does not match the reviewed source.");
}
receipt.inputs.wledBuildNumber = {
  header: "wled00/wled.h",
  originalHeaderSha256:
    "e75b06ba221bade02978200bda453e45054b34e45300aa5a83eead35ae336ca9",
  patchedHeaderSha256: sha256(wledHeader),
  patchScript: "firmware/patch-build-id.mjs",
  patchScriptSha256: sha256(
    await readFile(resolve(root, "firmware/patch-build-id.mjs")),
  ),
};
receipt.inputs.neopixelBus = {
  commit: dependencyCommit,
  header: RMT_HEADER,
  originalHeaderSha256: ORIGINAL_RMT_SHA256,
  patchedHeaderSha256: sha256(header),
  patchScript: "firmware/patch-rmt.mjs",
  patchScriptSha256: sha256(patch),
  rmtSymbolsPerOutput: 128,
  classicEsp32SymbolCapacity: 512,
  maximumRmtOutputs: 4,
};
for (const key of ["artifact", "fullFlashArtifact"]) {
  const bytes = await readFile(
    resolve(root, "build/firmware-rmt4", receipt[key].name),
  );
  receipt[key].byteLength = bytes.byteLength;
  receipt[key].sha256 = sha256(bytes);
}
await writeFile(
  resolve(root, "firmware/build-receipt.json"),
  `${JSON.stringify(receipt, null, 2)}\n`,
);
console.log(`Verified candidate firmware: ${receipt.artifact.sha256}`);
