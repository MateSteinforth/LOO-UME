import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emitPanelClosureCadArtifacts } from "../src/cad/GeneratePanelClosureCad.ts";
import {
  createMechanicalShellTriangleMesh,
  createMechanicalSurfaceOrientation,
} from "../src/sculpture/DesignSurface.ts";
import {
  compilePanelAssembly,
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
  type PanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import { regenerateMechanicalShell } from "../src/sculpture/MechanicalShellRegenerator.ts";
import {
  addPanelOnDesignSurface,
  deletePanel,
} from "../src/sculpture/SculptureEditor.ts";
import { validateMapping } from "../web/src/LedMapping.ts";

type Vector3Tuple = [number, number, number];

function subtract(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(value: Vector3Tuple): Vector3Tuple {
  const length = Math.hypot(...value);
  return value.map((coordinate) => coordinate / length) as Vector3Tuple;
}

function dot(a: Vector3Tuple, b: Vector3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function addSquarePanel(
  definition: PanelAssemblyDefinition,
  face: NonNullable<
    PanelAssemblyDefinition["mechanicalShell"]["authoringBoundary"]
  >["faces"][number],
  triangleIndex: number,
): PanelAssemblyDefinition {
  const boundary = definition.mechanicalShell.authoringBoundary!;
  const vertices = face.vertexIndices.map(
    (index) => boundary.vertices[index]!,
  );
  const center = [0, 1, 2].map(
    (axis) =>
      vertices.reduce((sum, vertex) => sum + vertex[axis]!, 0) /
      vertices.length,
  ) as Vector3Tuple;
  let faceNormal = normalize(
    cross(
      subtract(vertices[1]!, vertices[0]!),
      subtract(vertices[2]!, vertices[1]!),
    ),
  );
  if (dot(faceNormal, center) < 0) {
    faceNormal = faceNormal.map(
      (coordinate) => -coordinate,
    ) as Vector3Tuple;
  }
  const { xAxis, yAxis, normal } = createMechanicalSurfaceOrientation(
    faceNormal,
    [vertices[0]!, vertices[1]!, vertices[2]!],
  );
  const normalOffset = 0.4;
  return addPanelOnDesignSurface(definition, {
    position: center.map(
      (coordinate, axis) => coordinate + normal[axis]! * normalOffset,
    ) as Vector3Tuple,
    orientation: { xAxis, yAxis, normal },
    attachment: {
      surface: "mechanical-shell",
      triangleIndex,
      barycentric: [1 / 3, 1 / 3, 1 / 3],
      normalOffset,
    },
  });
}

describe("empty 66 mm cuboctahedron authoring project", () => {
  it("loads as a watertight zero-panel editor canvas", async () => {
    const input: unknown = JSON.parse(
      await readFile(
        "sculptures/cuboctahedron-empty-66/sculpture.json",
        "utf8",
      ),
    );
    const definition = parsePanelAssemblyDefinition(input);
    const project = createPanelAssemblyProject(definition, "empty-authoring.json");
    const mapping = createPanelAssemblyMapping(project);
    const mesh = createMechanicalShellTriangleMesh(definition);

    expect(definition.panels).toEqual([]);
    expect(definition.wiring.chainLengths).toEqual([0]);
    expect(mapping.entries).toEqual([]);
    expect(validateMapping(mapping, 0)).toEqual({ valid: true, errors: [] });
    expect(mesh.validation.watertight).toBe(true);

    const boundary = definition.mechanicalShell.authoringBoundary!;
    const squareFaces = boundary.faces.filter(
      (face) => face.panelPlacement === "whole-face",
    );
    expect(squareFaces).toHaveLength(6);
    for (const face of squareFaces) {
      const vertices = face.vertexIndices.map(
        (index) => boundary.vertices[index]!,
      );
      for (let index = 0; index < vertices.length; index += 1) {
        expect(
          Math.hypot(
            ...subtract(
              vertices[index]!,
              vertices[(index + 1) % vertices.length]!,
            ),
          ),
        ).toBeCloseTo(66, 8);
      }
    }

    const withOnePanel = addSquarePanel(definition, squareFaces[0]!, 0);
    const emptyAgain = deletePanel(withOnePanel, "P-01");
    expect(emptyAgain.panels).toEqual([]);
    expect(emptyAgain.wiring.chainLengths).toEqual([0]);
    expect(
      createPanelAssemblyProject(emptyAgain, "empty-again.json").sculpture.panels,
    ).toEqual([]);
  });

  it("places six panels and regenerates eight printable triangular closures", async () => {
    const input: unknown = JSON.parse(
      await readFile(
        "sculptures/cuboctahedron-empty-66/sculpture.json",
        "utf8",
      ),
    );
    let definition = parsePanelAssemblyDefinition(input);
    const squareFaces = definition.mechanicalShell.authoringBoundary!.faces.filter(
      (face) => face.panelPlacement === "whole-face",
    );
    for (const [index, face] of squareFaces.entries()) {
      definition = addSquarePanel(definition, face, index * 2);
    }

    expect(definition.panels).toHaveLength(6);
    expect(definition.wiring.chainLengths).toEqual([6]);

    const regenerated = regenerateMechanicalShell(
      createPanelAssemblyProject(definition, "placed-authoring.json"),
    );
    const project = createPanelAssemblyProject(
      regenerated,
      "placed-authoring.json",
    );
    const assembly = compilePanelAssembly(project);
    const mapping = createPanelAssemblyMapping(project, assembly);

    expect(regenerated.closures.faceIds).toEqual([
      "TR-01",
      "TR-02",
      "TR-03",
      "TR-04",
      "TR-05",
      "TR-06",
      "TR-07",
      "TR-08",
    ]);
    expect(assembly.counts).toMatchObject({
      panels: 6,
      closures: 8,
      closureConnectors: 24,
    });
    expect(mapping.entries).toHaveLength(384);
    expect(validateMapping(mapping, 384)).toEqual({ valid: true, errors: [] });

    const outputDirectory = await mkdtemp(join(tmpdir(), "empty-cubo-cad-"));
    const cad = await emitPanelClosureCadArtifacts(project, { outputDirectory });
    expect(cad.manifest.parts).toHaveLength(8);
  });

  it("blocks mechanically incomplete placement with the unsupported part named", async () => {
    const input: unknown = JSON.parse(
      await readFile(
        "sculptures/cuboctahedron-empty-66/sculpture.json",
        "utf8",
      ),
    );
    const definition = parsePanelAssemblyDefinition(input);
    const firstSquare = definition.mechanicalShell.authoringBoundary!.faces.find(
      (face) => face.panelPlacement === "whole-face",
    )!;
    const withOnePanel = addSquarePanel(definition, firstSquare, 0);
    const regenerated = regenerateMechanicalShell(
      createPanelAssemblyProject(withOnePanel, "partial-authoring.json"),
    );
    expect(() =>
      compilePanelAssembly(
        createPanelAssemblyProject(regenerated, "partial-authoring.json"),
      )
    ).toThrow(/Printable part SQ-\d+ needs at least 3 panel-hole connectors/);
  });
});
