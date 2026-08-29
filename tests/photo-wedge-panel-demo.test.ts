import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import { optimizeAutomaticWiring } from "../src/sculpture/AutomaticWiringOptimizer.ts";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { normalizePanelCarrier } from "../src/sculpture/PanelCarrier.ts";
import { deriveEditorCapabilities } from "../web/src/EditorCapabilities.ts";
import { createSimulatorSetupConfig } from "../web/src/Esp32Setup.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import {
  createPortableProjectZip,
  openPortableProjectZip,
} from "../web/src/PortableProject.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

const SOURCE = "sculptures/photo-wedge-panel/sculpture.json";
const SCULPTURE_SOURCE =
  "sculptures/photo-wedge-panel/sculpture-30-panel.json";
const PROFILE_SOURCE = "sculptures/photo-wedge-panel/panel-profile.json";

describe("photo-derived wedge panel visual-study fixture", () => {
  it("loads and maps one provisional 8x8 wedge panel on GPIO 16", async () => {
    const project = await loadPanelAssemblyProjectFromFile(SOURCE);
    const mapping = createPanelAssemblyMapping(project);
    const wiring = createProvisionalWiringPreview(
      mapping,
      project.sculpture,
      project.panelProfile,
    );
    const contract = createHardwareMappingContract(mapping, wiring, project.panelProfile);

    expect(project.sculpture.panels.map((panel) => panel.id)).toEqual(["WEDGE-01"]);
    expect(normalizePanelCarrier(project.panelProfile)).toEqual({
      kind: "planar-outline",
      outline: [[-110, 110], [-92, -110], [92, -110], [110, 110]],
    });
    expect(project.panelProfile.mounting.physicalCorrections.status).toBe("provisional");
    expect(project.panelProfile.dataConnectors).toMatchObject({
      orientationReference: "pose-local-explicit-connectors",
      cornerAssignmentStatus: "provisional",
      localPositions: {
        coordinateFrame: "pose-local",
        din: [-78, -88, -2.4],
        dout: [78, 88, -2.4],
      },
    });
    expect(mapping.panelPixelGrid).toEqual({ columns: 8, rows: 8 });
    expect(mapping.entries).toHaveLength(64);
    const physicalZero = contract.mapping.entries.find(
      (entry) => entry.physicalIndex === 0,
    );
    const physicalLast = contract.mapping.entries.find(
      (entry) => entry.physicalIndex === 63,
    );
    const pose = project.sculpture.panels[0].pose;
    const connectorWorld = (local: [number, number, number]) => ({
      x: pose.position[0] + pose.orientation.xAxis[0] * local[0] +
        pose.orientation.yAxis[0] * local[1] + pose.orientation.normal[0] * local[2],
      y: pose.position[1] + pose.orientation.xAxis[1] * local[0] +
        pose.orientation.yAxis[1] * local[1] + pose.orientation.normal[1] * local[2],
    });
    const dinWorld = connectorWorld(
      project.panelProfile.dataConnectors.localPositions!.din,
    );
    const doutWorld = connectorWorld(
      project.panelProfile.dataConnectors.localPositions!.dout,
    );
    expect(physicalZero).toMatchObject({ panelPixelX: 0, panelPixelY: 7 });
    expect(physicalLast).toMatchObject({ panelPixelX: 7, panelPixelY: 0 });
    expect(Math.sign(physicalZero!.x)).toBe(Math.sign(dinWorld.x));
    expect(Math.sign(physicalZero!.y)).toBe(Math.sign(dinWorld.y));
    expect(Math.sign(physicalLast!.x)).toBe(Math.sign(doutWorld.x));
    expect(Math.sign(physicalLast!.y)).toBe(Math.sign(doutWorld.y));
    expect(contract.outputs).toEqual([{
      outputIndex: 0,
      gpio: 16,
      startIndex: 0,
      pixelCount: 64,
      panelIds: ["WEDGE-01"],
    }]);
    expect(contract.readiness.mappingReady).toBe(true);

    const config = createSimulatorSetupConfig(
      JSON.parse(readFileSync("firmware/one-panel-smoke-cfg.json", "utf8")),
      [{ startIndex: 0, pixelCount: 64, gpio: 16 }],
      contract.wledColorOrder.wledValue,
      64,
    ) as { hw: { led: { total: number; maxpwr: number; ins: unknown[] } } };
    expect(config.hw.led).toMatchObject({
      total: 64,
      maxpwr: 1_000,
      ins: [{ start: 0, len: 64, pin: [16], order: 0, maxpwr: 1_000 }],
    });

    expect(deriveEditorCapabilities(
      project.sculpture,
      true,
      true,
      project.panelProfile,
    )).toMatchObject({
      canSelectPanels: true,
      canExportMappingAndWiring: true,
      canCreateOnActiveSurface: false,
      canAutomaticallySeed: false,
      canGenerateGenericMechanics: false,
      canGenerateStructuralMechanics: false,
    });
  });

  it("is registered and survives portable ZIP export and reload", async () => {
    const manifest = JSON.parse(readFileSync("sculptures/manifest.json", "utf8"));
    expect(manifest.sculptures).toContainEqual({
      id: "photo-derived-wedge-panel-demo",
      name: "Photo-derived Wedge Panel Demo",
      source: "./sculptures/photo-wedge-panel/sculpture.json",
      artifactStatus: "authoring-only",
    });

    const project = await loadPanelAssemblyProjectFromFile(SOURCE);
    const profileBytes = new TextEncoder().encode(readFileSync(PROFILE_SOURCE, "utf8"));
    const zip = createPortableProjectZip(
      project.sculpture,
      new Map([[project.sculpture.panelProfile.source, profileBytes]]),
    );
    const reopened = await openPortableProjectZip(
      zip,
      "photo-wedge-panel.zip",
      async () => {
        throw new Error("The bundled wedge profile was not used.");
      },
    );
    try {
      expect(reopened.project.panelProfile.id)
        .toBe("photo-derived-ws2812b-8x8-wedge-panel");
      expect(reopened.project.panelProfile.mounting.physicalCorrections.status)
        .toBe("provisional");
      expect(createPanelAssemblyMapping(reopened.project).entries).toHaveLength(64);
      expect(reopened.assets.get(project.sculpture.panelProfile.source)?.bytes)
        .toEqual(profileBytes);
    } finally {
      reopened.dispose();
    }
  });

  it("loads, routes, configures, and exports the 30-panel photo reconstruction", async () => {
    const manifest = JSON.parse(readFileSync("sculptures/manifest.json", "utf8"));
    expect(manifest.sculptures).toContainEqual({
      id: "photo-derived-30-panel-wedge-sculpture",
      name: "Photo-derived 30-panel Wedge Sculpture",
      source: "./sculptures/photo-wedge-panel/sculpture-30-panel.json",
      artifactStatus: "authoring-only",
    });

    const project = await loadPanelAssemblyProjectFromFile(SCULPTURE_SOURCE);
    const mapping = createPanelAssemblyMapping(project);
    const wiring = createProvisionalWiringPreview(
      mapping,
      project.sculpture,
      project.panelProfile,
    );
    const contract = createHardwareMappingContract(mapping, wiring, project.panelProfile);
    expect(project.sculpture.panels).toHaveLength(30);
    expect(project.sculpture.panels.every((panel) =>
      Math.abs(Math.hypot(...panel.pose.position) - 270) < 1e-6
    )).toBe(true);
    expect(project.sculpture.panels.every((panel) =>
      panel.pose.position.every((coordinate, axis) =>
        Math.abs(coordinate / 270 - panel.pose.orientation.normal[axis]) < 1e-9
      )
    )).toBe(true);
    expect(new Set(project.sculpture.panels.map((panel) =>
      panel.pose.orientation.normal.join(",")
    )).size).toBe(30);
    expect(mapping.entries).toHaveLength(1_920);
    expect(contract.readiness.mappingReady).toBe(true);
    expect(contract.outputs.map(({ gpio, pixelCount, panelIds }) => ({
      gpio,
      pixelCount,
      panels: panelIds.length,
    }))).toEqual([
      { gpio: 16, pixelCount: 640, panels: 10 },
      { gpio: 17, pixelCount: 640, panels: 10 },
      { gpio: 18, pixelCount: 640, panels: 10 },
    ]);
    const optimizedAgain = optimizeAutomaticWiring(
      project.sculpture,
      project.panelProfile,
    );
    expect(optimizedAgain.definition.wiring.outputs)
      .toEqual(project.sculpture.wiring.outputs);
    expect(optimizedAgain.definition.panels.map(({ id, pose }) => ({ id, pose })))
      .toEqual(project.sculpture.panels.map(({ id, pose }) => ({ id, pose })));
    expect(Object.values(optimizedAgain.poseQuarterTurnsByPanel))
      .toEqual(Array(30).fill(0));
    expect(optimizedAgain.estimatedCableLengthMm).toBeCloseTo(2_440.622313, 6);

    const config = createSimulatorSetupConfig(
      JSON.parse(readFileSync("firmware/one-panel-smoke-cfg.json", "utf8")),
      contract.outputs.map(({ startIndex, pixelCount, gpio }) => ({
        startIndex,
        pixelCount,
        gpio: gpio!,
      })),
      contract.wledColorOrder.wledValue,
      64,
    ) as { hw: { led: { total: number; maxpwr: number; ins: unknown[] } } };
    expect(config.hw.led).toMatchObject({
      total: 1_920,
      maxpwr: 30_000,
      ins: [
        { start: 0, len: 640, pin: [16], maxpwr: 10_000 },
        { start: 640, len: 640, pin: [17], maxpwr: 10_000 },
        { start: 1_280, len: 640, pin: [18], maxpwr: 10_000 },
      ],
    });

    const profileBytes = new TextEncoder().encode(readFileSync(PROFILE_SOURCE, "utf8"));
    const reopened = await openPortableProjectZip(
      createPortableProjectZip(
        project.sculpture,
        new Map([[project.sculpture.panelProfile.source, profileBytes]]),
      ),
      "photo-wedge-30-panel.zip",
      async () => {
        throw new Error("The bundled wedge profile was not used.");
      },
    );
    try {
      expect(reopened.project.sculpture.panels).toHaveLength(30);
      expect(createPanelAssemblyMapping(reopened.project).entries).toHaveLength(1_920);
      expect(reopened.assets.get("panel-profile.json")?.bytes).toEqual(profileBytes);
    } finally {
      reopened.dispose();
    }
  });
});
