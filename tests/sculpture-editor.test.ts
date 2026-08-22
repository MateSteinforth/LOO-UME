import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createMechanicalShellTriangleMesh,
} from "../src/sculpture/DesignSurface.ts";
import { describe, expect, it } from "vitest";
import {
  assertMechanicalShellReady,
  compilePanelAssembly,
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import {
  addPanelOnDesignSurface,
  addPanelToClosureFace,
  deletePanel,
  movePanelOnDesignSurface,
  projectPanelOrientationOntoSurface,
  rotatePanelAroundLocalZ,
} from "../src/sculpture/SculptureEditor.ts";
import { regenerateMechanicalShell } from "../src/sculpture/MechanicalShellRegenerator.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

type Vector3Tuple = [number, number, number];

function cross(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: Vector3Tuple, b: Vector3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function expectVectorClose(
  actual: Vector3Tuple,
  expected: Vector3Tuple,
  precision = 10,
): void {
  for (let axis = 0; axis < 3; axis += 1) {
    expect(actual[axis]).toBeCloseTo(expected[axis]!, precision);
  }
}

describe("browser sculpture editor", () => {
  it("rotates only the selected panel's right-handed in-plane basis", async () => {
    const source: unknown = JSON.parse(
      await readFile("sculptures/cuboctahedron/sculpture.json", "utf8"),
    );
    const original = parsePanelAssemblyDefinition(source);
    const originalPanel = structuredClone(original.panels[0]!);
    const originalWiring = structuredClone(original.wiring);
    const rotated = rotatePanelAroundLocalZ(original, originalPanel.id, 90);
    const rotatedPanel = rotated.panels[0]!;

    expectVectorClose(
      rotatedPanel.pose.orientation.xAxis,
      originalPanel.pose.orientation.yAxis,
    );
    expectVectorClose(
      rotatedPanel.pose.orientation.yAxis,
      originalPanel.pose.orientation.xAxis.map((value) => -value) as Vector3Tuple,
    );
    expect(rotatedPanel.pose.position).toEqual(originalPanel.pose.position);
    expect(rotatedPanel.pose.orientation.normal).toEqual(
      originalPanel.pose.orientation.normal,
    );
    expect(rotatedPanel.surfaceAttachment).toEqual(originalPanel.surfaceAttachment);
    expect(rotatedPanel.id).toBe(originalPanel.id);
    expect(rotatedPanel.mountFaceId).toBe(originalPanel.mountFaceId);
    expect(rotated.panelProfile).toEqual(original.panelProfile);
    expect(rotated.wiring).toEqual({
      ...originalWiring,
      status: "draft",
    });
    expect(rotated.panels).toHaveLength(original.panels.length);
    expect(rotated.mechanicalShell!.derivationStatus).toBe(
      "requires-regeneration",
    );
    expect(rotated.calibration).toMatchObject({
      panelTransforms: "generated-provisional",
      installedPanelOrientation: "provisional",
      physicalChains: "provisional",
    });

    const { xAxis, yAxis, normal } = rotatedPanel.pose.orientation;
    expect(Math.hypot(...xAxis)).toBeCloseTo(1, 12);
    expect(Math.hypot(...yAxis)).toBeCloseTo(1, 12);
    expect(dot(xAxis, yAxis)).toBeCloseTo(0, 12);
    expect(dot(xAxis, normal)).toBeCloseTo(0, 12);
    expect(dot(yAxis, normal)).toBeCloseTo(0, 12);
    expectVectorClose(cross(xAxis, yAxis), normal, 12);

    const roundTrip: unknown = JSON.parse(JSON.stringify(rotated));
    expect(() => parsePanelAssemblyDefinition(roundTrip)).not.toThrow();
    const restored = rotatePanelAroundLocalZ(rotated, originalPanel.id, -90);
    expectVectorClose(
      restored.panels[0]!.pose.orientation.xAxis,
      originalPanel.pose.orientation.xAxis,
    );
    expectVectorClose(
      restored.panels[0]!.pose.orientation.yAxis,
      originalPanel.pose.orientation.yAxis,
    );
  });

  it("returns to the original serialized orientation after four quarter turns", async () => {
    const source: unknown = JSON.parse(
      await readFile("sculptures/cuboctahedron/sculpture.json", "utf8"),
    );
    const original = parsePanelAssemblyDefinition(source);
    const panelId = original.panels[0]!.id;
    let rotated = original;
    for (let turn = 0; turn < 4; turn += 1) {
      rotated = rotatePanelAroundLocalZ(rotated, panelId, 90);
    }
    expectVectorClose(
      rotated.panels[0]!.pose.orientation.xAxis,
      original.panels[0]!.pose.orientation.xAxis,
      12,
    );
    expectVectorClose(
      rotated.panels[0]!.pose.orientation.yAxis,
      original.panels[0]!.pose.orientation.yAxis,
      12,
    );
  });

  it("preserves an existing local-Z rotation while dragging on the same normal", async () => {
    const source: unknown = JSON.parse(
      await readFile("sculptures/cuboctahedron/sculpture.json", "utf8"),
    );
    const original = parsePanelAssemblyDefinition(source);
    const panelId = original.panels[0]!.id;
    const rotated = rotatePanelAroundLocalZ(original, panelId, 37);
    const orientation = rotated.panels[0]!.pose.orientation;
    const projected = projectPanelOrientationOntoSurface(
      orientation.xAxis,
      orientation.normal,
    );
    expectVectorClose(projected.xAxis, orientation.xAxis, 12);
    expectVectorClose(projected.yAxis, orientation.yAxis, 12);
  });

  it("names an unknown panel when rotation cannot be applied", async () => {
    const source: unknown = JSON.parse(
      await readFile("sculptures/cuboctahedron/sculpture.json", "utf8"),
    );
    const original = parsePanelAssemblyDefinition(source);
    expect(() => rotatePanelAroundLocalZ(original, "P-missing", 90)).toThrow(
      /Unknown panel P-missing/,
    );
  });

  it("insets a panel and leaves a pipeline-compilable closure ring", async () => {
    const source: unknown = JSON.parse(
      await readFile(
        "sculptures/truncated-octahedron/sculpture.json",
        "utf8",
      ),
    );
    const original = parsePanelAssemblyDefinition(source);
    const originalProject = createPanelAssemblyProject(
      original,
      "editor-test.json",
    );
    const draftWiring = createProvisionalWiringPreview(
      createPanelAssemblyMapping(originalProject),
      original,
      originalProject.panelProfile,
    );
    original.wiring.outputs[0]!.panelIds = [
      ...draftWiring.outputs[0]!.panelIds,
    ];
    original.wiring.status = "authored";
    const originalRoute = structuredClone(original.wiring.outputs);
    const faceId = original.closures!.faceIds[0]!;
    const edited = addPanelToClosureFace(
      original,
      faceId,
      originalProject.panelProfile.dimensions,
    );

    expect(original.panels).toHaveLength(6);
    expect(original.closures!.faceIds).toContain(faceId);
    expect(edited.panels).toHaveLength(7);
    expect(edited.closures!.faceIds).not.toContain(faceId);
    expect(edited.closures!.faceIds.length).toBeGreaterThan(
      original.closures!.faceIds.length,
    );
    expect(
      edited.wiring.chainLengths.reduce((sum, value) => sum + value, 0),
    ).toBe(7);
    expect(edited.wiring.status).toBe("requires-review");
    expect(edited.wiring.outputs).toEqual(originalRoute);

    const project = createPanelAssemblyProject(edited, "editor-test.json");
    const assembly = compilePanelAssembly(project);
    expect(assembly.counts.panels).toBe(7);
    const addedPanel = assembly.panels.find((panel) => panel.id === "P-07")!;
    const assignedHoles = addedPanel.mountingHoles.filter(
      (hole) => hole.assignedClosureId !== null,
    );
    expect(assignedHoles).toHaveLength(4);
    expect(
      new Set(assignedHoles.map((hole) => hole.assignedClosureId)).size,
    ).toBe(3);
    expect(assembly.counts.closureConnectors).toBeGreaterThan(0);
  });

  it("persists a GLB surface attachment and invalidates stale CAD", async () => {
    const source: unknown = JSON.parse(
      await readFile("sculptures/cuboctahedron/sculpture.json", "utf8"),
    );
    const original = parsePanelAssemblyDefinition(source);
    const withSurface = structuredClone(original);
    withSurface.designSurface = {
      kind: "triangle-mesh",
      format: "glb",
      source: "blob.glb",
      sha256: "a".repeat(64),
      scaleToMillimeters: 1000,
      status: "watertight",
    };
    const edited = movePanelOnDesignSurface(withSurface, "P-01", {
      position: [10, 20, 30],
      orientation: {
        xAxis: [1, 0, 0],
        yAxis: [0, 1, 0],
        normal: [0, 0, 1],
      },
      attachment: {
        triangleIndex: 12,
        barycentric: [0.2, 0.3, 0.5],
        normalOffset: 0.4,
      },
    });

    expect(edited.panels[0]!.pose.position).toEqual([10, 20, 30]);
    expect(edited.panels[0]!.surfaceAttachment).toEqual({
      triangleIndex: 12,
      barycentric: [0.2, 0.3, 0.5],
      normalOffset: 0.4,
    });
    expect(edited.mechanicalShell!.derivationStatus).toBe(
      "requires-regeneration",
    );
    const project = createPanelAssemblyProject(edited, "editor-test.json");
    expect(() => assertMechanicalShellReady(project)).toThrow(
      /out of date/,
    );
  });

  it("adds a JSON-shell panel without a GLB and persists its surface", async () => {
    const source: unknown = JSON.parse(
      await readFile("sculptures/cuboctahedron/sculpture.json", "utf8"),
    );
    const original = parsePanelAssemblyDefinition(source);
    const shellSurface = createMechanicalShellTriangleMesh(original);
    expect(shellSurface.validation.watertight).toBe(true);
    expect(shellSurface.validation.triangleCount).toBeGreaterThan(0);
    const edited = addPanelOnDesignSurface(original, {
      position: [10, 20, 30],
      orientation: {
        xAxis: [1, 0, 0],
        yAxis: [0, 1, 0],
        normal: [0, 0, 1],
      },
      attachment: {
        surface: "mechanical-shell",
        triangleIndex: 7,
        barycentric: [0.2, 0.3, 0.5],
        normalOffset: 0.4,
      },
    });

    const added = edited.panels.at(-1)!;
    expect(added.id).toBe("P-07");
    expect(added.mountFaceId).toBeUndefined();
    expect(added.surfaceAttachment?.surface).toBe("mechanical-shell");
    expect(
      edited.wiring.chainLengths.reduce((sum, value) => sum + value, 0),
    ).toBe(7);
    const project = createPanelAssemblyProject(
      JSON.parse(JSON.stringify(edited)),
      "editor-test.json",
    );
    const mapping = createPanelAssemblyMapping(project);
    const wiring = createProvisionalWiringPreview(
      mapping,
      project.sculpture,
      project.panelProfile,
    );
    expect(mapping.panels).toHaveLength(7);
    expect(mapping.entries).toHaveLength(7 * 64);
    expect(mapping.mechanicalMounts).toBeUndefined();
    expect(mapping.printableClosures).toBeUndefined();
    expect(wiring.nodes.some((node) => node.panelId === "P-07")).toBe(true);
    expect(() => assertMechanicalShellReady(project)).toThrow(/out of date/);

    const deleted = deletePanel(edited, "P-07");
    const restored = createPanelAssemblyProject(
      JSON.parse(JSON.stringify(deleted)),
      "editor-test.json",
    );
    expect(restored.sculpture.panels).toHaveLength(6);
    expect(restored.sculpture.wiring.chainLengths.reduce((sum, value) => sum + value, 0)).toBe(6);
    expect(createPanelAssemblyMapping(restored).panels).toHaveLength(6);
  });

  it("regenerates a flat printable ring from JSON after GLB-canvas placement", async () => {
    const source: unknown = JSON.parse(
      await readFile("sculptures/truncated-octahedron/sculpture.json", "utf8"),
    );
    const original = parsePanelAssemblyDefinition(source);
    original.designSurface = {
      kind: "triangle-mesh",
      format: "glb",
      source: "visual-canvas.glb",
      sha256: "b".repeat(64),
      scaleToMillimeters: 1000,
      status: "watertight",
    };
    const originalProject = createPanelAssemblyProject(original, "editor-test.json");
    const target = compilePanelAssembly(originalProject).faces.find(
      (face) => face.role === "closure",
    )!;
    const edited = addPanelOnDesignSurface(original, {
      position: [
        target.center.x + target.normal.x * 0.4,
        target.center.y + target.normal.y * 0.4,
        target.center.z + target.normal.z * 0.4,
      ],
      orientation: {
        xAxis: [target.xAxis.x, target.xAxis.y, target.xAxis.z],
        yAxis: [target.yAxis.x, target.yAxis.y, target.yAxis.z],
        normal: [target.normal.x, target.normal.y, target.normal.z],
      },
      attachment: {
        surface: "design-surface",
        triangleIndex: 999,
        barycentric: [0.2, 0.3, 0.5],
        normalOffset: 0.4,
      },
    });

    const regenerated = regenerateMechanicalShell(
      createPanelAssemblyProject(edited, "editor-test.json"),
    );
    const project = createPanelAssemblyProject(regenerated, "editor-test.json");
    const assembly = compilePanelAssembly(project);
    const panel = assembly.panels.find((candidate) => candidate.id === "P-07")!;
    const partIds = new Set(
      regenerated.mechanicalShell!.faces
        .filter((face) => face.partId?.includes("P-07"))
        .map((face) => face.partId),
    );

    expect(regenerated.mechanicalShell!.derivationStatus).toBe("authored");
    expect(panel.faceId).toContain("HX-01-PANEL-P-07");
    expect(partIds.size).toBe(1);
    expect(
      panel.mountingHoles
        .filter((hole) => hole.mechanicalUse === "eligible")
        .every((hole) => hole.assignedClosureId !== null),
    ).toBe(true);
    expect(regenerated.designSurface?.source).toBe("visual-canvas.glb");
    expect(regenerated.mechanicalShell!.vertices).not.toEqual([]);
  });

  it("rejects a panel whose cleared envelope crosses the JSON boundary", async () => {
    const source: unknown = JSON.parse(
      await readFile("sculptures/truncated-octahedron/sculpture.json", "utf8"),
    );
    const original = parsePanelAssemblyDefinition(source);
    const edited = addPanelOnDesignSurface(original, {
      position: [1000, 0, 0],
      orientation: {
        xAxis: [0, 1, 0],
        yAxis: [0, 0, 1],
        normal: [1, 0, 0],
      },
      attachment: {
        surface: "mechanical-shell",
        triangleIndex: 0,
        barycentric: [1, 0, 0],
        normalOffset: 0.4,
      },
    });
    expect(() => regenerateMechanicalShell(
      createPanelAssemblyProject(edited, "editor-test.json"),
    )).toThrow(/Panel P-07.*fully inside one planar JSON boundary face/);
  });

  it("rejects surface attachments without a design-surface GLB", async () => {
    const source: unknown = JSON.parse(
      await readFile("sculptures/cuboctahedron/sculpture.json", "utf8"),
    );
    const invalid = parsePanelAssemblyDefinition(source);
    invalid.panels[0]!.surfaceAttachment = {
      triangleIndex: 0,
      barycentric: [1, 0, 0],
      normalOffset: 0.4,
    };
    expect(() => parsePanelAssemblyDefinition(invalid)).toThrow(/Panels require/);
  });
});
