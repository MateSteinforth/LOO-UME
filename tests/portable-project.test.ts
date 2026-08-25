import { describe, expect, it } from "vitest";
import { Zip, ZipPassThrough, zipSync } from "fflate";
import { sha256Bytes } from "../src/sculpture/GeneratedMechanics.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import {
  parsePanelAssemblyDefinition,
  type PanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import { sculptureJson } from "../src/sculpture/SculptureEditor.ts";
import {
  createPortableProjectFiles,
  createPortableProjectZip,
  openPortableProjectFiles,
  openPortableProjectZip,
  writePortableProjectFolder,
  type PortableProjectFile,
  type PortableDirectoryHandle,
} from "../web/src/PortableProject.ts";

const GLB = new Uint8Array([
  0x67, 0x6c, 0x54, 0x46,
  0x02, 0x00, 0x00, 0x00,
  0x0c, 0x00, 0x00, 0x00,
]);

async function portableFixture(): Promise<{
  definition: PanelAssemblyDefinition;
  profile: Awaited<ReturnType<typeof loadPanelAssemblyProjectFromFile>>["panelProfile"];
  files: PortableProjectFile[];
}> {
  const loaded = await loadPanelAssemblyProjectFromFile(
    "sculptures/pose-only-two-panel/sculpture.json",
  );
  const definition = structuredClone(loaded.sculpture);
  definition.id = "portable-validation-fixture";
  definition.designSurface = {
    kind: "triangle-mesh",
    format: "glb",
    source: "design/source.glb",
    sha256: sha256Bytes(GLB),
    scaleToMillimeters: 1,
    status: "watertight",
  };
  const files = [
    {
      path: "project/sculpture.json",
      bytes: new TextEncoder().encode(sculptureJson(definition)),
    },
    { path: "project/design/source.glb", bytes: GLB },
  ];
  return { definition, profile: loaded.panelProfile, files };
}

