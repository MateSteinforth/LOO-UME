import Module, { type ManifoldToplevel } from "manifold-3d";

/** Pinned npm identity for the generic CAD kernel. */
export const MANIFOLD_PACKAGE = "manifold-3d";
export const MANIFOLD_VERSION = "3.5.1";
export const MANIFOLD_LICENSE = "Apache-2.0";
export const MANIFOLD_SOURCE = "https://github.com/elalish/manifold";

export class ManifoldRuntimeUnavailableError extends Error {
  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Manifold WASM could not be loaded: ${detail}`, {
      cause: cause instanceof Error ? cause : undefined,
    });
    this.name = "ManifoldRuntimeUnavailableError";
  }
}

export type ManifoldModuleFactory = () => Promise<ManifoldToplevel>;

export function createManifoldRuntimeLoader(
  moduleFactory: ManifoldModuleFactory,
): () => Promise<ManifoldToplevel> {
  let loaded: Promise<ManifoldToplevel> | undefined;
  return () => {
    if (!loaded) {
      loaded = moduleFactory()
        .then((wasm) => {
          wasm.setup();
          return wasm;
        })
        .catch((error: unknown) => {
          loaded = undefined;
          throw error instanceof ManifoldRuntimeUnavailableError
            ? error
            : new ManifoldRuntimeUnavailableError(error);
        });
    }
    return loaded;
  };
}

const loadPinnedManifoldRuntime = createManifoldRuntimeLoader(Module);

/**
 * Loads the pinned Manifold WASM once per process. Callers must `delete()`
 * every constructed `Manifold` or `CrossSection`; the WASM heap is not GC'd.
 */
export function loadManifoldRuntime(): Promise<ManifoldToplevel> {
  return loadPinnedManifoldRuntime();
}

export interface ManifoldGeneratorStatus {
  schemaVersion: "1.0.0";
  available: boolean;
  generator: "manifold";
  supportedVersion: string;
  detectedVersion?: string;
  message: string;
}

export async function probeManifoldGeneratorStatus(): Promise<ManifoldGeneratorStatus> {
  try {
    await loadManifoldRuntime();
    return {
      schemaVersion: "1.0.0",
      available: true,
      generator: "manifold",
      supportedVersion: MANIFOLD_VERSION,
      detectedVersion: MANIFOLD_VERSION,
      message: `Manifold ${MANIFOLD_VERSION} is ready for local generation.`,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      schemaVersion: "1.0.0",
      available: false,
      generator: "manifold",
      supportedVersion: MANIFOLD_VERSION,
      message:
        `Printable STL generation is unavailable because ${detail}`,
    };
  }
}
