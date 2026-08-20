import {
  compilePanelAssembly,
  createPanelAssemblyProject,
  type GeneratedMechanicsManifest,
  type PanelAssemblyDefinition,
  type PanelAssemblyProject,
} from "../sculpture/PanelAssembly.ts";
import {
  detectPanelBoundaryTopology,
  generateClosedPanelBoundary,
  type ClosedPanelBoundary,
} from "../sculpture/PanelOutlineBoundary.ts";
import { sha256Bytes } from "../sculpture/GeneratedMechanics.ts";
import { serializeAsciiStl, serializeManifoldMeshAsciiStl } from "./Stl.ts";
import { buildPanelClosureSolids } from "./GeneratePanelClosureSolids.ts";

const GENERATED_CLOSURE_POLICY = Object.freeze({
  generator: "panel-hole-tabs" as const,
  holeSelection: "minimum-total-edge-distance" as const,
  exteriorClipping: "polyhedron-interior" as const,
  coverThickness: 2,
  coverCornerRadius: 2,
  flangeThickness: 3,
  flangeOverlap: 1.25,
  edgeLipDepth: 3,
  screwTabWidth: 13,
  screwTabEndMargin: 4.5,
  connectorCornerClearance: 14,
  panelEnvelopeClearance: 0.3,
});

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Converts only a previously validated boundary into the established planar
 * closure compiler contract. This object is derived build input and is never
 * stored as a second project pose authority.
 */
export function createPrintableBoundaryProject(
  project: PanelAssemblyProject,
  boundary: ClosedPanelBoundary,
): PanelAssemblyProject {
  if (
    boundary.metadata.status.generation !== "complete" ||
    boundary.metadata.status.validation !== "passed"
  ) {
    throw new Error("Printable-part generation requires a complete validated boundary.");
  }
  const sourceFingerprint = generateClosedPanelBoundary(
    project.sculpture,
    project.panelProfile,
  ).metadata.sourceFingerprint.value;
  if (boundary.metadata.sourceFingerprint.value !== sourceFingerprint) {
    throw new Error("Printable-part generation refused a boundary from different panel poses.");
  }

  const panelFaces = boundary.faces
    .filter((face) => face.role === "panel-outline")
    .sort((left, right) => compareText(left.panelId!, right.panelId!));
  const capFaces = boundary.faces
    .filter((face) => face.role === "cap")
    .sort((left, right) => compareText(left.gapId!, right.gapId!));
  const faceIdentity = new Map<string, { id: string; partId?: string }>();
  panelFaces.forEach((face, index) => {
    faceIdentity.set(face.id, {
      id: `panel-${String(index + 1).padStart(3, "0")}`,
    });
  });
  capFaces.forEach((face, index) => {
    faceIdentity.set(face.id, {
      id: `closure-${String(index + 1).padStart(3, "0")}`,
      partId: `part-${String(index + 1).padStart(3, "0")}`,
    });
  });

  const definition = structuredClone(project.sculpture);
  delete definition.boundaryTopology;
  delete definition.generatedMechanics;
  definition.panels = definition.panels.map((panel) => {
    const face = panelFaces.find((candidate) => candidate.panelId === panel.id);
    if (!face) throw new Error(`Validated boundary omitted panel outline ${panel.id}.`);
    return {
      ...panel,
      mountFaceId: faceIdentity.get(face.id)!.id,
      connectorPolicy: {
        allowSharedClosureAcrossAdjacentEdges: true as const,
        reason:
          "A validated panel-outline boundary may expose fewer gap edges than the four eligible real mounting holes; all holes still use the proven tab geometry.",
      },
    };
  });
  definition.mechanicalShell = {
    kind: "explicit-planar-face-graph",
    derivationStatus: "authored",
    vertices: boundary.vertices.map((vertex) => [...vertex]),
    faces: [...panelFaces, ...capFaces].map((face) => ({
      id: faceIdentity.get(face.id)!.id,
      ...(faceIdentity.get(face.id)!.partId
        ? { partId: faceIdentity.get(face.id)!.partId }
        : {}),
      vertexIndices: [...face.vertexIndices],
    })),
  };
  definition.closures = {
    faceIds: capFaces.map((face) => faceIdentity.get(face.id)!.id),
    ...GENERATED_CLOSURE_POLICY,
  };
  return createPanelAssemblyProject(
    definition,
    `generated from ${project.source}`,
    project.panelProfile,
  );
}

