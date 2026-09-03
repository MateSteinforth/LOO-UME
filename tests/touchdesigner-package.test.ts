import { describe, expect, it } from "vitest";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import { sculptureJson } from "../src/sculpture/SculptureEditor.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import {
  createTouchDesignerConfig,
  createTouchDesignerPackageFiles,
  touchDesignerDdpScript,
} from "../web/src/TouchDesignerPackage.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

async function fixture(source: string) {
  const project = await loadPanelAssemblyProjectFromFile(source);
  const mapping = createPanelAssemblyMapping(project);
  const wiring = createProvisionalWiringPreview(
    mapping,
    project.sculpture,
    project.panelProfile,
  );
  return {
    project,
    contract: createHardwareMappingContract(
      mapping,
      wiring,
      project.panelProfile,
    ),
  };
}

describe("TouchDesigner package", () => {
  it("binds one 2:1 TOP to the current logical mapping and WLED identity", async () => {
    const { project, contract } = await fixture(
      "sculptures/rhombicosidodecahedron/sculpture.json",
    );
    const config = createTouchDesignerConfig(
      contract,
      sculptureJson(project.sculpture),
      { simulatorAddress: "192.168.1.44" },
    );

    expect(config).toMatchObject({
      inputProjection: "equirectangular-2:1",
      addressOrder: "logical-effect-order",
      sculptureMirror: {
        status: "ready",
        wledLedmapApplications: 1,
      },
      target: {
        address: "192.168.1.44",
        port: 4048,
        status: "configured-private-host",
      },
      mappingFingerprint: "524500f5",
      pixelCount: 2_624,
      frameRate: 30,
      channelsPerPacket: 1_440,
      replacedFramePolicy: "keep-latest-complete-frame",
      outputColorChannels: "RGB",
    });
    expect(config.deploymentIdentity).toMatch(/^[0-9a-f]{64}$/);
    expect(config.pixels.map((pixel) => pixel.logicalIndex)).toEqual(
      Array.from({ length: 2_624 }, (_, index) => index),
    );
    expect(config.pixels[0]).toEqual({
      logicalIndex: 0,
      u: contract.mapping.entries.find((entry) => entry.logicalIndex === 0)!.u,
      v: contract.mapping.entries.find((entry) => entry.logicalIndex === 0)!.v,
    });
  });

  it("creates deterministic files without an external plugin", async () => {
    const { project, contract } = await fixture(
      "sculptures/rhombicosidodecahedron/sculpture.json",
    );
    const first = createTouchDesignerPackageFiles(
      contract,
      sculptureJson(project.sculpture),
    );
    const second = createTouchDesignerPackageFiles(
      contract,
      sculptureJson(project.sculpture),
    );
    expect(first).toEqual(second);
    expect([...first.keys()]).toEqual([
      "config.json",
      "loo_ume_ddp.py",
      "README.txt",
    ]);
    const readme = new TextDecoder().decode(first.get("README.txt"));
    expect(readme).toContain("No external plugin is required");
    expect(readme).toContain("Replaced frames");
    expect(readme).toContain("forwards the visible simulator frame");
    const script = touchDesignerDdpScript();
    expect(script).toContain("numpyArray(delayed=True)");
    expect(script).toContain('(1.0 - pixel["v"]) * (height - 1)');
    expect(script).toContain("0x41 if final else 0x40");
    expect(script).toContain('state["replacedFrames"] += 1');
    expect(script).toContain('me.store("looUmeDdpStatus", status)');
  });

  it("keeps simulator output available before physical mapping is ready", async () => {
    const { project, contract } = await fixture(
      "sculptures/kicad-diamond-panel/sculpture-rhombic-triacontahedron.json",
    );
    expect(createTouchDesignerConfig(
      contract,
      sculptureJson(project.sculpture),
    )).toMatchObject({
      deploymentIdentity: null,
      sculptureMirror: {
        status: "simulator-only",
        wledLedmapApplications: 1,
      },
      pixelCount: 1_920,
    });
  });

  it("blocks public simulator addresses", async () => {
    const flagship = await fixture(
      "sculptures/rhombicosidodecahedron/sculpture.json",
    );
    expect(() => createTouchDesignerConfig(
      flagship.contract,
      sculptureJson(flagship.project.sculpture),
      { simulatorAddress: "8.8.8.8" },
    )).toThrow(/private IPv4/);
  });
});
