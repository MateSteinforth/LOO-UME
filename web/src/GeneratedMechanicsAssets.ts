import { inspectStl, type StlInspection } from "../../src/cad/Stl.ts";
import {
  getGeneratedMechanicsState,
  type PanelAssemblyDefinition,
  type ProjectAssetReference,
} from "../../src/sculpture/PanelAssembly.ts";
import { sha256Bytes } from "../../src/sculpture/GeneratedMechanics.ts";
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

type FetchAsset = (input: string | URL) => Promise<Response>;

async function fetchVerifiedAsset(
  id: string,
  reference: ProjectAssetReference,
  projectUrl: URL,
  fetchAsset: FetchAsset,
): Promise<VerifiedGeneratedAsset> {
  const url = new URL(reference.source, projectUrl);
  const response = await fetchAsset(url);
  if (!response.ok) {
    throw new Error(
      `Unable to load generated STL ${reference.source}: HTTP ${response.status}.`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actualHash = sha256Bytes(bytes);
  if (actualHash !== reference.sha256) {
    throw new Error(
      `Generated STL ${reference.source} failed SHA-256 verification; expected ${reference.sha256}, received ${actualHash}.`,
    );
  }
  return {
    id,
    source: reference.source,
    url: url.href,
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
): Promise<VerifiedGeneratedMechanics | undefined> {
  const manifest = definition.generatedMechanics;
  if (!manifest) return undefined;
  const state = getGeneratedMechanicsState(definition, profile);
  if (state !== "current") {
    throw new Error(
      "Generated mechanics are stale for the current panel poses; regenerate before displaying or downloading them.",
    );
  }
  if (projectSource.startsWith("local:")) {
    throw new Error(
      "This local JSON references companion STL files; reopen it from a project folder URL to verify those assets.",
    );
  }
  const projectUrl = new URL(projectSource, baseUrl);
  const [boundary, ...parts] = await Promise.all([
    fetchVerifiedAsset(
      "boundary",
      manifest.boundary,
      projectUrl,
      fetchAsset,
    ),
    ...manifest.parts.map((part) =>
      fetchVerifiedAsset(part.id, part, projectUrl, fetchAsset)
    ),
  ]);
  return { boundary: boundary!, parts };
}
