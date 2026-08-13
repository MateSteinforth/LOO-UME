import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createPrintableBoundaryProject,
  generatePanelBoundaryParts,
  type ScadRenderer,
} from "../src/cad/GeneratePanelBoundaryParts.ts";
import { serializeAsciiStl } from "../src/cad/Stl.ts";
import {
  compilePanelAssembly,
  createPanelAssemblyProject,
  getGeneratedMechanicsState,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import { generateClosedPanelBoundary } from "../src/sculpture/PanelOutlineBoundary.ts";
import { rotatePanelAroundLocalZ } from "../src/sculpture/SculptureEditor.ts";
import { loadVerifiedGeneratedMechanics } from "../web/src/GeneratedMechanicsAssets.ts";

const FIXTURE = "sculptures/panel-outline-prism/sculpture.json";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

async function loadProject() {
  const definition = parsePanelAssemblyDefinition(JSON.parse(
    await readFile(FIXTURE, "utf8"),
  ));
  return createPanelAssemblyProject(definition, FIXTURE);
}

function deterministicRenderer(seenSources: string[]): ScadRenderer {
  return async (inputScad, outputStl) => {
    const source = await readFile(inputScad, "utf8");
    seenSources.push(source);
    expect(source).toContain("pilot_d=1.6;");
    expect(source).toContain("leadin_d=3.2;");
    expect(source).toContain("leadin_depth=0.7;");
    expect(source).toContain("panel_mount_offset=1.3;");
    expect(source).toContain("translate([");
    await writeFile(
      outputStl,
      serializeAsciiStl(
        "mock-open-scad-part",
        [[0, 0, 0], [10, 0, 0], [0, 10, 2]],
        [[0, 1, 2]],
      ),
    );
  };
}

describe("validated panel boundary printable asset pipeline", () => {
  it("compiles deterministic parts with every real eligible hole and no blocked connector", async () => {
    const project = await loadProject();
    const boundary = generateClosedPanelBoundary(
      project.sculpture,
      project.panelProfile,
    );
    const printable = createPrintableBoundaryProject(project, boundary);
    const assembly = compilePanelAssembly(printable);

    expect(printable.sculpture.closures).toMatchObject({
      generator: "panel-hole-tabs",
      coverThickness: 2,
      flangeThickness: 3,
      screwTabWidth: 13,
      connectorCornerClearance: 14,
      panelEnvelopeClearance: 0.3,
    });
    expect(assembly.counts).toMatchObject({
      panels: 4,
      closures: 2,
      closureConnectors: 16,
    });
    expect(assembly.faces.filter(({ role }) => role === "closure")
      .map(({ partId }) => partId)).toEqual(["part-001", "part-002"]);
    for (const panel of assembly.panels) {
      expect(panel.mountingHoles.filter(
        ({ mechanicalUse }) => mechanicalUse === "eligible",
      ).every(({ assignedClosureId }) => assignedClosureId !== null)).toBe(true);
      expect(panel.mountingHoles.filter(
        ({ mechanicalUse }) => mechanicalUse === "blocked",
      ).every(({ assignedClosureId }) => assignedClosureId === null)).toBe(true);
    }
    const sources = printable.sculpture.mechanicalShell!.faces;
    expect(sources.map(({ id, partId }) => ({ id, partId }))).toEqual([
      { id: "panel-001", partId: undefined },
      { id: "panel-002", partId: undefined },
      { id: "panel-003", partId: undefined },
      { id: "panel-004", partId: undefined },
      { id: "closure-001", partId: "part-001" },
      { id: "closure-002", partId: "part-002" },
    ]);
  });

  it("runs panels -> boundary -> parts -> STL references -> exact STL reload", async () => {
    const project = await loadProject();
    const parent = await mkdtemp(join(tmpdir(), "panel-boundary-parts-"));
    temporaryDirectories.push(parent);
    const outputDirectory = join(parent, "bundle");
    const seenSources: string[] = [];
    const result = await generatePanelBoundaryParts(project, {
      outputDirectory,
      renderScad: deterministicRenderer(seenSources),
    });

    expect(seenSources).toHaveLength(2);
    expect(result.definition.generatedMechanics).toMatchObject({
      status: { generation: "complete", validation: "passed" },
      boundary: {
        source: "mechanics/boundary.stl",
        format: "stl",
      },
      parts: [
        { id: "part-001", source: "mechanics/parts/part-001.stl" },
        { id: "part-002", source: "mechanics/parts/part-002.stl" },
      ],
    });
    expect(getGeneratedMechanicsState(
      result.definition,
      project.panelProfile,
    )).toBe("current");
    const reopenedProject = await loadPanelAssemblyProjectFromFile(
      join(outputDirectory, "sculpture.json"),
    );
    expect(reopenedProject.panelProfile.id).toBe(project.panelProfile.id);
    expect(getGeneratedMechanicsState(
      reopenedProject.sculpture,
      reopenedProject.panelProfile,
    )).toBe("current");

    const reopenedDefinition = parsePanelAssemblyDefinition(JSON.parse(
      await readFile(join(outputDirectory, "sculpture.json"), "utf8"),
    ));
    const fetchFromBundle = async (input: string | URL): Promise<Response> => {
      const url = new URL(input);
      const source = url.pathname.replace(/^\/bundle\//, "");
      try {
        const bytes = await readFile(join(outputDirectory, source));
        return new Response(Uint8Array.from(bytes), { status: 200 });
      } catch {
        return new Response("missing", { status: 404 });
      }
    };
    const exact = await loadVerifiedGeneratedMechanics(
      reopenedDefinition,
      project.panelProfile,
      "https://example.test/bundle/sculpture.json",
      fetchFromBundle,
    );
    expect(exact?.boundary.sha256).toBe(
      reopenedDefinition.generatedMechanics!.boundary.sha256,
    );
    expect(exact?.parts.map(({ sha256 }) => sha256)).toEqual(
      reopenedDefinition.generatedMechanics!.parts.map(({ sha256 }) => sha256),
    );
    expect(exact?.parts.map(({ bytes }) => bytes.byteLength)).toEqual(
      await Promise.all(result.partAssets.map(async ({ absolutePath }) =>
        (await stat(absolutePath)).size
      )),
    );

    const tamperedFetch = async (input: string | URL): Promise<Response> => {
      const response = await fetchFromBundle(input);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (String(input).endsWith("part-002.stl")) bytes[bytes.length - 2] ^= 1;
      return new Response(bytes, { status: response.status });
    };
    await expect(loadVerifiedGeneratedMechanics(
      reopenedDefinition,
      project.panelProfile,
      "https://example.test/bundle/sculpture.json",
      tamperedFetch,
    )).rejects.toThrow(/failed SHA-256 verification/);

    const edited = rotatePanelAroundLocalZ(
      reopenedDefinition,
      "P-FRONT",
      1,
    );
    expect(getGeneratedMechanicsState(edited, project.panelProfile)).toBe("stale");
    await expect(loadVerifiedGeneratedMechanics(
      edited,
      project.panelProfile,
      "https://example.test/bundle/sculpture.json",
      fetchFromBundle,
    )).rejects.toThrow(/stale/);
  });

  it("validates before rendering and preserves the last successful bundle on failure", async () => {
    const project = await loadProject();
    const parent = await mkdtemp(join(tmpdir(), "panel-boundary-atomic-"));
    temporaryDirectories.push(parent);
    const outputDirectory = join(parent, "bundle");
    await generatePanelBoundaryParts(project, {
      outputDirectory,
      renderScad: deterministicRenderer([]),
    });
    const successfulManifest = await readFile(
      join(outputDirectory, "sculpture.json"),
      "utf8",
    );

    let calls = 0;
    await expect(generatePanelBoundaryParts(project, {
      outputDirectory,
      renderScad: async () => {
        calls += 1;
        throw new Error("synthetic OpenSCAD failure");
      },
    })).rejects.toThrow(/synthetic OpenSCAD failure/);
    expect(calls).toBeGreaterThan(0);
    expect(await readFile(join(outputDirectory, "sculpture.json"), "utf8"))
      .toBe(successfulManifest);

    const invalid = structuredClone(project.sculpture);
    invalid.boundaryTopology!.gaps.pop();
    calls = 0;
    await expect(generatePanelBoundaryParts(
      createPanelAssemblyProject(invalid, FIXTURE, project.panelProfile),
      {
        outputDirectory: join(parent, "invalid"),
        renderScad: async () => { calls += 1; },
      },
    )).rejects.toThrow(/Boundary|boundary|Gap|gap/);
    expect(calls).toBe(0);
  });
});
