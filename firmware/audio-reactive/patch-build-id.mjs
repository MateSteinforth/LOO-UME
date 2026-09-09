import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = process.argv[2];
if (!source) throw new Error("Provide the pinned WLED source directory.");
const path = resolve(source, "wled00/wled.h");
const original = await readFile(path);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (
  sha256(original) !==
  "e75b06ba221bade02978200bda453e45054b34e45300aa5a83eead35ae336ca9"
) {
  throw new Error("The WLED header does not match the pinned original.");
}
const before = "#define VERSION 2607201";
const text = original.toString("utf8");
if (text.split(before).length !== 2)
  throw new Error("Expected one build number.");
const patched = text.replace(before, "#define VERSION 2609085");
await writeFile(path, patched);
console.log(`Build 2609085 source: ${sha256(patched)}`);
