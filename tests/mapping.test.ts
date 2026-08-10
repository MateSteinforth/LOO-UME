import { describe, expect, it } from "vitest";
import {
  createUniformSphereMapping,
  validateMapping,
  type LedMapping,
} from "../web/src/LedMapping.ts";

describe("LED mapping", () => {
  it("creates a complete explicit physical-to-logical sphere LUT", () => {
    const mapping = createUniformSphereMapping(2688);
    const result = validateMapping(mapping, 2688);

    expect(result).toEqual({ valid: true, errors: [] });
    expect(mapping.entries).toHaveLength(2688);
    expect(mapping.entries[0]).toMatchObject({
      physicalIndex: 0,
      logicalIndex: 0,
      panelId: null,
    });

    for (const entry of mapping.entries) {
      const radius = Math.hypot(entry.x, entry.y, entry.z);
      expect(radius).toBeCloseTo(100, 5);
      expect(entry.u).toBeGreaterThanOrEqual(0);
      expect(entry.u).toBeLessThanOrEqual(1);
      expect(entry.v).toBeGreaterThanOrEqual(0);
      expect(entry.v).toBeLessThanOrEqual(1);
    }
  });

  it("reports duplicate and out-of-range indices", () => {
    const mapping: LedMapping = {
      id: "bad",
      status: "provisional",
      entries: [
        {
          physicalIndex: 0,
          logicalIndex: 2,
          panelId: null,
          panelPixelX: null,
          panelPixelY: null,
          u: 0,
          v: 0,
          x: 0,
          y: 0,
          z: 0,
        },
        {
          physicalIndex: 0,
          logicalIndex: 2,
          panelId: null,
          panelPixelX: null,
          panelPixelY: null,
          u: 1,
          v: 1,
          x: 1,
          y: 1,
          z: 1,
        },
      ],
    };

    const result = validateMapping(mapping, 2);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("duplicated");
    expect(result.errors.join(" ")).toContain("out of range");
  });
});
