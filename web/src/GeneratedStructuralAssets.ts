import { zipSync } from "fflate";
import {
  inspectStructuralThreeMf,
  type ThreeMfInspection,
} from "../../src/cad/CompileStructuralArtifacts.ts";
import { inspectStl, type StlInspection } from "../../src/cad/Stl.ts";
import type { PanelHardwareProfile } from "../../src/sculpture/Definition.ts";
import {
  assertPortableProjectAssetSource,
  verifyProjectAssetBytes,
} from "../../src/sculpture/GeneratedMechanics.ts";
import type { PanelAssemblyDefinition } from "../../src/sculpture/PanelAssembly.ts";
import {
  getGeneratedStructuralState,
  type GeneratedStructuralManifest,
} from "../../src/sculpture/StructuralDesign.ts";

export interface VerifiedStructuralAsset {
  id: string;
  role: GeneratedStructuralManifest["artifacts"][number]["role"];
  format: GeneratedStructuralManifest["artifacts"][number]["format"];
  source: string;
  url: string;
  bytes: Uint8Array;
  sha256: string;
  stlInspection?: StlInspection;
  threeMfInspection?: ThreeMfInspection;
}

export interface VerifiedGeneratedStructure {
  artifacts: VerifiedStructuralAsset[];
  parts: VerifiedStructuralAsset[];
  preview: VerifiedStructuralAsset;
  package: VerifiedStructuralAsset;
  analysis: VerifiedStructuralAsset;
  report: VerifiedStructuralAsset;
}

export function createGeneratedStructureZip(
  structure: Pick<VerifiedGeneratedStructure, "artifacts">,
): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const artifact of [...structure.artifacts].sort((left, right) =>
    left.source.localeCompare(right.source)
  )) {
    assertPortableProjectAssetSource(
      artifact.source,
      "Generated structural ZIP entry",
    );
    if (entries[artifact.source]) {
      throw new Error(
        `Generated structural ZIP contains duplicate path ${artifact.source}.`,
      );
    }
    entries[artifact.source] = Uint8Array.from(artifact.bytes);
  }
  return zipSync(entries, {
    level: 6,
    mtime: new Date("1980-01-01T00:00:00.000Z"),
  });
}

type FetchAsset = (input: string | URL) => Promise<Response>;

function requiredRole(
  artifacts: VerifiedStructuralAsset[],
  role: VerifiedStructuralAsset["role"],
): VerifiedStructuralAsset {
  const matches = artifacts.filter((artifact) => artifact.role === role);
  if (matches.length !== 1) {
    throw new Error(`Generated structure requires exactly one ${role} artifact.`);
  }
  return matches[0]!;
}

function validatePayload(asset: VerifiedStructuralAsset): void {
  if (asset.format === "stl") {
    asset.stlInspection = inspectStl(asset.bytes);
  } else if (asset.format === "3mf") {
    asset.threeMfInspection = inspectStructuralThreeMf(asset.bytes);
  } else if (asset.format === "json") {
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(asset.bytes));
  } else if (
    new TextDecoder("utf-8", { fatal: true }).decode(asset.bytes).trim().length === 0
  ) {
    throw new Error(`Generated structural report ${asset.source} is empty.`);
  }
}

function assertDisplayedStructureMatchesDownloads(
  parts: VerifiedStructuralAsset[],
  preview: VerifiedStructuralAsset,
  packageArtifact: VerifiedStructuralAsset,
): void {
  const previewInspection = preview.stlInspection;
  if (previewInspection?.format !== "binary") {
    throw new Error("Generated structural preview must be a binary STL assembled from its printable parts.");
  }
  const expectedBytes = parts.reduce((total, part) => {
    if (part.stlInspection?.format !== "binary") {
      throw new Error(`Generated structural part ${part.id} must be a binary STL.`);
    }
    return total + part.bytes.byteLength - 84;
  }, 0);
  if (preview.bytes.byteLength - 84 !== expectedBytes) {
    throw new Error("Generated structural preview does not exactly assemble the referenced printable parts.");
  }
  let previewOffset = 84;
  for (const part of parts) {
    for (let partOffset = 84; partOffset < part.bytes.byteLength; partOffset += 1) {
      if (preview.bytes[previewOffset] !== part.bytes[partOffset]) {
        throw new Error("Generated structural preview does not exactly assemble the referenced printable parts.");
      }
      previewOffset += 1;
    }
  }
  const packageInspection = packageArtifact.threeMfInspection;
  if (!packageInspection ||
    packageInspection.objectNames.length !== parts.length ||
    packageInspection.objectNames.some((name, index) => name !== parts[index]!.id) ||
    packageInspection.objectTriangles.some(
      (triangles, index) => triangles !== parts[index]!.stlInspection!.triangles,
    )) {
    throw new Error("Generated structural 3MF identities or triangle counts do not match the printable parts.");
  }
}

/** Loads one current, complete, hash-verified structural set for preview and export. */
export async function loadVerifiedGeneratedStructure(
  definition: PanelAssemblyDefinition,
  profile: PanelHardwareProfile,
  projectSource: string,
  fetchAsset: FetchAsset = fetch,
  baseUrl: string = globalThis.location?.href ?? "http://localhost/",
  assetUrls?: ReadonlyMap<string, string>,
): Promise<VerifiedGeneratedStructure | undefined> {
  const manifest = definition.generatedStructure;
  if (!manifest) return undefined;
  if (getGeneratedStructuralState(definition, profile) !== "current") {
    throw new Error(
      "Generated structure is stale for the current panel poses or structural inputs; regenerate before displaying or downloading it.",
    );
  }
  const projectUrl = projectSource.startsWith("local:")
    ? undefined
    : new URL(projectSource, baseUrl);
  const artifacts = await Promise.all(manifest.artifacts.map(async (reference) => {
    const resolvedUrl = assetUrls?.get(reference.source);
    if (!resolvedUrl && !projectUrl) {
      throw new Error(
        `Generated structural artifact ${reference.source} is unavailable; import the complete folder or ZIP.`,
      );
    }
    const url = resolvedUrl ?? new URL(reference.source, projectUrl!).href;
    const response = await fetchAsset(url);
    if (!response.ok) {
      throw new Error(
        `Unable to load generated structural artifact ${reference.source}: HTTP ${response.status}.`,
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const asset: VerifiedStructuralAsset = {
      id: reference.id,
      role: reference.role,
      format: reference.format,
      source: reference.source,
      url,
      bytes,
      sha256: verifyProjectAssetBytes(reference, bytes, `Generated structural artifact ${reference.id}`),
    };
    validatePayload(asset);
    return asset;
  }));
  const parts = artifacts.filter(({ role }) => role === "part");
  if (parts.length === 0) throw new Error("Generated structure requires printable part artifacts.");
  const preview = requiredRole(artifacts, "preview");
  const packageArtifact = requiredRole(artifacts, "package");
  assertDisplayedStructureMatchesDownloads(parts, preview, packageArtifact);
  return {
    artifacts,
    parts,
    preview,
    package: packageArtifact,
    analysis: requiredRole(artifacts, "analysis"),
    report: requiredRole(artifacts, "report"),
  };
}
