import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createReceipt,
  verifyReceipt,
} from "../scripts/desktop-build-receipt.mjs";

const COMMIT = "1".repeat(40);

function options(root: string) {
  return {
    "--root": root,
    "--receipt": join(root, ".tools", "desktop-build-receipt.json"),
    "--target": "linux-x64",
    "--commit": COMMIT,
  };
}

describe("desktop build receipt", () => {
  it("binds reuse to every production output byte", async () => {
    const root = mkdtempSync(join(tmpdir(), "loo-ume-build-receipt-"));
    try {
      mkdirSync(join(root, "dist", "assets"), { recursive: true });
      mkdirSync(join(root, ".tools"));
      writeFileSync(join(root, "dist", "index.html"), "<script src='assets/app.js'></script>");
      writeFileSync(join(root, "dist", "assets", "app.js"), "current");

      await createReceipt(options(root));
      await expect(verifyReceipt(options(root))).resolves.toBeUndefined();
      const receipt = readFileSync(
        join(root, ".tools", "desktop-build-receipt.json"),
        "utf8",
      );
      expect(receipt).toContain('"assets/app.js"');

      writeFileSync(join(root, "dist", "assets", "app.js"), "modified");
      await expect(verifyReceipt(options(root))).rejects.toThrow(
        "does not match the complete production output",
      );
      writeFileSync(join(root, "dist", "assets", "app.js"), "current");
      writeFileSync(join(root, "dist", "assets", "unexpected.js"), "extra");
      await expect(verifyReceipt(options(root))).rejects.toThrow(
        "does not match the complete production output",
      );
      rmSync(join(root, "dist", "assets", "unexpected.js"));
      rmSync(join(root, "dist", "assets", "app.js"));
      await expect(verifyReceipt(options(root))).rejects.toThrow(
        "does not match the complete production output",
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
