import { describe, expect, it } from "vitest";
import { compileEquatorMapping } from "../src/effects/EquatorMapping.ts";

describe("Equator Wave coordinates", () => {
  const positions = [
    { logicalIndex: 0, x: 1, y: 0, z: 0 },
    { logicalIndex: 1, x: 0, y: 0, z: 1 },
    { logicalIndex: 2, x: -1, y: 0, z: 0 },
    { logicalIndex: 3, x: 0, y: 0, z: -1 },
    { logicalIndex: 4, x: 0, y: 1, z: 0 },
    { logicalIndex: 5, x: 0, y: -1, z: 0 },
  ];
  it("uses Y for height and preserves logical order", () => {
    const points = compileEquatorMapping([...positions].reverse());
    expect(points.slice(0, 4)).toEqual(
      [0, 16384, 32768, 49152].map((longitude) => ({ longitude, height: 0 })),
    );
    expect(points[4]?.height).toBe(32767);
    expect(points[5]?.height).toBe(-32767);
  });
  it("preserves coordinates under translation and uniform scale", () => {
    expect(
      compileEquatorMapping(
        positions.map((point) => ({
          ...point,
          x: point.x * 20 + 300,
          y: point.y * 20 - 200,
          z: point.z * 20 + 100,
        })),
      ),
    ).toEqual(compileEquatorMapping(positions));
  });
  it("rejects ambiguous indices and invalid geometry", () => {
    expect(() => compileEquatorMapping([positions[0]!, positions[0]!])).toThrow(
      "unique",
    );
    expect(() => compileEquatorMapping([{ ...positions[0]!, y: NaN }])).toThrow(
      "finite",
    );
    expect(compileEquatorMapping([])).toEqual([]);
    expect(compileEquatorMapping([positions[0]!])).toEqual([
      { longitude: 0, height: 0 },
    ]);
  });
});