function zipWithEntries(
  entries: Array<{ name: string; bytes: Uint8Array }>,
): Uint8Array {
  const chunks: Uint8Array[] = [];
  let failure: Error | undefined;
  const archive = new Zip((error, chunk) => {
    if (error) {
      failure = error;
      return;
    }
    chunks.push(Uint8Array.from(chunk));
  });
  for (const { name, bytes } of entries) {
    const file = new ZipPassThrough(name);
    archive.add(file);
    file.push(bytes, true);
  }
  archive.end();
  if (failure) throw failure;
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

describe("portable project folder and ZIP validation", () => {
  it("uses identical relative paths and hashes for folder and ZIP transport", async () => {
    const { definition, profile } = await portableFixture();
    const assets = new Map([["design/source.glb", GLB]]);
    const exportedFiles = createPortableProjectFiles(definition, assets);
    expect([...exportedFiles.keys()]).toEqual([
      "sculpture.json",
      "design/source.glb",
    ]);

    const written = new Map<string, Uint8Array>();
    const directory = (prefix: string): PortableDirectoryHandle => ({
      getDirectoryHandle: async (name) => directory(`${prefix}${name}/`),
      getFileHandle: async (name) => ({
        createWritable: async () => ({
          write: async (data) => {
            written.set(
              `${prefix}${name}`,
              new Uint8Array(await data.arrayBuffer()),
            );
          },
          close: async () => undefined,
        }),
      }),
    });
    await writePortableProjectFolder(
      directory(""),
      definition,
      assets,
      "written-project",
    );
    expect([...written.keys()]).toEqual([
      "written-project/design/source.glb",
      "written-project/sculpture.json",
    ]);
    expect(written.get("written-project/design/source.glb")).toEqual(GLB);

    const folder = await openPortableProjectFiles(
      [...exportedFiles].map(([path, bytes]) => ({
        path: `folder/${path}`,
        bytes,
      })),
      "folder",
      async () => profile,
    );
    const zip = await openPortableProjectZip(
      createPortableProjectZip(definition, assets),
      "project.zip",
      async () => profile,
    );
    try {
      expect(folder.project.sculpture.designSurface).toEqual(
        zip.project.sculpture.designSurface,
      );
      expect(folder.assets.get("design/source.glb")?.bytes).toEqual(GLB);
      expect(zip.assets.get("design/source.glb")?.bytes).toEqual(GLB);
      expect(zip.project.sculpture.designSurface?.source)
        .toBe("design/source.glb");
    } finally {
      folder.dispose();
      zip.dispose();
    }
  });

  it("round-trips every generated structural artifact and a bundled panel profile exactly", async () => {
    const { definition, profile } = await portableFixture();
    delete definition.designSurface;
    const structural = [
      { id: "part", role: "part", format: "stl", source: "structure/parts/part.stl", bytes: new Uint8Array([1, 2, 3]) },
      { id: "preview", role: "preview", format: "stl", source: "structure/preview.stl", bytes: new Uint8Array([4, 5]) },
      { id: "package", role: "package", format: "3mf", source: "structure/model.3mf", bytes: new Uint8Array([6, 7, 8]) },
      { id: "analysis", role: "analysis", format: "json", source: "structure/analysis.json", bytes: new TextEncoder().encode("{}\n") },
      { id: "report", role: "report", format: "markdown", source: "structure/report.md", bytes: new TextEncoder().encode("# Report\n") },
    ] as const;
    definition.generatedStructure = {
      schemaVersion: "1.0.0",
      generator: { id: "test/structural", version: "1" },
      sourceFingerprint: { algorithm: "sha256", value: "a".repeat(64) },
      status: { generation: "complete", validation: "passed" },
      artifacts: structural.map(({ bytes, ...artifact }) => ({
        ...artifact,
        sha256: sha256Bytes(bytes),
      })),
    };
    definition.panelProfile.source = "catalog/panel-profile.json";
    const profileBytes = new TextEncoder().encode(`${JSON.stringify(profile)}\n`);
    const assets = new Map<string, Uint8Array>([
      [definition.panelProfile.source, profileBytes],
      ...structural.map(({ source, bytes }) => [source, bytes] as const),
    ]);

    const files = createPortableProjectFiles(definition, assets);
    expect(files.get(definition.panelProfile.source)).toEqual(profileBytes);
    const reopened = await openPortableProjectZip(
      createPortableProjectZip(definition, assets),
      "structure.zip",
      async () => {
        throw new Error("Bundled panel profile was not used.");
      },
    );
    try {
      expect(reopened.project.panelProfile).toEqual(profile);
      expect(reopened.assets.size).toBe(structural.length + 1);
      expect(reopened.assets.get(definition.panelProfile.source)?.bytes).toEqual(profileBytes);
      for (const { source, bytes } of structural) {
        expect(reopened.assets.get(source)?.bytes).toEqual(bytes);
      }
      const reexported = createPortableProjectFiles(
        reopened.project.sculpture,
        new Map([...reopened.assets].map(([source, asset]) => [source, asset.bytes])),
      );
      expect(reexported.get(definition.panelProfile.source)).toEqual(profileBytes);
    } finally {
      reopened.dispose();
    }
  });

  it("rejects a missing referenced file", async () => {
    const { profile, files } = await portableFixture();
    await expect(openPortableProjectFiles(
      files.slice(0, 1),
      "missing",
      async () => profile,
    )).rejects.toThrow(/missing referenced file design\/source\.glb/);
  });

  it("rejects duplicate container entries and duplicate sculpture documents", async () => {
    const { profile, files } = await portableFixture();
    await expect(openPortableProjectFiles(
      [...files, { ...files[1]!, bytes: Uint8Array.from(GLB) }],
      "duplicate-file",
      async () => profile,
    )).rejects.toThrow(/duplicate file/);
    await expect(openPortableProjectFiles(
      [
        ...files,
        {
          path: "other/sculpture.json",
          bytes: files[0]!.bytes,
        },
      ],
      "duplicate-json",
      async () => profile,
    )).rejects.toThrow(/duplicate sculpture\.json/);
  });

  it("rejects unsafe folder and ZIP paths before reading project assets", async () => {
    const { profile, files } = await portableFixture();
    await expect(openPortableProjectFiles(
      [...files, { path: "../escape.stl", bytes: new Uint8Array() }],
      "unsafe-folder",
      async () => profile,
    )).rejects.toThrow(/safe portable path/);

    const unsafeZip = zipSync({
      "project/sculpture.json": files[0]!.bytes,
      "project/design/source.glb": GLB,
      "../escape.stl": new Uint8Array(),
    });
    await expect(openPortableProjectZip(
      unsafeZip,
      "unsafe.zip",
      async () => profile,
    )).rejects.toThrow(/safe portable path/);
  });

  it("rejects hash mismatches on import and export", async () => {
    const { definition, profile, files } = await portableFixture();
    const mismatched = files.map((file) => ({ ...file }));
    mismatched[1] = {
      ...mismatched[1]!,
      bytes: new Uint8Array([...GLB.slice(0, -1), 0xff]),
    };
    await expect(openPortableProjectFiles(
      mismatched,
      "mismatched",
      async () => profile,
    )).rejects.toThrow(/failed SHA-256 verification/);
    expect(() => createPortableProjectZip(
      definition,
      new Map([["design/source.glb", mismatched[1]!.bytes]]),
    )).toThrow(/failed SHA-256 verification/);
  });

  it("rejects duplicate file names preserved in a ZIP central stream", async () => {
    const { profile, files } = await portableFixture();
    const duplicateZip = zipWithEntries([
      { name: files[0]!.path, bytes: files[0]!.bytes },
      { name: files[1]!.path, bytes: files[1]!.bytes },
      { name: files[1]!.path, bytes: files[1]!.bytes },
    ]);
    await expect(openPortableProjectZip(
      duplicateZip,
      "duplicate.zip",
      async () => profile,
    )).rejects.toThrow(/duplicate file/);
  });

  it("rejects a suspiciously compressed ZIP before project parsing", async () => {
    const { profile } = await portableFixture();
    const compressedBomb = zipSync({
      "project/sculpture.json": new Uint8Array(1024 * 1024),
    });
    await expect(openPortableProjectZip(
      compressedBomb,
      "compressed-bomb.zip",
      async () => profile,
    )).rejects.toThrow(/suspicious compression ratio/);
  });

  it("rejects URL-escaped asset paths before direct folder reopen", async () => {
    const { definition, profile, files } = await portableFixture();
    definition.designSurface!.source = "%2e%2e/secret.glb";
    const unsafeFiles = files.map((file) => file.path.endsWith("sculpture.json")
      ? { ...file, bytes: new TextEncoder().encode(JSON.stringify(definition)) }
      : file);
    await expect(openPortableProjectFiles(
      unsafeFiles,
      "project",
      async () => profile,
    )).rejects.toThrow(/safe portable path/);
  });

  it("rejects duplicate relative asset references in sculpture.json", async () => {
    const { definition } = await portableFixture();
    definition.generatedMechanics = {
      generator: { id: "test", version: "1" },
      sourceFingerprint: { algorithm: "sha256", value: "a".repeat(64) },
      status: { generation: "complete", validation: "passed" },
      boundary: {
        kind: "closed-boundary-mesh",
        format: "stl",
        source: "mechanics/shared.stl",
        sha256: "b".repeat(64),
      },
      parts: [{
        id: "part-001",
        format: "stl",
        source: "mechanics/shared.stl",
        sha256: "b".repeat(64),
      }],
    };
    expect(() => parsePanelAssemblyDefinition(definition))
      .toThrow(/duplicates project asset source/);
  });

  it("rejects asset references that collide after portable case folding", async () => {
    const { definition } = await portableFixture();
    definition.generatedMechanics = {
      generator: { id: "test", version: "1" },
      sourceFingerprint: { algorithm: "sha256", value: "a".repeat(64) },
      status: { generation: "complete", validation: "passed" },
      boundary: {
        kind: "closed-boundary-mesh",
        format: "stl",
        source: "DESIGN/SOURCE.GLB",
        sha256: "b".repeat(64),
      },
      parts: [{
        id: "part-001",
        format: "stl",
        source: "mechanics/part-001.stl",
        sha256: "c".repeat(64),
      }],
    };
    expect(() => parsePanelAssemblyDefinition(definition))
      .toThrow(/duplicates project asset source/);
  });
});
