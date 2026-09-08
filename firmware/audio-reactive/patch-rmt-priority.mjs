import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RMT_HEADER } from "../patch-rmt.mjs";

export function patchRmtPriority(bytes) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== "01189d3266629a6a72e2928faa56977b7536d7cf596f927c7355440036b658f7") {
    throw new Error("Expected the pinned four-output RMT header.");
  }
  const before = "config.clk_src = RMT_CLK_SRC_DEFAULT;";
  const source = bytes.toString("utf8");
  if (source.split(before).length !== 2) throw new Error("Expected one RMT configuration.");
  return Buffer.from(source.replace(before, `${before}\n        config.intr_priority = 3; // Give LED buffer refills priority under network load.`));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("Provide the pinned NeoPixelBus directory.");
  const path = resolve(process.argv[2], RMT_HEADER);
  const patched = patchRmtPriority(await readFile(path));
  await writeFile(path, patched);
  console.log(createHash("sha256").update(patched).digest("hex"));
}
