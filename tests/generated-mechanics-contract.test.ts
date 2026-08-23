import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createGeneratedMechanicsFingerprint,
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
  getGeneratedMechanicsState,
  parsePanelAssemblyDefinition,
  type GeneratedMechanicsManifest,
  type PanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import { sha256Text } from "../src/sculpture/GeneratedMechanics.ts";
import {
  rotatePanelAroundLocalZ,
  sculptureJson,
} from "../src/sculpture/SculptureEditor.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

const hash = (character: string): string => character.repeat(64);

async function loadPoseOnly(): Promise<PanelAssemblyDefinition> {
  return parsePanelAssemblyDefinition(JSON.parse(await readFile(
    "sculptures/pose-only-two-panel/sculpture.json",
    "utf8",
  )));
}

async function loadProfile() {
  return createPanelAssemblyProject(
    await loadPoseOnly(),
    "sculptures/pose-only-two-panel/sculpture.json",
  ).panelProfile;
}

function manifest(sourceFingerprint: string): GeneratedMechanicsManifest {
  return {
    generator: {
      id: "wled-orbital-lab/planar-boundary",
      version: "0.1.0",
    },
    sourceFingerprint: {
      algorithm: "sha256",
      value: sourceFingerprint,
    },
    status: {
      generation: "complete",
      validation: "passed",
    },
    boundary: {
      kind: "closed-boundary-mesh",
      format: "stl",
      source: "mechanics/boundary.stl",
      sha256: hash("b"),
    },
    parts: [
      {
        id: "part-002",
        format: "stl",
        source: "mechanics/parts/part-002.stl",
        sha256: hash("c"),
      },
      {
        id: "part-001",
        format: "stl",
        source: "mechanics/parts/part-001.stl",
        sha256: hash("d"),
      },
    ],
  };
}

async function portableDefinition(): Promise<{
  definition: PanelAssemblyDefinition;
  profile: Awaited<ReturnType<typeof loadProfile>>;
}> {
  const definition = await loadPoseOnly();
  const profile = await loadProfile();
  definition.designSurface = {
    kind: "triangle-mesh",
    format: "glb",
    source: "design/source.glb",
    sha256: hash("a"),
    scaleToMillimeters: 1,
    status: "watertight",
  };
  definition.generatedMechanics = manifest(
    createGeneratedMechanicsFingerprint(definition, profile),
  );
  return { definition, profile };
}

