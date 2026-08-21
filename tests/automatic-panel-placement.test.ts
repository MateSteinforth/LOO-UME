import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createMechanicalShellTriangleMesh,
} from "../src/sculpture/DesignSurface.ts";
import {
  loadGlbDesignSurface,
  placementMeshFromSurface,
} from "../web/src/DesignSurfaceLoader.ts";
import {
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import {
  automaticallySeedPanelsOnSurface,
} from "../src/sculpture/SculptureEditor.ts";

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

describe("automatic panel placement", () => {
  it("deterministically seeds an empty JSON shell and refreshes mapping", async () => {
    const source: unknown = JSON.parse(
      await readFile(
        "sculptures/cuboctahedron-empty-66/sculpture.json",
        "utf8",
      ),
    );
    const original = parsePanelAssemblyDefinition(source);
    const mesh = createMechanicalShellTriangleMesh(original);
    const place = () => automaticallySeedPanelsOnSurface(
      original,
      { positions: mesh.positions, indices: mesh.indices },
      { width: 66, height: 65 },
      {
        targetPanelCount: 6,
        surface: "mechanical-shell",
        normalOffset: 0.4,
      },
    );
    const first = place();
    const repeated = place();

    expect(original.panels).toEqual([]);
    expect(first.placedPanelIds).toEqual([
      "P-01",
      "P-02",
      "P-03",
      "P-04",
      "P-05",
      "P-06",
    ]);
    expect(first.definition.panels).toEqual(repeated.definition.panels);
    expect(first.triangleIndices).toEqual(repeated.triangleIndices);
    expect(first.definition.wiring.chainLengths).toEqual([6]);
    expect(first.definition.mechanicalShell!.derivationStatus).toBe(
      "requires-regeneration",
    );
    for (const panel of first.definition.panels) {
      expect(panel.surfaceAttachment?.surface).toBe("mechanical-shell");
      const { xAxis, yAxis, normal } = panel.pose.orientation;
      expect(Math.hypot(...xAxis)).toBeCloseTo(1, 12);
      expect(Math.hypot(...yAxis)).toBeCloseTo(1, 12);
      expect(Math.hypot(...normal)).toBeCloseTo(1, 12);
      expectVectorClose(cross(xAxis, yAxis), normal, 12);
    }
    const project = createPanelAssemblyProject(
      first.definition,
      "automatic-shell.json",
    );
    expect(createPanelAssemblyMapping(project).entries).toHaveLength(384);

    const noOp = automaticallySeedPanelsOnSurface(
      first.definition,
      { positions: mesh.positions, indices: mesh.indices },
      { width: 66, height: 65 },
      {
        targetPanelCount: 6,
        surface: "mechanical-shell",
        normalOffset: 0.4,
      },
    );
    expect(noOp.placedPanelIds).toEqual([]);
    expect(noOp.definition).toEqual(first.definition);
  });

  it("preserves existing panels while filling to a requested total", async () => {
    const source: unknown = JSON.parse(
      await readFile(
        "sculptures/cuboctahedron-empty-66/sculpture.json",
        "utf8",
      ),
    );
    const original = parsePanelAssemblyDefinition(source);
    const mesh = createMechanicalShellTriangleMesh(original);
    const first = automaticallySeedPanelsOnSurface(
      original,
      { positions: mesh.positions, indices: mesh.indices },
      { width: 66, height: 65 },
      { targetPanelCount: 2, surface: "mechanical-shell" },
    );
    const preserved = structuredClone(first.definition.panels);
    const filled = automaticallySeedPanelsOnSurface(
      first.definition,
      { positions: mesh.positions, indices: mesh.indices },
      { width: 66, height: 65 },
      { targetPanelCount: 5, surface: "mechanical-shell" },
    );
    expect(filled.definition.panels.slice(0, 2)).toEqual(preserved);
    expect(filled.placedPanelIds).toEqual(["P-03", "P-04", "P-05"]);
    expect(filled.definition.wiring.chainLengths).toEqual([5]);
  });

  it("places six panels on the 66 mm cuboctahedron squares", async () => {
    const source = parsePanelAssemblyDefinition(
      JSON.parse(
        await readFile("sculptures/pose-only-empty/sculpture.json", "utf8"),
      ),
    );
    const glb = await readFile(
      "sculptures/pose-only-empty/design/placement-surface.glb",
    );
    const surface = await loadGlbDesignSurface(
      glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength),
      1,
    );
    const result = automaticallySeedPanelsOnSurface(
      source,
      placementMeshFromSurface(surface, false),
      { width: 66, height: 65 },
      {
        targetPanelCount: 6,
        surface: "design-surface",
        normalOffset: 0.4,
      },
    );
    expect(result.placedPanelIds).toHaveLength(6);
    const axes = new Set(
      result.definition.panels.map((panel) =>
        panel.pose.orientation.normal.map((value) => Math.round(value)).join(","),
      ),
    );
    expect(axes).toEqual(new Set([
      "1,0,0",
      "-1,0,0",
      "0,1,0",
      "0,-1,0",
      "0,0,1",
      "0,0,-1",
    ]));
  });

  it("sits each panel on a planar mesh face instead of tilting off the surface", async () => {
    const size = 50;
    const positions = [
      -size, -size, -size, size, -size, -size, size, size, -size, -size, size, -size,
      -size, -size, size, size, -size, size, size, size, size, -size, size, size,
    ];
    const indices = [
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4,
      3, 7, 6, 3, 6, 2,
      0, 4, 7, 0, 7, 3,
      1, 2, 6, 1, 6, 5,
    ];
    const loaded: unknown = JSON.parse(
      await readFile("sculptures/pose-only-two-panel/sculpture.json", "utf8"),
    );
    const source = parsePanelAssemblyDefinition(loaded);
    source.panels = [];
    source.wiring.chainLengths = [0];
    source.designSurface = {
      kind: "triangle-mesh",
      format: "glb",
      source: "design/cube.glb",
      sha256: "a".repeat(64),
      scaleToMillimeters: 1,
      status: "watertight",
    };
    const result = automaticallySeedPanelsOnSurface(
      source,
      { positions, indices },
      { width: 66, height: 65 },
      {
        targetPanelCount: 6,
        surface: "design-surface",
        normalOffset: 0.4,
      },
    );
    expect(result.placedPanelIds).toHaveLength(6);
    const axes = result.definition.panels.map((panel) => {
      const { position, orientation } = panel.pose;
      const axis = orientation.normal.map((value) => Math.round(value)) as Vector3Tuple;
      const offsetAxis = axis.findIndex((value) => value !== 0);
      expect(Math.abs(axis[0]!) + Math.abs(axis[1]!) + Math.abs(axis[2]!)).toBe(1);
      expect(position[offsetAxis]!).toBeCloseTo(axis[offsetAxis]! * (size + 0.4), 8);
      expect(Math.abs(dot(position, orientation.normal) - (size + 0.4))).toBeLessThan(1e-8);
      expectVectorClose(
        cross(orientation.xAxis, orientation.yAxis),
        orientation.normal,
        10,
      );
      return axis.join(",");
    });
    expect(new Set(axes).size).toBe(6);
  });

  it("rejects automatic placement for manual mechanics", async () => {
    const source: unknown = JSON.parse(
      await readFile(
        "sculptures/rhombicosidodecahedron/sculpture.json",
        "utf8",
      ),
    );
    const manual = parsePanelAssemblyDefinition(source);
    expect(() => automaticallySeedPanelsOnSurface(
      manual,
      {
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: [0, 1, 2],
      },
      { width: 66, height: 65 },
      {
        targetPanelCount: manual.panels.length + 1,
        surface: "mechanical-shell",
      },
    )).toThrow(/manualMechanics/);
  });
});
