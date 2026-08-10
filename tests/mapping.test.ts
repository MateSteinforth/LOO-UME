import { describe, expect, it } from "vitest";
import {
  createPanelizedSculptureMapping,
  createUniformSphereMapping,
  SCULPTURE_GEOMETRY,
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

    const pentagonApothem =
      SCULPTURE_GEOMETRY.faceEdge / (2 * Math.tan(Math.PI / 5));
    const foldRadians =
      (SCULPTURE_GEOMETRY.squarePentagonFoldDegrees * Math.PI) / 180;
    const expectedPentagonDistance =
      (SCULPTURE_GEOMETRY.faceEdge / 2 +
        Math.cos(foldRadians) * pentagonApothem) /
      Math.sin(foldRadians);
    const expectedSquareDistance =
      (pentagonApothem +
        Math.cos(foldRadians) * (SCULPTURE_GEOMETRY.faceEdge / 2)) /
      Math.sin(foldRadians);

    for (const squarePanel of squarePanels) {
      const faceDistance =
        squarePanel.position.x * squarePanel.normal.x +
        squarePanel.position.y * squarePanel.normal.y +
        squarePanel.position.z * squarePanel.normal.z;
      expect(faceDistance).toBeCloseTo(expectedSquareDistance, 5);
      expect(squarePanel.previewWidth).toBe(66);
      expect(squarePanel.previewHeight).toBe(65);

      for (const neighborId of squarePanel.neighborPanelIds) {
        const pentagonPanel = pentagonPanels.find(
          (panel) => panel.id === neighborId,
        )!;
        const sharedEdge = {
          x:
            squarePanel.normal.y * pentagonPanel.normal.z -
            squarePanel.normal.z * pentagonPanel.normal.y,
          y:
            squarePanel.normal.z * pentagonPanel.normal.x -
            squarePanel.normal.x * pentagonPanel.normal.z,
          z:
            squarePanel.normal.x * pentagonPanel.normal.y -
            squarePanel.normal.y * pentagonPanel.normal.x,
        };
        const sharedEdgeLength = Math.hypot(
          sharedEdge.x,
          sharedEdge.y,
          sharedEdge.z,
        );
        const alignment =
          (squarePanel.xAxis.x * sharedEdge.x +
            squarePanel.xAxis.y * sharedEdge.y +
            squarePanel.xAxis.z * sharedEdge.z) /
          sharedEdgeLength;
        expect(Math.abs(alignment)).toBeCloseTo(1, 8);
      }
    }

    for (const centerPanel of pentagonPanels) {
      const faceDistance =
        centerPanel.position.x * centerPanel.normal.x +
        centerPanel.position.y * centerPanel.normal.y +
        centerPanel.position.z * centerPanel.normal.z;
      expect(faceDistance).toBeCloseTo(
        expectedPentagonDistance - SCULPTURE_GEOMETRY.centerPanelRecess,
        5,
      );

      const inPlanePosition = {
        x: centerPanel.position.x - faceDistance * centerPanel.normal.x,
        y: centerPanel.position.y - faceDistance * centerPanel.normal.y,
        z: centerPanel.position.z - faceDistance * centerPanel.normal.z,
      };
      expect(
        Math.hypot(
          inPlanePosition.x,
          inPlanePosition.y,
          inPlanePosition.z,
        ),
      ).toBeCloseTo(
        Math.hypot(
          SCULPTURE_GEOMETRY.centerPanelOffsetX,
          SCULPTURE_GEOMETRY.centerPanelOffsetY,
        ),
        5,
      );

      const centerRotation =
        (SCULPTURE_GEOMETRY.centerPanelRotationDegrees * Math.PI) / 180;
      const expectedLocalX =
        SCULPTURE_GEOMETRY.centerPanelOffsetX * Math.cos(centerRotation) +
        SCULPTURE_GEOMETRY.centerPanelOffsetY * Math.sin(centerRotation);
      const expectedLocalY =
        -SCULPTURE_GEOMETRY.centerPanelOffsetX * Math.sin(centerRotation) +
        SCULPTURE_GEOMETRY.centerPanelOffsetY * Math.cos(centerRotation);
      expect(
        inPlanePosition.x * centerPanel.xAxis.x +
          inPlanePosition.y * centerPanel.xAxis.y +
          inPlanePosition.z * centerPanel.xAxis.z,
      ).toBeCloseTo(expectedLocalX, 5);
      expect(
        inPlanePosition.x * centerPanel.yAxis.x +
          inPlanePosition.y * centerPanel.yAxis.y +
          inPlanePosition.z * centerPanel.yAxis.z,
      ).toBeCloseTo(expectedLocalY, 5);

      const alignedNeighbor = squarePanels.some((squarePanel) => {
        if (!centerPanel.neighborPanelIds.includes(squarePanel.id)) return false;
        const sharedEdge = {
          x:
            centerPanel.normal.y * squarePanel.normal.z -
            centerPanel.normal.z * squarePanel.normal.y,
          y:
            centerPanel.normal.z * squarePanel.normal.x -
            centerPanel.normal.x * squarePanel.normal.z,
          z:
            centerPanel.normal.x * squarePanel.normal.y -
            centerPanel.normal.y * squarePanel.normal.x,
        };
        const sharedEdgeLength = Math.hypot(
          sharedEdge.x,
          sharedEdge.y,
          sharedEdge.z,
        );
        const alignment =
          (centerPanel.xAxis.x * sharedEdge.x +
            centerPanel.xAxis.y * sharedEdge.y +
            centerPanel.xAxis.z * sharedEdge.z) /
          sharedEdgeLength;
        return Math.abs(alignment) > 1 - 1e-8;
      });
      expect(alignedNeighbor).toBe(true);
    }
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
