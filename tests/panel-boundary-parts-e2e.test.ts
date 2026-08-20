import {
  mkdtemp,
  readFile,
  readdir,
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
} from "../src/cad/GeneratePanelBoundaryParts.ts";
import { sha256Bytes } from "../src/sculpture/GeneratedMechanics.ts";
import {
  compilePanelAssembly,
  createPanelAssemblyProject,
  getGeneratedMechanicsState,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import { generateClosedPanelBoundary } from "../src/sculpture/PanelOutlineBoundary.ts";
import {
  automaticallySeedPanelsOnSurface,
  movePanelOnDesignSurface,
  rotatePanelAroundLocalZ,
} from "../src/sculpture/SculptureEditor.ts";
import { loadVerifiedGeneratedMechanics } from "../web/src/GeneratedMechanicsAssets.ts";
import {
  loadGlbDesignSurface,
  placementMeshFromSurface,
} from "../web/src/DesignSurfaceLoader.ts";
import {
  createPortableProjectZip,
  openPortableProjectFiles,
  openPortableProjectZip,
} from "../web/src/PortableProject.ts";

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

function tetrahedronGlb(): Uint8Array {
  const positions = new Float32Array([
    50, 50, 50,
    -50, -50, 50,
    -50, 50, -50,
    50, -50, -50,
  ]);
  const indices = new Uint16Array([
    0, 2, 1,
    0, 1, 3,
    0, 3, 2,
    1, 2, 3,
  ]);
  const binary = new Uint8Array(positions.byteLength + indices.byteLength);
  binary.set(new Uint8Array(positions.buffer), 0);
  binary.set(new Uint8Array(indices.buffer), positions.byteLength);
  const json = JSON.stringify({
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      {
        buffer: 0,
        byteOffset: positions.byteLength,
        byteLength: indices.byteLength,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 4,
        type: "VEC3",
        min: [-50, -50, -50],
        max: [50, 50, 50],
      },
      { bufferView: 1, componentType: 5123, count: 12, type: "SCALAR" },
    ],
  });
  const encodedJson = new TextEncoder().encode(json);
  const paddedJsonLength = Math.ceil(encodedJson.length / 4) * 4;
  const paddedBinaryLength = Math.ceil(binary.length / 4) * 4;
  const output = new Uint8Array(
    12 + 8 + paddedJsonLength + 8 + paddedBinaryLength,
  );
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, output.length, true);
  view.setUint32(12, paddedJsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  output.fill(0x20, 20, 20 + paddedJsonLength);
  output.set(encodedJson, 20);
  const binaryHeader = 20 + paddedJsonLength;
  view.setUint32(binaryHeader, paddedBinaryLength, true);
  view.setUint32(binaryHeader + 4, 0x004e4942, true);
  output.set(binary, binaryHeader + 8);
  return output;
}

