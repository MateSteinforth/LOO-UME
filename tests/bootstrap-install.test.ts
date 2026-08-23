import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MANIFEST = "toolchains/bootstrap/install-manifest.json";

describe("clean-checkout bootstrap", () => {
  it("pins one complete Node/npm artifact for every supported target", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
      schemaVersion: string;
      targets: Array<{
        id: string;
        artifacts: Array<{
          id: string;
          version: string;
          installDirectory: string;
          url: string;
          size: number;
          sha256: string;
          treeSha256: string;
          executables: string[];
        }>;
      }>;
    };
    expect(manifest.schemaVersion).toBe("1.0.0");
    expect(manifest.targets.map((target) => target.id)).toEqual([
      "linux-x64",
      "darwin-arm64",
      "darwin-x64",
    ]);
    for (const target of manifest.targets) {
      expect(target.artifacts).toHaveLength(1);
      const artifact = target.artifacts[0]!;
      expect(artifact).toMatchObject({
        id: "node",
        version: "22.23.2",
        installDirectory: ".tools/node",
      });
      expect(artifact.url).toMatch(
        /^https:\/\/nodejs\.org\/download\/release\/v22\.23\.2\//,
      );
      expect(artifact.size).toBeGreaterThan(40_000_000);
      expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(artifact.treeSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(artifact.executables).toEqual([
        "bin/node",
        "lib/node_modules/npm/bin/npm-cli.js",
        "lib/node_modules/npm/bin/npx-cli.js",
      ]);
    }
  });

  it("passes the strict manifest through the reviewed native validator", () => {
    expect(execFileSync("sh", [
      "bootstrap.sh",
      "validate",
      "--manifest",
      MANIFEST,
    ], { encoding: "utf8" })).toBe("");
  });

  it("rejects extra setup arguments before it changes the checkout", () => {
    const result = spawnSync("sh", ["bootstrap.sh", "setup", "unexpected"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage: ./bootstrap.sh setup");
  });
});
