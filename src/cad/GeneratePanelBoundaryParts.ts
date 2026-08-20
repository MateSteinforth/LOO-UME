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
  type PanelAssemblyDefinition,
  type PanelAssemblyProject,
} from "../sculpture/PanelAssembly.ts";
import {
  type ClosedPanelBoundary,
} from "../sculpture/PanelOutlineBoundary.ts";
import {
  portableProjectAssetCollisionKey,
  sha256Bytes,
  verifyProjectAssetBytes,
} from "../sculpture/GeneratedMechanics.ts";
import { createUnprobedOpenScadRenderer } from "./OpenScadRuntime.ts";
import { emitPanelClosureCadArtifacts } from "./GeneratePanelClosureCad.ts";
import { inspectStl, type StlInspection } from "./Stl.ts";
import {
  compilePanelBoundaryBundle,
  createPrintableBoundaryProject,
} from "./CompilePanelBoundaryBundle.ts";

export { createPrintableBoundaryProject };

export type ScadRenderer = (
  inputScad: string,
  outputStl: string,
) => Promise<void>;

export interface GeneratePanelBoundaryPartsOptions {
  outputDirectory: string;
  rootDirectory?: string;
  panelProfileSource?: string;
  designSurfaceBytes?: Uint8Array;
  /** Ignored. Generic parts are tessellated with Manifold, not OpenSCAD. */
  renderScad?: ScadRenderer;
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

  const rootDirectory = resolve(options.rootDirectory ?? process.cwd());
  const outputDirectory = resolve(rootDirectory, options.outputDirectory);
  const originalProfilePath = resolve(
    dirname(resolve(rootDirectory, project.source)),
    project.sculpture.panelProfile.source,
  );
  const panelProfileSource = options.panelProfileSource ??
    relative(outputDirectory, originalProfilePath).split(sep).join("/");
  const bundle = await compilePanelBoundaryBundle(project, panelProfileSource);
  const temporaryDirectory =
    `${outputDirectory}.pending-${process.pid}-${randomUUID()}`;
  const cadDirectory = resolve(temporaryDirectory, "mechanics", "cad");

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
    for (const file of bundle.files) {
      const absolutePath = resolve(temporaryDirectory, file.source);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, file.bytes);
    }
    const cad = await emitPanelClosureCadArtifacts(bundle.printableProject, {
      rootDirectory,
      outputDirectory: cadDirectory,
    });
    const boundaryPath = resolve(temporaryDirectory, "mechanics/boundary.stl");
    const partAssets: GeneratedPanelBoundaryAsset[] = [];
    for (const file of bundle.files) {
      if (!file.source.startsWith("mechanics/parts/")) continue;
      const id = file.source.slice("mechanics/parts/".length).replace(/\.stl$/, "");
      partAssets.push(
        await inspectedAsset(id, file.source, resolve(temporaryDirectory, file.source)),
      );
    }
    partAssets.sort((left, right) => compareText(left.id, right.id));
    const boundaryAsset = await inspectedAsset(
      "boundary",
      "mechanics/boundary.stl",
      boundaryPath,
    );
    const pendingManifest = resolve(temporaryDirectory, "sculpture.json.pending");
    await writeFile(
      pendingManifest,
      `${JSON.stringify(bundle.definition, null, 2)}\n`,
      "utf8",
    );
    await rename(pendingManifest, resolve(temporaryDirectory, "sculpture.json"));
    await publishDirectory(temporaryDirectory, outputDirectory);

    const published = (path: string): string =>
      resolve(outputDirectory, relative(temporaryDirectory, path));
    return {
      outputDirectory,
      projectSource: resolve(outputDirectory, "sculpture.json"),
      definition: bundle.definition,
      boundary: bundle.boundary,
      printableProject: bundle.printableProject,
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
