import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { compileEquatorMapping } from "../src/effects/EquatorMapping.ts";

const projectPath = process.argv[2];
const outputPath = process.argv[3];
if (!projectPath || !outputPath) {
  throw new Error("Supply the sculpture JSON path and output directory.");
}
const project = await loadPanelAssemblyProjectFromFile(
  projectPath,
  process.cwd(),
);
const mapping = createPanelAssemblyMapping(project);
const points = compileEquatorMapping(mapping.entries);
if (points.length !== 2624)
  throw new Error("This firmware target requires 2,624 LEDs.");
const data = JSON.stringify(points);
const sha256 = createHash("sha256").update(data).digest("hex");
mkdirSync(outputPath, { recursive: true });
writeFileSync(
  path.join(outputPath, "EquatorMapping.h"),
  [
    "#pragma once",
    "#include <stdint.h>",
    "// Generated from authoritative LED poses in logical order.",
    `static constexpr uint16_t EQUATOR_LED_COUNT = ${points.length};`,
    `static const char EQUATOR_MAPPING_SHA256[] = "${sha256}";`,
    "struct EquatorCoordinate { uint16_t longitude; int16_t height; };",
    "static const EquatorCoordinate EQUATOR_COORDINATES[] PROGMEM = {",
    ...points.map((point) => `  {${point.longitude}, ${point.height}},`),
    "};",
    "",
  ].join("\n"),
);
writeFileSync(
  path.join(outputPath, "mapping-receipt.json"),
  JSON.stringify(
    { projectPath, ledCount: points.length, coordinatesSha256: sha256 },
    null,
    2,
  ) + "\n",
);
console.log(`Generated ${points.length} logical coordinates: ${sha256}`);
