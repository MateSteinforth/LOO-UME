import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
  type PanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import {
  detectPanelBoundaryTopology,
  generateClosedPanelBoundary,
  PANEL_BOUNDARY_TOLERANCES,
  PanelBoundaryGenerationError,
} from "../src/sculpture/PanelOutlineBoundary.ts";

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
      .toThrow(/Gap gap-bottom.*capCoplanarityMm.*0\.05 mm/);
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

  it("rejects a cap edge below the named non-degeneracy tolerance", async () => {
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
      throw new Error("Expected degenerate cap generation to fail.");
    } catch (error) {
      expect((error as PanelBoundaryGenerationError).code).toBe("degenerate");
      expect((error as Error).message).toMatch(/minimumEdgeLengthMm/);
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
