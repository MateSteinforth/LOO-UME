import { unzipSync, zipSync } from "fflate";
import { sha256Bytes, sha256Text } from "../sculpture/GeneratedMechanics.ts";
import type { StructuralVector } from "../sculpture/StructuralDesign.ts";
import type { StructuralSolidMesh } from "./GenerateStructuralSolids.ts";
import { inspectStl, serializeManifoldMeshBinaryStl } from "./Stl.ts";

const TEXT = new TextEncoder();
const THREE_MF_DATE = new Date("1980-01-01T00:00:00.000Z");
const RESERVED_ARTIFACT_IDS = new Set([
  "assembly-preview", "print-package", "analysis", "engineering-report", "project",
  "panel-profile", "design-surface",
]);

export const STRUCTURAL_ARTIFACT_LIMITS = Object.freeze({
  maximumParts: 5_000,
  maximumTrianglesPerPart: 500_000,
  maximumTotalTriangles: 6_000_000,
  maximumTotalVertices: 6_000_000,
});

export interface StructuralArtifactFile {
  id: string;
  role: "part" | "preview" | "package" | "analysis" | "report" | "project" | "profile" | "source";
  format: "stl" | "3mf" | "json" | "markdown" | "glb";
  source: string;
  bytes: Uint8Array;
  sha256: string;
}

export interface StructuralArtifactManifest {
  schemaVersion: "1.0.0";
  generator: { id: "wled-orbital-lab/structural-artifacts"; version: "1.0.0" };
  sourceFingerprint: { algorithm: "sha256"; value: string };
  unit: "millimeter";
  packageTransformMm: StructuralVector;
  parts: Array<{ partId: string; artifactId: string; source: string }>;
  artifacts: Array<{
    id: string;
    role: StructuralArtifactFile["role"];
    format: StructuralArtifactFile["format"];
    source: string;
    byteLength: number;
    sha256: string;
  }>;
}

export interface CompiledStructuralArtifactBundle {
  manifest: StructuralArtifactManifest;
  manifestSource: "structure/artifacts.json";
  manifestBytes: Uint8Array;
  files: StructuralArtifactFile[];
}

