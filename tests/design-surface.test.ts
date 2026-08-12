import { describe, expect, it } from "vitest";
import {
  createMechanicalSurfaceOrientation,
  createSurfaceOrientation,
  validateWatertightTriangleMesh,
} from "../src/sculpture/DesignSurface.ts";

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

  it("creates a right-handed world-up tangent frame", () => {
    const orientation = createSurfaceOrientation([0, 1, 0]);
    expect(orientation.normal).toEqual([0, 1, 0]);
    expect(orientation.yAxis).toEqual([0, 0, 1]);
    expect(orientation.xAxis).toEqual([-1, 0, 0]);
  });

  it("uses a square side instead of its triangulation diagonal", () => {
    const coordinate = 66 / Math.sqrt(2);
    const orientation = createMechanicalSurfaceOrientation(
      [0, 1, 0],
      [
        [0, 0, -coordinate],
        [-coordinate, 0, 0],
        [0, 0, coordinate],
      ],
    );
    expect(orientation.xAxis[0]).toBeCloseTo(-1 / Math.sqrt(2), 12);
    expect(orientation.xAxis[1]).toBe(0);
    expect(orientation.xAxis[2]).toBeCloseTo(1 / Math.sqrt(2), 12);
    expect(orientation.normal).toEqual([0, 1, 0]);
  });
});
