import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import definitionJson from "../sculptures/truncated-octahedron/sculpture.json" with {
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
    "sculptures/truncated-octahedron/sculpture.json",
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("truncated octahedron end-to-end compiler", () => {
  it("compiles the explicit face graph, panel mounts, and closure seams", () => {
    const assembly = compilePanelAssembly(loadProject());
    const roleByFaceId = new Map(
      assembly.faces.map((face) => [face.id, face.role]),
    );

    expect(assembly.counts).toEqual({
      vertices: 24,
      edges: 36,
      faces: 14,
      panels: 6,
      closures: 8,
      closureConnectors: 24,
    });
    expect(
      assembly.faces.filter((face) => face.vertexIndices.length === 4),
    ).toHaveLength(6);
    expect(
      assembly.faces.filter((face) => face.vertexIndices.length === 6),
    ).toHaveLength(8);
    expect(
      assembly.edges.filter((edge) =>
        edge.faceIds.every((faceId) => roleByFaceId.get(faceId) === "closure"),
      ),
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
    for (const closure of assembly.faces.filter(
      (face) => face.role === "closure",
    )) {
      expect(closure.connectors).toHaveLength(3);
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
        new Set(eligibleHoles.map((hole) => hole.assignedClosureId)).size,
      ).toBe(4);
      expect(
        panel.mountingHoles
          .filter((hole) => hole.mechanicalUse === "blocked")
          .every((hole) => hole.assignedClosureId === null),
      ).toBe(true);
    }
  });

  it("generates hexagonal CAD, wiring, viewer LEDs, and WLED mapping", async () => {
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

    expect(mapping.panels).toHaveLength(6);
    expect(mapping.entries).toHaveLength(384);
    expect(mapping.surfaceFaces).toHaveLength(14);
    expect(mapping.printableClosures).toHaveLength(8);
    expect(mapping.mechanicalMounts).toHaveLength(24);
    expect(mapping.notes).toContain(
      "12 closure-to-closure edges are clean butt seams without PCB-hole tabs.",
    );
    expect(wiring.outputs.map((output) => output.panelIds.length)).toEqual([6]);
    expect(validateMapping(mapping, 384)).toEqual({ valid: true, errors: [] });
    expect(validateWiringPreview(wiring, mapping)).toEqual({
      valid: true,
      errors: [],
    });
    expect(contract.ledmap.map).toHaveLength(384);
    expect(new Set(contract.ledmap.map).size).toBe(384);
    expect(contract.fingerprint).toBe("b7169f35");

    const outputDirectory = await mkdtemp(
      join(tmpdir(), "truncated-octahedron-cad-"),
    );
    temporaryDirectories.push(outputDirectory);
    const cad = await emitPanelClosureCadArtifacts(project, { outputDirectory });
    expect(cad.manifest.parts).toHaveLength(8);
    expect(
      cad.manifest.parts.every((part) => part.connectorPanelIds.length === 3),
    ).toBe(true);
    expect(cad.manifest.warnings).toContain(
      "12 closure-to-closure edges are clean butt seams without direct fasteners.",
    );
    const source = await readFile(
      cad.entrypointPaths.closures[cad.manifest.parts[0]!.closureFaceId]!,
      "utf8",
    );
    expect(source.match(/module connector_[0-2]\(\)/g)).toHaveLength(3);
    expect(source).toContain("polyhedron(points=clip_points");
  });
});
