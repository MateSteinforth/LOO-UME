import type { InstalledAddressTransform } from "../../src/sculpture/PanelAssembly.ts";

export interface LedMappingEntry {
  physicalIndex: number;
  logicalIndex: number;
  panelId: string | null;
  panelPixelX: number | null;
  panelPixelY: number | null;
  u: number;
  v: number;
  x: number;
  y: number;
  z: number;
}

export type PanelFaceType = "square-face" | "pentagon-centre";

export interface Vector3Data {
  x: number;
  y: number;
  z: number;
}

export interface PanelDefinition {
  id: string;
  faceType: PanelFaceType;
  transformStatus: "generated-provisional" | "measured";
  position: Vector3Data;
  normal: Vector3Data;
  xAxis: Vector3Data;
  yAxis: Vector3Data;
  previewWidth: number;
  previewHeight: number;
  neighborPanelIds: string[];
  ledIndices: number[];
  rotationDegrees: number | null;
  mirrored: boolean | null;
  installedAddressTransform: InstalledAddressTransform;
  pixelOrder: {
    status: "unknown" | "provisional" | "measured";
    pixelZeroCorner:
      | "top-left"
      | "top-right"
      | "bottom-left"
      | "bottom-right"
      | null;
    traversalAxis: "rows" | "columns" | null;
    lineProgression:
      | "top-to-bottom"
      | "bottom-to-top"
      | "left-to-right"
      | "right-to-left"
      | null;
    serpentine: boolean | null;
    firstLineDirection:
      | "left-to-right"
      | "right-to-left"
      | "top-to-bottom"
      | "bottom-to-top"
      | null;
  };
  wiring: {
    status: "unassigned" | "provisional" | "assigned";
    output: number | null;
    chainPosition: number | null;
    previousPanelId: string | null;
    nextPanelId: string | null;
  };
}

export interface MechanicalMountPreview {
  closureFaceId: string;
  panelId: string;
  holeId: string;
  edgeMidpoint: Vector3Data;
  holePosition: Vector3Data;
  pilotPosition: Vector3Data;
}

export interface PrintableClosurePreview {
  id: string;
  vertices: Vector3Data[];
  normal: Vector3Data;
  coverThickness: number;
  exteriorClipping: "polyhedron-interior";
  cadMeshAsset: string;
  frame: {
    origin: Vector3Data;
    xAxis: Vector3Data;
    yAxis: Vector3Data;
    inwardAxis: Vector3Data;
  };
  connectors: Array<{
    panelId: string;
    holeId: string;
    pilotPosition: Vector3Data;
    panelInwardNormal: Vector3Data;
    panelMountOffset: number;
    flangeThickness: number;
    screwTabWidth: number;
    pilotDiameter: number;
  }>;
}

export interface SculptureSurfaceFace {
  id: string;
  role: "panel" | "filler";
  vertices: Vector3Data[];
  normal: Vector3Data;
}

export interface LedMapping {
  id: string;
  status: "provisional" | "measured";
  topology: "panelized-sculpture" | "uniform-sphere" | "custom";
  panelPixelGrid?: {
    columns: number;
    rows: number;
  };
  panels: PanelDefinition[];
  surfaceFaces?: SculptureSurfaceFace[];
  mechanicalMounts?: MechanicalMountPreview[];
  printableClosures?: PrintableClosurePreview[];
  notes: string[];
  entries: LedMappingEntry[];
}

