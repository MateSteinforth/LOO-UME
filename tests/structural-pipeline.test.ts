import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import {
  validateStructuralArtifactBundle,
} from "../src/cad/CompileStructuralArtifacts.ts";
import {
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
  type PanelAssemblyDefinition,
  type PanelAssemblyProject,
} from "../src/sculpture/PanelAssembly.ts";
import { sha256Bytes } from "../src/sculpture/GeneratedMechanics.ts";
import {
  getGeneratedStructuralState,
  normalizeStructuralDesign,
} from "../src/sculpture/StructuralDesign.ts";
import {
  runStructuralPipeline,
  type StructuralPipelineResult,
} from "../src/structure/StructuralPipeline.ts";
import { loadVerifiedGeneratedStructure } from "../web/src/GeneratedStructuralAssets.ts";

const sourcePath = "sculptures/pose-only-two-panel/sculpture.json";
const GLB = new Uint8Array([
  0x67, 0x6c, 0x54, 0x46,
  0x02, 0x00, 0x00, 0x00,
  0x0c, 0x00, 0x00, 0x00,
]);
let source: PanelAssemblyDefinition;
let project: PanelAssemblyProject;
let result: StructuralPipelineResult;

beforeAll(async () => {
  source = parsePanelAssemblyDefinition(JSON.parse(await readFile(sourcePath, "utf8")));
  project = createPanelAssemblyProject(source, sourcePath);
  result = await runStructuralPipeline(project);
}, 60_000);

