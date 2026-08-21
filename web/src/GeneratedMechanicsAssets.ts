import { zipSync } from "fflate";
import { inspectStl, type StlInspection } from "../../src/cad/Stl.ts";
import {
  getGeneratedMechanicsState,
  type PanelAssemblyDefinition,
  type ProjectAssetReference,
} from "../../src/sculpture/PanelAssembly.ts";
import {
  assertPortableProjectAssetSource,
  verifyProjectAssetBytes,
} from "../../src/sculpture/GeneratedMechanics.ts";
import type { PanelHardwareProfile } from "../../src/sculpture/Definition.ts";

export interface VerifiedGeneratedAsset {
  id: string;
  source: string;
  url: string;
  bytes: Uint8Array;
  sha256: string;
  inspection: StlInspection;
}

export interface VerifiedGeneratedMechanics {
  boundary: VerifiedGeneratedAsset;
  parts: VerifiedGeneratedAsset[];
}

interface GeneratedMechanicsZipAsset {
  source: string;
  bytes: Uint8Array;
}

export interface GeneratedMechanicsZipSupplement {
  path: string;
  bytes: Uint8Array;
}

export function createGeneratedMechanicsZip(
  mechanics: {
    boundary: GeneratedMechanicsZipAsset;
    parts: GeneratedMechanicsZipAsset[];
  },
  supplements: GeneratedMechanicsZipSupplement[] = [],
): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  const assets = [mechanics.boundary, ...mechanics.parts]
    .sort((left, right) =>
      left.source < right.source ? -1 : left.source > right.source ? 1 : 0
    );
  for (const asset of assets) {
    assertPortableProjectAssetSource(asset.source, "Generated STL ZIP entry");
    if (!asset.source.toLowerCase().endsWith(".stl")) {
      throw new Error(`Generated STL ZIP entry ${asset.source} must be an STL file.`);
    }
    if (entries[asset.source]) {
      throw new Error(`Generated STL ZIP contains duplicate path ${asset.source}.`);
    }
    entries[asset.source] = Uint8Array.from(asset.bytes);
  }
  for (const supplement of supplements) {
    assertPortableProjectAssetSource(
      supplement.path,
      "Generated STL ZIP supplemental entry",
    );
    if (entries[supplement.path]) {
      throw new Error(
        `Generated STL ZIP contains duplicate path ${supplement.path}.`,
      );
    }
    entries[supplement.path] = Uint8Array.from(supplement.bytes);
  }
  return zipSync(entries, {
    level: 6,
    mtime: new Date("1980-01-01T00:00:00.000Z"),
  });
}

type FetchAsset = (input: string | URL) => Promise<Response>;

async function fetchVerifiedAsset(
  id: string,
  reference: ProjectAssetReference,
  projectUrl: URL | undefined,
  fetchAsset: FetchAsset,
  assetUrls?: ReadonlyMap<string, string>,
): Promise<VerifiedGeneratedAsset> {
  const resolvedUrl = assetUrls?.get(reference.source);
  if (!resolvedUrl && !projectUrl) {
    throw new Error(
      `Generated STL ${reference.source} is unavailable from this local project; import the complete folder or ZIP.`,
    );
  }
  const url = resolvedUrl ?? new URL(reference.source, projectUrl!).href;
  const response = await fetchAsset(url);
  if (!response.ok) {
    throw new Error(
      `Unable to load generated STL ${reference.source}: HTTP ${response.status}.`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actualHash = verifyProjectAssetBytes(reference, bytes, "Generated STL");
  return {
    id,
    source: reference.source,
    url,
    bytes,
    sha256: actualHash,
    inspection: inspectStl(bytes),
  };
}

/**
 * Loads only a current complete manifest. The returned bytes are the single
 * source used by the viewer and download controls.
 */
export async function loadVerifiedGeneratedMechanics(
  definition: PanelAssemblyDefinition,
  profile: PanelHardwareProfile,
  projectSource: string,
  fetchAsset: FetchAsset = fetch,
  baseUrl: string = globalThis.location?.href ?? "http://localhost/",
  assetUrls?: ReadonlyMap<string, string>,
): Promise<VerifiedGeneratedMechanics | undefined> {
  const manifest = definition.generatedMechanics;
  if (!manifest) return undefined;
  const state = getGeneratedMechanicsState(definition, profile);
  if (state !== "current") {
    throw new Error(
      "Generated mechanics are stale for the current panel poses; regenerate before displaying or downloading them.",
    );
  }
  const projectUrl = projectSource.startsWith("local:")
    ? undefined
    : new URL(projectSource, baseUrl);
  const [boundary, ...parts] = await Promise.all([
    fetchVerifiedAsset(
      "boundary",
      manifest.boundary,
      projectUrl,
      fetchAsset,
      assetUrls,
    ),
    ...manifest.parts.map((part) =>
      fetchVerifiedAsset(part.id, part, projectUrl, fetchAsset, assetUrls)
    ),
  ]);
  return { boundary: boundary!, parts };
}
