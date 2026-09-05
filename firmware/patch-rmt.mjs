import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RMT_HEADER = "src/internal/methods/ESP/ESP32/NeoEsp32RmtXMethod.h";
export const ORIGINAL_RMT_SHA256 =
  "873f04f31542043993106dddc483e42adbc7d30cb12198645354c46dbf097ee6";
const before =
  "config.mem_block_symbols = 192;         // memory block size, 64 * 4 = 256 Bytes";
const after =
  "config.mem_block_symbols = 128;         // Two 64-symbol blocks permit four ESP32 outputs.";

export function patchRmtHeader(bytes) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== ORIGINAL_RMT_SHA256) {
    throw new Error(
      "The RMT source does not match the pinned unmodified header.",
    );
  }
  const source = bytes.toString("utf8");
  if (source.split(before).length !== 2) {
    throw new Error("The RMT patch requires one exact source match.");
  }
  return Buffer.from(source.replace(before, after), "utf8");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const directory = process.argv[2];
  if (!directory) throw new Error("Provide the pinned NeoPixelBus directory.");
  const path = resolve(directory, RMT_HEADER);
  const patched = patchRmtHeader(await readFile(path));
  await writeFile(path, patched);
  console.log(
    `Patched RMT source: ${createHash("sha256").update(patched).digest("hex")}`,
  );
}
