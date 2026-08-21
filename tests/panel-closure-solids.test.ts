import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { compilePanelBoundaryBundle } from "../src/cad/CompilePanelBoundaryBundle.ts";
import {
  buildPanelClosureSolids,
  meshContainsPoint,
} from "../src/cad/GeneratePanelClosureSolids.ts";
import { createPrintableBoundaryProject } from "../src/cad/GeneratePanelBoundaryParts.ts";
import {
  createPanelAssemblyProject,
} from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import { generateClosedPanelBoundary } from "../src/sculpture/PanelOutlineBoundary.ts";

const FIXTURE = "sculptures/panel-outline-prism/sculpture.json";

describe("Manifold panel closure solids", () => {
  it("builds a watertight prism closure without the SCAD emitter", async () => {
    const project = await loadPanelAssemblyProjectFromFile(FIXTURE);
    const boundary = generateClosedPanelBoundary(
      project.sculpture,
      project.panelProfile,
    );
    const printable = createPrintableBoundaryProject(project, boundary);
    const parts = await buildPanelClosureSolids(printable);
    expect(parts.length).toBeGreaterThanOrEqual(1);

    const part = parts[0]!;
    expect(part.status).toBe("NoError");
    expect(part.numTri).toBeGreaterThan(12);
    expect(part.volume).toBeGreaterThan(100);
    expect(part.vertProperties.every((value) => Number.isFinite(value))).toBe(true);
    expect(part.panelMountOffset).toBeCloseTo(1.3, 6);
    expect(part.pilotDiameter).toBeCloseTo(1.6, 6);
    expect(part.holeEdgeCorrection).toBeCloseTo(0.2, 6);
    expect(part.surfaceFlushCorrection).toBeCloseTo(0.5, 6);
    expect(part.connectorHoleIds.length).toBeGreaterThan(0);
    expect(
      part.connectorHoleIds.some((id) => part.blockedHoleIds.includes(id)),
    ).toBe(false);

    for (const hole of part.holeCenters) {
      expect(await meshContainsPoint(part, hole)).toBe(false);
    }
    for (const envelope of part.panelEnvelopeCenters) {
      expect(await meshContainsPoint(part, envelope)).toBe(false);
    }

    const emitter = await readFile("src/cad/GeneratePanelClosureCad.ts", "utf8");
    expect(emitter).toContain("pilot_d=${scadNumber(profile.mounting.printedPilotDiameter)}");
    expect(emitter).toContain("linear_extrude");
  });

  it("caps holes from panel poses when a leftover JSON shell and no GLB bytes are present", async () => {
    const prism = await loadPanelAssemblyProjectFromFile(FIXTURE);
    const shellProject = await loadPanelAssemblyProjectFromFile(
      "sculptures/cuboctahedron-empty-66/sculpture.json",
    );
    const mixed = structuredClone(prism.sculpture);
    delete mixed.boundaryTopology;
    delete mixed.generatedMechanics;
    mixed.designSurface = {
      kind: "triangle-mesh",
      format: "glb",
      source: "design/source.glb",
      sha256: "a".repeat(64),
      scaleToMillimeters: 1,
      status: "watertight",
    };
    mixed.mechanicalShell = {
      ...shellProject.sculpture.mechanicalShell!,
      derivationStatus: "requires-regeneration",
    };
    mixed.closures = shellProject.sculpture.closures;
    mixed.panels = mixed.panels.map((panel) => ({
      ...panel,
      surfaceAttachment: {
        surface: "design-surface" as const,
        triangleIndex: 0,
        barycentric: [1 / 3, 1 / 3, 1 / 3] as [number, number, number],
        normalOffset: 0.4,
      },
    }));
    const bundle = await compilePanelBoundaryBundle(
      createPanelAssemblyProject(mixed, "mixed-shell.json", prism.panelProfile),
    );
    expect(bundle.definition.mechanicalShell).toBeUndefined();
    expect(bundle.definition.boundaryTopology?.gaps).toHaveLength(2);
    expect(
      bundle.files.some((file) => file.source.startsWith("mechanics/parts/")),
    ).toBe(true);
  });
});
