import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const RECEIPT_PATH = "web/public/wasm/runtime-integrity.json";
const EXPECTED_ARTIFACTS = [
  "web/public/wasm/wled-engine.js",
  "web/public/wasm/wled-engine.wasm",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyWasmRuntime(
  repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
) {
  const receipt = JSON.parse(readFileSync(path.join(repoRoot, RECEIPT_PATH), "utf8"));
  if (
    receipt.schemaVersion !== "1.0.0" ||
    receipt.generationBranch !== "generate/wled-simulator" ||
    !/^[0-9a-f]{40}$/.test(receipt.source?.wledCommit ?? "") ||
    typeof receipt.compiler?.emscriptenVersion !== "string" ||
    !/^[0-9a-f]{40}$/.test(receipt.compiler?.emsdkRevision ?? "") ||
    !Array.isArray(receipt.artifacts) ||
    receipt.artifacts.length !== EXPECTED_ARTIFACTS.length
  ) {
    throw new Error("Invalid WLED simulator integrity receipt.");
  }

  for (const [index, expectedPath] of EXPECTED_ARTIFACTS.entries()) {
    const artifact = receipt.artifacts[index];
    if (
      artifact?.path !== expectedPath ||
      !Number.isInteger(artifact.byteLength) ||
      artifact.byteLength < 1 ||
      !/^[0-9a-f]{64}$/.test(artifact.sha256 ?? "")
    ) {
      throw new Error(`Invalid WLED simulator receipt entry ${expectedPath}.`);
    }
    const bytes = readFileSync(path.join(repoRoot, expectedPath));
    const actualHash = sha256(bytes);
    if (bytes.byteLength !== artifact.byteLength || actualHash !== artifact.sha256) {
      throw new Error(
        `WLED simulator artifact ${expectedPath} failed integrity verification.`,
      );
    }
  }
  return {
    artifacts: EXPECTED_ARTIFACTS.length,
    wledCommit: receipt.source.wledCommit,
  };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyWasmRuntime();
    console.log(
      `Verified ${result.artifacts} checked-in WLED simulator artifacts from ${result.wledCommit.slice(0, 12)}.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
