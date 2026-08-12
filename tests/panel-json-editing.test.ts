import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createManualCadProject } from "../src/cad/GenerateCad.ts";
import {
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import {
  addPanelOnDesignSurface,
  deletePanel,
  movePanelInLocalPlane,
  rotatePanelAroundLocalZ,
} from "../src/sculpture/SculptureEditor.ts";
import { deriveEditorCapabilities } from "../web/src/EditorCapabilities.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import {
  beginPanelPlaneDrag, updatePanelPlaneDrag,
} from "../web/src/SurfacePlacementController.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

async function loadManual() {
  return parsePanelAssemblyDefinition(JSON.parse(await readFile(
    "sculptures/rhombicosidodecahedron/sculpture.json", "utf8",
  )));
}

function roundTrip<T>(value: T): T {
  return parsePanelAssemblyDefinition(
    JSON.parse(JSON.stringify(value)),
  ) as T;
}

function mappingFor(definition: Awaited<ReturnType<typeof loadManual>>) {
  const project = createPanelAssemblyProject(
    definition, "sculptures/rhombicosidodecahedron/sculpture.json",
  );
  return { project, mapping: createPanelAssemblyMapping(project) };
}

describe("mechanics-independent panel JSON editing", () => {
  it("rotates a manual panel without changing population, metadata, or other panels", async () => {
    const source = await loadManual();
    const before = structuredClone(source.panels[0]!);
    const unaffected = JSON.stringify(source.panels[1]);
    const beforeMapping = mappingFor(source).mapping;
    const edited = rotatePanelAroundLocalZ(source, before.id, 23);
    const after = edited.panels[0]!;

    expect(source.manualMechanics?.compatibilityStatus).toBeUndefined();
    expect(edited.manualMechanics?.compatibilityStatus).toBe("requires-review");
    expect(edited.panels.map((panel) => panel.id)).toEqual(
      source.panels.map((panel) => panel.id),
    );
    expect(after.pose.position).toEqual(before.pose.position);
    expect(after.pose.orientation.normal).toEqual(before.pose.orientation.normal);
    expect(after.faceType).toBe(before.faceType);
    expect(after.neighborPanelIds).toEqual(before.neighborPanelIds);
    expect(JSON.stringify(edited.panels[1])).toBe(unaffected);

    const { xAxis, yAxis, normal } = after.pose.orientation;
    const cross = new THREE.Vector3(...xAxis).cross(new THREE.Vector3(...yAxis));
    expect(xAxis.every(Number.isFinite)).toBe(true);
    expect(yAxis.every(Number.isFinite)).toBe(true);
    expect(new THREE.Vector3(...xAxis).length()).toBeCloseTo(1, 12);
    expect(new THREE.Vector3(...yAxis).length()).toBeCloseTo(1, 12);
    expect(new THREE.Vector3(...xAxis).dot(new THREE.Vector3(...yAxis))).toBeCloseTo(0, 12);
    normal.forEach((value, index) => expect(cross.getComponent(index)).toBeCloseTo(value, 12));

    const afterMapping = mappingFor(roundTrip(edited)).mapping;
    expect(afterMapping.entries).toHaveLength(2_624);
    expect(new Set(afterMapping.entries.map((entry) => entry.logicalIndex)).size).toBe(2_624);
    expect(afterMapping.entries.slice(0, 64).map(({ x, y, z }) => [x, y, z]))
      .not.toEqual(beforeMapping.entries.slice(0, 64).map(({ x, y, z }) => [x, y, z]));
  });

  it("moves in the saved panel plane without a shell or GLB", async () => {
    const source = await loadManual();
    const panel = structuredClone(source.panels[0]!);
    const edited = movePanelInLocalPlane(source, panel.id, 4.5, -2.25);
    const moved = edited.panels[0]!;
    const expected = panel.pose.position.map((value, axis) =>
      value + panel.pose.orientation.xAxis[axis]! * 4.5 -
        panel.pose.orientation.yAxis[axis]! * 2.25
    );
    expected.forEach((value, axis) =>
      expect(moved.pose.position[axis]).toBeCloseTo(value!, 12)
    );
    expect(moved.pose.orientation).toEqual(panel.pose.orientation);
    expect(moved.surfaceAttachment).toEqual(panel.surfaceAttachment);
    expect(() => roundTrip(edited)).not.toThrow();
  });

  it("deletes one panel, cleans neighbor references, and preserves output metadata", async () => {
    const source = await loadManual();
    const deletedId = source.panels[0]!.id;
    const unrelated = source.panels.find(
      (panel) => !panel.neighborPanelIds?.includes(deletedId) && panel.id !== deletedId,
    )!;
    const unrelatedBytes = JSON.stringify(unrelated);
    const outputBytes = JSON.stringify(source.wiring.outputs);
    const edited = deletePanel(source, deletedId);
    const reparsed = roundTrip(edited);

    expect(reparsed.panels).toHaveLength(40);
    expect(reparsed.panels.map((panel) => panel.id)).toEqual(
      source.panels.filter((panel) => panel.id !== deletedId).map((panel) => panel.id),
    );
    expect(reparsed.panels.every(
      (panel) => !panel.neighborPanelIds?.includes(deletedId),
    )).toBe(true);
    expect(JSON.stringify(reparsed.panels.find((panel) => panel.id === unrelated.id)))
      .toBe(unrelatedBytes);
    expect(reparsed.wiring.chainLengths.reduce((sum, value) => sum + value, 0)).toBe(40);
    expect(reparsed.wiring.chainLengths).toEqual([10, 10, 10, 10]);
    expect(JSON.stringify(reparsed.wiring.outputs)).toBe(outputBytes);
    expect(mappingFor(reparsed).mapping.entries).toHaveLength(2_560);
    expect(reparsed.manualMechanics?.compatibilityStatus).toBe("requires-review");
  });

  it("allows a manual pose-first project to reach zero panels", async () => {
    let edited = await loadManual();
    for (const panelId of edited.panels.map((panel) => panel.id)) {
      edited = deletePanel(edited, panelId);
    }
    const reparsed = roundTrip(edited);
    expect(reparsed.panels).toEqual([]);
    expect(reparsed.wiring.chainLengths).toEqual([0, 0, 0, 0]);
    expect(mappingFor(reparsed).mapping.entries).toEqual([]);
  });

  it("requires honest metadata for manual creation on a referenced GLB", async () => {
    const source = await loadManual();
    source.designSurface = {
      kind: "triangle-mesh", format: "glb", source: "canvas.glb",
      sha256: "a".repeat(64), scaleToMillimeters: 1, status: "watertight",
    };
    const placement = {
      position: [1, 2, 3] as [number, number, number],
      orientation: {
        xAxis: [1, 0, 0] as [number, number, number],
        yAxis: [0, 1, 0] as [number, number, number],
        normal: [0, 0, 1] as [number, number, number],
      },
      attachment: {
        surface: "design-surface" as const, triangleIndex: 2,
        barycentric: [0.2, 0.3, 0.5] as [number, number, number], normalOffset: 0.4,
      },
    };
    expect(() => addPanelOnDesignSurface(source, placement)).toThrow(/faceType/);
    const edited = roundTrip(addPanelOnDesignSurface(
      source, placement, { faceType: "square-face" },
    ));
    expect(edited.panels.at(-1)).toMatchObject({
      id: "P-01", faceType: "square-face", neighborPanelIds: [],
      pose: { position: [1, 2, 3] },
    });
    expect(edited.wiring.chainLengths).toEqual([11, 11, 10, 10]);
    expect(edited.manualMechanics?.compatibilityStatus).toBe("requires-review");
  });

  it("keeps the unedited golden contract and gates reviewed manual wrappers", async () => {
    const source = await loadManual();
    const { project, mapping } = mappingFor(source);
    const wiring = createProvisionalWiringPreview(mapping, source, project.panelProfile);
    expect(source.panels).toHaveLength(41);
    expect(mapping.entries).toHaveLength(2_624);
    expect(source.wiring.chainLengths).toEqual([11, 10, 10, 10]);
    expect(createHardwareMappingContract(mapping, wiring, project.panelProfile).fingerprint)
      .toBe("31291c59");
    expect(() => createManualCadProject(project)).not.toThrow();
    const editedProject = mappingFor(rotatePanelAroundLocalZ(source, "SQ-01", 1)).project;
    expect(() => createManualCadProject(editedProject)).toThrow(/require review/);
  });

  it("exposes manual editing capabilities while keeping generic mechanics disabled", async () => {
    const source = await loadManual();
    expect(deriveEditorCapabilities(source, false)).toMatchObject({
      canSelectPanels: true,
      canRotateSelectedPanel: true,
      canDeleteSelectedPanel: true,
      canTranslateOnActiveSurface: false,
      canTranslateInPanelPlane: true,
      canCreateOnActiveSurface: false,
      canAutomaticallySeed: false,
      canExportMappingAndWiring: true,
      canGenerateGenericMechanics: false,
    });
  });

  it("uses the pointer-down plane offset so a planar drag does not jump", () => {
    const center = new THREE.Vector3(4, -3, 2);
    const normal = new THREE.Vector3(0, 0, 1);
    const ray = new THREE.Ray(
      new THREE.Vector3(9, 5, 10), new THREE.Vector3(0, 0, -1),
    );
    const drag = beginPanelPlaneDrag(
      ray, center, new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0), normal,
    )!;
    const unchanged = updatePanelPlaneDrag(ray, drag)!;
    expect(unchanged.position.toArray()).toEqual(center.toArray());
    expect(unchanged).toMatchObject({ deltaX: 0, deltaY: 0 });
  });
});