async function filesFromDirectory(
  directory: string,
  prefix = "",
): Promise<Array<{ path: string; bytes: Uint8Array }>> {
  const files: Array<{ path: string; bytes: Uint8Array }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await filesFromDirectory(absolutePath, path));
    } else if (entry.isFile()) {
      files.push({ path, bytes: new Uint8Array(await readFile(absolutePath)) });
    }
  }
  return files;
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
    const result = await generatePanelBoundaryParts(project, {
      outputDirectory,
    });

    expect(result.partAssets.every((part) => part.inspection.triangles > 12)).toBe(true);
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
    });
    const successfulManifest = await readFile(
      join(outputDirectory, "sculpture.json"),
      "utf8",
    );

    const invalid = structuredClone(project.sculpture);
    invalid.boundaryTopology!.gaps.pop();
    await expect(generatePanelBoundaryParts(
      createPanelAssemblyProject(invalid, FIXTURE, project.panelProfile),
      {
        outputDirectory: join(parent, "invalid"),
      },
    )).rejects.toThrow(/Boundary|boundary|Gap|gap/);
    expect(await readFile(join(outputDirectory, "sculpture.json"), "utf8"))
      .toBe(successfulManifest);
  });

  it("rejects missing, tampered, and reserved design assets before staging or rendering", async () => {
    const source = await loadProject();
    const glbBytes = tetrahedronGlb();
    const parent = await mkdtemp(join(tmpdir(), "panel-boundary-design-guard-"));
    temporaryDirectories.push(parent);
    const manifestCollision = structuredClone(source.sculpture);
    manifestCollision.designSurface = {
      kind: "triangle-mesh",
      format: "glb",
      source: "sculpture.json",
      sha256: sha256Bytes(glbBytes),
      scaleToMillimeters: 1,
      status: "watertight",
    };
    expect(() => createPanelAssemblyProject(
      manifestCollision,
      FIXTURE,
      source.panelProfile,
    )).toThrow(/reserved portable project manifest path/);
    expect((await readdir(parent)).some((entry) =>
      entry.includes(".pending-")
    )).toBe(false);

    const cases = [
      {
        label: "missing",
        source: "design/source.glb",
        sha256: sha256Bytes(glbBytes),
        bytes: undefined,
        error: /requires verified bytes/,
      },
      {
        label: "tampered",
        source: "design/source.glb",
        sha256: sha256Bytes(glbBytes),
        bytes: new Uint8Array([...glbBytes.slice(0, -1), 0xff]),
        error: /failed SHA-256 verification/,
      },
      {
        label: "mechanics-root-collision",
        source: "mechanics",
        sha256: sha256Bytes(glbBytes),
        bytes: glbBytes,
        error: /reserved generated-project path/,
      },
      {
        label: "mechanics-collision",
        source: "mechanics/source.glb",
        sha256: sha256Bytes(glbBytes),
        bytes: glbBytes,
        error: /reserved generated-project path/,
      },
      {
        label: "case-folded-mechanics-collision",
        source: "Mechanics/source.glb",
        sha256: sha256Bytes(glbBytes),
        bytes: glbBytes,
        error: /reserved generated-project path/,
      },
    ];

    for (const testCase of cases) {
      const definition = structuredClone(source.sculpture);
      definition.designSurface = {
        kind: "triangle-mesh",
        format: "glb",
        source: testCase.source,
        sha256: testCase.sha256,
        scaleToMillimeters: 1,
        status: "watertight",
      };
      const project = createPanelAssemblyProject(
        definition,
        FIXTURE,
        source.panelProfile,
      );
      const outputDirectory = join(parent, testCase.label);
      await writeFile(outputDirectory, "prior output\n");
      await expect(generatePanelBoundaryParts(project, {
        outputDirectory,
        ...(testCase.bytes ? { designSurfaceBytes: testCase.bytes } : {}),
      })).rejects.toThrow(testCase.error);
      expect(await readFile(outputDirectory, "utf8")).toBe("prior output\n");
      expect((await readdir(parent)).some((entry) =>
        entry.startsWith(`${testCase.label}.pending-`)
      )).toBe(false);
    }
  });

  it("accepts GLB -> placement -> edit -> parts -> ZIP -> complete reopen", async () => {
    const source = await loadProject();
    const glbBytes = tetrahedronGlb();
    const loadedSurface = await loadGlbDesignSurface(
      glbBytes.slice().buffer,
      1,
    );
    expect(loadedSurface.validation.watertight).toBe(true);

    let definition = structuredClone(source.sculpture);
    definition.id = "portable-panel-outline-journey";
    definition.name = "Portable Panel Outline Journey";
    definition.panels = [];
    definition.wiring.chainLengths = [0];
    delete definition.boundaryTopology;
    delete definition.generatedMechanics;
    definition.designSurface = {
      kind: "triangle-mesh",
      format: "glb",
      source: "design/source.glb",
      sha256: sha256Bytes(glbBytes),
      scaleToMillimeters: 1,
      status: "watertight",
    };

    const seeded = automaticallySeedPanelsOnSurface(
      definition,
      placementMeshFromSurface(loadedSurface, false),
      source.panelProfile.dimensions,
      {
        targetPanelCount: 4,
        surface: "design-surface",
        normalOffset: source.panelProfile.dimensions.thickness / 2,
      },
    );
    expect(seeded.placedPanelIds).toEqual(["P-01", "P-02", "P-03", "P-04"]);
    definition = seeded.definition;

    const editedPoses = [
      {
        id: "P-01",
        position: [0, 33, 0] as [number, number, number],
        orientation: {
          xAxis: [-1, 0, 0] as [number, number, number],
          yAxis: [0, 0, 1] as [number, number, number],
          normal: [0, 1, 0] as [number, number, number],
        },
      },
      {
        id: "P-02",
        position: [33, 0, 0] as [number, number, number],
        orientation: {
          xAxis: [0, 1, 0] as [number, number, number],
          yAxis: [0, 0, 1] as [number, number, number],
          normal: [1, 0, 0] as [number, number, number],
        },
      },
      {
        id: "P-03",
        position: [0, -33, 0] as [number, number, number],
        orientation: {
          xAxis: [1, 0, 0] as [number, number, number],
          yAxis: [0, 0, 1] as [number, number, number],
          normal: [0, -1, 0] as [number, number, number],
        },
      },
      {
        id: "P-04",
        position: [-33, 0, 0] as [number, number, number],
        orientation: {
          xAxis: [0, -1, 0] as [number, number, number],
          yAxis: [0, 0, 1] as [number, number, number],
          normal: [-1, 0, 0] as [number, number, number],
        },
      },
    ];
    editedPoses.forEach((pose, index) => {
      definition = movePanelOnDesignSurface(definition, pose.id, {
        position: pose.position,
        orientation: pose.orientation,
        attachment: {
          surface: "design-surface",
          triangleIndex: index,
          barycentric: [1 / 3, 1 / 3, 1 / 3],
          normalOffset: source.panelProfile.dimensions.thickness / 2,
        },
      });
    });
    const editedProject = createPanelAssemblyProject(
      definition,
      "local:acceptance/sculpture.json",
      source.panelProfile,
    );
    expect(editedProject.sculpture.boundaryTopology).toBeUndefined();
    const expectedPoses = structuredClone(editedProject.sculpture.panels.map(
      ({ id, pose }) => ({ id, pose }),
    ));

    const parent = await mkdtemp(join(tmpdir(), "portable-project-journey-"));
    temporaryDirectories.push(parent);
    const generated = await generatePanelBoundaryParts(editedProject, {
      outputDirectory: join(parent, "generated"),
      designSurfaceBytes: glbBytes,
    });
    expect(generated.definition.boundaryTopology).toMatchObject({
      kind: "panel-outline-gap-cycles",
      gaps: [
        { id: expect.stringMatching(/^gap-[0-9a-f]{12}$/) },
        { id: expect.stringMatching(/^gap-[0-9a-f]{12}$/) },
      ],
    });
    expect(editedProject.sculpture.boundaryTopology).toBeUndefined();

    expect(new Uint8Array(await readFile(
      join(generated.outputDirectory, "design/source.glb"),
    ))).toEqual(glbBytes);
    const projectFiles = await filesFromDirectory(generated.outputDirectory);
    const folderBundle = await openPortableProjectFiles(
      projectFiles.map(({ path, bytes }) => ({
        path: `portable-folder/${path}`,
        bytes,
      })),
      "portable-folder",
      async () => source.panelProfile,
    );
    expect(folderBundle.project.sculpture.designSurface?.source)
      .toBe("design/source.glb");
    expect(folderBundle.project.sculpture.boundaryTopology)
      .toEqual(generated.definition.boundaryTopology);
    expect(folderBundle.assets.size).toBe(4);
    const availableAssets = new Map(
      [...folderBundle.assets].map(([path, asset]) => [
        path,
        Uint8Array.from(asset.bytes),
      ]),
    );

    folderBundle.dispose();

    const zipBytes = createPortableProjectZip(
      generated.definition,
      availableAssets,
    );
    const reopened = await openPortableProjectZip(
      zipBytes,
      "portable-panel-outline-journey.zip",
      async () => source.panelProfile,
    );
    try {
      expect(reopened.project.sculpture.panels.map(({ id, pose }) => ({ id, pose })))
        .toEqual(expectedPoses);
      expect(reopened.project.sculpture.boundaryTopology)
        .toEqual(generated.definition.boundaryTopology);
      expect(getGeneratedMechanicsState(
        reopened.project.sculpture,
        reopened.project.panelProfile,
      )).toBe("current");
      expect([...reopened.assets.keys()].sort())
        .toEqual([...availableAssets.keys()].sort());
      for (const [path, bytes] of availableAssets) {
        expect(reopened.assets.get(path)?.bytes).toEqual(bytes);
      }

      expect(reopened.assetUrls.get("design/source.glb")).toMatch(/^blob:/);
      const reopenedGlb = new Uint8Array(await (
        await fetch(reopened.assetUrls.get("design/source.glb")!)
      ).arrayBuffer());
      expect(reopenedGlb).toEqual(glbBytes);

      const reopenedBoundary = generateClosedPanelBoundary(
        reopened.project.sculpture,
        reopened.project.panelProfile,
      );
      expect(reopenedBoundary.metadata.meshFingerprint)
        .toEqual(generated.boundary.metadata.meshFingerprint);
      const exact = await loadVerifiedGeneratedMechanics(
        reopened.project.sculpture,
        reopened.project.panelProfile,
        reopened.project.source,
        fetch,
        "http://localhost/",
        reopened.assetUrls,
      );
      expect(exact?.boundary.url).toMatch(/^blob:/);
      expect(exact?.parts.map(({ sha256 }) => sha256)).toEqual(
        generated.partAssets.map(({ sha256 }) => sha256),
      );

      const staleDefinition = rotatePanelAroundLocalZ(
        reopened.project.sculpture,
        "P-01",
        1,
      );
      const staleZip = createPortableProjectZip(
        staleDefinition,
        availableAssets,
      );
      const staleReopened = await openPortableProjectZip(
        staleZip,
        "portable-panel-outline-stale.zip",
        async () => source.panelProfile,
      );
      try {
        expect(getGeneratedMechanicsState(
          staleReopened.project.sculpture,
          staleReopened.project.panelProfile,
        )).toBe("stale");
        expect([...staleReopened.assets.keys()].sort()).toEqual(
          [...reopened.assets.keys()].sort(),
        );
        await expect(loadVerifiedGeneratedMechanics(
          staleReopened.project.sculpture,
          staleReopened.project.panelProfile,
          staleReopened.project.source,
          fetch,
          "http://localhost/",
          staleReopened.assetUrls,
        )).rejects.toThrow(/stale/);
      } finally {
        staleReopened.dispose();
      }
    } finally {
      reopened.dispose();
      loadedSurface.geometry.dispose();
    }
  });
});
