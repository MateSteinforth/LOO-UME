import { describe, expect, it } from "vitest";
import {
  createPanelizedSculptureMapping,
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

  it("creates 42 explicit 8x8 panels on the sculpture topology", () => {
    const mapping = createPanelizedSculptureMapping();
    const result = validateMapping(mapping, 2688);

    expect(result).toEqual({ valid: true, errors: [] });
    expect(mapping.topology).toBe("panelized-sculpture");
    expect(mapping.status).toBe("provisional");
    expect(mapping.entries).toHaveLength(2688);
    expect(mapping.panels).toHaveLength(42);

    const squarePanels = mapping.panels.filter(
      (panel) => panel.faceType === "square-face",
    );
    const pentagonPanels = mapping.panels.filter(
      (panel) => panel.faceType === "pentagon-centre",
    );
    expect(squarePanels).toHaveLength(30);
    expect(pentagonPanels).toHaveLength(12);

    for (const panel of mapping.panels) {
      expect(panel.ledIndices).toHaveLength(64);
      expect(panel.transformStatus).toBe("generated-provisional");
      expect(panel.pixelOrder.status).toBe("unknown");
      expect(panel.wiring.status).toBe("unassigned");
      expect(panel.rotationDegrees).toBeNull();
      expect(panel.mirrored).toBeNull();
      expect(panel.neighborPanelIds).toHaveLength(
        panel.faceType === "square-face" ? 2 : 5,
      );

      const panelEntries = mapping.entries.filter(
        (entry) => entry.panelId === panel.id,
      );
      const coordinates = new Set(
        panelEntries.map(
          (entry) => `${entry.panelPixelX},${entry.panelPixelY}`,
        ),
      );
      expect(panelEntries).toHaveLength(64);
      expect(coordinates.size).toBe(64);
    }

    const square = squarePanels[0]!;
    const neighboringPentagon = mapping.panels.find(
      (panel) => panel.id === square.neighborPanelIds[0],
    )!;
    const dot =
      square.normal.x * neighboringPentagon.normal.x +
      square.normal.y * neighboringPentagon.normal.y +
      square.normal.z * neighboringPentagon.normal.z;
    const angleDegrees = (Math.acos(dot) * 180) / Math.PI;
    expect(angleDegrees).toBeCloseTo(31.717474, 5);
  });

  it("reports duplicate and out-of-range indices", () => {
    const mapping: LedMapping = {
      id: "bad",
      status: "provisional",
      topology: "custom",
      panels: [],
      notes: [],
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
