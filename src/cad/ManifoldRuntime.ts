import Module, { type ManifoldToplevel } from "manifold-3d";

/** Pinned npm identity for the generic CAD kernel. Generator call sites do not use this yet. */
export const MANIFOLD_PACKAGE = "manifold-3d";
export const MANIFOLD_VERSION = "3.5.1";
export const MANIFOLD_LICENSE = "Apache-2.0";
export const MANIFOLD_SOURCE = "https://github.com/elalish/manifold";

let loaded: Promise<ManifoldToplevel> | undefined;

/**
 * Loads the pinned Manifold WASM once per process. Callers must `delete()`
 * every constructed `Manifold` or `CrossSection`; the WASM heap is not GC'd.
 */
export function loadManifoldRuntime(): Promise<ManifoldToplevel> {
  if (!loaded) {
    loaded = Module().then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return loaded;
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
        `Printable STL generation is unavailable because Manifold WASM could not be loaded: ${detail}`,
    };
  }
}
