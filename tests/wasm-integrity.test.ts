import {
  appendFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// The verifier stays plain Node.js so clean verification needs no TS runner.
// @ts-expect-error TypeScript does not infer declarations for the local MJS file.
import { verifyWasmRuntime } from "../scripts/verify-wasm-runtime.mjs";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function runtimeCopy(): string {
  const root = mkdtempSync(path.join(tmpdir(), "wled-runtime-integrity-"));
  temporaryRoots.push(root);
  const target = path.join(root, "web/public/wasm");
  mkdirSync(target, { recursive: true });
  for (const name of [
    "runtime-integrity.json",
    "wled-engine.js",
    "wled-engine.wasm",
  ]) {
    cpSync(path.join("web/public/wasm", name), path.join(target, name));
  }
  return root;
}

describe("checked-in WLED simulator integrity", () => {
  it("accepts the tracked runtime and receipt without a source checkout", () => {
    expect(() => verifyWasmRuntime()).not.toThrow();
  });

  it("rejects changed runtime bytes", () => {
    const root = runtimeCopy();
    appendFileSync(path.join(root, "web/public/wasm/wled-engine.wasm"), "changed");
    expect(() => verifyWasmRuntime(root)).toThrow(/failed integrity verification/);
  });
});
