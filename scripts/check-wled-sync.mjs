import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const VERIFIED_FUNCTIONS = [
  "mode_static",
  "blink",
  "mode_blink",
  "mode_blink_rainbow",
  "mode_strobe",
  "mode_strobe_rainbow",
  "color_wipe",
  "mode_color_wipe",
  "mode_color_sweep",
  "mode_breath",
  "mode_fade",
  "scan",
  "mode_scan",
  "mode_dual_scan",
  "mode_rainbow",
  "mode_rainbow_cycle",
  "running",
  "mode_theater_chase",
  "mode_theater_chase_rainbow",
  "running_base",
  "mode_running_lights",
  "mode_saw",
  "mode_bpm",
  "mode_static_pattern",
  "mode_tri_static_pattern",
  "mode_twinkle",
  "mode_sparkle",
  "mode_flash_sparkle",
  "mode_hyper_sparkle",
  "mode_multi_strobe",
  "sinelon_base",
  "mode_sinelon",
  "mode_sinelon_dual",
  "mode_sinelon_rainbow",
  "glitter_base",
  "mode_glitter",
  "mode_solid_glitter",
];

function extractFunction(source, functionName) {
  const escapedName = functionName.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  const signature = new RegExp(
    `(?:^|\\n)(?:static\\s+)?void\\s+${escapedName}\\s*\\([^)]*\\)\\s*\\{`,
    "m",
  );
  const match = signature.exec(source);
  if (!match) throw new Error(`Cannot find WLED function ${functionName}`);

  const start = match.index + (match[0].startsWith("\n") ? 1 : 0);
  const openingBrace = source.indexOf("{", start);
  let depth = 0;
  let state = "code";

  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (character === "\n") state = "code";
      continue;
    }
    if (state === "block-comment") {
      if (character === "*" && next === "/") {
        state = "code";
        index += 1;
      }
      continue;
    }
    if (state === "string") {
      if (character === "\\") index += 1;
      else if (character === '"') state = "code";
      continue;
    }
    if (state === "character") {
      if (character === "\\") index += 1;
      else if (character === "'") state = "code";
      continue;
    }

    if (character === "/" && next === "/") {
      state = "line-comment";
      index += 1;
    } else if (character === "/" && next === "*") {
      state = "block-comment";
      index += 1;
    } else if (character === '"') {
      state = "string";
    } else if (character === "'") {
      state = "character";
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  throw new Error(`Unterminated WLED function ${functionName}`);
}

function normalizeCpp(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/\s+/g, "");
}

export function verifyWledSync(repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")) {
  const revisionFile = path.join(repoRoot, "wasm/upstream-revision.txt");
  const expectedRevision = readFileSync(revisionFile, "utf8").trim();
  const upstreamDir = path.join(repoRoot, "wled/upstream");
  const actualRevision = execFileSync("git", ["-C", upstreamDir, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();

  if (actualRevision !== expectedRevision) {
    throw new Error(
      `WLED revision mismatch: expected ${expectedRevision}, found ${actualRevision}. Review upstream changes before updating the pin.`,
    );
  }

  const upstream = readFileSync(path.join(upstreamDir, "wled00/FX.cpp"), "utf8");
  const local = readFileSync(path.join(repoRoot, "wasm/src/wled_effects.inc"), "utf8");
  const mismatches = [];

  for (const functionName of VERIFIED_FUNCTIONS) {
    const upstreamBody = normalizeCpp(extractFunction(upstream, functionName));
    const localBody = normalizeCpp(extractFunction(local, functionName));
    if (upstreamBody !== localBody) mismatches.push(functionName);
  }

  if (mismatches.length) {
    throw new Error(
      `Selected WLED functions differ from pinned upstream: ${mismatches.join(", ")}`,
    );
  }

  return {
    revision: actualRevision,
    verifiedFunctions: VERIFIED_FUNCTIONS.length,
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyWledSync();
    console.log(
      `WLED sync verified: ${result.verifiedFunctions} functions at ${result.revision.slice(0, 12)}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