describe("headless structural system pipeline", () => {
  it("runs existing Schema 2 JSON through analysis, printable assets, reports, and a current manifest", () => {
    expect(result.optimization.status).toBe("converged");
    expect(result.solids).toHaveLength(result.candidate.connectorCells.length);
    expect(result.solids.every(({ kind }) => kind === "organic-connector")).toBe(true);
    expect(result.bundle.files).toHaveLength(result.solids.length + 6);
    expect(() => validateStructuralArtifactBundle(result.bundle)).not.toThrow();
    expect(result.generatedStructure.artifacts).toHaveLength(result.solids.length + 4);
    expect(new Set(result.generatedStructure.artifacts.map(({ role }) => role))).toEqual(
      new Set(["part", "preview", "package", "analysis", "report"]),
    );
    expect(getGeneratedStructuralState(result.definition, project.panelProfile)).toBe("current");
    const projectFile = result.bundle.files.find(({ role }) => role === "project")!;
    expect(JSON.parse(new TextDecoder().decode(projectFile.bytes))).toEqual(result.definition);
    const profileFile = result.bundle.files.find(({ role }) => role === "profile")!;
    expect(result.definition.panelProfile.source).toBe("catalog/panel-profile.json");
    expect(JSON.parse(new TextDecoder().decode(profileFile.bytes))).toEqual(project.panelProfile);
    for (const artifact of result.generatedStructure.artifacts) {
      const file = result.bundle.files.find(({ id }) => id === artifact.id)!;
      expect(file.source).toBe(artifact.source);
      expect(sha256Bytes(file.bytes)).toBe(artifact.sha256);
    }
  });

  it("reports supports, load cases, safety factor, warnings, member results, buckling, history, and hashes", () => {
    expect(result.analysis.disclaimer).toBe(
      "Load-path guidance only; not engineering certification.",
    );
    expect(result.analysis.supports.length).toBeGreaterThan(0);
    expect(result.analysis.loadCases).toHaveLength(7);
    expect(result.analysis.loadCaseResults).toHaveLength(7);
    expect(result.analysis.members).toHaveLength(
      result.optimization.optimizedCandidate.members.length,
    );
    expect(result.analysis.members.every(({ governingLoadCaseId }) => governingLoadCaseId.length > 0))
      .toBe(true);
    expect(result.analysis.members.some(({ forceType }) => forceType === "compression")).toBe(true);
    expect(result.analysis.optimization.trace.length).toBeGreaterThan(0);
    expect(result.analysis.warnings.map(({ code }) => code)).toEqual([
      "STRUCTURAL_PREVIEW_DEFAULTS",
      "NO_REAL_SUPPORTS",
      "ELECTRICAL_KEEPOUTS_UNMEASURED",
    ]);
    expect(result.reportMarkdown).toMatch(/NOT ENGINEERING CERTIFICATION/);
    expect(result.reportMarkdown).toMatch(/NO REAL SUPPORT WAS AUTHORED/);
    expect(result.reportMarkdown).toContain(`Safety factor: ${result.analysis.design.safetyFactor}`);
    expect(result.reportMarkdown).toContain("Euler buckling utilization");
    expect(result.reportMarkdown).toContain("## Optimization history");
    for (const artifact of result.analysis.artifacts) {
      expect(result.reportMarkdown).toContain(artifact.sha256);
    }
    const analysisArtifact = result.generatedStructure.artifacts.find(({ role }) => role === "analysis")!;
    expect(result.reportMarkdown).toContain(analysisArtifact.sha256);
  });

  it("loads the current exact structural set for browser preview and rejects it after a pose edit", async () => {
    const urls = new Map(result.generatedStructure.artifacts.map(({ source }) => [
      source,
      `memory:${source}`,
    ]));
    const bytesByUrl = new Map(result.generatedStructure.artifacts.map(({ source }) => [
      `memory:${source}`,
      result.bundle.files.find((file) => file.source === source)!.bytes,
    ]));
    const loaded = await loadVerifiedGeneratedStructure(
      result.definition,
      project.panelProfile,
      "local:test",
      async (input) => {
        const bytes = bytesByUrl.get(String(input));
        if (!bytes) throw new Error(`Missing test bytes for ${String(input)}.`);
        return new Response(new Blob([Uint8Array.from(bytes)]));
      },
      "http://localhost/",
      urls,
    );

    expect(loaded?.parts).toHaveLength(result.solids.length);
    expect(loaded?.preview.stlInspection?.triangles).toBeGreaterThan(0);
    expect(loaded?.analysis.bytes).toEqual(result.analysisBytes);
    expect(loaded?.report.bytes).toEqual(result.reportBytes);

    const stale = structuredClone(result.definition);
    stale.panels[0]!.pose.position[0] += 1;
    await expect(loadVerifiedGeneratedStructure(
      stale,
      project.panelProfile,
      "local:test",
      async () => {
        throw new Error("Stale assets must not be fetched.");
      },
      "http://localhost/",
      urls,
    )).rejects.toThrow(/stale/i);
  });

  it("is byte-identical when equivalent panels, supports, and loads are reordered", async () => {
    const authored = structuredClone(source);
    authored.structuralDesign = structuredClone(normalizeStructuralDesign(project).design);
    authored.structuralDesign.supports = [
      {
        id: "reference-panel",
        kind: "panel",
        panelId: "P-01",
        constrainedTranslations: ["x", "y", "z"],
      },
      {
        id: "handling-anchor",
        kind: "anchor",
        panelId: "P-02",
        holeId: "bottom-right",
        constrainedTranslations: ["x", "z"],
      },
    ];
    authored.structuralDesign.loads = [
      {
        id: "corner-force",
        kind: "panel-corner-force",
        panelId: "P-02",
        corner: "top-left",
        forceNewtons: [1, 0, 0],
      },
      {
        id: "cable-pull",
        kind: "cable-pull",
        panelId: "P-01",
        connector: "DIN",
        forceNewtons: [0, 0, 1],
      },
    ];
    authored.structuralDesign.connectorization!.panelPairOverrides = [{
      panelIds: ["P-01", "P-02"],
      action: "include",
    }];
    const reordered = structuredClone(authored);
    reordered.panels.reverse();
    reordered.structuralDesign!.supports.reverse();
    reordered.structuralDesign!.supports[0]!.constrainedTranslations.reverse();
    reordered.structuralDesign!.loads.reverse();
    reordered.structuralDesign!.connectorization!.panelPairOverrides[0]!.panelIds.reverse();
    const first = await runStructuralPipeline(createPanelAssemblyProject(
      authored, sourcePath, project.panelProfile,
    ));
    const repeated = await runStructuralPipeline(createPanelAssemblyProject(
      reordered, sourcePath, project.panelProfile,
    ));

    expect(repeated.analysisBytes).toEqual(first.analysisBytes);
    expect(repeated.reportBytes).toEqual(first.reportBytes);
    expect(repeated.bundle.manifestBytes).toEqual(first.bundle.manifestBytes);
    expect(repeated.bundle.files.map(({ source, bytes, sha256 }) => ({ source, bytes, sha256 })))
      .toEqual(first.bundle.files.map(({ source, bytes, sha256 }) => ({ source, bytes, sha256 })));
  }, 120_000);

  it("includes a verified design surface at a safe project-relative path", async () => {
    const surfaced = structuredClone(source);
    surfaced.designSurface = {
      kind: "triangle-mesh",
      format: "glb",
      source: "design/source.glb",
      sha256: sha256Bytes(GLB),
      scaleToMillimeters: 1,
      status: "watertight",
    };
    const surfacedResult = await runStructuralPipeline(
      createPanelAssemblyProject(surfaced, sourcePath, project.panelProfile),
      { designSurfaceBytes: GLB },
    );
    const surfaceFile = surfacedResult.bundle.files.find(({ role }) => role === "source")!;

    expect(surfacedResult.definition.designSurface?.source).toBe("assets/design-surface.glb");
    expect(surfaceFile.source).toBe("assets/design-surface.glb");
    expect(surfaceFile.bytes).toEqual(GLB);
    expect(surfacedResult.generatedStructure.artifacts.some(({ id }) => id === "design-surface"))
      .toBe(false);
  }, 60_000);

  it("fails clearly when authored supports leave a singular system", async () => {
    const singularDefinition = structuredClone(source);
    const normalized = normalizeStructuralDesign(project);
    singularDefinition.structuralDesign = structuredClone(normalized.design);
    singularDefinition.structuralDesign.supports = [{
      id: "insufficient-x-only",
      kind: "panel",
      panelId: "P-01",
      constrainedTranslations: ["x"],
    }];
    const singularProject = createPanelAssemblyProject(
      singularDefinition,
      sourcePath,
      project.panelProfile,
    );

    await expect(runStructuralPipeline(singularProject)).rejects.toThrow(
      /singular|supports are insufficient|rigid-body mechanism/i,
    );
  });
});
