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
  "./sculptures/rhombicosidodecahedron/sculpture.json";
export const SCULPTURE_REGISTRY_URL = "./sculptures/manifest.json";
export const PROJECT_LIBRARY_URL = "./api/project-library";
export const STATIC_PROJECT_LIBRARY_URL = "./projects/manifest.json";

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

export interface ProjectLibraryEntry {
  id: string;
  name: string;
  source: string;
  thumbnailSource?: string;
  panelCount?: number;
  revision?: string;
  filename?: string;
  location?: "demo" | "local";
  readOnly?: boolean;
  modifiedTimeMs?: number;
}

export interface ProjectLibraryRegistry {
  schemaVersion: "1.0.0";
  writable?: boolean;
  defaultSource: string;
  projects: ProjectLibraryEntry[];
  invalidPackages?: Array<{ source: string; error: string }>;
}

async function fetchProjectLibrary(source: string): Promise<Response> {
  const response = await fetch(source);
  if (
    source === PROJECT_LIBRARY_URL &&
    (response.status === 404 || !response.headers.get("content-type")?.includes("application/json"))
  ) return fetch(STATIC_PROJECT_LIBRARY_URL);
  return response;
}

export async function loadProjectLibraryRegistry(
  source = PROJECT_LIBRARY_URL,
): Promise<ProjectLibraryRegistry> {
  const response = await fetchProjectLibrary(source);
  if (!response.ok) {
    throw new Error(`Unable to load project library: HTTP ${response.status}.`);
  }
  const registry = (await readJsonResponse(
    response,
    "Project library",
  )) as Partial<ProjectLibraryRegistry>;
  if (
    registry.schemaVersion !== "1.0.0" ||
    typeof registry.defaultSource !== "string" ||
    !Array.isArray(registry.projects) || registry.projects.length === 0 ||
    registry.projects.some((entry) =>
      typeof entry.id !== "string" || entry.id.length === 0 ||
      typeof entry.name !== "string" || entry.name.length === 0 ||
      typeof entry.source !== "string" || !entry.source.endsWith(".loo.zip") ||
      (entry.thumbnailSource !== undefined && typeof entry.thumbnailSource !== "string") ||
      (entry.panelCount !== undefined && (!Number.isInteger(entry.panelCount) || entry.panelCount < 0)) ||
      (entry.revision !== undefined && !/^[0-9a-f]{64}$/.test(entry.revision)) ||
      (entry.filename !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,179}\.loo\.zip$/.test(entry.filename)) ||
      (entry.location !== undefined && entry.location !== "demo" && entry.location !== "local") ||
      (entry.readOnly !== undefined && typeof entry.readOnly !== "boolean") ||
      (entry.modifiedTimeMs !== undefined &&
        (!Number.isFinite(entry.modifiedTimeMs) || entry.modifiedTimeMs < 0))
    ) ||
    !registry.projects.some((entry) => entry.source === registry.defaultSource)
  ) {
    throw new Error("Project library is invalid.");
  }
  registry.projects.sort((left, right) =>
    (right.modifiedTimeMs ?? 0) - (left.modifiedTimeMs ?? 0) ||
    (right.location ?? "").localeCompare(left.location ?? "") ||
    left.name.localeCompare(right.name)
  );
  return registry as ProjectLibraryRegistry;
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
