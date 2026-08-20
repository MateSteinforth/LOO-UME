import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import {
  createWledDeploymentBundle,
  sha256ExactBytes,
  validateWledDeploymentBundle,
} from "../src/wled/DeploymentContract.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

async function fixture() {
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
  return createHardwareMappingContract(geometry, wiring, project.panelProfile);
}

describe("assumed WLED deployment contract", () => {
  it("emits the exact four pinned bus vectors and a canonical identity", async () => {
    const contract = await fixture();
    const ledmapBytes = JSON.stringify(contract.ledmap) + "\n";
    const sculptureBytes = readFileSync(
      "sculptures/rhombicosidodecahedron/sculpture.json",
      "utf8",
    );
    const bundle = createWledDeploymentBundle(
      contract,
      ledmapBytes,
      sculptureBytes,
    );
    const config = JSON.parse(bundle.configBytes) as {
      hw: { led: { total: number; maxpwr: number; ins: Array<Record<string, unknown>> } };
    };
    expect(config.hw.led).toMatchObject({ total: 2624, maxpwr: 0 });
    expect(config.hw.led.ins.map((bus) => ({
      start: bus.start,
      len: bus.len,
      pin: bus.pin,
      order: bus.order,
      rev: bus.rev,
      type: bus.type,
      maxpwr: bus.maxpwr,
      ledma: bus.ledma,
      drv: bus.drv,
    }))).toEqual([
      { start: 0, len: 704, pin: [16], order: 0, rev: false, type: 22, maxpwr: 14000, ledma: 60, drv: 0 },
      { start: 704, len: 640, pin: [17], order: 0, rev: false, type: 22, maxpwr: 14000, ledma: 60, drv: 0 },
      { start: 1344, len: 640, pin: [18], order: 0, rev: false, type: 22, maxpwr: 14000, ledma: 60, drv: 0 },
      { start: 1984, len: 640, pin: [19], order: 0, rev: false, type: 22, maxpwr: 14000, ledma: 60, drv: 0 },
    ]);
    expect(bundle.deploymentIdentity).toBe(sha256ExactBytes(bundle.manifestBytes));
    expect(JSON.parse(bundle.manifestBytes)).toMatchObject({
      status: "assumed-review-only",
      mappingFingerprint: "31291c59",
      target: {
        platformioEnvironment: "esp32dev",
        wledCommit: "d9b9a846561227351ad929e3109781daadb7bed2",
      },
    });
    expect(() => validateWledDeploymentBundle(bundle.manifestBytes, {
      "wled/cfg.provisional.json": bundle.configBytes,
      "wled/ledmap.provisional.json": ledmapBytes,
    }, bundle.deploymentIdentity)).not.toThrow();
  });

  it("rejects contradictory routes, stale ledmaps, and modified deployment bytes", async () => {
    const contract = await fixture();
    const ledmapBytes = JSON.stringify(contract.ledmap) + "\n";
    const sculptureBytes = "{}\n";
    expect(() => createWledDeploymentBundle(
      { ...contract, outputs: contract.outputs.map((output, index) =>
        index === 0 ? { ...output, gpio: 5 } : output) },
      ledmapBytes,
      sculptureBytes,
    )).toThrow(/contradicts/);
    expect(() => createWledDeploymentBundle(
      { ...contract, outputs: contract.outputs.slice(0, 3) },
      ledmapBytes,
      sculptureBytes,
    )).toThrow(/exactly four outputs/);
    expect(() => createWledDeploymentBundle(
      contract,
      ledmapBytes.replace("[", "[1,"),
      sculptureBytes,
    )).toThrow(/do not match/);
    const bundle = createWledDeploymentBundle(contract, ledmapBytes, sculptureBytes);
    expect(() => validateWledDeploymentBundle(bundle.manifestBytes, {
      "wled/cfg.provisional.json": bundle.configBytes + " ",
      "wled/ledmap.provisional.json": ledmapBytes,
    }, bundle.deploymentIdentity)).toThrow(/missing or stale/);

    const contradictoryConfig = JSON.parse(bundle.configBytes) as {
      hw: { led: { ins: Array<{ rev: boolean }> } };
    };
    contradictoryConfig.hw.led.ins[0]!.rev = true;
    const contradictoryBytes = JSON.stringify(contradictoryConfig, null, 2) + "\n";
    const contradictoryManifest = JSON.parse(bundle.manifestBytes) as {
      files: Array<{ byteLength: number; sha256: string }>;
    };
    contradictoryManifest.files[0]!.byteLength = Buffer.byteLength(contradictoryBytes);
    contradictoryManifest.files[0]!.sha256 = sha256ExactBytes(contradictoryBytes);
    const contradictoryManifestBytes = JSON.stringify(contradictoryManifest, null, 2) + "\n";
    expect(() => validateWledDeploymentBundle(
      contradictoryManifestBytes,
      {
        "wled/cfg.provisional.json": contradictoryBytes,
        "wled/ledmap.provisional.json": ledmapBytes,
      },
      sha256ExactBytes(contradictoryManifestBytes),
    )).toThrow(/bus 0 contradicts/);

    contradictoryConfig.hw.led.ins[0]!.rev = false;
    (contradictoryConfig.hw.led.ins[0] as { text?: string }).text = "wrong domain";
    const wrongDomainBytes = JSON.stringify(contradictoryConfig, null, 2) + "\n";
    contradictoryManifest.files[0]!.byteLength = Buffer.byteLength(wrongDomainBytes);
    contradictoryManifest.files[0]!.sha256 = sha256ExactBytes(wrongDomainBytes);
    const wrongDomainManifestBytes = JSON.stringify(contradictoryManifest, null, 2) + "\n";
    expect(() => validateWledDeploymentBundle(
      wrongDomainManifestBytes,
      {
        "wled/cfg.provisional.json": wrongDomainBytes,
        "wled/ledmap.provisional.json": ledmapBytes,
      },
      sha256ExactBytes(wrongDomainManifestBytes),
    )).toThrow(/bus 0 contradicts/);
  });
});