export interface ThreeMfInspection {
  unit: "millimeter";
  objectNames: string[];
  objectTriangles: number[];
  buildObjectIds: number[];
  transformMm: StructuralVector;
  boundsMm: { min: StructuralVector; max: StructuralVector };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function number(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Structural artifact contains a non-finite number.");
  return Math.abs(value) < 1e-12 ? "0" : Number(value.toFixed(9)).toString();
}

function xml(value: string): string {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
    throw new Error("Structural part identity contains a character forbidden by XML 1.0.");
  }
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function unxml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

function slug(partId: string): string {
  const base = partId.normalize("NFC").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "structural-part";
  return base.length <= 120 ? base : `${base.slice(0, 101)}-${sha256Text(partId).slice(0, 16)}`;
}

function vertices(mesh: StructuralSolidMesh): StructuralVector[] {
  if (mesh.vertProperties.length % 3 !== 0) {
    throw new Error(`Structural mesh ${mesh.partId} does not have packed XYZ vertices.`);
  }
  const result: StructuralVector[] = [];
  for (let index = 0; index < mesh.vertProperties.length; index += 3) {
    const point: StructuralVector = [
      mesh.vertProperties[index]!,
      mesh.vertProperties[index + 1]!,
      mesh.vertProperties[index + 2]!,
    ];
    if (point.some((value) => !Number.isFinite(value))) {
      throw new Error(`Structural mesh ${mesh.partId} contains a non-finite vertex.`);
    }
    result.push(point);
  }
  return result;
}

function assertSourceMesh(mesh: StructuralSolidMesh): void {
  if (!mesh.partId || mesh.status !== "NoError" || mesh.volumeCubicMm <= 0) {
    throw new Error(`Structural mesh ${mesh.partId || "<empty>"} is not a validated positive Manifold solid.`);
  }
  const points = vertices(mesh);
  if (mesh.triVerts.length === 0 || mesh.triVerts.length % 3 !== 0) {
    throw new Error(`Structural mesh ${mesh.partId} has no complete triangles.`);
  }
  for (let index = 0; index < mesh.triVerts.length; index += 3) {
    const triangle = [mesh.triVerts[index]!, mesh.triVerts[index + 1]!, mesh.triVerts[index + 2]!];
    if (triangle.some((vertex) => !Number.isInteger(vertex) || !points[vertex])) {
      throw new Error(`Structural mesh ${mesh.partId} references an unknown vertex.`);
    }
    const [a, b, c] = triangle.map((vertex) => points[vertex]!) as [
      StructuralVector, StructuralVector, StructuralVector,
    ];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const area2 = Math.hypot(
      ab[1]! * ac[2]! - ab[2]! * ac[1]!,
      ab[2]! * ac[0]! - ab[0]! * ac[2]!,
      ab[0]! * ac[1]! - ab[1]! * ac[0]!,
    );
    if (area2 <= 1e-10) throw new Error(`Structural mesh ${mesh.partId} has a degenerate triangle.`);
  }
}

function combinedPreview(meshes: StructuralSolidMesh[]): {
  vertProperties: Float32Array;
  triVerts: Uint32Array;
} {
  const vertexValues: number[] = [];
  const triangleValues: number[] = [];
  let vertexOffset = 0;
  for (const mesh of meshes) {
    for (const value of mesh.vertProperties) vertexValues.push(value);
    for (const vertex of mesh.triVerts) triangleValues.push(vertex + vertexOffset);
    vertexOffset += mesh.vertProperties.length / 3;
  }
  return {
    vertProperties: Float32Array.from(vertexValues),
    triVerts: Uint32Array.from(triangleValues),
  };
}

function packageTransform(meshes: StructuralSolidMesh[]): StructuralVector {
  const minimum: StructuralVector = [Infinity, Infinity, Infinity];
  for (const mesh of meshes) {
    for (const point of vertices(mesh)) {
      for (let axis = 0; axis < 3; axis += 1) {
        minimum[axis] = Math.min(minimum[axis]!, point[axis]!);
      }
    }
  }
  return minimum.map((value) => Number(number(Math.max(0, -value)))) as StructuralVector;
}

function serializeThreeMf(meshes: StructuralSolidMesh[], transformMm: StructuralVector): Uint8Array {
  const objects = meshes.map((mesh, index) => {
    const points = vertices(mesh);
    const vertexXml = points.map((point) =>
      `        <vertex x="${number(point[0])}" y="${number(point[1])}" z="${number(point[2])}"/>`
    ).join("\n");
    const triangleXml: string[] = [];
    for (let triangle = 0; triangle < mesh.triVerts.length; triangle += 3) {
      triangleXml.push(
        `        <triangle v1="${mesh.triVerts[triangle]}" v2="${mesh.triVerts[triangle + 1]}" v3="${mesh.triVerts[triangle + 2]}"/>`,
      );
    }
    return [
      `    <object id="${index + 1}" name="${xml(mesh.partId)}" type="model">`,
      "      <mesh>",
      "      <vertices>",
      vertexXml,
      "      </vertices>",
      "      <triangles>",
      triangleXml.join("\n"),
      "      </triangles>",
      "      </mesh>",
      "    </object>",
    ].join("\n");
  }).join("\n");
  const transform = `1 0 0 0 1 0 0 0 1 ${transformMm.map(number).join(" ")}`;
  const build = meshes.map((_, index) =>
    `    <item objectid="${index + 1}" transform="${transform}"/>`
  ).join("\n");
  const model = TEXT.encode([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    '  <metadata name="Application">LOO/UME</metadata>',
    "  <resources>",
    objects,
    "  </resources>",
    "  <build>",
    build,
    "  </build>",
    "</model>",
    "",
  ].join("\n"));
  const entries: Record<string, Uint8Array> = {
    "[Content_Types].xml": TEXT.encode([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '  <Override PartName="/3D/3dmodel.model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>',
      "</Types>",
      "",
    ].join("\n")),
    "_rels/.rels": TEXT.encode([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
      '  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>',
      "</Relationships>",
      "",
    ].join("\n")),
    "3D/3dmodel.model": model,
  };
  return zipSync(entries, { level: 6, mtime: THREE_MF_DATE });
}

function parseNumbers(match: RegExpMatchArray, offset: number, count: number): number[] {
  const values = Array.from({ length: count }, (_, index) => Number(match[offset + index]));
  if (values.some((value) => !Number.isFinite(value))) throw new Error("3MF contains a non-finite number.");
  return values;
}

export function inspectStructuralThreeMf(bytes: Uint8Array): ThreeMfInspection {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (error) {
    throw new Error(`3MF ZIP package is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  const expected = ["3D/3dmodel.model", "[Content_Types].xml", "_rels/.rels"];
  if (Object.keys(entries).sort(compareText).join("\n") !== expected.sort(compareText).join("\n")) {
    throw new Error("3MF package must contain exactly the model, content-types, and root-relationship parts.");
  }
  const contentTypes = new TextDecoder().decode(entries["[Content_Types].xml"]!);
  const relationships = new TextDecoder().decode(entries["_rels/.rels"]!);
  const model = new TextDecoder().decode(entries["3D/3dmodel.model"]!);
  if (!contentTypes.includes("application/vnd.ms-package.3dmanufacturing-3dmodel+xml")) {
    throw new Error("3MF package does not declare the core model content type.");
  }
  if (!relationships.includes('Target="/3D/3dmodel.model"') ||
    !relationships.includes("http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel")) {
    throw new Error("3MF package does not identify its required start model.");
  }
  if (/<!DOCTYPE/i.test(model) || !/<model\s+unit="millimeter"/.test(model)) {
    throw new Error("3MF model must be UTF-8 core XML in millimetres without a DTD.");
  }
  const objectNames: string[] = [];
  const objectTriangles: number[] = [];
  const objectIds: number[] = [];
  const rawMinimum: StructuralVector = [Infinity, Infinity, Infinity];
  const rawMaximum: StructuralVector = [-Infinity, -Infinity, -Infinity];
  const objectPattern = /<object id="(\d+)" name="([^"]+)" type="model">([\s\S]*?)<\/object>/g;
  for (const objectMatch of model.matchAll(objectPattern)) {
    const objectId = Number(objectMatch[1]);
    const body = objectMatch[3]!;
    const points = [...body.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)]
      .map((match) => parseNumbers(match, 1, 3) as StructuralVector);
    if (points.length < 4) throw new Error(`3MF object ${objectId} has too few vertices.`);
    let triangleCount = 0;
    for (const triangle of body.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)) {
      const indices = parseNumbers(triangle, 1, 3);
      if (indices.some((index) => !Number.isInteger(index) || !points[index])) {
        throw new Error(`3MF object ${objectId} references an unknown vertex.`);
      }
      const [a, b, c] = indices.map((index) => points[index]!) as [
        StructuralVector, StructuralVector, StructuralVector,
      ];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      if (Math.hypot(
        ab[1]! * ac[2]! - ab[2]! * ac[1]!,
        ab[2]! * ac[0]! - ab[0]! * ac[2]!,
        ab[0]! * ac[1]! - ab[1]! * ac[0]!,
      ) <= 1e-10) throw new Error(`3MF object ${objectId} contains a degenerate triangle.`);
      triangleCount += 1;
    }
    if (triangleCount < 4) throw new Error(`3MF object ${objectId} has too few triangles.`);
    objectIds.push(objectId);
    objectNames.push(unxml(objectMatch[2]!));
    objectTriangles.push(triangleCount);
    for (const point of points) for (let axis = 0; axis < 3; axis += 1) {
      rawMinimum[axis] = Math.min(rawMinimum[axis]!, point[axis]!);
      rawMaximum[axis] = Math.max(rawMaximum[axis]!, point[axis]!);
    }
  }
  if (objectIds.length === 0 || new Set(objectIds).size !== objectIds.length) {
    throw new Error("3MF model requires uniquely identified mesh objects.");
  }
  const itemPattern = /<item objectid="(\d+)" transform="1 0 0 0 1 0 0 0 1 ([^\s]+) ([^\s]+) ([^\s]+)"\/>/g;
  const items = [...model.matchAll(itemPattern)];
  const buildObjectIds = items.map((match) => Number(match[1]));
  if (buildObjectIds.length !== objectIds.length ||
    buildObjectIds.some((id, index) => id !== objectIds[index])) {
    throw new Error("3MF build must reference every mesh object once in stable order.");
  }
  const transforms = items.map((match) => parseNumbers(match, 2, 3) as StructuralVector);
  if (transforms.some((value) => value.some((axis, index) => axis !== transforms[0]![index]))) {
    throw new Error("3MF build objects must share one assembly transform.");
  }
  const transformMm = transforms[0]!;
  const boundsMm = {
    min: [0, 1, 2].map((axis) => rawMinimum[axis]! + transformMm[axis]!) as StructuralVector,
    max: [0, 1, 2].map((axis) => rawMaximum[axis]! + transformMm[axis]!) as StructuralVector,
  };
  if (boundsMm.min.some((value) => value < -1e-6)) {
    throw new Error("3MF build transform does not place the assembly in the positive build octant.");
  }
  return {
    unit: "millimeter",
    objectNames,
    objectTriangles,
    buildObjectIds,
    transformMm,
    boundsMm,
  };
}

function artifact(
  id: string,
  role: StructuralArtifactFile["role"],
  format: StructuralArtifactFile["format"],
  source: string,
  bytes: Uint8Array,
): StructuralArtifactFile {
  return { id, role, format, source, bytes, sha256: sha256Bytes(bytes) };
}

function manifestBytes(manifest: StructuralArtifactManifest): Uint8Array {
  return TEXT.encode(`${JSON.stringify(manifest, null, 2)}\n`);
}

export function createStructuralArtifactFile(
  id: string,
  role: StructuralArtifactFile["role"],
  format: StructuralArtifactFile["format"],
  source: string,
  bytes: Uint8Array,
): StructuralArtifactFile {
  return artifact(id, role, format, source, Uint8Array.from(bytes));
}

export function extendStructuralArtifactBundle(
  base: CompiledStructuralArtifactBundle,
  additionalFiles: StructuralArtifactFile[],
): CompiledStructuralArtifactBundle {
  validateStructuralArtifactBundle(base);
  const files = [...base.files, ...additionalFiles]
    .sort((left, right) => compareText(left.source, right.source));
  const manifest: StructuralArtifactManifest = {
    ...base.manifest,
    artifacts: files.map(({ id, role, format, source, bytes, sha256 }) => ({
      id, role, format, source, byteLength: bytes.byteLength, sha256,
    })),
  };
  const result: CompiledStructuralArtifactBundle = {
    manifest,
    manifestSource: base.manifestSource,
    manifestBytes: manifestBytes(manifest),
    files,
  };
  validateStructuralArtifactBundle(result);
  return result;
}

export function compileStructuralArtifactBundle(
  sourceFingerprint: { algorithm: "sha256"; value: string },
  inputMeshes: StructuralSolidMesh[],
): CompiledStructuralArtifactBundle {
  if (!/^[0-9a-f]{64}$/.test(sourceFingerprint.value)) {
    throw new Error("Structural artifact source fingerprint must be lowercase SHA-256.");
  }
  const meshes = [...inputMeshes].sort((left, right) => compareText(left.partId, right.partId));
  if (meshes.length === 0 || new Set(meshes.map(({ partId }) => partId)).size !== meshes.length) {
    throw new Error("Structural artifact compilation requires unique non-empty parts.");
  }
  if (meshes.length > STRUCTURAL_ARTIFACT_LIMITS.maximumParts) {
    throw new Error(
      `Structural artifact compilation permits at most ${STRUCTURAL_ARTIFACT_LIMITS.maximumParts} parts; received ${meshes.length}.`,
    );
  }
  const reserved = meshes.find(({ partId }) => RESERVED_ARTIFACT_IDS.has(partId));
  if (reserved) throw new Error(`Structural part ID ${reserved.partId} is reserved for a bundle artifact.`);
  const totalTriangles = meshes.reduce((total, mesh) => total + mesh.triVerts.length / 3, 0);
  const totalVertices = meshes.reduce((total, mesh) => total + mesh.vertProperties.length / 3, 0);
  const oversized = meshes.find((mesh) =>
    mesh.triVerts.length / 3 > STRUCTURAL_ARTIFACT_LIMITS.maximumTrianglesPerPart
  );
  if (oversized) {
    throw new Error(
      `Structural part ${oversized.partId} exceeds the ${STRUCTURAL_ARTIFACT_LIMITS.maximumTrianglesPerPart}-triangle limit.`,
    );
  }
  if (totalTriangles > STRUCTURAL_ARTIFACT_LIMITS.maximumTotalTriangles ||
    totalVertices > STRUCTURAL_ARTIFACT_LIMITS.maximumTotalVertices) {
    throw new Error(
      `Structural artifacts exceed the in-memory limit: ${totalTriangles} triangles and ${totalVertices} vertices; ` +
      `limits are ${STRUCTURAL_ARTIFACT_LIMITS.maximumTotalTriangles} and ${STRUCTURAL_ARTIFACT_LIMITS.maximumTotalVertices}.`,
    );
  }
  meshes.forEach(assertSourceMesh);
  const slugs = meshes.map(({ partId }) => slug(partId));
  if (new Set(slugs).size !== slugs.length) throw new Error("Structural part IDs produce colliding file names.");
  const files: StructuralArtifactFile[] = meshes.map((mesh, index) => {
    const bytes = serializeManifoldMeshBinaryStl(slugs[index]!, mesh.vertProperties, mesh.triVerts);
    const inspection = inspectStl(bytes);
    if (inspection.triangles !== mesh.triVerts.length / 3) {
      throw new Error(`STL round-trip changed triangle count for ${mesh.partId}.`);
    }
    return artifact(mesh.partId, "part", "stl", `structure/parts/${slugs[index]}.stl`, bytes);
  });
  const preview = combinedPreview(meshes);
  const previewBytes = serializeManifoldMeshBinaryStl(
    "structural-assembly-preview",
    preview.vertProperties,
    preview.triVerts,
  );
  if (inspectStl(previewBytes).triangles !== preview.triVerts.length / 3) {
    throw new Error("Assembly preview STL round-trip changed triangle count.");
  }
  files.push(artifact(
    "assembly-preview", "preview", "stl", "structure/assembly-preview.stl", previewBytes,
  ));
  const packageTransformMm = packageTransform(meshes);
  const packageBytes = serializeThreeMf(meshes, packageTransformMm);
  const packageInspection = inspectStructuralThreeMf(packageBytes);
  if (packageInspection.objectNames.join("\n") !== meshes.map(({ partId }) => partId).join("\n") ||
    packageInspection.objectTriangles.some((count, index) => count !== meshes[index]!.triVerts.length / 3)) {
    throw new Error("3MF round-trip changed part identities or triangle counts.");
  }
  files.push(artifact(
    "print-package", "package", "3mf", "structure/structure.model.3mf", packageBytes,
  ));
  const manifest: StructuralArtifactManifest = {
    schemaVersion: "1.0.0",
    generator: { id: "wled-orbital-lab/structural-artifacts", version: "1.0.0" },
    sourceFingerprint: { ...sourceFingerprint },
    unit: "millimeter",
    packageTransformMm,
    parts: meshes.map((mesh, index) => ({
      partId: mesh.partId,
      artifactId: mesh.partId,
      source: `structure/parts/${slugs[index]}.stl`,
    })),
    artifacts: files.map(({ id, role, format, source, bytes, sha256 }) => ({
      id, role, format, source, byteLength: bytes.byteLength, sha256,
    })),
  };
  const encodedManifest = manifestBytes(manifest);
  const bundle = {
    manifest,
    manifestSource: "structure/artifacts.json" as const,
    manifestBytes: encodedManifest,
    files,
  };
  validateStructuralArtifactBundle(bundle);
  return bundle;
}

export function validateStructuralArtifactBundle(bundle: CompiledStructuralArtifactBundle): void {
  if (bundle.manifestSource !== "structure/artifacts.json" ||
    bundle.manifest.schemaVersion !== "1.0.0" ||
    bundle.manifest.generator.id !== "wled-orbital-lab/structural-artifacts" ||
    bundle.manifest.generator.version !== "1.0.0" ||
    bundle.manifest.unit !== "millimeter" ||
    bundle.manifest.sourceFingerprint.algorithm !== "sha256" ||
    !/^[0-9a-f]{64}$/.test(bundle.manifest.sourceFingerprint.value)) {
    throw new Error("Structural artifact manifest has an unsupported identity, version, unit, or fingerprint.");
  }
  const parsed = JSON.parse(new TextDecoder().decode(bundle.manifestBytes)) as StructuralArtifactManifest;
  if (JSON.stringify(parsed) !== JSON.stringify(bundle.manifest)) {
    throw new Error("Structural artifact manifest bytes do not match the in-memory manifest.");
  }
  const references = bundle.manifest.artifacts;
  if (references.length !== bundle.files.length ||
    new Set(references.map(({ source }) => source)).size !== references.length ||
    new Set(references.map(({ id }) => id)).size !== references.length) {
    throw new Error("Structural artifact manifest does not reference one unique ID and path per file.");
  }
  const partReferences = references.filter(({ role, format }) => role === "part" && format === "stl");
  const expectedFormats = new Map<StructuralArtifactFile["role"], StructuralArtifactFile["format"]>([
    ["part", "stl"], ["preview", "stl"], ["package", "3mf"],
    ["analysis", "json"], ["report", "markdown"], ["project", "json"],
    ["profile", "json"], ["source", "glb"],
  ]);
  if (partReferences.length === 0 ||
    references.filter(({ id, role, format }) =>
      id === "assembly-preview" && role === "preview" && format === "stl"
    ).length !== 1 ||
    references.filter(({ id, role, format }) =>
      id === "print-package" && role === "package" && format === "3mf"
    ).length !== 1 ||
    references.some(({ role, format }) => expectedFormats.get(role) !== format) ||
    references.filter(({ role }) => role === "analysis").length > 1 ||
    references.filter(({ role }) => role === "report").length > 1 ||
    references.filter(({ role }) => role === "project").length > 1 ||
    references.filter(({ role }) => role === "profile").length > 1 ||
    references.filter(({ role }) => role === "source").length > 1 ||
    (references.some(({ role }) => role === "analysis") !==
      references.some(({ role }) => role === "report"))) {
    throw new Error("Structural artifact manifest requires STL parts, one STL preview, and one 3MF package.");
  }
  for (const file of bundle.files) {
    const reference = references.find(({ id, source }) => id === file.id && source === file.source);
    if (!reference || reference.role !== file.role || reference.format !== file.format ||
      reference.byteLength !== file.bytes.byteLength || reference.sha256 !== sha256Bytes(file.bytes) ||
      file.sha256 !== reference.sha256) {
      throw new Error(`Structural artifact ${file.source} failed manifest hash or identity validation.`);
    }
    if (file.format === "stl") inspectStl(file.bytes);
    else if (file.format === "3mf") inspectStructuralThreeMf(file.bytes);
    else if (file.format === "json") JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(file.bytes));
    else if (file.format === "glb") {
      if (file.bytes.byteLength < 12) throw new Error(`Structural source ${file.source} is not a complete GLB.`);
      const view = new DataView(file.bytes.buffer, file.bytes.byteOffset, file.bytes.byteLength);
      if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 ||
        view.getUint32(8, true) !== file.bytes.byteLength) {
        throw new Error(`Structural source ${file.source} is not a binary glTF 2.0 GLB.`);
      }
    }
    else if (new TextDecoder("utf-8", { fatal: true }).decode(file.bytes).trim().length === 0) {
      throw new Error(`Structural report ${file.source} is empty.`);
    }
  }
  const partSources = new Set(bundle.manifest.parts.map(({ source }) => source));
  const filePartSources = new Set(bundle.files.filter(({ role }) => role === "part").map(({ source }) => source));
  if (partSources.size !== bundle.manifest.parts.length ||
    partSources.size !== filePartSources.size ||
    [...partSources].some((source) => !filePartSources.has(source))) {
    throw new Error("Structural part identities do not match the published STL set.");
  }
}
