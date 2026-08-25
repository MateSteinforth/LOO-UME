import {
  createPanelAssemblyMapping,
  loadPanelAssemblyProject,
  type PanelAssemblyDefinition,
  type PanelAssemblyProject,
} from "../../src/sculpture/PanelAssembly.ts";
import {
  createHardwareMappingContract,
  type HardwareMappingContract,
} from "./HardwareMapping.ts";
import { readJsonResponse } from "./JsonResponse.ts";
import { createProvisionalWiringPreview } from "./WiringPreview.ts";

export const DEFAULT_SCULPTURE_JSON =
  "./sculptures/pose-only-rhombicosidodecahedron/sculpture.json";
export const SCULPTURE_REGISTRY_URL = "./sculptures/manifest.json";

export interface SculptureRegistryEntry {
  id: string;
  name: string;
  source: string;
}

export interface SculptureRegistry {
  schemaVersion: "1.0.0";
  defaultSource: string;
  sculptures: SculptureRegistryEntry[];
}

export interface LoadedSculpture {
  definition: PanelAssemblyDefinition;
  project: PanelAssemblyProject;
  contract: HardwareMappingContract;
}

export async function loadSculptureRegistry(
  source = SCULPTURE_REGISTRY_URL,
): Promise<SculptureRegistry> {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(
      "Unable to load sculpture registry: HTTP " + response.status + ".",
    );
  }
  const registry = (await readJsonResponse(
    response,
    "Sculpture registry",
  )) as Partial<SculptureRegistry>;
  if (
    registry.schemaVersion !== "1.0.0" ||
    !Array.isArray(registry.sculptures) ||
    registry.sculptures.length === 0 ||
    registry.sculptures.some(
      (entry) =>
        typeof entry.id !== "string" ||
        typeof entry.name !== "string" ||
        typeof entry.source !== "string",
    )
  ) {
    throw new Error("Sculpture registry is invalid.");
  }
  return registry as SculptureRegistry;
}

export function createLoadedSculpture(
  project: PanelAssemblyProject,
): LoadedSculpture {
  const geometry = createPanelAssemblyMapping(project);
  const wiring = createProvisionalWiringPreview(
    geometry,
    project.sculpture,
    project.panelProfile,
  );
  return {
    definition: project.sculpture,
    project,
    contract: createHardwareMappingContract(
      geometry,
      wiring,
      project.panelProfile,
    ),
  };
}

export async function loadSculptureContract(
  source: string,
): Promise<LoadedSculpture> {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(
      "Unable to load sculpture JSON " + source + ": HTTP " + response.status + ".",
    );
  }
  const sculptureInput = await readJsonResponse(response, "Sculpture JSON");
  const project = await loadPanelAssemblyProject(
    sculptureInput,
    source,
    async (reference) => {
      const profileUrl = new URL(reference.source, response.url);
      const profileResponse = await fetch(profileUrl);
      if (!profileResponse.ok) {
        throw new Error(
          "Unable to load panel profile " +
            reference.id +
            ": HTTP " +
            profileResponse.status +
            ".",
        );
      }
      return readJsonResponse(profileResponse, "Panel profile");
    },
  );
  return createLoadedSculpture(project);
}

export async function loadStagedPanelProfile(
  reference: PanelAssemblyDefinition["panelProfile"],
): Promise<unknown> {
  const profileResponse = await fetch(
    new URL(`./catalog/panels/${reference.id}.json`, document.baseURI),
  );
  if (!profileResponse.ok) {
    throw new Error(
      `Unable to find panel profile ${reference.id} in the staged catalog.`,
    );
  }
  return readJsonResponse(profileResponse, "Panel profile");
}

export async function loadLocalSculpture(file: File): Promise<LoadedSculpture> {
  const input: unknown = JSON.parse(await file.text());
  const project = await loadPanelAssemblyProject(
    input,
    `local:${file.name}`,
    loadStagedPanelProfile,
  );
  return createLoadedSculpture(project);
}