export interface MappingValidation {
  valid: boolean;
  errors: string[];
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/**
 * Creates a deterministic Fibonacci sphere. Identity logical/physical ordering
 * is explicit here, not assumed by the renderer.
 */
export function createUniformSphereMapping(
  count: number,
  radius = 100,
): LedMapping {
  const entries = Array.from({ length: count }, (_, physicalIndex) => {
    const yUnit = 1 - (2 * (physicalIndex + 0.5)) / count;
    const ringRadius = Math.sqrt(Math.max(0, 1 - yUnit * yUnit));
    const theta = physicalIndex * GOLDEN_ANGLE;
    const xUnit = Math.cos(theta) * ringRadius;
    const zUnit = Math.sin(theta) * ringRadius;
    const u = (Math.atan2(zUnit, xUnit) / (2 * Math.PI) + 1) % 1;
    const v = Math.acos(yUnit) / Math.PI;

    return {
      physicalIndex,
      logicalIndex: physicalIndex,
      panelId: null,
      panelPixelX: null,
      panelPixelY: null,
      u,
      v,
      x: xUnit * radius,
      y: yUnit * radius,
      z: zUnit * radius,
    };
  });

  return {
    id: `fibonacci-sphere-${count}`,
    status: "provisional",
    topology: "uniform-sphere",
    panels: [],
    notes: [
      "Fallback point distribution; no panel topology or wiring metadata.",
    ],
    entries,
  };
}

export function validateMapping(
  mapping: LedMapping,
  ledCount: number,
): MappingValidation {
  const errors: string[] = [];
  const grid = mapping.panelPixelGrid;
  if (
    mapping.panels.length > 0 &&
    (grid === undefined ||
      !Number.isInteger(grid.columns) ||
      grid.columns <= 0 ||
      !Number.isInteger(grid.rows) ||
      grid.rows <= 0)
  ) {
    errors.push("Panelized mappings require a valid panel pixel grid.");
  }
  const columns = grid?.columns ?? 0;
  const rows = grid?.rows ?? 0;
  const ledsPerPanel = columns * rows;
  if (mapping.entries.length !== ledCount) {
    errors.push(
      `Mapping has ${mapping.entries.length} entries; engine has ${ledCount} LEDs.`,
    );
  }

  const physical = new Set<number>();
  const logical = new Set<number>();
  for (const entry of mapping.entries) {
    if (entry.physicalIndex < 0 || entry.physicalIndex >= ledCount) {
      errors.push(`Physical index ${entry.physicalIndex} is out of range.`);
    }
    if (entry.logicalIndex < 0 || entry.logicalIndex >= ledCount) {
      errors.push(`Logical index ${entry.logicalIndex} is out of range.`);
    }
    if (physical.has(entry.physicalIndex)) {
      errors.push(`Physical index ${entry.physicalIndex} is duplicated.`);
    }
    if (logical.has(entry.logicalIndex)) {
      errors.push(`Logical index ${entry.logicalIndex} is duplicated.`);
    }
    physical.add(entry.physicalIndex);
    logical.add(entry.logicalIndex);
  }

  const panelIds = new Set<string>();
  const entriesByPanel = new Map<string, LedMappingEntry[]>();
  for (const panel of mapping.panels) {
    if (panelIds.has(panel.id))
      errors.push(`Panel ID ${panel.id} is duplicated.`);
    panelIds.add(panel.id);
    entriesByPanel.set(panel.id, []);
  }

  for (const entry of mapping.entries) {
    if (entry.panelId === null) continue;
    const panelEntries = entriesByPanel.get(entry.panelId);
    if (!panelEntries) {
      errors.push(
        `LED ${entry.physicalIndex} references unknown panel ${entry.panelId}.`,
      );
      continue;
    }
    panelEntries.push(entry);
  }

  for (const panel of mapping.panels) {
    const panelEntries = entriesByPanel.get(panel.id) ?? [];
    if (panelEntries.length !== ledsPerPanel) {
      errors.push(
        `Panel ${panel.id} has ${panelEntries.length} LEDs; expected ${ledsPerPanel}.`,
      );
    }
    if (panel.ledIndices.length !== ledsPerPanel) {
      errors.push(
        `Panel ${panel.id} index list has ${panel.ledIndices.length} LEDs; expected ${ledsPerPanel}.`,
      );
    }

    const coordinates = new Set<string>();
    for (const entry of panelEntries) {
      const x = entry.panelPixelX;
      const y = entry.panelPixelY;
      if (
        x === null || y === null ||
        x < 0 || x >= columns || y < 0 || y >= rows
      ) {
        errors.push(`Panel ${panel.id} has an invalid panel-local coordinate.`);
        continue;
      }
      const key = `${x},${y}`;
      if (coordinates.has(key)) {
        errors.push(`Panel ${panel.id} coordinate ${key} is duplicated.`);
      }
      coordinates.add(key);
    }

    for (const neighborId of panel.neighborPanelIds) {
      if (!panelIds.has(neighborId)) {
        errors.push(
          `Panel ${panel.id} references unknown neighbor ${neighborId}.`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
