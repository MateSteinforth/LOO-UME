import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  compilePanelAssembly,
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
  type PanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import {
  compilePanelBoundaryBundle,
  createPrintableBoundaryProject,
} from "../src/cad/CompilePanelBoundaryBundle.ts";
import {
  detectPanelBoundaryTopology,
  generateClosedPanelBoundary,
  PANEL_BOUNDARY_TOLERANCES,
  PanelBoundaryGenerationError,
} from "../src/sculpture/PanelOutlineBoundary.ts";
import { automaticallySeedPanelsOnSurface } from "../src/sculpture/SculptureEditor.ts";
import {
  loadGlbDesignSurface,
  placementMeshFromSurface,
} from "../web/src/DesignSurfaceLoader.ts";

const VALID_FIXTURE = "sculptures/panel-outline-prism/sculpture.json";

interface InvalidFixture {
  base: string;
  mutation:
    | { kind: "translate-panel"; panelId: string; offset: [number, number, number] }
    | { kind: "remove-gap"; gapId: string }
    | { kind: "duplicate-gap"; gapId: string; newGapId: string }
    | { kind: "duplicate-panel"; panelId: string; newPanelId: string };
  expectedErrorCode: string;
}

async function loadDefinition(path = VALID_FIXTURE): Promise<PanelAssemblyDefinition> {
  return parsePanelAssemblyDefinition(JSON.parse(await readFile(path, "utf8")));
}

async function loadInvalidFixture(name: string): Promise<{
  definition: PanelAssemblyDefinition;
  expectedErrorCode: string;
}> {
  const fixture = JSON.parse(await readFile(
    `tests/fixtures/panel-boundary/${name}.json`,
    "utf8",
  )) as InvalidFixture;
  const definition = await loadDefinition(fixture.base);
  const mutation = fixture.mutation;
  if (mutation.kind === "translate-panel") {
    const panel = definition.panels.find(({ id }) => id === mutation.panelId)!;
    panel.pose.position = panel.pose.position.map(
      (value, axis) => value + mutation.offset[axis]!,
    ) as [number, number, number];
  } else if (mutation.kind === "remove-gap") {
    definition.boundaryTopology!.gaps = definition.boundaryTopology!.gaps
      .filter(({ id }) => id !== mutation.gapId);
  } else if (mutation.kind === "duplicate-gap") {
    const gap = definition.boundaryTopology!.gaps.find(
      ({ id }) => id === mutation.gapId,
    )!;
    definition.boundaryTopology!.gaps.push({
      ...structuredClone(gap),
      id: mutation.newGapId,
    });
  } else {
    const panel = definition.panels.find(({ id }) => id === mutation.panelId)!;
    definition.panels.push({
      ...structuredClone(panel),
      id: mutation.newPanelId,
    });
  }
  return { definition, expectedErrorCode: fixture.expectedErrorCode };
}

function planarPanel(
  id: string,
  position: [number, number, number],
  xAxis: [number, number, number] = [1, 0, 0],
  normal: [number, number, number] = [0, 0, 1],
): PanelAssemblyDefinition["panels"][number] {
  return {
    id,
    pose: {
      position,
      orientation: { xAxis, yAxis: [0, 1, 0], normal },
    },
  };
}

function displaceFourthFaceVertexAlongNormal(
  project: ReturnType<typeof createPrintableBoundaryProject>,
  faceId: string,
  distanceMm: number,
): void {
  const shell = project.sculpture.mechanicalShell!;
  const faceIndex = shell.faces.findIndex((face) => face.id === faceId);
  const [face] = shell.faces.splice(faceIndex, 1);
  shell.faces.unshift(face!);
  const [first, second, third] = face!.vertexIndices.map(
    (vertexIndex) => shell.vertices[vertexIndex]!,
  );
  const firstEdge = second!.map((value, axis) => value - first![axis]!) as
    [number, number, number];
  const secondEdge = third!.map((value, axis) => value - second![axis]!) as
    [number, number, number];
  const normal: [number, number, number] = [
    firstEdge[1] * secondEdge[2] - firstEdge[2] * secondEdge[1],
    firstEdge[2] * secondEdge[0] - firstEdge[0] * secondEdge[2],
    firstEdge[0] * secondEdge[1] - firstEdge[1] * secondEdge[0],
  ];
  const length = Math.hypot(...normal);
  const fourthIndex = face!.vertexIndices[3]!;
  shell.vertices[fourthIndex] = shell.vertices[fourthIndex]!.map(
    (value, axis) => value + normal[axis]! * distanceMm / length,
  ) as [number, number, number];
}