export interface CompiledPanelBoundaryFile {
  source: string;
  bytes: Uint8Array;
  sha256: string;
}

export interface CompiledPanelBoundaryBundle {
  definition: PanelAssemblyDefinition;
  boundary: ClosedPanelBoundary;
  printableProject: PanelAssemblyProject;
  files: CompiledPanelBoundaryFile[];
}

/** Compiles topology, boundary STL, and Manifold part STLs in memory. */
export async function compilePanelBoundaryBundle(
  project: PanelAssemblyProject,
  panelProfileSource?: string,
): Promise<CompiledPanelBoundaryBundle> {
  if (project.sculpture.manualMechanics) {
    throw new Error("Manually authored mechanics cannot enter generic part generation.");
  }
  const workingDefinition = structuredClone(project.sculpture);
  if (!workingDefinition.boundaryTopology) {
    workingDefinition.boundaryTopology = detectPanelBoundaryTopology(
      workingDefinition,
      project.panelProfile,
    );
  }
  const workingProject = createPanelAssemblyProject(
    workingDefinition,
    project.source,
    project.panelProfile,
  );
  const boundary = generateClosedPanelBoundary(
    workingProject.sculpture,
    workingProject.panelProfile,
  );
  const printableProject = createPrintableBoundaryProject(workingProject, boundary);
  compilePanelAssembly(printableProject);

  const files: CompiledPanelBoundaryFile[] = [];
  const boundaryBytes = serializeAsciiStl(
    "validated-panel-boundary",
    boundary.vertices,
    boundary.triangles,
  );
  files.push({
    source: "mechanics/boundary.stl",
    bytes: boundaryBytes,
    sha256: sha256Bytes(boundaryBytes),
  });
  const solids = await buildPanelClosureSolids(printableProject);
  const partFiles = solids
    .map((solid) => {
      const bytes = serializeManifoldMeshAsciiStl(
        solid.partId,
        solid.vertProperties,
        solid.triVerts,
      );
      return {
        id: solid.partId,
        source: `mechanics/parts/${solid.partId}.stl`,
        bytes,
        sha256: sha256Bytes(bytes),
      };
    })
    .sort((left, right) => compareText(left.id, right.id));
  for (const part of partFiles) {
    files.push({ source: part.source, bytes: part.bytes, sha256: part.sha256 });
  }

  const manifest: GeneratedMechanicsManifest = {
    generator: {
      id: "wled-orbital-lab/panel-outline-parts",
      version: "0.2.0",
    },
    sourceFingerprint: boundary.metadata.sourceFingerprint,
    status: { generation: "complete", validation: "passed" },
    boundary: {
      kind: "closed-boundary-mesh",
      format: "stl",
      source: "mechanics/boundary.stl",
      sha256: files[0]!.sha256,
    },
    parts: partFiles.map((part) => ({
      id: part.id,
      format: "stl",
      source: part.source,
      sha256: part.sha256,
    })),
  };
  const definition = structuredClone(workingProject.sculpture);
  definition.generatedMechanics = manifest;
  if (panelProfileSource) definition.panelProfile.source = panelProfileSource;
  definition.notes = [
    ...definition.notes.filter((note) =>
      !note.startsWith("Generated printable asset set ")
    ),
    `Generated printable asset set ${boundary.metadata.sourceFingerprint.value.slice(0, 12)} from the validated panel-gap boundary.`,
  ];
  createPanelAssemblyProject(definition, workingProject.source, project.panelProfile);
  return { definition, boundary, printableProject, files };
}
