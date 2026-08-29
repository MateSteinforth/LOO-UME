import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
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

const SOURCE = "sculptures/one-metre-led-ring/sculpture.json";

describe("one-metre-diameter flexible LED-ring demo", () => {
  it("loads, maps, wires, and configures one 188-emitter GPIO 16 fixture", async () => {
    const project = await loadPanelAssemblyProjectFromFile(SOURCE);
    const mapping = createPanelAssemblyMapping(project);
    const wiring = createProvisionalWiringPreview(
      mapping,
      project.sculpture,
      project.panelProfile,
    );
    const contract = createHardwareMappingContract(mapping, wiring, project.panelProfile);

    expect(project.sculpture.panels.map((panel) => panel.id)).toEqual(["RING-01"]);
    expect(normalizePanelCarrier(project.panelProfile)).toMatchObject({
      kind: "flexible-path",
      closed: true,
      width: 12,
      thickness: 2,
    });
    expect(mapping.panelPixelGrid).toEqual({ columns: 188, rows: 1 });
    expect(mapping.entries).toHaveLength(188);
    expect(contract.mapping.entries.find((entry) => entry.physicalIndex === 0)).toMatchObject({
      panelId: "RING-01",
      panelPixelX: 0,
      panelPixelY: 0,
      x: 0,
      y: 502.2,
      z: 0,
    });
    expect(contract.mapping.entries.find((entry) => entry.physicalIndex === 187)).toMatchObject({
      panelId: "RING-01",
      panelPixelX: 187,
      panelPixelY: 0,
      x: -16.781001,
      y: 501.919553,
      z: 0,
    });
    expect(contract.outputs).toEqual([{
      outputIndex: 0,
      gpio: 16,
      startIndex: 0,
      pixelCount: 188,
      panelIds: ["RING-01"],
    }]);
    expect([...contract.ledmap.map].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 188 }, (_, index) => index),
    );
    expect(contract.readiness.mappingReady).toBe(true);

    const config = createSimulatorSetupConfig(
      JSON.parse(readFileSync("firmware/one-panel-smoke-cfg.json", "utf8")),
      [{ startIndex: 0, pixelCount: 188, gpio: 16 }],
      contract.wledColorOrder.wledValue,
      188,
    ) as { hw: { led: { total: number; maxpwr: number; ins: unknown[] } } };
    expect(config.hw.led).toMatchObject({
      total: 188,
      maxpwr: 2_938,
      ins: [{ start: 0, len: 188, pin: [16], order: 0, maxpwr: 2_938 }],
    });

    expect(deriveEditorCapabilities(
      project.sculpture,
      false,
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

  it("is registered as an authoring-only browser project", () => {
    const manifest = JSON.parse(readFileSync("sculptures/manifest.json", "utf8"));
    expect(manifest.sculptures).toContainEqual({
      id: "one-metre-flexible-led-ring-demo",
      name: "One-metre Diameter Flexible LED Ring Demo",
      source: "./sculptures/one-metre-led-ring/sculpture.json",
      artifactStatus: "authoring-only",
    });
  });

  it("exports and reloads the project ZIP with its flexible profile", async () => {
    const project = await loadPanelAssemblyProjectFromFile(SOURCE);
    const profileSource = project.sculpture.panelProfile.source;
    const profileBytes = new TextEncoder().encode(
      readFileSync("sculptures/one-metre-led-ring/panel-profile.json", "utf8"),
    );
    const zip = createPortableProjectZip(
      project.sculpture,
      new Map([[profileSource, profileBytes]]),
    );
    const reopened = await openPortableProjectZip(
      zip,
      "one-metre-ring.zip",
      async () => {
        throw new Error("The bundled ring profile was not used.");
      },
    );
    try {
      expect(reopened.project.panelProfile.pixelGrid).toMatchObject({
        columns: 188,
        rows: 1,
      });
      expect(normalizePanelCarrier(reopened.project.panelProfile)).toMatchObject({
        kind: "flexible-path",
        closed: true,
      });
      expect(reopened.project.sculpture.wiring.outputs).toMatchObject([{
        gpio: 16,
        panelIds: ["RING-01"],
      }]);
      expect(createPanelAssemblyMapping(reopened.project).entries).toHaveLength(188);
      expect(reopened.assets.get(profileSource)?.bytes).toEqual(profileBytes);
    } finally {
      reopened.dispose();
    }
  });
});
