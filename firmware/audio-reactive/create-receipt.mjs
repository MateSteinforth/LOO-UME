import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RMT_HEADER } from "../patch-rmt.mjs";

const root = resolve(import.meta.dirname, "../..");
const source = resolve(root, "build/firmware-source");
const core = resolve(root, "build/firmware-toolchain/core");
const output = resolve(root, "build/firmware-audioreactive");
const variant = resolve(root, "firmware/audio-reactive");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const receipt = await json(resolve(root, "firmware/build-receipt.json"));
const archiveHash = sha256(
  await readFile(resolve(root, "build/wled-source.tar.gz")),
);
assert.equal(
  archiveHash,
  "42f12c1b286030301dde811079386e99cbe6590989c7b45daa323bb0495fa8d1",
);
for (const [field, path] of [
  ["platformVersion", "platforms/espressif32/platform.json"],
  ["frameworkVersion", "packages/framework-arduinoespressif32/package.json"],
  ["toolchainVersion", "packages/toolchain-xtensa-esp-elf/package.json"],
  ["esptoolVersion", "packages/tool-esptoolpy/package.json"],
]) {
  assert.equal(
    (await json(resolve(core, path))).version,
    receipt.target[field],
  );
}
const override = await readFile(resolve(variant, "platformio.ini"));
assert.ok(
  override.equals(await readFile(resolve(source, "platformio_override.ini"))),
);
assert.ok(!override.includes("WLED_DISABLE_ADALIGHT"));
assert.ok(override.includes("custom_usermods = audioreactive"));
const dependencyName = "NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575";
const dependency = resolve(
  source,
  ".pio/libdeps/orbital_esp32dev",
  dependencyName,
);
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: dependency,
    encoding: "utf8",
  }).trim(),
  receipt.inputs.neopixelBus.commit,
);
assert.equal(
  sha256(await readFile(resolve(dependency, RMT_HEADER))),
  receipt.inputs.neopixelBus.patchedHeaderSha256,
);
const compiledDependencies = await readFile(
  resolve(source, ".pio/build/orbital_esp32dev/src/bus_manager.cpp.d"),
  "utf8",
);
assert.ok(compiledDependencies.includes(`${dependencyName}/${RMT_HEADER}`));
const commandsBytes = await readFile(resolve(source, "compile_commands.json"));
const commands = JSON.parse(commandsBytes);
const audioCommand = commands.find((entry) =>
  entry.file.endsWith("audio_reactive.cpp"),
);
assert.ok(audioCommand, "The audio source must be in the build.");
const command = audioCommand.command ?? audioCommand.arguments.join(" ");
for (const flag of [
  "UM_AUDIOREACTIVE_ENABLE",
  "SR_DMTYPE=1",
  "I2S_SDPIN=32",
  "I2S_WSPIN=26",
  "I2S_CKPIN=27",
  "MCLK_PIN=-1",
]) {
  assert.ok(
    command.includes(`-D${flag}`) || command.includes(`-D ${flag}`),
    `Missing flag: ${flag}`,
  );
}
const elf = resolve(source, ".pio/build/orbital_esp32dev/firmware.elf");
const symbols = execFileSync(
  resolve(core, "packages/toolchain-xtensa-esp-elf/bin/xtensa-esp32-elf-nm"),
  ["-C", elf],
  { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);
for (const name of [
  "AudioReactive::setup()",
  "FFTcode",
  "rmt_new_tx_channel",
  "handleImprovPacket",
]) {
  assert.ok(
    symbols.toLowerCase().includes(name.toLowerCase()),
    `Missing compiled symbol: ${name}`,
  );
}
const wledHeader = await readFile(resolve(source, "wled00/wled.h"));
assert.equal(
  sha256(wledHeader),
  "c13f713ddb39c0e53501119517c175e78ece046e1c8defca810186c986483922",
);
const fft = await json(
  resolve(source, ".pio/libdeps/orbital_esp32dev/arduinoFFT/library.json"),
);
assert.equal(fft.version, "2.0.1");
receipt.target.buildId = 2609082;
receipt.target.capabilities.audioReactive = {
  usermod: "audioreactive",
  enabledByDefault: true,
  microphone: "INMP441",
  type: "generic-i2s",
  dataGpio: 32,
  wordSelectGpio: 26,
  clockGpio: 27,
  masterClockGpio: -1,
};
receipt.inputs.sourceArchiveSha256 = archiveHash;
receipt.inputs.platformioOverrideSha256 = sha256(override);
receipt.inputs.wledBuildNumber.patchedHeaderSha256 = sha256(wledHeader);
receipt.inputs.wledBuildNumber.patchScript =
  "firmware/audio-reactive/patch-build-id.mjs";
receipt.inputs.wledBuildNumber.patchScriptSha256 = sha256(
  await readFile(resolve(variant, "patch-build-id.mjs")),
);
receipt.inputs.audioReactive = {
  source: "usermods/audioreactive/audio_reactive.cpp",
  sourceSha256: sha256(
    await readFile(
      resolve(source, "usermods/audioreactive/audio_reactive.cpp"),
    ),
  ),
  fftVersion: fft.version,
  compileCommandsSha256: sha256(commandsBytes),
  elfSha256: sha256(await readFile(elf)),
};
assert.equal(receipt.inputs.audioReactive.sourceSha256,
  "538547f009c9c34d6602c7e27ff54f0be73735095ed347c1854771e05c550338");
const sourceHeaderSha256 = sha256(await readFile(resolve(source, "usermods/audioreactive/audio_source.h")));
assert.equal(sourceHeaderSha256, "e7085fc728e9203a07e6a2d292720f72dae62dd68cd017fe7170646c44946017");
receipt.inputs.audioReactive.captureSuspension = {
  during: "DDP including main-segment mode, manual disable and OTA",
  sourceHeaderSha256,
  patchScript: "firmware/audio-reactive/patch-ddp-capture.mjs",
  patchScriptSha256: sha256(await readFile(resolve(variant, "patch-ddp-capture.mjs"))),
};
for (const [field, name] of [
  ["artifact", "wled-audioreactive-rmt4-esp32.bin"],
  ["fullFlashArtifact", "wled-audioreactive-rmt4-esp32-full-flash.bin"],
]) {
  const bytes = await readFile(resolve(output, name));
  receipt[field] = {
    ...receipt[field],
    name,
    byteLength: bytes.length,
    sha256: sha256(bytes),
  };
}
const app = await readFile(resolve(output, receipt.artifact.name));
const full = await readFile(resolve(output, receipt.fullFlashArtifact.name));
assert.ok(
  full.subarray(0x10000).equals(app),
  "The USB image must contain the exact application image.",
);
await writeFile(
  resolve(variant, "build-receipt.json"),
  `${JSON.stringify(receipt, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      buildId: receipt.target.buildId,
      artifact: receipt.artifact,
      fullFlashArtifact: receipt.fullFlashArtifact,
    },
    null,
    2,
  ),
);
