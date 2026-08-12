import { describe, expect, it } from "vitest";
import { triangulatePolygon } from "../src/cad/TriangulatePolygon.ts";

describe("triangulatePolygon", () => {
  it("triangulates a concave polygon without fan overlap", () => {
    const triangles = triangulatePolygon(
      [0, 1, 2, 3, 4],
      [[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]],
    );
    expect(triangles).toHaveLength(3);
    expect(new Set(triangles.flat())).toEqual(new Set([0, 1, 2, 3, 4]));
  });
});
