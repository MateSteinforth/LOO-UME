import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import { sculptureJson } from "../src/sculpture/SculptureEditor.ts";
import {
  createWledDeploymentBundle,
  sha256ExactBytes,
  validateWledDeploymentBundle,
} from "../src/wled/DeploymentContract.ts";
import {
  createHardwareMappingContract,
  type HardwareMappingContract,
} from "../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

async function fixture(): Promise<{
  contract: HardwareMappingContract;
  sculptureBytes: string;
}> {
  const project = await loadPanelAssemblyProjectFromFile(
    "sculptures/rhombicosidodecahedron/sculpture.json",
    process.cwd(),
  );
  const geometry = createPanelAssemblyMapping(project);
  const wiring = createProvisionalWiringPreview(
    geometry,
    project.sculpture,
    project.panelProfile,
  );
  return {
    contract: createHardwareMappingContract(geometry, wiring, project.panelProfile),
    sculptureBytes: sculptureJson(project.sculpture),
  };
}

function fileRecord(
  files: ReadonlyMap<string, string>,
  sculptureBytes: string,
): Record<string, string> {
  return { "sculpture.json": sculptureBytes, ...Object.fromEntries(files) };
}

describe("guarded WLED deployment contract", () => {
  it("emits the exact pinned installation files and validates their identity", async () => {
    const { contract, sculptureBytes } = await fixture();
    const bundle = createWledDeploymentBundle(
      contract,
      sculptureBytes,
      "installation",
    );
    expect(bundle.mode).toBe("installation");
    expect([...bundle.files.keys()]).toEqual([
      "wled/cfg.json",
      "wled/ledmap.json",
      "wled/route-mapping-manifest.json",
      "wled/one-panel-smoke-cfg.json",
      "wled/firmware-build-receipt.json",
      "wled/deployment-manifest.json",
    ]);
    const config = JSON.parse(bundle.files.get("wled/cfg.json")!) as {
      hw: { led: { total: number; maxpwr: number; ins: Array<Record<string, unknown>> } };
    };
    expect(config.hw.led).toMatchObject({ total: 2624, maxpwr: 0 });
    expect(config.hw.led.ins.map((bus) => ({
      start: bus.start,
      len: bus.len,
      pin: bus.pin,
      order: bus.order,
      rev: bus.rev,
      maxpwr: bus.maxpwr,
      ledma: bus.ledma,
    }))).toEqual([
      { start: 0, len: 704, pin: [16], order: 0, rev: false, maxpwr: 14000, ledma: 60 },
      { start: 704, len: 640, pin: [17], order: 0, rev: false, maxpwr: 14000, ledma: 60 },
      { start: 1344, len: 640, pin: [18], order: 0, rev: false, maxpwr: 14000, ledma: 60 },
      { start: 1984, len: 640, pin: [19], order: 0, rev: false, maxpwr: 14000, ledma: 60 },
    ]);
    expect(bundle.deploymentIdentity).toBe(sha256ExactBytes(bundle.manifestBytes));
    expect(JSON.parse(bundle.manifestBytes)).toMatchObject({
      status: "mapping-ready-installation",
      mappingFingerprint: "73b36d49",
      mappingFingerprintVersion: "fnv1a32-u32le-v2",
      target: {
        platformioEnvironment: "orbital_esp32dev",
        upstreamEnvironment: "esp32dev",
        wledCommit: "d9b9a846561227351ad929e3109781daadb7bed2",
      },
      firmware: {
        receiptPath: "wled/firmware-build-receipt.json",
        artifact: {
          name: "wled-orbital-esp32dev.bin",
          byteLength: 1111920,
          sha256: "6bf3cec1ab1865dc6b03e0ddd5dd03198c39851343e7e1ed99660b1dc5bf5975",
        },
        fullFlashArtifact: {
          name: "wled-orbital-esp32dev-full-flash.bin",
          byteLength: 1177456,
          sha256: "d245f7b0502c5734a3aa17027e60a2f3d5936a3397210cf867385f7cf74e81af",
          flashAddress: 0,
          eraseAll: true,
        },
      },
      sourceProject: { path: "sculpture.json" },
    });
    expect(JSON.parse(bundle.files.get("wled/one-panel-smoke-cfg.json")!))
      .toMatchObject({
        hw: { led: { total: 64, maxpwr: 1000, ins: [{ order: 0 }] } },
      });
    expect(() => validateWledDeploymentBundle(
      bundle.manifestBytes,
      fileRecord(bundle.files, sculptureBytes),
      bundle.deploymentIdentity,
    )).not.toThrow();
  });

  it("uses diagnostic-only names for draft or explicitly diagnostic output", async () => {
    const { contract, sculptureBytes } = await fixture();
    const cliReview = createWledDeploymentBundle(
      contract,
      sculptureBytes,
      "diagnostic",
    );
    for (const [path, bytes] of cliReview.files) {
      expect(readFileSync(path, "utf8")).toBe(bytes);
    }
    const draft = {
      ...contract,
      wiring: { ...contract.wiring, status: "draft" as const },
      readiness: {
        ...contract.readiness,
        mappingReady: false,
        currentChecksPass: false,
        wiringLifecycle: "draft" as const,
      },
    };
    const bundle = createWledDeploymentBundle(draft, sculptureBytes);
    expect(bundle.mode).toBe("diagnostic");
    expect([...bundle.files.keys()]).toEqual([
      "wled/diagnostic/ledmap.diagnostic.json",
      "wled/diagnostic/route-mapping.diagnostic.json",
      "wled/diagnostic/deployment-manifest.diagnostic.json",
    ]);
    expect([...bundle.files.keys()].every((path) => path.includes("diagnostic")))
      .toBe(true);
    expect(() => createWledDeploymentBundle(
      draft,
      sculptureBytes,
      "installation",
    )).toThrow(/mapping-ready/);
    const stale = {
      ...contract,
      wiring: { ...contract.wiring, status: "requires-review" as const },
    };
    expect(() => createWledDeploymentBundle(
      stale,
      sculptureBytes,
      "installation",
    )).toThrow(/saved route/);
    expect(() => validateWledDeploymentBundle(
      bundle.manifestBytes,
      fileRecord(bundle.files, sculptureBytes),
      bundle.deploymentIdentity,
    )).not.toThrow();
  });

  it("rejects stale routes, source bytes, artifacts, identities, and bus data", async () => {
    const { contract, sculptureBytes } = await fixture();
    expect(() => createWledDeploymentBundle(
      {
        ...contract,
        outputs: contract.outputs.map((output, index) =>
          index === 0 ? { ...output, gpio: 5 } : output
        ),
      },
      sculptureBytes,
      "installation",
    )).toThrow(/contradicts/);
    const bundle = createWledDeploymentBundle(contract, sculptureBytes, "installation");
    const files = fileRecord(bundle.files, sculptureBytes);
    expect(() => validateWledDeploymentBundle(
      bundle.manifestBytes,
      { ...files, "sculpture.json": sculptureBytes + " " },
      bundle.deploymentIdentity,
    )).toThrow(/source sculpture.json.*stale/);
    expect(() => validateWledDeploymentBundle(
      bundle.manifestBytes,
      { ...files, "wled/ledmap.json": files["wled/ledmap.json"] + " " },
      bundle.deploymentIdentity,
    )).toThrow(/missing or stale/);
    expect(() => validateWledDeploymentBundle(
      bundle.manifestBytes,
      {
        ...files,
        "wled/firmware-build-receipt.json":
          files["wled/firmware-build-receipt.json"] + " ",
      },
      bundle.deploymentIdentity,
    )).toThrow(/missing or stale/);
    expect(() => validateWledDeploymentBundle(
      bundle.manifestBytes,
      {
        ...files,
        "wled/one-panel-smoke-cfg.json":
          files["wled/one-panel-smoke-cfg.json"] + " ",
      },
      bundle.deploymentIdentity,
    )).toThrow(/missing or stale/);
    expect(() => validateWledDeploymentBundle(
      bundle.manifestBytes,
      files,
      "0".repeat(64),
    )).toThrow(/manifest or identity/);

    const changedConfig = JSON.parse(files["wled/cfg.json"]!) as {
      hw: { led: { ins: Array<{ rev: boolean }> } };
    };
    changedConfig.hw.led.ins[0]!.rev = true;
    const changedConfigBytes = JSON.stringify(changedConfig, null, 2) + "\n";
    const changedManifest = JSON.parse(bundle.manifestBytes) as {
      files: Array<{ path: string; byteLength: number; sha256: string }>;
    };
    const configEntry = changedManifest.files.find(({ path }) => path === "wled/cfg.json")!;
    configEntry.byteLength = new TextEncoder().encode(changedConfigBytes).byteLength;
    configEntry.sha256 = sha256ExactBytes(changedConfigBytes);
    const changedManifestBytes = JSON.stringify(changedManifest, null, 2) + "\n";
    expect(() => validateWledDeploymentBundle(
      changedManifestBytes,
      { ...files, "wled/cfg.json": changedConfigBytes },
      sha256ExactBytes(changedManifestBytes),
    )).toThrow(/bus 0 contradicts/);
  });
});