describe("automatic panel-boundary topology detection", () => {
  it("detects stable, oppositely wound cap cycles for the prism", async () => {
    const definition = await loadDefinition();
    const project = createPanelAssemblyProject(definition, VALID_FIXTURE);
    delete definition.boundaryTopology;

    const topology = detectPanelBoundaryTopology(
      definition,
      project.panelProfile,
    );
    const keys = topology.gaps.map(({ vertices }) =>
      vertices.map(({ panelId, corner }) => `${panelId}.${corner}`).join("|")
    ).sort();

    expect(topology.kind).toBe("panel-outline-gap-cycles");
    expect(topology.gaps).toHaveLength(2);
    expect(topology.gaps.map(({ id }) => id)).toEqual(
      [...topology.gaps.map(({ id }) => id)].sort(),
    );
    expect(topology.gaps.every(({ id }) => /^gap-[0-9a-f]{12}$/.test(id)))
      .toBe(true);
    expect(keys).toEqual([
      "P-BACK.bottom-left|P-FRONT.bottom-right|P-FRONT.bottom-left|P-BACK.bottom-right",
      "P-BACK.top-left|P-BACK.top-right|P-FRONT.top-left|P-FRONT.top-right",
    ]);

    const boundary = generateClosedPanelBoundary(
      definition,
      project.panelProfile,
      topology,
    );
    expect(boundary.metadata.counts).toMatchObject({
      vertices: 8,
      edges: 12,
      panelOutlines: 4,
      caps: 2,
      connectedComponents: 1,
    });
  });

  it("is independent of panel array order, including stable gap IDs", async () => {
    const definition = await loadDefinition();
    const project = createPanelAssemblyProject(definition, VALID_FIXTURE);
    delete definition.boundaryTopology;
    const expected = detectPanelBoundaryTopology(
      definition,
      project.panelProfile,
    );
    definition.panels.reverse();

    expect(detectPanelBoundaryTopology(definition, project.panelProfile))
      .toEqual(expected);
  });

  it("rejects a corner where two exposed gap cycles touch ambiguously", async () => {
    const definition = await loadDefinition();
    const project = createPanelAssemblyProject(definition, VALID_FIXTURE);
    definition.panels = [
      planarPanel("A", [0, 0, 0]),
      planarPanel("B", [66, 65, 0]),
    ];

    try {
      detectPanelBoundaryTopology(definition, project.panelProfile);
      throw new Error("Expected ambiguous topology detection to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(PanelBoundaryGenerationError);
      expect((error as PanelBoundaryGenerationError).code).toBe(
        "ambiguous-topology",
      );
      expect((error as Error).message).toMatch(
        /ambiguous.*A\.top-right, B\.bottom-left.*Separate the touching gaps/i,
      );
    }
  });

  it("rejects panel edges used by more than two outlines as non-manifold", async () => {
    const definition = await loadDefinition();
    const project = createPanelAssemblyProject(definition, VALID_FIXTURE);
    definition.panels = [
      planarPanel("A", [0, 0, 0]),
      planarPanel("B", [0, 0, 0]),
      planarPanel("C", [0, 0, 0]),
    ];

    try {
      detectPanelBoundaryTopology(definition, project.panelProfile);
      throw new Error("Expected non-manifold topology detection to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(PanelBoundaryGenerationError);
      expect((error as PanelBoundaryGenerationError).code).toBe("non-manifold");
      expect((error as Error).message).toMatch(
        /used by 3 panel outlines.*at most two are permitted/i,
      );
    }
  });

  it("rejects a shared edge whose panel windings match", async () => {
    const definition = await loadDefinition();
    const project = createPanelAssemblyProject(definition, VALID_FIXTURE);
    definition.panels = [
      planarPanel("A", [0, 0, 0]),
      planarPanel("B", [66, 0, 0], [-1, 0, 0], [0, 0, -1]),
    ];

    try {
      detectPanelBoundaryTopology(definition, project.panelProfile);
      throw new Error("Expected matching shared-edge winding to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(PanelBoundaryGenerationError);
      expect((error as PanelBoundaryGenerationError).code).toBe(
        "inconsistent-winding",
      );
      expect((error as Error).message).toMatch(
        /shared with matching direction.*opposite directions/i,
      );
    }
  });

  it("closes eight triangular caps after six panels on the 66 mm cuboctahedron", async () => {
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
    const placed = automaticallySeedPanelsOnSurface(
      source,
      placementMeshFromSurface(surface, false),
      { width: 66, height: 65 },
      {
        targetPanelCount: 6,
        surface: "design-surface",
        normalOffset: 0.4,
      },
    );
    const project = createPanelAssemblyProject(
      placed.definition,
      "pose-only-cuboctahedron.json",
    );
    delete placed.definition.boundaryTopology;

    const topology = detectPanelBoundaryTopology(
      placed.definition,
      project.panelProfile,
    );
    expect(topology.gaps).toHaveLength(8);
    expect(topology.gaps.every((gap) => gap.vertices.length === 3)).toBe(true);

    const boundary = generateClosedPanelBoundary(
      placed.definition,
      project.panelProfile,
      topology,
    );
    expect(boundary.metadata.counts).toMatchObject({
      vertices: 12,
      edges: 24,
      panelOutlines: 6,
      caps: 8,
      connectedComponents: 1,
    });
    expect(
      boundary.faces.filter((face) => face.role === "cap").every(
        (face) => face.vertexIndices.length === 3,
      ),
    ).toBe(true);

    const bundle = await compilePanelBoundaryBundle(project);
    expect(bundle.files.map((file) => file.source)).toEqual([
      "mechanics/boundary.stl",
      "mechanics/parts/part-001.stl",
      "mechanics/parts/part-002.stl",
      "mechanics/parts/part-003.stl",
      "mechanics/parts/part-004.stl",
      "mechanics/parts/part-005.stl",
      "mechanics/parts/part-006.stl",
      "mechanics/parts/part-007.stl",
      "mechanics/parts/part-008.stl",
    ]);
    const assembly = compilePanelAssembly(bundle.printableProject);
    for (const panel of assembly.panels) {
      const holesByEdge = new Map<number, string[]>();
      for (const face of assembly.faces) {
        for (const connector of face.connectors) {
          if (connector.panelId !== panel.id) continue;
          holesByEdge.set(connector.panelEdgeIndex, [
            ...(holesByEdge.get(connector.panelEdgeIndex) ?? []),
            connector.panelHoleId,
          ]);
        }
      }
      expect(Object.fromEntries([...holesByEdge.entries()].sort(
        (left, right) => left[0] - right[0],
      ))).toEqual({
        0: ["bottom-right"],
        1: ["middle-right"],
        2: ["top-left"],
        3: ["middle-left"],
      });
    }
    for (const face of assembly.faces.filter((candidate) => candidate.role === "closure")) {
      expect(new Set(face.connectors.map((connector) => connector.panelId)).size)
        .toBe(3);
      expect(
        face.connectors.every((connector) =>
          ["top-left", "middle-left", "middle-right", "bottom-right"]
            .includes(connector.panelHoleId)
        ),
      ).toBe(true);
    }
  });

  it("closes 20 triangles and 12 pentagons after 30 rhombicosidodecahedron square panels", async () => {
    const source = parsePanelAssemblyDefinition(
      JSON.parse(
        await readFile(
          "sculptures/pose-only-rhombicosidodecahedron/sculpture.json",
          "utf8",
        ),
      ),
    );
    const glb = await readFile(
      "sculptures/pose-only-rhombicosidodecahedron/design/placement-surface.glb",
    );
    const surface = await loadGlbDesignSurface(
      glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength),
      1,
    );
    const placed = automaticallySeedPanelsOnSurface(
      source,
      placementMeshFromSurface(surface, false),
      { width: 66, height: 65 },
      {
        targetPanelCount: 30,
        surface: "design-surface",
        normalOffset: 0.4,
      },
    );
    const project = createPanelAssemblyProject(
      placed.definition,
      "pose-only-rhombicosidodecahedron.json",
    );
    const topology = detectPanelBoundaryTopology(
      placed.definition,
      project.panelProfile,
    );
    const sizes = topology.gaps.map((gap) => gap.vertices.length).sort(
      (left, right) => left - right,
    );
    expect(sizes.filter((size) => size === 3)).toHaveLength(20);
    expect(sizes.filter((size) => size === 5)).toHaveLength(12);
    expect(topology.gaps).toHaveLength(32);
    project.sculpture.boundaryTopology = topology;

    const boundary = generateClosedPanelBoundary(
      project.sculpture,
      project.panelProfile,
      topology,
    );
    expect(boundary.metadata.counts).toMatchObject({
      vertices: 60,
      edges: 120,
      faces: 62,
      panelOutlines: 30,
      caps: 32,
      connectedComponents: 1,
    });
    expect(
      boundary.faces.filter(
        (face) => face.role === "cap" && face.vertexIndices.length === 5,
      ),
    ).toHaveLength(12);
    const printable = createPrintableBoundaryProject(project, boundary);
    expect(() => compilePanelAssembly(printable)).not.toThrow();

    const warpedClosure = structuredClone(printable);
    const closureFaceId = warpedClosure.sculpture.closures!.faceIds.find(
      (faceId) => warpedClosure.sculpture.mechanicalShell!.faces.find(
        (face) => face.id === faceId,
      )!.vertexIndices.length === 5,
    )!;
    displaceFourthFaceVertexAlongNormal(warpedClosure, closureFaceId, 0.4);
    expect(() => compilePanelAssembly(warpedClosure)).toThrow(
      `Face ${closureFaceId} is not planar.`,
    );

    const warpedPanel = structuredClone(printable);
    const panelFaceId = warpedPanel.sculpture.panels[0]!.mountFaceId!;
    displaceFourthFaceVertexAlongNormal(warpedPanel, panelFaceId, 0.001);
    expect(() => compilePanelAssembly(warpedPanel)).toThrow(
      `Face ${panelFaceId} is not planar.`,
    );
  });
});
describe("panel-outline closed-boundary generation", () => {
  it("builds the complete deterministic prism fixture from poses and profile dimensions", async () => {
    const definition = await loadDefinition();
    const project = createPanelAssemblyProject(definition, VALID_FIXTURE);
    const boundary = generateClosedPanelBoundary(
      definition,
      project.panelProfile,
    );

    expect(boundary).toMatchObject({
      schemaVersion: "1.0.0",
      kind: "closed-panel-outline-boundary",
      units: "mm",
      metadata: {
        generator: {
          id: "wled-orbital-lab/panel-outline-boundary",
          version: "0.1.0",
        },
        status: { generation: "complete", validation: "passed" },
        tolerances: PANEL_BOUNDARY_TOLERANCES,
        counts: {
          vertices: 8,
          edges: 12,
          faces: 6,
          panelOutlines: 4,
          caps: 2,
          triangles: 12,
          connectedComponents: 1,
        },
      },
    });
    expect(boundary.vertices).toEqual([
      [-33, -33, -32.5],
      [33, -33, -32.5],
      [33, -33, 32.5],
      [-33, -33, 32.5],
      [33, 33, -32.5],
      [-33, 33, -32.5],
      [-33, 33, 32.5],
      [33, 33, 32.5],
    ]);
    expect(boundary.faces.map(({ id }) => id)).toEqual([
      "panel:P-BACK",
      "panel:P-FRONT",
      "panel:P-LEFT",
      "panel:P-RIGHT",
      "gap:gap-bottom",
      "gap:gap-top",
    ]);
    expect(boundary.metadata.meshFingerprint.value).toMatch(/^[0-9a-f]{64}$/);
    expect(boundary.metadata.sourceFingerprint.value).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is independent of panel and gap array order and ignores GLB triangles", async () => {
    const definition = await loadDefinition();
    const project = createPanelAssemblyProject(definition, VALID_FIXTURE);
    const expected = generateClosedPanelBoundary(definition, project.panelProfile);
    const reordered = structuredClone(definition);
    reordered.panels.reverse();
    reordered.boundaryTopology!.gaps.reverse();
    reordered.designSurface = {
      kind: "triangle-mesh",
      format: "glb",
      source: "design/ignored-authoring-surface.glb",
      sha256: "a".repeat(64),
      scaleToMillimeters: 1,
      status: "watertight",
    };

    const actual = generateClosedPanelBoundary(reordered, project.panelProfile);
    expect(actual.vertices).toEqual(expected.vertices);
    expect(actual.triangles).toEqual(expected.triangles);
    expect(actual.faces).toEqual(expected.faces);
    expect(actual.metadata.meshFingerprint).toEqual(
      expected.metadata.meshFingerprint,
    );
  });

  it.each([
    "non-planar",
    "open",
    "intersecting",
    "non-manifold",
  ])("rejects the %s fixture with its focused boundary error", async (name) => {
    const { definition, expectedErrorCode } = await loadInvalidFixture(name);
    const project = createPanelAssemblyProject(
      await loadDefinition(),
      VALID_FIXTURE,
    );
    try {
      generateClosedPanelBoundary(definition, project.panelProfile);
      throw new Error("Expected boundary generation to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(PanelBoundaryGenerationError);
      expect((error as PanelBoundaryGenerationError).code).toBe(
        expectedErrorCode,
      );
      expect((error as Error).message).toMatch(/Gap|Boundary|gap/);
    }
  });

  it("identifies an offending gap and names the coplanarity tolerance", async () => {
    const { definition } = await loadInvalidFixture("non-planar");
    const project = createPanelAssemblyProject(
      await loadDefinition(),
      VALID_FIXTURE,
    );
    expect(() => generateClosedPanelBoundary(definition, project.panelProfile))
      .toThrow(/Gap gap-bottom.*capCoplanarityMm.*0\.1 mm/);
  });

  it("rejects malformed accepted topology without introducing coordinates", async () => {
    const definition = await loadDefinition();
    definition.boundaryTopology!.gaps[0]!.vertices[0]!.panelId = "UNKNOWN";
    expect(() => parsePanelAssemblyDefinition(definition)).toThrow(
      /known panel-corner references/,
    );
    expect(JSON.stringify(definition.boundaryTopology)).not.toMatch(
      /position|orientation|coordinate/,
    );
  });

  it("rejects a simple-cap assumption violation before topology compilation", async () => {
    const definition = await loadDefinition();
    const project = createPanelAssemblyProject(definition, VALID_FIXTURE);
    const back = definition.panels.find(({ id }) => id === "P-BACK")!;
    back.pose.position[0] += 10;
    const top = structuredClone(
      definition.boundaryTopology!.gaps.find(({ id }) => id === "gap-top")!,
    );
    const [first, second, third, fourth] = top.vertices;
    top.vertices = [first!, second!, fourth!, third!];

    expect(() => generateClosedPanelBoundary(
      definition,
      project.panelProfile,
      { kind: "panel-outline-gap-cycles", gaps: [top] },
    )).toThrow(PanelBoundaryGenerationError);
    try {
      generateClosedPanelBoundary(
        definition,
        project.panelProfile,
        { kind: "panel-outline-gap-cycles", gaps: [top] },
      );
    } catch (error) {
      expect((error as PanelBoundaryGenerationError).code).toBe(
        "self-intersecting",
      );
      expect((error as PanelBoundaryGenerationError).gapId).toBe("gap-top");
    }
  });

  it("rejects a cap whose near-degenerate edge collapses inside vertexWeldMm", async () => {
    const definition = await loadDefinition();
    const project = createPanelAssemblyProject(definition, VALID_FIXTURE);
    const left = definition.panels.find(({ id }) => id === "P-LEFT")!;
    left.pose.position[1] += 65.9995;
    const top = structuredClone(
      definition.boundaryTopology!.gaps.find(({ id }) => id === "gap-top")!,
    );
    try {
      generateClosedPanelBoundary(
        definition,
        project.panelProfile,
        { kind: "panel-outline-gap-cycles", gaps: [top] },
      );
      throw new Error("Expected collapsed cap generation to fail.");
    } catch (error) {
      expect((error as PanelBoundaryGenerationError).code).toBe("invalid-gap");
      expect((error as Error).message).toMatch(/repeats a welded panel corner/i);
    }
  });

  it("rejects cap winding that agrees with rather than opposes panel edges", async () => {
    const definition = await loadDefinition();
    const project = createPanelAssemblyProject(definition, VALID_FIXTURE);
    const top = definition.boundaryTopology!.gaps.find(
      ({ id }) => id === "gap-top",
    )!;
    top.vertices.reverse();
    try {
      generateClosedPanelBoundary(definition, project.panelProfile);
      throw new Error("Expected inconsistent winding generation to fail.");
    } catch (error) {
      expect((error as PanelBoundaryGenerationError).code).toBe(
        "inconsistent-winding",
      );
      expect((error as PanelBoundaryGenerationError).gapId).toBe("gap-top");
    }
  });

  it("rejects a cap that intrudes into a PCB envelope", async () => {
    const definition = await loadDefinition();
    const project = createPanelAssemblyProject(definition, VALID_FIXTURE);
    const frontCap = {
      id: "gap-inside-front-pcb",
      vertices: [
        { panelId: "P-FRONT", corner: "bottom-left" as const },
        { panelId: "P-FRONT", corner: "bottom-right" as const },
        { panelId: "P-FRONT", corner: "top-right" as const },
        { panelId: "P-FRONT", corner: "top-left" as const },
      ],
    };
    try {
      generateClosedPanelBoundary(
        definition,
        project.panelProfile,
        { kind: "panel-outline-gap-cycles", gaps: [frontCap] },
      );
      throw new Error("Expected PCB-envelope intersection generation to fail.");
    } catch (error) {
      expect((error as PanelBoundaryGenerationError).code).toBe(
        "pcb-intersection",
      );
      expect((error as PanelBoundaryGenerationError).gapId).toBe(
        "gap-inside-front-pcb",
      );
    }
  });

  it("rejects multiple otherwise valid closed boundary components", async () => {
    const definition = await loadDefinition();
    const project = createPanelAssemblyProject(definition, VALID_FIXTURE);
    const duplicatePanels = definition.panels.map((panel) => ({
      ...structuredClone(panel),
      id: `${panel.id}-SECOND`,
      pose: {
        ...structuredClone(panel.pose),
        position: [
          panel.pose.position[0] + 200,
          panel.pose.position[1],
          panel.pose.position[2],
        ] as [number, number, number],
      },
    }));
    definition.panels.push(...duplicatePanels);
    const duplicateGaps = definition.boundaryTopology!.gaps.map((gap) => ({
      id: `${gap.id}-SECOND`,
      vertices: gap.vertices.map(({ panelId, corner }) => ({
        panelId: `${panelId}-SECOND`,
        corner,
      })),
    }));
    definition.boundaryTopology!.gaps.push(...duplicateGaps);
    try {
      generateClosedPanelBoundary(definition, project.panelProfile);
      throw new Error("Expected disconnected boundary generation to fail.");
    } catch (error) {
      expect((error as PanelBoundaryGenerationError).code).toBe("disconnected");
      expect((error as Error).message).toMatch(/disconnected face components/);
    }
  });
});
