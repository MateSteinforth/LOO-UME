import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BUILD_ID = 2609093;
export const RMT_HEADER = "src/internal/methods/ESP/ESP32/NeoEsp32RmtXMethod.h";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function replacePinned(bytes, expectedHash, before, after) {
  if (hash(bytes) !== expectedHash) throw new Error("Unexpected pinned source");
  const source = bytes.toString("utf8");
  if (source.split(before).length !== 2) throw new Error("Expected one source match");
  return Buffer.from(source.replace(before, after));
}

export function patchReset(bytes) {
  return replacePinned(
    bytes,
    "01189d3266629a6a72e2928faa56977b7536d7cf596f927c7355440036b658f7",
    "uint32_t reset_ticks = config->resolution / 1000000 * 50 / 2; // reset code duration defaults to 50us",
    "uint32_t reset_ticks = T_SPEED::RmtDurationReset / 2; // Selected speed reset, in ticks at the matching RMT resolution.",
  );
}

export function patchBuildId(bytes) {
  return replacePinned(
    bytes,
    "e75b06ba221bade02978200bda453e45054b34e45300aa5a83eead35ae336ca9",
    "#define VERSION 2607201",
    `#define VERSION ${BUILD_ID}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4) throw new Error("Provide WLED source and NeoPixelBus directories");
  const buildPath = resolve(process.argv[2], "wled00/wled.h");
  const resetPath = resolve(process.argv[3], RMT_HEADER);
  // Validate both inputs before changing either file.
  const build = patchBuildId(await readFile(buildPath));
  const reset = patchReset(await readFile(resetPath));
  await writeFile(buildPath, build);
  await writeFile(resetPath, reset);
  console.log(JSON.stringify({ buildId: BUILD_ID, wledHeader: hash(build), rmtHeader: hash(reset) }));
}
