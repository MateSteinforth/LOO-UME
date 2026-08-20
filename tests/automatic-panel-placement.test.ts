import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createMechanicalShellTriangleMesh,
} from "../src/sculpture/DesignSurface.ts";
import {
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import {
  automaticallySeedPanelsOnSurface,
} from "../src/sculpture/SculptureEditor.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

type Vector3Tuple = [number, number, number];

function cross(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
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
    const authoredProject = createPanelAssemblyProject(
      first.definition, "automatic-shell.json",
    );
    const draftWiring = createProvisionalWiringPreview(
      createPanelAssemblyMapping(authoredProject),
      first.definition,
      authoredProject.panelProfile,
    );
    first.definition.wiring.outputs[0]!.panelIds = [
      ...draftWiring.outputs[0]!.panelIds,
    ];
    first.definition.wiring.status = "authored";
    const originalRoute = structuredClone(first.definition.wiring.outputs);
    const filled = automaticallySeedPanelsOnSurface(
      first.definition,
      { positions: mesh.positions, indices: mesh.indices },
      { width: 66, height: 65 },
      { targetPanelCount: 5, surface: "mechanical-shell" },
    );
    expect(filled.definition.panels.slice(0, 2)).toEqual(preserved);
    expect(filled.placedPanelIds).toEqual(["P-03", "P-04", "P-05"]);
    expect(filled.definition.wiring.chainLengths).toEqual([5]);
    expect(filled.definition.wiring.status).toBe("requires-review");
    expect(filled.definition.wiring.outputs).toEqual(originalRoute);
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
