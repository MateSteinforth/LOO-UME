import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
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
import {
  portableProjectAssetCollisionKey,
  sha256Bytes,
  verifyProjectAssetBytes,
} from "../sculpture/GeneratedMechanics.ts";
import { createUnprobedOpenScadRenderer } from "./OpenScadRuntime.ts";
import { emitPanelClosureCadArtifacts } from "./GeneratePanelClosureCad.ts";
import { inspectStl, serializeAsciiStl, type StlInspection } from "./Stl.ts";

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

export type ScadRenderer = (
  inputScad: string,
  outputStl: string,
) => Promise<void>;

export interface GeneratePanelBoundaryPartsOptions {
  outputDirectory: string;
  rootDirectory?: string;
  panelProfileSource?: string;
  designSurfaceBytes?: Uint8Array;
  renderScad: ScadRenderer;
}

export interface GeneratedPanelBoundaryAsset {
  id: string;
  source: string;
  absolutePath: string;
  sha256: string;
  inspection: StlInspection;
}

export interface GeneratePanelBoundaryPartsResult {
  outputDirectory: string;
  projectSource: string;
  definition: PanelAssemblyDefinition;
  boundary: ClosedPanelBoundary;
  printableProject: PanelAssemblyProject;
  boundaryAsset: GeneratedPanelBoundaryAsset;
  partAssets: GeneratedPanelBoundaryAsset[];
  assemblyPreviewSource: string;
}

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

async function inspectedAsset(
  id: string,
  source: string,
  absolutePath: string,
): Promise<GeneratedPanelBoundaryAsset> {
  const bytes = new Uint8Array(await readFile(absolutePath));
  return {
    id,
    source,
    absolutePath,
    sha256: sha256Bytes(bytes),
    inspection: inspectStl(bytes),
  };
}

async function publishDirectory(
  temporaryDirectory: string,
  outputDirectory: string,
): Promise<void> {
  const backupDirectory = `${outputDirectory}.previous-${randomUUID()}`;
  const hadPrevious = existsSync(outputDirectory);
  if (hadPrevious) await rename(outputDirectory, backupDirectory);
  try {
    await rename(temporaryDirectory, outputDirectory);
  } catch (error) {
    if (hadPrevious && existsSync(backupDirectory)) {
      await rename(backupDirectory, outputDirectory);
    }
    throw error;
  }
  if (hadPrevious) await rm(backupDirectory, { recursive: true, force: true });
}

/**
 * Validates the boundary before creating a temporary directory, writes and
 * validates every STL there, writes sculpture.json last, then publishes the
 * complete bundle as one directory swap.
 */
