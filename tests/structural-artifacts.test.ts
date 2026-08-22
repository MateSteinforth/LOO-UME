import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFile as readProjectFile } from "node:fs/promises";
import {
  compileStructuralArtifactBundle,
  inspectStructuralThreeMf,
  STRUCTURAL_ARTIFACT_LIMITS,
  validateStructuralArtifactBundle,
  type CompiledStructuralArtifactBundle,
} from "../src/cad/CompileStructuralArtifacts.ts";
import { buildStructuralSolids, type StructuralSolidMesh } from "../src/cad/GenerateStructuralSolids.ts";
import {
  publishStructuralArtifactBundle,
} from "../src/cad/PublishStructuralArtifacts.ts";
import { inspectStl } from "../src/cad/Stl.ts";
import { createPanelAssemblyProject, parsePanelAssemblyDefinition } from "../src/sculpture/PanelAssembly.ts";
import { normalizeStructuralDesign } from "../src/sculpture/StructuralDesign.ts";
import { createCandidateTruss } from "../src/structure/CandidateTruss.ts";
import { optimizeStructuralTruss } from "../src/structure/TrussOptimizer.ts";

let meshes: StructuralSolidMesh[];
let bundle: CompiledStructuralArtifactBundle;
const temporaryRoots: string[] = [];

beforeAll(async () => {
  const path = "sculptures/pose-only-two-panel/sculpture.json";
  const definition = parsePanelAssemblyDefinition(JSON.parse(await readProjectFile(path, "utf8")));
  const normalized = normalizeStructuralDesign(createPanelAssemblyProject(definition, path));
  const optimized = optimizeStructuralTruss(normalized, createCandidateTruss(normalized));
  meshes = await buildStructuralSolids(normalized, optimized);
  bundle = compileStructuralArtifactBundle(normalized.sourceFingerprint, meshes);
}, 60_000);

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })
  ));
});

describe("structural STL, 3MF, and preview artifacts", () => {
  it("serializes stable per-part STL files and one exact-mesh assembly preview", () => {
    const partFiles = bundle.files.filter(({ role }) => role === "part");
    const preview = bundle.files.find(({ role }) => role === "preview")!;

    expect(partFiles).toHaveLength(meshes.length);
    expect(bundle.manifest.parts.map(({ partId }) => partId)).toEqual(
      [...meshes].sort((left, right) => left.partId.localeCompare(right.partId)).map(({ partId }) => partId),
    );
    for (const file of partFiles) {
      const source = meshes.find(({ partId }) => partId === file.id)!;
      const inspection = inspectStl(file.bytes);
      expect(inspection.format).toBe("binary");
      expect(inspection.triangles).toBe(source.triVerts.length / 3);
      inspection.bounds.minimum.forEach((value, axis) =>
        expect(value).toBeCloseTo(source.boundingBoxMm.min[axis]!, 4)
      );
      inspection.bounds.maximum.forEach((value, axis) =>
        expect(value).toBeCloseTo(source.boundingBoxMm.max[axis]!, 4)
      );
    }
    expect(inspectStl(preview.bytes).triangles).toBe(
      meshes.reduce((total, mesh) => total + mesh.triVerts.length / 3, 0),
    );
  });

  it("creates a millimetre core 3MF package with stable identities and transforms", () => {
    const packageFile = bundle.files.find(({ role }) => role === "package")!;
    const inspection = inspectStructuralThreeMf(packageFile.bytes);

    expect(inspection.unit).toBe("millimeter");
    expect(inspection.objectNames).toEqual(bundle.manifest.parts.map(({ partId }) => partId));
    expect(inspection.buildObjectIds).toEqual(
      inspection.objectNames.map((_, index) => index + 1),
    );
    expect(inspection.transformMm).toEqual(bundle.manifest.packageTransformMm);
    expect(inspection.boundsMm.min.every((value) => value >= -1e-6)).toBe(true);
  });

  it("produces identical bytes and hashes for reordered equivalent meshes", () => {
    const repeated = compileStructuralArtifactBundle(
      bundle.manifest.sourceFingerprint,
      [...meshes].reverse(),
    );

    expect(repeated.manifestBytes).toEqual(bundle.manifestBytes);
    expect(repeated.files.map(({ source, sha256, bytes }) => ({ source, sha256, bytes })))
      .toEqual(bundle.files.map(({ source, sha256, bytes }) => ({ source, sha256, bytes })));
  }, 30_000);

  it("rejects a tampered artifact before publication", () => {
    const tampered = structuredClone(bundle);
    tampered.files[0]!.bytes[0] ^= 0xff;

    expect(() => validateStructuralArtifactBundle(tampered)).toThrow(/failed manifest hash/);
  });

  it("publishes a complete validated set with the manifest written last", async () => {
    const root = await mkdtemp(join(tmpdir(), "structural-artifacts-"));
    temporaryRoots.push(root);
    const result = await publishStructuralArtifactBundle(bundle, {
      artifactRootDirectory: root,
      directoryName: "published",
    });

    expect(new Uint8Array(await readFile(result.manifestPath))).toEqual(bundle.manifestBytes);
    expect(result.artifactPaths).toHaveLength(bundle.files.length);
    for (const [index, path] of result.artifactPaths.entries()) {
      expect(new Uint8Array(await readFile(path))).toEqual(bundle.files[index]!.bytes);
    }
  }, 30_000);

  it("rejects reserved IDs and resource counts before allocation", () => {
    expect(() => compileStructuralArtifactBundle(
      bundle.manifest.sourceFingerprint,
      [{ ...meshes[0]!, partId: "assembly-preview" }],
    )).toThrow(/reserved/);
    const tooMany = Array.from(
      { length: STRUCTURAL_ARTIFACT_LIMITS.maximumParts + 1 },
      (_, index) => ({ ...meshes[0]!, partId: `bounded-part-${index}` }),
    );
    expect(() => compileStructuralArtifactBundle(bundle.manifest.sourceFingerprint, tooMany))
      .toThrow(/permits at most/);
  });

  it("refuses to replace an unrelated existing directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "structural-scope-"));
    temporaryRoots.push(root);
    const output = join(root, "published");
    await mkdir(output);
    await writeFile(join(output, "unrelated.txt"), "preserve me");

    await expect(publishStructuralArtifactBundle(bundle, {
      artifactRootDirectory: root,
      directoryName: "published",
    })).rejects.toThrow(/not a complete generator-owned/);
    expect(await readFile(join(output, "unrelated.txt"), "utf8")).toBe("preserve me");
  });

  it("restores the prior directory if final promotion fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "structural-rollback-"));
    temporaryRoots.push(root);
    const output = join(root, "published");
    await publishStructuralArtifactBundle(bundle, {
      artifactRootDirectory: root,
      directoryName: "published",
    });
    const priorManifest = new Uint8Array(await readFile(join(output, bundle.manifestSource)));
    let moves = 0;

    await expect(publishStructuralArtifactBundle(bundle, {
      artifactRootDirectory: root,
      directoryName: "published",
      moveDirectory: async (source, destination) => {
        moves += 1;
        if (moves === 2) throw new Error("injected promotion failure");
        await rename(source, destination);
      },
    })).rejects.toThrow(/injected promotion failure/);

    expect(new Uint8Array(await readFile(join(output, bundle.manifestSource))))
      .toEqual(priorManifest);
  }, 30_000);
});
