import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MANIFEST = "toolchains/bootstrap/install-manifest.json";
const WORKFLOW = ".github/workflows/render.yml";

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

  it("defines one-command launch and guarded update contracts", () => {
    const bootstrap = readFileSync("bootstrap.sh", "utf8");
    expect(bootstrap).toContain("launch)");
    expect(bootstrap).toContain("scripts/local-editor-server.ts\" --open-browser");
    expect(bootstrap).toContain("LOO_UME_OPEN_BROWSER-1");
    expect(bootstrap).toContain("update)");
    expect(bootstrap).toContain("bootstrap-update-apply.sh");
    expect(bootstrap).toContain("review-electron)");
    expect(bootstrap).toContain("run review:electron:mac");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["review:electron:mac"]).toContain(
      "scripts/launch-local-packaged-electron.sh",
    );
    const localElectron = readFileSync(
      "scripts/launch-local-packaged-electron.sh",
      "utf8",
    );
    expect(localElectron).toContain("electron-builder --mac dir");
    expect(localElectron).toContain("LOO_UME_LOCAL_ELECTRON_REVIEW=1");
    expect(localElectron).toContain("LOO_UME_LOCAL_ELECTRON_REVIEW_DATA=");
    expect(localElectron).not.toContain("exec /usr/bin/open");
    const update = readFileSync("scripts/bootstrap-update-apply.sh", "utf8");
    expect(update).toContain("verify_update_checkout");
    expect(update).toContain("verify_update_fast_forward");
    expect(update).toContain("apply_update_with_preserved_changes");
  });

  it("runs the same restricted-PATH setup on Linux and native macOS CI", () => {
    const workflow = readFileSync(WORKFLOW, "utf8");
    const macJob = workflow.split("  stage-zero-bootstrap-macos:")[1]
      ?.split("\n  clean-checkout:")[0];
    const linuxJob = workflow.split("  clean-checkout:")[1]
      ?.split("\n  manifold-panel-parts:")[0];

    expect(macJob).toContain("runner: macos-15");
    expect(macJob).toContain("runner: macos-15-intel");
    expect(macJob).toContain("architecture: arm64");
    expect(macJob).toContain("architecture: x86_64");
    expect(macJob).toContain(
      "run: env PATH=/usr/bin:/bin ./bootstrap.sh setup",
    );
    expect(linuxJob).toContain(
      "run: env PATH=/usr/bin:/bin ./bootstrap.sh setup",
    );
  });
});
