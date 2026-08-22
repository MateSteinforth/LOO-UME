import { inspectStructuralThreeMf } from "../../src/cad/CompileStructuralArtifacts.ts";
import { inspectStl, type StlInspection } from "../../src/cad/Stl.ts";
import type { PanelHardwareProfile } from "../../src/sculpture/Definition.ts";
import { verifyProjectAssetBytes } from "../../src/sculpture/GeneratedMechanics.ts";
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
}

export interface VerifiedGeneratedStructure {
  artifacts: VerifiedStructuralAsset[];
  parts: VerifiedStructuralAsset[];
  preview: VerifiedStructuralAsset;
  package: VerifiedStructuralAsset;
  analysis: VerifiedStructuralAsset;
  report: VerifiedStructuralAsset;
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
    inspectStructuralThreeMf(asset.bytes);
  } else if (asset.format === "json") {
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(asset.bytes));
  } else if (
    new TextDecoder("utf-8", { fatal: true }).decode(asset.bytes).trim().length === 0
  ) {
    throw new Error(`Generated structural report ${asset.source} is empty.`);
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
  return {
    artifacts,
    parts,
    preview: requiredRole(artifacts, "preview"),
    package: requiredRole(artifacts, "package"),
    analysis: requiredRole(artifacts, "analysis"),
    report: requiredRole(artifacts, "report"),
  };
}
