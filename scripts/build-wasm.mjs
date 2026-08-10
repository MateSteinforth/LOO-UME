import { mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pinnedVersion = readFileSync(path.join(repoRoot, "wasm/emscripten-version.txt"), "utf8").trim();
const localEmcc = path.join(repoRoot, ".tools/emsdk/upstream/emscripten/emcc");
const emcc = process.env.EMCC || (process.platform === "win32" ? "emcc.bat" : localEmcc);

const outputDir = path.join(repoRoot, "web/public/wasm");
mkdirSync(outputDir, { recursive: true });

const exportedFunctions = [
  "_wled_init",
  "_wled_resize",
  "_wled_reset",
  "_wled_set_effect",
  "_wled_set_speed",
  "_wled_set_intensity",
  "_wled_set_palette",
  "_wled_set_primary_color",
  "_wled_set_secondary_color",
  "_wled_set_audio",
  "_wled_tick",
  "_wled_get_pixel_buffer",
  "_wled_get_led_count",
  "_wled_get_effect_count",
  "_wled_get_effect_name",
  "_wled_get_palette_count",
  "_wled_get_palette_name",
  "_wled_get_oob_write_count",
  "_malloc",
  "_free"
];

const args = [
  path.join(repoRoot, "wasm/src/wled_engine.cpp"),
  path.join(repoRoot, "wled/upstream/wled00/src/dependencies/fastled_slim/fastled_slim.cpp"),
  "-I" + path.join(repoRoot, "wasm/compatibility"),
  "-I" + path.join(repoRoot, "wasm/include"),
  "-I" + path.join(repoRoot, "wasm/src"),
  "-I" + path.join(repoRoot, "wled/upstream/wled00/src/dependencies/fastled_slim"),
  "-std=c++20",
  "-O3",
  "-flto",
  "--no-entry",
  "-sMODULARIZE=1",
  "-sEXPORT_ES6=1",
  "-sENVIRONMENT=web,node",
  "-sALLOW_MEMORY_GROWTH=1",
  "-sFILESYSTEM=0",
  "-sASSERTIONS=1",
  "-sINITIAL_MEMORY=33554432",
  "-sEXPORTED_FUNCTIONS=" + JSON.stringify(exportedFunctions),
  "-sEXPORTED_RUNTIME_METHODS=[\"UTF8ToString\",\"HEAPU32\"]",
  "-o",
  path.join(outputDir, "wled-engine.js")
];

const result = spawnSync(emcc, args, {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: "inherit"
});

if (result.error?.code === "ENOENT") {
  console.error(
    `Emscripten ${pinnedVersion} is not installed. Run npm run setup:emsdk, or set EMCC to an emcc executable.`
  );
  process.exit(1);
}
process.exit(result.status ?? 1);
