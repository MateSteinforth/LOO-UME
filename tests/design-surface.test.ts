import { describe, expect, it } from "vitest";
import { validateWatertightTriangleMesh } from "../src/sculpture/DesignSurface.ts";

const tetrahedron = [
  1, 1, 1,
  -1, -1, 1,
  -1, 1, -1,
  1, -1, -1,
];

describe("design surface validation", () => {
  it("accepts one connected watertight shell", () => {
    const result = validateWatertightTriangleMesh(
      tetrahedron,
      [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3],
    );
    expect(result.watertight).toBe(true);
    expect(result.triangleCount).toBe(4);
    expect(result.vertexCount).toBe(4);
  });

  it("rejects an open mesh", () => {
    expect(() =>
      validateWatertightTriangleMesh(
        tetrahedron,
        [0, 2, 1, 0, 1, 3, 0, 3, 2],
      )
    ).toThrow(/not watertight/);
  });

  it("rejects inconsistent winding", () => {
    expect(() =>
      validateWatertightTriangleMesh(
        tetrahedron,
        [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 3, 2],
      )
    ).toThrow(/winding/);
  });
});
