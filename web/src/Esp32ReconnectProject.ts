import {
  openPortableProjectZip,
  type LoadPortablePanelProfile,
  type PortableProjectBundle,
} from "./PortableProject.ts";
import {
  createProjectPackageZip,
  readProjectPackageSummary,
} from "./ProjectPackage.ts";
import type { PanelAssemblyProject } from "../../src/sculpture/PanelAssembly.ts";
import { assertPortableProjectAssetSource } from "../../src/sculpture/GeneratedMechanics.ts";
import { rememberDesktopEsp32Reconnect } from "./Esp32Setup.ts";

const ENDPOINT = "/api/esp32-reconnect-project";

export function createEsp32ReconnectProject(
  project: PanelAssemblyProject,
  availableAssets: ReadonlyMap<string, Uint8Array>,
): Uint8Array {
  const definition = structuredClone(project.sculpture);
  const assets = new Map(availableAssets);
  try {
    assertPortableProjectAssetSource(
      definition.panelProfile.source,
      "Panel profile",
    );
    assets.set(
      definition.panelProfile.source,
      new TextEncoder().encode(JSON.stringify(project.panelProfile)),
    );
  } catch {
    // Preserve catalog references because address fingerprints include the source.
    assets.delete(definition.panelProfile.source);
  }
  return createProjectPackageZip(definition, assets);
}

export async function loadEsp32ReconnectProject(
  loadProfile: LoadPortablePanelProfile,
  request: typeof fetch = fetch,
): Promise<PortableProjectBundle | undefined> {
  const response = await request(ENDPOINT, {
    headers: { "X-LOO-UME-ESP32": "1" },
  });
  if (response.status === 404 || response.status === 405) return undefined;
  if (!response.ok) {
    throw new Error(
      `ESP32 startup project read failed with HTTP ${response.status}.`,
    );
  }
  // Static browser hosts can return the application HTML for an unknown path.
  if (response.headers.get("content-type")?.startsWith("text/html"))
    return undefined;
  const bytes = new Uint8Array(await response.arrayBuffer());
  readProjectPackageSummary(bytes);
  return openPortableProjectZip(bytes, "esp32-startup.loo.zip", loadProfile);
}

export async function saveEsp32ReconnectProject(
  bytes: Uint8Array,
  request: typeof fetch = fetch,
): Promise<boolean> {
  const response = await request(ENDPOINT, {
    method: "PUT",
    headers: {
      "X-LOO-UME-ESP32": "1",
      "Content-Type": "application/zip",
    },
    body: Uint8Array.from(bytes),
  });
  if (response.status === 404 || response.status === 405) return false;
  if (!response.ok) {
    throw new Error(
      `ESP32 startup project save failed with HTTP ${response.status}.`,
    );
  }
  return true;
}

export async function rememberEsp32ReconnectProject(
  bytes: Uint8Array,
  request: typeof fetch = fetch,
): Promise<void> {
  if (await saveEsp32ReconnectProject(bytes, request)) {
    await rememberDesktopEsp32Reconnect(request);
  }
}