export async function generatePanelBoundaryParts(
  project: PanelAssemblyProject,
  options: GeneratePanelBoundaryPartsOptions,
): Promise<GeneratePanelBoundaryPartsResult> {
  if (project.sculpture.manualMechanics) {
    throw new Error("Manually authored mechanics cannot enter generic part generation.");
  }
  const designSurface = project.sculpture.designSurface;
  let designSurfaceBytes: Uint8Array | undefined;
  if (designSurface) {
    const collisionSource = portableProjectAssetCollisionKey(designSurface.source);
    if (
      collisionSource === "sculpture.json" ||
      collisionSource.startsWith("sculpture.json/") ||
      collisionSource === "mechanics" ||
      collisionSource.startsWith("mechanics/")
    ) {
      throw new Error(
        `Design surface source ${designSurface.source} conflicts with a reserved generated-project path.`,
      );
    }
    if (!options.designSurfaceBytes) {
      throw new Error(
        `Generation requires verified bytes for design surface ${designSurface.source}.`,
      );
    }
    designSurfaceBytes = Uint8Array.from(options.designSurfaceBytes);
    verifyProjectAssetBytes(designSurface, designSurfaceBytes, "Design surface");
  } else if (options.designSurfaceBytes) {
    throw new Error(
      "Generation received design-surface bytes, but the project has no designSurface reference.",
    );
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
  const printableProject = createPrintableBoundaryProject(
    workingProject,
    boundary,
  );
  compilePanelAssembly(printableProject);

  const rootDirectory = resolve(options.rootDirectory ?? process.cwd());
  const outputDirectory = resolve(rootDirectory, options.outputDirectory);
  const temporaryDirectory =
    `${outputDirectory}.pending-${process.pid}-${randomUUID()}`;
  const mechanicsDirectory = resolve(temporaryDirectory, "mechanics");
  const partDirectory = resolve(mechanicsDirectory, "parts");
  const cadDirectory = resolve(mechanicsDirectory, "cad");

  try {
    if (designSurface && designSurfaceBytes) {
      const designSurfacePath = resolve(
        temporaryDirectory,
        designSurface.source,
      );
      await mkdir(dirname(designSurfacePath), { recursive: true });
      await writeFile(designSurfacePath, designSurfaceBytes);
      verifyProjectAssetBytes(
        designSurface,
        new Uint8Array(await readFile(designSurfacePath)),
        "Staged design surface",
      );
    }
    await mkdir(partDirectory, { recursive: true });
    const boundaryPath = resolve(mechanicsDirectory, "boundary.stl");
    await writeFile(
      boundaryPath,
      serializeAsciiStl(
        "validated-panel-boundary",
        boundary.vertices,
        boundary.triangles,
      ),
    );

    const cad = await emitPanelClosureCadArtifacts(printableProject, {
      rootDirectory,
      outputDirectory: cadDirectory,
    });
    const rendered: GeneratedPanelBoundaryAsset[] = [];
    for (const part of cad.manifest.parts) {
      const id = part.closureFaceId;
      const outputStl = resolve(partDirectory, `${id}.stl`);
      await options.renderScad(
        cad.entrypointPaths.closures[part.closureFaceId]!,
        outputStl,
      );
      rendered.push(
        await inspectedAsset(id, `mechanics/parts/${id}.stl`, outputStl),
      );
    }
    const boundaryAsset = await inspectedAsset(
      "boundary",
      "mechanics/boundary.stl",
      boundaryPath,
    );
    const partAssets = rendered.sort((left, right) => compareText(left.id, right.id));
    const manifest: GeneratedMechanicsManifest = {
      generator: {
        id: "wled-orbital-lab/panel-outline-parts",
        version: "0.1.0",
      },
      sourceFingerprint: boundary.metadata.sourceFingerprint,
      status: { generation: "complete", validation: "passed" },
      boundary: {
        kind: "closed-boundary-mesh",
        format: "stl",
        source: boundaryAsset.source,
        sha256: boundaryAsset.sha256,
      },
      parts: partAssets.map((part) => ({
        id: part.id,
        format: "stl",
        source: part.source,
        sha256: part.sha256,
      })),
    };
    const definition = structuredClone(workingProject.sculpture);
    definition.generatedMechanics = manifest;
    const originalProfilePath = resolve(
      dirname(resolve(rootDirectory, workingProject.source)),
      workingProject.sculpture.panelProfile.source,
    );
    definition.panelProfile.source = options.panelProfileSource ??
      relative(outputDirectory, originalProfilePath)
        .split(sep)
        .join("/");
    definition.notes = [
      ...definition.notes.filter((note) =>
        !note.startsWith("Generated printable asset set ")
      ),
      `Generated printable asset set ${boundary.metadata.sourceFingerprint.value.slice(0, 12)} from the validated panel-gap boundary.`,
    ];

    // Validate the final manifest before it becomes visible, then write it last.
    createPanelAssemblyProject(
      definition,
      resolve(temporaryDirectory, "sculpture.json"),
      project.panelProfile,
    );
    const pendingManifest = resolve(temporaryDirectory, "sculpture.json.pending");
    await writeFile(
      pendingManifest,
      `${JSON.stringify(definition, null, 2)}\n`,
      "utf8",
    );
    await rename(pendingManifest, resolve(temporaryDirectory, "sculpture.json"));
    await publishDirectory(temporaryDirectory, outputDirectory);

    const published = (path: string): string =>
      resolve(outputDirectory, relative(temporaryDirectory, path));
    return {
      outputDirectory,
      projectSource: resolve(outputDirectory, "sculpture.json"),
      definition,
      boundary,
      printableProject,
      boundaryAsset: { ...boundaryAsset, absolutePath: published(boundaryPath) },
      partAssets: partAssets.map((asset) => ({
        ...asset,
        absolutePath: published(asset.absolutePath),
      })),
      assemblyPreviewSource: published(cad.entrypointPaths.assemblyPreview),
    };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export function createOpenScadRenderer(
  rootDirectory: string,
  executable = process.env.OPENSCAD,
): ScadRenderer {
  return createUnprobedOpenScadRenderer(rootDirectory, executable);
}
