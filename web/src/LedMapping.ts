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

export interface LedMapping {
  id: string;
  status: "provisional" | "measured";
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
    entries,
  };
}

export function validateMapping(mapping: LedMapping, ledCount: number): MappingValidation {
  const errors: string[] = [];
  if (mapping.entries.length !== ledCount) {
    errors.push(`Mapping has ${mapping.entries.length} entries; engine has ${ledCount} LEDs.`);
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

  return { valid: errors.length === 0, errors };
}
