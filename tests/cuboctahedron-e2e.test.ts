import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import cuboctahedronJson from "../sculptures/cuboctahedron/sculpture.json" with {
  type: "json",
};
import {
  compilePanelAssembly,
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import { validateMapping } from "../web/src/LedMapping.ts";
import {
  createProvisionalWiringPreview,
  validateWiringPreview,
} from "../web/src/WiringPreview.ts";

const temporaryDirectories: string[] = [];

function loadFixtureProject() {
  return createPanelAssemblyProject(
    structuredClone(cuboctahedronJson),
    "sculptures/cuboctahedron/sculpture.json",
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("panel-driven cuboctahedron end-to-end compiler", () => {
  it("uses only the explicit JSON face graph and assigns every real panel hole", () => {
    const project = loadFixtureProject();
    const assembly = compilePanelAssembly(project);

    expect(assembly.counts).toEqual({
      vertices: 12,
      edges: 24,
      faces: 14,
      panels: 6,
      closures: 8,
      closureConnectors: 24,
    });
    expect(assembly.vertices[0]).toEqual({
      x: -46.24478349,
      y: -46.24478349,
      z: 0,
    });
    for (const panel of assembly.panels) {
      expect(panel.mountingHoles).toHaveLength(6);
      const eligibleHoles = panel.mountingHoles.filter(
        (hole) => hole.mechanicalUse === "eligible",
      );
      const blockedHoles = panel.mountingHoles.filter(
        (hole) => hole.mechanicalUse === "blocked",
      );
      expect(eligibleHoles).toHaveLength(4);
      expect(
        eligibleHoles.every((hole) => hole.assignedClosureId !== null),
      ).toBe(true);
      expect(
        new Set(eligibleHoles.map((hole) => hole.assignedClosureId)).size,
      ).toBe(4);
      expect(blockedHoles).toMatchObject([
        {
          id: "bottom-left",
          blockedBy: "DOUT",
          assignedClosureId: null,
        },
        {
          id: "top-right",
          blockedBy: "DIN",
          assignedClosureId: null,
        },
      ]);
      const connectors = assembly.faces.flatMap((face) =>
        face.connectors.filter((connector) => connector.panelId === panel.id),
      );
      for (const connector of connectors) {
        expect(
          Math.hypot(
            connector.pilotPosition.x - connector.holePosition.x,
            connector.pilotPosition.y - connector.holePosition.y,
            connector.pilotPosition.z - connector.holePosition.z,
          ),
        ).toBeCloseTo(0.2, 8);
      }
    }
    for (const closure of assembly.faces.filter((face) => face.role === "closure")) {
      expect(closure.connectors).toHaveLength(3);
      expect(new Set(closure.connectors.map((connector) => connector.panelId)).size).toBe(3);
    }
  });

  it("generates visualizer LEDs, adjacency wiring, and a matching WLED map", () => {
    const project = loadFixtureProject();
    const mapping = createPanelAssemblyMapping(project);
    const wiring = createProvisionalWiringPreview(
      mapping,
      project.sculpture,
      project.panelProfile,
    );
    expect(mapping.panels).toHaveLength(6);
    expect(mapping.surfaceFaces).toHaveLength(14);
    expect(mapping.mechanicalMounts).toHaveLength(24);
    expect(mapping.printableClosures).toHaveLength(8);
    expect(
      mapping.printableClosures?.every(
        (closure) =>
          closure.exteriorClipping === "polyhedron-interior" &&
          closure.connectors.length === 3 &&
          closure.cadMeshAsset.endsWith(
            "/closure-" + closure.id.toLowerCase() + ".stl",
          ) &&
          Math.hypot(
            closure.frame.inwardAxis.x,
            closure.frame.inwardAxis.y,
            closure.frame.inwardAxis.z,
          ) > 0.999,
      ),
    ).toBe(true);
    expect(mapping.entries).toHaveLength(384);
    expect(validateMapping(mapping, 384)).toEqual({ valid: true, errors: [] });
    expect(validateWiringPreview(wiring, mapping)).toEqual({
      valid: true,
      errors: [],
    });
    const contract = createHardwareMappingContract(
      mapping,
      wiring,
      project.panelProfile,
    );
    expect(contract.ledmap.map).toHaveLength(384);
    expect(new Set(contract.ledmap.map).size).toBe(384);
    expect(contract.outputs[0]).toMatchObject({
      outputIndex: 0,
      startIndex: 0,
      pixelCount: 384,
    });
    expect(
      mapping.panels.map((panel) => [
        panel.id,
        [panel.position.x, panel.position.y, panel.position.z],
        panel.mirrored,
      ]),
    ).toEqual(
      project.sculpture.panels.map((panel) => [
        panel.id,
        panel.pose.position,
        false,
      ]),
    );
    expect(mapping.panels[0]?.pixelOrder).toMatchObject({
      pixelZeroCorner: "top-right",
      traversalAxis: "rows",
      lineProgression: "top-to-bottom",
      serpentine: false,
      firstLineDirection: "right-to-left",
    });

    const firstPanelId = contract.outputs[0]!.panelIds[0]!;
    const physicalAt = (x: number, y: number): number =>
      contract.mapping.entries.find(
        (entry) =>
          entry.panelId === firstPanelId &&
          entry.panelPixelX === x &&
          entry.panelPixelY === y,
      )!.physicalIndex;
    expect(physicalAt(0, 0)).toBe(0);
    expect(physicalAt(7, 0)).toBe(7);
    expect(physicalAt(0, 1)).toBe(8);
    expect(physicalAt(7, 1)).toBe(15);
    expect(physicalAt(0, 7)).toBe(56);
    expect(physicalAt(7, 7)).toBe(63);
  });

  it("propagates GPIO assignments from each sculpture JSON", () => {
    const project = loadFixtureProject();
    project.sculpture.wiring.outputs[0]!.gpio = 18;
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
    expect(contract.outputs[0]?.gpio).toBe(18);
  });

  it("treats the authored pose as authoritative over the mount face", () => {
    const project = loadFixtureProject();
    project.sculpture.panels[0]!.pose.position[0] += 3;
    const assembly = compilePanelAssembly(project);
    expect(assembly.panels[0]!.position.x).toBe(3);
    expect(assembly.faces.find((face) => face.id === "SQ-01")!.center.x).toBe(0);
  });

  it("rejects a non-orthonormal authored pose", () => {
    const project = loadFixtureProject();
    project.sculpture.panels[0]!.pose.orientation.xAxis = [2, 0, 0];
    expect(() => parsePanelAssemblyDefinition(project.sculpture)).toThrow(
      "right-handed orthonormal orientations",
    );
  });

  it("rejects an unassigned face", () => {
    const project = loadFixtureProject();
    const invalid = structuredClone(project.sculpture);
    invalid.closures!.faceIds.pop();
    expect(() => parsePanelAssemblyDefinition(invalid)).toThrow(
      "Every face must be assigned",
    );
  });
});
