import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPentagonAssemblyEntrypoint,
  createTriangleClosureEntrypoint,
  emitCadArtifacts,
} from "../src/cad/GenerateCad.ts";
import {
  loadCanonicalSculptureProject,
  parseSculptureDefinition,
} from "../src/sculpture/Definition.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

describe("CAD generation", () => {
  it("declares every triangular opening interface explicitly", () => {
    const opening = loadCanonicalSculptureProject().sculpture.openings.triangleFaces;

    expect(opening).toMatchObject({
      faceType: "triangle",
      count: 20,
      population: "all",
      closure: {
        partId: "triangle-filler",
        quantity: 20,
        handedness: -1,
      },
    });
    expect(opening.closure.interfaces.map((entry) => entry.edgeIndex)).toEqual([
      0, 1, 2,
    ]);
    expect(
      opening.closure.interfaces.every(
        (entry) =>
          entry.mountingHoleEnd === "opposite-electrical-connector" &&
          entry.adjacentFaceType === "square",
      ),
    ).toBe(true);
  });

  it("emits a thin wrapper that guards every proven fit value", () => {
    const project = loadCanonicalSculptureProject();
    const entrypoint = createTriangleClosureEntrypoint(
      project,
      resolve("build/generated/test/triangle-filler.scad"),
      process.cwd(),
    );

    expect(entrypoint).toContain("include <../../../parts/triangle.scad>;");
    expect(entrypoint).toContain("triangle_handedness == -1");
    expect(entrypoint).toContain("pilot_hole_d == 1.6");
    expect(entrypoint).toContain("screw_bevel_entry_d == 3.2");
    expect(entrypoint).toContain("hole_edge_correction == 0.2");
    expect(entrypoint).toContain("surface_flush_correction == 0.5");
    expect(entrypoint).toContain("connector_corner_clearance == 14");
    expect(entrypoint).toContain("panel_envelope_clearance_xy == 0.3");
  });

  it("describes and composes the two-part populated-pentagon closure", () => {
    const project = loadCanonicalSculptureProject();
    const closure = project.sculpture.openings.pentagonFaces.closure;

    expect(closure.quantity).toBe(11);
    expect(closure.openOuterEdge).toBe(1);
    expect(closure.parts.map((part) => part.partId)).toEqual([
      "pentagon-u-frame",
      "middle-panel-connector",
    ]);
    expect(closure.parts[0].interfaces.outerPanelEdges).toEqual([0, 2, 3, 4]);
    expect(closure.parts[1].interfaces).toEqual([
      { panel: "center", hole: "top-middle-edge", edgeDistance: 8 },
      {
        panel: "outer",
        outerEdgeIndex: 1,
        hole: "middle-edge",
        edgeDistance: 8.2,
      },
    ]);

    const assembly = createPentagonAssemblyEntrypoint(
      project,
      resolve("build/generated/test/populated-pentagon-assembly.scad"),
      process.cwd(),
    );
    expect(assembly).toContain("pentagon_u_part();");
    expect(assembly).toContain("middle_panel_connector_part();");
    expect(assembly).toContain("pentagon_u_outer_panel_previews();");
  });

  it("writes a deterministic generated entrypoint and manifest", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "led-rhombo-cad-"));
    temporaryDirectories.push(outputDirectory);
    const project = loadCanonicalSculptureProject();
    const result = await emitCadArtifacts(project, {
      rootDirectory: process.cwd(),
      outputDirectory,
    });

    expect(result.manifest.artifacts.map((artifact) => artifact.id)).toEqual([
      "triangle-filler",
      "pentagon-u-frame",
      "middle-panel-connector",
    ]);
    expect(result.manifest.assemblies).toEqual([
      {
        id: "populated-pentagon-panel-mount",
        faceType: "pentagon",
        quantity: 11,
        entrypoint: "populated-pentagon-assembly.scad",
        parts: ["pentagon-u-frame", "middle-panel-connector"],
        preview: "center-and-five-outer-panels",
      },
    ]);
    expect(JSON.parse(await readFile(result.manifestPath, "utf8"))).toEqual(
      result.manifest,
    );
    expect(await readFile(result.entrypointPaths.pentagonAssembly, "utf8")).toContain(
      "middle_panel_connector_part();",
    );
  });

  it("rejects missing or unsafe triangle interfaces", () => {
    const project = loadCanonicalSculptureProject();
    const missingInterface = structuredClone(project.sculpture);
    missingInterface.openings.triangleFaces.closure.interfaces.pop();
    expect(() => parseSculptureDefinition(missingInterface)).toThrow(
      "exactly three panel interfaces",
    );

    const unsafeHandedness = structuredClone(project.sculpture) as unknown as {
      openings: { triangleFaces: { closure: { handedness: number } } };
    };
    unsafeHandedness.openings.triangleFaces.closure.handedness = 0;
    expect(() => parseSculptureDefinition(unsafeHandedness)).toThrow(
      "handedness must be -1 or 1",
    );

    const invalidPentagonEdges = structuredClone(project.sculpture);
    invalidPentagonEdges.openings.pentagonFaces.closure.parts[0].interfaces.outerPanelEdges = [
      0, 1, 3, 4,
    ];
    expect(() => parseSculptureDefinition(invalidPentagonEdges)).toThrow(
      "open-edge handedness",
    );
  });
});