function asUnknown(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe("Schema 2 portable generated-mechanics assets", () => {
  it("uses a browser-safe standards-compliant SHA-256 implementation", () => {
    expect(sha256Text("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Text("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("round-trips the GLB, boundary, and ordered exact STL identities", async () => {
    const { definition, profile } = await portableDefinition();
    const parsed = parsePanelAssemblyDefinition(
      JSON.parse(sculptureJson(definition)),
    );

    expect(parsed.designSurface).toEqual(definition.designSurface);
    expect(parsed.generatedMechanics).toEqual(definition.generatedMechanics);
    expect(parsed.generatedMechanics?.parts.map((part) => part.id)).toEqual([
      "part-002",
      "part-001",
    ]);
    expect(getGeneratedMechanicsState(parsed, profile)).toBe("current");
  });

  it("derives stale mechanics after a panel edit without disabling pose-first work", async () => {
    const { definition, profile } = await portableDefinition();
    const edited = rotatePanelAroundLocalZ(definition, "P-01", 15);
    const project = createPanelAssemblyProject(
      JSON.parse(sculptureJson(edited)),
      "portable/sculpture.json",
      profile,
    );
    const mapping = createPanelAssemblyMapping(project);
    const wiring = createProvisionalWiringPreview(
      mapping,
      project.sculpture,
      profile,
    );

    expect(getGeneratedMechanicsState(project.sculpture, profile)).toBe("stale");
    expect(project.sculpture.generatedMechanics).toEqual(
      definition.generatedMechanics,
    );
    expect(mapping.entries).toHaveLength(128);
    expect(wiring.nodes).toHaveLength(2);
    expect(createHardwareMappingContract(mapping, wiring, profile).ledmap.map)
      .toHaveLength(128);
  });

  it("becomes stale for relevant profile changes but ignores ordering and mapping facts", async () => {
    const { definition, profile } = await portableDefinition();
    const reordered = structuredClone(definition);
    reordered.panels.reverse();
    reordered.mapping.notes = ["Display-only mapping note."];
    const reorderedProfile = structuredClone(profile);
    reorderedProfile.mounting.holes.reverse();
    expect(getGeneratedMechanicsState(reordered, reorderedProfile)).toBe("current");

    const changedProfile = structuredClone(profile);
    changedProfile.dimensions.width += 0.25;
    expect(getGeneratedMechanicsState(definition, changedProfile)).toBe("stale");
  });

  it("loads the flagship project without a second mechanics authority", async () => {
    const flagship = parsePanelAssemblyDefinition(JSON.parse(await readFile(
      "sculptures/rhombicosidodecahedron/sculpture.json",
      "utf8",
    )));
    expect(flagship.generatedMechanics).toBeUndefined();
    expect(flagship.mechanicalShell).toBeUndefined();
  });

  it.each([
    "/mechanics/part.stl",
    "../mechanics/part.stl",
    "mechanics/../part.stl",
    "mechanics//part.stl",
    "./mechanics/part.stl",
    "C:/mechanics/part.stl",
    "https://example.test/part.stl",
    "mechanics\\part.stl",
    "mechanics/part.stl?download=1",
    "mechanics/part.stl#mesh",
    "design%2Fsource.glb",
    "%2e%2e/secret.glb",
    "build/editor-projects/run-1/part.stl",
  ])("rejects unsafe project asset source %s", async (source) => {
    const { definition } = await portableDefinition();
    definition.generatedMechanics!.parts[0]!.source = source;
    expect(() => parsePanelAssemblyDefinition(definition)).toThrow(
      /safe portable path|project-relative path/,
    );
  });

  it("applies the same safe-path and lowercase hash rules to existing GLB references", async () => {
    const { definition } = await portableDefinition();
    definition.designSurface!.source = "../outside.glb";
    expect(() => parsePanelAssemblyDefinition(definition)).toThrow(/safe portable path/);

    const second = await portableDefinition();
    second.definition.designSurface!.sha256 = hash("A");
    expect(() => parsePanelAssemblyDefinition(second.definition)).toThrow(
      /lowercase SHA-256/,
    );
  });

  it.each([
    "sculpture.json",
    "sculpture.json/design.glb",
    "Sculpture.json",
    "SCULPTURE.JSON/design.glb",
  ])("rejects asset source %s that collides with the portable manifest", async (source) => {
    const { definition } = await portableDefinition();
    definition.designSurface!.source = source;
    expect(() => parsePanelAssemblyDefinition(definition)).toThrow(
      /reserved portable project manifest path sculpture\.json/,
    );
  });

  it("rejects malformed hashes and duplicate stable part IDs", async () => {
    const { definition } = await portableDefinition();
    definition.generatedMechanics!.boundary.sha256 = "abc";
    expect(() => parsePanelAssemblyDefinition(definition)).toThrow(/SHA-256/);

    const second = await portableDefinition();
    second.definition.generatedMechanics!.parts[1]!.id = "part-002";
    expect(() => parsePanelAssemblyDefinition(second.definition)).toThrow(
      /unique.*stable IDs/,
    );
  });

  it("rejects unsupported generated-asset manifest fields", async () => {
    const { definition } = await portableDefinition();
    asUnknown(definition.generatedMechanics!.boundary).downloadUrl =
      "https://example.test/part.stl";
    expect(() => parsePanelAssemblyDefinition(definition)).toThrow(
      /Generated boundary contains unsupported field downloadUrl/,
    );
  });

  it.each([
    "generator",
    "sourceFingerprint",
    "status",
    "boundary",
    "parts",
  ])("rejects a generated manifest missing %s", async (field) => {
    const { definition } = await portableDefinition();
    delete asUnknown(definition.generatedMechanics)[field];
    expect(() => parsePanelAssemblyDefinition(definition)).toThrow();
  });

  it("rejects missing asset fields and blocks unsafe paths at save time", async () => {
    const { definition } = await portableDefinition();
    delete asUnknown(definition.generatedMechanics!.boundary).sha256;
    expect(() => parsePanelAssemblyDefinition(definition)).toThrow(/SHA-256/);

    const second = await portableDefinition();
    second.definition.generatedMechanics!.boundary.source =
      "build/editor-projects/preview/boundary.stl";
    expect(() => sculptureJson(second.definition)).toThrow(/safe portable path/);
  });
});
