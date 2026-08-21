import { describe, expect, it } from "vitest";
import {
  loadManifoldRuntime,
  MANIFOLD_LICENSE,
  MANIFOLD_PACKAGE,
  MANIFOLD_SOURCE,
  MANIFOLD_VERSION,
} from "../src/cad/ManifoldRuntime.ts";

describe("Manifold runtime", () => {
  it("records the pinned package identity", () => {
    expect(MANIFOLD_PACKAGE).toBe("manifold-3d");
    expect(MANIFOLD_VERSION).toBe("3.5.1");
    expect(MANIFOLD_LICENSE).toBe("Apache-2.0");
    expect(MANIFOLD_SOURCE).toBe("https://github.com/elalish/manifold");
  });

  it("loads WASM and subtracts a cylinder from a cube", async () => {
    const { Manifold } = await loadManifoldRuntime();
    const cube = Manifold.cube(20, true);
    const bore = Manifold.cylinder(20, 5, 5, 0, true);
    const result = cube.subtract(bore);
    try {
      expect(result.status()).toBe("NoError");
      expect(result.isEmpty()).toBe(false);
      expect(result.genus()).toBe(1);
      expect(result.numTri()).toBeGreaterThan(12);
      const volume = result.volume();
      expect(volume).toBeGreaterThan(6000);
      expect(volume).toBeLessThan(8000);
      const mesh = result.getMesh();
      expect(mesh.numTri).toBe(result.numTri());
      expect(mesh.triVerts.length).toBe(result.numTri() * 3);
      expect(mesh.vertProperties.every((value) => Number.isFinite(value))).toBe(
        true,
      );
    } finally {
      result.delete();
      bore.delete();
      cube.delete();
    }
  });
});
