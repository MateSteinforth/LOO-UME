import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import definitionJson from "../sculptures/rhombicosidodecahedron-auto/sculpture.json" with {
  type: "json",
};
import { emitPanelClosureCadArtifacts } from "../src/cad/GeneratePanelClosureCad.ts";
import {
  compilePanelAssembly,
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
} from "../src/sculpture/PanelAssembly.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import { validateMapping } from "../web/src/LedMapping.ts";
import {
  createProvisionalWiringPreview,
  validateWiringPreview,
} from "../web/src/WiringPreview.ts";

const temporaryDirectories: string[] = [];

function loadProject() {
  return createPanelAssemblyProject(
    structuredClone(definitionJson),
    "sculptures/rhombicosidodecahedron-auto/sculpture.json",
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("automatic rhombicosidodecahedron end-to-end compiler", () => {
  it("derives the complete 66 mm face graph from the new JSON only", () => {
    const assembly = compilePanelAssembly(loadProject());

    expect(assembly.counts).toEqual({
      vertices: 60,
      edges: 120,
      faces: 62,
      panels: 30,
      closures: 32,
      closureConnectors: 120,
    });
    expect(
      assembly.faces.filter((face) => face.vertexIndices.length === 3),
    ).toHaveLength(20);
    expect(
      assembly.faces.filter((face) => face.vertexIndices.length === 4),
    ).toHaveLength(30);
    expect(
      assembly.faces.filter((face) => face.vertexIndices.length === 5),
    ).toHaveLength(12);
    for (const edge of assembly.edges) {
      expect(
        Math.hypot(
          edge.vertices[1].x - edge.vertices[0].x,
          edge.vertices[1].y - edge.vertices[0].y,
          edge.vertices[1].z - edge.vertices[0].z,
        ),
      ).toBeCloseTo(66, 7);
    }
    for (const panel of assembly.panels) {
      expect(panel.mountingHoles).toHaveLength(6);
      const eligibleHoles = panel.mountingHoles.filter(
        (hole) => hole.mechanicalUse === "eligible",
      );
      expect(eligibleHoles).toHaveLength(4);
      expect(
        eligibleHoles.every((hole) => hole.assignedClosureId !== null),
      ).toBe(true);
      expect(
        panel.mountingHoles
          .filter((hole) => hole.mechanicalUse === "blocked")
          .every((hole) => hole.assignedClosureId === null),
      ).toBe(true);

      const connectorAssignments = assembly.faces.flatMap((face) =>
        face.connectors
          .filter((connector) => connector.panelId === panel.id)
          .map((connector) => ({
            closureVertexCount: face.vertexIndices.length,
            holeId: connector.panelHoleId,
          })),
      );
      expect(
        connectorAssignments
          .filter((assignment) => assignment.closureVertexCount === 3)
          .map((assignment) => assignment.holeId)
          .sort(),
      ).toEqual(["bottom-right", "top-left"]);
      expect(
        connectorAssignments
          .filter((assignment) => assignment.closureVertexCount === 5)
          .map((assignment) => assignment.holeId)
          .sort(),
      ).toEqual(["middle-left", "middle-right"]);
    }
  });

  it("generates all closures, wiring, viewer LEDs, and a matching WLED map", async () => {
    const project = loadProject();
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

    expect(mapping.panels).toHaveLength(30);
    expect(mapping.entries).toHaveLength(1_920);
    expect(mapping.surfaceFaces).toHaveLength(62);
    expect(mapping.printableClosures).toHaveLength(32);
    expect(mapping.mechanicalMounts).toHaveLength(120);
    expect(wiring.outputs.map((output) => output.panelIds.length)).toEqual([
      8, 8, 7, 7,
    ]);
    expect(validateMapping(mapping, 1_920)).toEqual({ valid: true, errors: [] });
    expect(validateWiringPreview(wiring, mapping)).toEqual({
      valid: true,
      errors: [],
    });
    expect(contract.ledmap.map).toHaveLength(1_920);
    expect(new Set(contract.ledmap.map).size).toBe(1_920);
    expect(contract.fingerprint).toBe("93987755");

    const outputDirectory = await mkdtemp(join(tmpdir(), "rco-auto-cad-"));
    temporaryDirectories.push(outputDirectory);
    const cad = await emitPanelClosureCadArtifacts(project, { outputDirectory });
    expect(cad.manifest.parts).toHaveLength(32);
    expect(
      cad.manifest.parts.filter((part) => part.connectorPanelIds.length === 3),
    ).toHaveLength(20);
    expect(
      cad.manifest.parts.filter((part) => part.connectorPanelIds.length === 5),
    ).toHaveLength(12);
    const pentagon = cad.manifest.parts.find(
      (part) => part.connectorPanelIds.length === 5,
    )!;
    const source = await readFile(
      cad.entrypointPaths.closures[pentagon.closureFaceId]!,
      "utf8",
    );
    expect(source.match(/module connector_[0-4]\(\)/g)).toHaveLength(5);
    expect(source).toContain("polyhedron(points=clip_points");
  });
});
