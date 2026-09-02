import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { optimizeAutomaticWiring } from "../src/sculpture/AutomaticWiringOptimizer.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { normalizePanelCarrier } from "../src/sculpture/PanelCarrier.ts";
import { deriveEditorCapabilities } from "../web/src/EditorCapabilities.ts";
import { createSimulatorSetupConfig } from "../web/src/Esp32Setup.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import {
  createLocalPanelCarrierGeometry,
  panelCarrierApertures,
} from "../web/src/PanelCarrierGeometry.ts";
import {
  createPortableProjectZip,
  openPortableProjectZip,
} from "../web/src/PortableProject.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

const SOURCE = "sculptures/kicad-diamond-panel/sculpture.json";
const PROFILE_SOURCE = "sculptures/kicad-diamond-panel/panel-profile.json";

function triangleContainsPoint(
  triangle: Array<[number, number, number]>,
  point: [number, number],
): boolean {
  const [[ax, ay], [bx, by], [cx, cy]] = triangle;
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const first = ((bx - ax) * (point[1] - ay) - (by - ay) * (point[0] - ax)) / area;
  const second = ((cx - bx) * (point[1] - by) - (cy - by) * (point[0] - bx)) / area;
  const third = ((ax - cx) * (point[1] - cy) - (ay - cy) * (point[0] - cx)) / area;
  return first >= -1e-9 && second >= -1e-9 && third >= -1e-9;
}

describe("image-derived KiCad diamond-panel demo", () => {
  it("loads a stable 64-emitter panel with nine visible apertures", async () => {
    const project = await loadPanelAssemblyProjectFromFile(SOURCE);
    const carrier = normalizePanelCarrier(project.panelProfile);
    const mapping = createPanelAssemblyMapping(project);
    const wiring = createProvisionalWiringPreview(
      mapping,
      project.sculpture,
      project.panelProfile,
    );
    const contract = createHardwareMappingContract(
      mapping,
      wiring,
      project.panelProfile,
    );

    expect(carrier).toMatchObject({
      kind: "planar-outline",
      outline: [[0, 55], [-85, 4.5], [-85, -4.5], [0, -55], [85, -4.5], [85, 4.5]],
    });
    const apertures = panelCarrierApertures(project.panelProfile);
    expect(apertures).toHaveLength(9);
    const geometry = createLocalPanelCarrierGeometry(project.panelProfile);
    const triangles = Array.from(
      { length: geometry.triangles.length / 3 },
      (_, index) => geometry.triangles.slice(index * 3, index * 3 + 3),
    );
    for (const aperture of apertures) {
      expect(triangles.some((triangle) =>
        triangleContainsPoint(triangle, aperture.center)
      )).toBe(false);
    }
    expect(project.panelProfile.pixelGrid.localEmitterPositions).toHaveLength(64);
    expect(new Set(project.panelProfile.pixelGrid.localEmitterPositions!.map(
      (position) => position.join(","),
    )).size).toBe(64);
    expect(mapping.entries).toHaveLength(64);
    expect(contract.outputs).toEqual([{
      outputIndex: 0,
      gpio: 16,
      startIndex: 0,
      pixelCount: 64,
      panelIds: ["DAVE-01"],
    }]);
    expect(contract.readiness.mappingReady).toBe(true);
    expect(project.panelProfile.mounting.physicalCorrections.status)
      .toBe("provisional");
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

    const optimizedAgain = optimizeAutomaticWiring(
      project.sculpture,
      project.panelProfile,
    );
    expect(optimizedAgain.definition.wiring.outputs)
      .toEqual(project.sculpture.wiring.outputs);
    expect(optimizedAgain.definition.panels).toEqual(project.sculpture.panels);
    expect(optimizedAgain.poseQuarterTurnsByPanel).toEqual({ "DAVE-01": 0 });

    const reference = readFileSync(
      "sculptures/kicad-diamond-panel/reference/davePCB.jpg",
    );
    expect([...reference.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);

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
  });

  it("is registered and keeps its exact profile in a portable project", async () => {
    const manifest = JSON.parse(readFileSync("sculptures/manifest.json", "utf8"));
    expect(manifest.sculptures).toContainEqual({
      id: "image-derived-kicad-diamond-panel-demo",
      name: "Image-derived KiCad Diamond Panel",
      source: "./sculptures/kicad-diamond-panel/sculpture.json",
      artifactStatus: "authoring-only",
    });

    const project = await loadPanelAssemblyProjectFromFile(SOURCE);
    const profileBytes = new TextEncoder().encode(readFileSync(PROFILE_SOURCE, "utf8"));
    const reopened = await openPortableProjectZip(
      createPortableProjectZip(
        project.sculpture,
        new Map([[project.sculpture.panelProfile.source, profileBytes]]),
      ),
      "kicad-diamond-panel.loo.zip",
      async () => {
        throw new Error("The bundled image-derived panel profile was not used.");
      },
    );
    try {
      expect(reopened.project.panelProfile.id)
        .toBe("image-derived-wled-8x8-diamond-panel");
      expect(panelCarrierApertures(reopened.project.panelProfile)).toHaveLength(9);
      expect(createPanelAssemblyMapping(reopened.project).entries).toHaveLength(64);
      expect(reopened.assets.get(project.sculpture.panelProfile.source)?.bytes)
        .toEqual(profileBytes);
    } finally {
      reopened.dispose();
    }
  });
});
