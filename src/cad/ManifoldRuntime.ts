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
