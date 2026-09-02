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
const SCULPTURE_SOURCE =
  "sculptures/kicad-diamond-panel/sculpture-rhombic-triacontahedron.json";
const PROFILE_SOURCE = "sculptures/kicad-diamond-panel/panel-profile.json";
const PHI = (1 + Math.sqrt(5)) / 2;
const SHORT_HALF_MM = 100 / Math.sqrt(PHI * PHI + 1);
const LONG_HALF_MM = PHI * SHORT_HALF_MM;

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

function localToWorld(
  panel: Awaited<ReturnType<typeof loadPanelAssemblyProjectFromFile>>["sculpture"]["panels"][number],
  [x, y, z = 0]: [number, number, number?],
): [number, number, number] {
  const { position, orientation } = panel.pose;
  return position.map((value, axis) =>
    value + orientation.xAxis[axis] * x + orientation.yAxis[axis] * y +
      orientation.normal[axis] * z
  ) as [number, number, number];
}

function pointKey(point: [number, number, number]): string {
  return point.map((value) => Math.round(value * 1e5)).join(",");
}

function edgeKey(
  first: [number, number, number],
  second: [number, number, number],
): string {
  return [pointKey(first), pointKey(second)].sort().join("|");
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
      outline: [
        [0, 52.573111212],
        [-81.662477602, 2.102924448],
        [-81.662477602, -2.102924448],
        [0, -52.573111212],
        [81.662477602, -2.102924448],
        [81.662477602, 2.102924448],
      ],
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

  it("aligns 30 clipped PCBs on every shared triacontahedron edge", async () => {
    const project = await loadPanelAssemblyProjectFromFile(SCULPTURE_SOURCE);
    const carrier = normalizePanelCarrier(project.panelProfile);
    if (carrier.kind !== "planar-outline") {
      throw new Error("The diamond fixture must use a planar outline.");
    }
    expect(project.sculpture.panels).toHaveLength(30);
    expect(project.sculpture.wiring.panelRotationConstraint)
      .toBe("half-turns-only");

    const sharedEdges = new Map<string, number>();
    const longVertices = new Map<string, number>();
    const shortVertices = new Map<string, number>();
    const inradius = Math.hypot(...project.sculpture.panels[0].pose.position);
    for (const panel of project.sculpture.panels) {
      const { xAxis, yAxis, normal } = panel.pose.orientation;
      const cross = [
        xAxis[1] * yAxis[2] - xAxis[2] * yAxis[1],
        xAxis[2] * yAxis[0] - xAxis[0] * yAxis[2],
        xAxis[0] * yAxis[1] - xAxis[1] * yAxis[0],
      ];
      expect(cross).toEqual(normal.map((value) => expect.closeTo(value, 7)));
      expect(Math.hypot(...panel.pose.position)).toBeCloseTo(137.638192047, 6);

      for (const point of carrier.outline) {
        const world = localToWorld(panel, [point[0], point[1], 0]);
        for (const other of project.sculpture.panels) {
          expect(other.pose.orientation.normal.reduce(
            (sum, coordinate, axis) => sum + coordinate * world[axis],
            0,
          )).toBeLessThanOrEqual(inradius + 1e-6);
        }
      }

      for (let index = 0; index < carrier.outline.length; index += 1) {
        const first = carrier.outline[index];
        const second = carrier.outline[(index + 1) % carrier.outline.length];
        if (Math.abs(first[0] - second[0]) < 1e-8) continue;
        const key = edgeKey(
          localToWorld(panel, [first[0], first[1], 0]),
          localToWorld(panel, [second[0], second[1], 0]),
        );
        sharedEdges.set(key, (sharedEdges.get(key) ?? 0) + 1);
      }
      for (const x of [-LONG_HALF_MM, LONG_HALF_MM]) {
        const key = pointKey(localToWorld(panel, [x, 0, 0]));
        longVertices.set(key, (longVertices.get(key) ?? 0) + 1);
      }
      for (const y of [-SHORT_HALF_MM, SHORT_HALF_MM]) {
        const key = pointKey(localToWorld(panel, [0, y, 0]));
        shortVertices.set(key, (shortVertices.get(key) ?? 0) + 1);
      }
    }
    expect(sharedEdges.size).toBe(60);
    expect([...sharedEdges.values()]).toEqual(Array(60).fill(2));
    expect(longVertices.size).toBe(12);
    expect([...longVertices.values()]).toEqual(Array(12).fill(5));
    expect(shortVertices.size).toBe(20);
    expect([...shortVertices.values()]).toEqual(Array(20).fill(3));
    expect(Math.hypot(
      LONG_HALF_MM - Math.abs(carrier.outline[1][0]),
      carrier.outline[1][1],
    )).toBeCloseTo(4, 8);

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
    expect(mapping.entries).toHaveLength(1_920);
    expect(new Set(mapping.entries.map(({ x, y, z }) =>
      [x, y, z].map((value) => value.toFixed(6)).join(",")
    )).size).toBe(1_920);
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
    const optimizedAgain = optimizeAutomaticWiring(
      project.sculpture,
      project.panelProfile,
    );
    expect(optimizedAgain.definition.panels).toEqual(project.sculpture.panels);
    expect(optimizedAgain.definition.wiring.outputs)
      .toEqual(project.sculpture.wiring.outputs);
    expect(Object.values(optimizedAgain.poseQuarterTurnsByPanel))
      .toEqual(Array(30).fill(0));
    expect(optimizedAgain.estimatedCableLengthMm).toBeCloseTo(1_134.884692, 6);

    const profileBytes = new TextEncoder().encode(readFileSync(PROFILE_SOURCE, "utf8"));
    const reopened = await openPortableProjectZip(
      createPortableProjectZip(
        project.sculpture,
        new Map([[project.sculpture.panelProfile.source, profileBytes]]),
      ),
      "kicad-rhombic-triacontahedron.loo.zip",
      async () => {
        throw new Error("The bundled diamond profile was not used.");
      },
    );
    try {
      expect(reopened.project.sculpture.panels).toHaveLength(30);
      expect(createPanelAssemblyMapping(reopened.project).entries).toHaveLength(1_920);
      expect(reopened.assets.get(project.sculpture.panelProfile.source)?.bytes)
        .toEqual(profileBytes);
    } finally {
      reopened.dispose();
    }
  });

  it("is registered and keeps its exact profile in a portable project", async () => {
    const manifest = JSON.parse(readFileSync("sculptures/manifest.json", "utf8"));
    expect(manifest.sculptures).toContainEqual({
      id: "image-derived-kicad-diamond-panel-demo",
      name: "Image-derived KiCad Diamond Panel",
      source: "./sculptures/kicad-diamond-panel/sculpture.json",
      artifactStatus: "authoring-only",
    });
    expect(manifest.sculptures).toContainEqual({
      id: "image-derived-kicad-rhombic-triacontahedron",
      name: "KiCad Diamond Rhombic Triacontahedron",
      source: "./sculptures/kicad-diamond-panel/sculpture-rhombic-triacontahedron.json",
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
