import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const sourceDirectory = process.argv[2];
if (!sourceDirectory)
  throw new Error("Provide the pinned WLED source directory.");
const path = resolve(sourceDirectory, "wled00/wled.h");
const original = await readFile(path, "utf8");
if (
  createHash("sha256").update(original).digest("hex") !==
  "e75b06ba221bade02978200bda453e45054b34e45300aa5a83eead35ae336ca9"
) {
  throw new Error(
    "The WLED source does not match the pinned unmodified header.",
  );
}
const before = "#define VERSION 2607201";
const after = "#define VERSION 2609051";
if (original.split(before).length !== 2) {
  throw new Error(
    "The WLED build number patch requires one exact source match.",
  );
}
const patched = original.replace(before, after);
await writeFile(path, patched);
console.log(
  `Build 2609051 source: ${createHash("sha256").update(patched).digest("hex")}`,
);
