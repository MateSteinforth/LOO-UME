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
  pixelOrder: {
    status: "unknown" | "measured";
    pixelZeroCorner: string | null;
    serpentineAxis: "rows" | "columns" | null;
    firstRowDirection: string | null;
  };
  wiring: {
    status: "unassigned" | "assigned";
    output: number | null;
    chainPosition: number | null;
    previousPanelId: string | null;
    nextPanelId: string | null;
  };
}

export interface LedMapping {
  id: string;
  status: "provisional" | "measured";
  topology: "panelized-sculpture" | "uniform-sphere" | "custom";
  panels: PanelDefinition[];
  notes: string[];
  entries: LedMappingEntry[];
}

export interface MappingValidation {
  valid: boolean;
  errors: string[];
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const PHI = (1 + Math.sqrt(5)) / 2;
const PANEL_LED_SIDE = 8;
const LEDS_PER_PANEL = PANEL_LED_SIDE * PANEL_LED_SIDE;

/**
 * Dimensions and relative placement copied from the canonical OpenSCAD parts.
 * The global face numbering/orientation and electrical mapping remain
 * provisional, but these mechanical relationships are not arbitrary preview
 * values.
 */
export const SCULPTURE_GEOMETRY = {
  faceEdge: 66,
  squarePanelWidth: 66,
  squarePanelHeight: 65,
  centerPanelWidth: 66,
  centerPanelHeight: 65,
  centerPanelOffsetX: 9.62,
  centerPanelOffsetY: -7.04,
  centerPanelRotationDegrees: 234,
  centerPanelRecess: 0.7,
  squarePentagonFoldDegrees: 31.717474,
} as const;

const CENTER_PANEL_ROTATION_RADIANS =
  (SCULPTURE_GEOMETRY.centerPanelRotationDegrees * Math.PI) / 180;
const CENTER_PANEL_OFFSET_ALONG_X =
  SCULPTURE_GEOMETRY.centerPanelOffsetX *
    Math.cos(CENTER_PANEL_ROTATION_RADIANS) +
  SCULPTURE_GEOMETRY.centerPanelOffsetY *
    Math.sin(CENTER_PANEL_ROTATION_RADIANS);
const CENTER_PANEL_OFFSET_ALONG_Y =
  -SCULPTURE_GEOMETRY.centerPanelOffsetX *
    Math.sin(CENTER_PANEL_ROTATION_RADIANS) +
  SCULPTURE_GEOMETRY.centerPanelOffsetY *
    Math.cos(CENTER_PANEL_ROTATION_RADIANS);
const PENTAGON_APOTHEM =
  SCULPTURE_GEOMETRY.faceEdge / (2 * Math.tan(Math.PI / 5));
const SQUARE_APOTHEM = SCULPTURE_GEOMETRY.faceEdge / 2;
const SQUARE_PENTAGON_FOLD_RADIANS =
  (SCULPTURE_GEOMETRY.squarePentagonFoldDegrees * Math.PI) / 180;
const FOLD_SIN = Math.sin(SQUARE_PENTAGON_FOLD_RADIANS);
const FOLD_COS = Math.cos(SQUARE_PENTAGON_FOLD_RADIANS);

// Unlike a sphere, unlike face types do not share one plane radius. These
// distances make their shared edge land at the correct face apothem.
const PENTAGON_FACE_DISTANCE =
  (SQUARE_APOTHEM + FOLD_COS * PENTAGON_APOTHEM) / FOLD_SIN;
const SQUARE_FACE_DISTANCE =
  (PENTAGON_APOTHEM + FOLD_COS * SQUARE_APOTHEM) / FOLD_SIN;
const LED_EMITTER_OFFSET = 1.2;

interface PanelSeed {
  faceType: PanelFaceType;
  normal: Vector3Data;
  sourceVertex?: number;
  sourceEdge?: [number, number];
}

function vector(x: number, y: number, z: number): Vector3Data {
  return { x, y, z };
}

function add(a: Vector3Data, b: Vector3Data): Vector3Data {
  return vector(a.x + b.x, a.y + b.y, a.z + b.z);
}

function subtract(a: Vector3Data, b: Vector3Data): Vector3Data {
  return vector(a.x - b.x, a.y - b.y, a.z - b.z);
}

function scale(value: Vector3Data, amount: number): Vector3Data {
  return vector(value.x * amount, value.y * amount, value.z * amount);
}

function cross(a: Vector3Data, b: Vector3Data): Vector3Data {
  return vector(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  );
}

function dot(a: Vector3Data, b: Vector3Data): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(value: Vector3Data): Vector3Data {
  const length = Math.hypot(value.x, value.y, value.z);
  if (length === 0) throw new Error("Cannot normalize a zero-length vector.");
  return scale(value, 1 / length);
}

function distanceSquared(a: Vector3Data, b: Vector3Data): number {
  const x = a.x - b.x;
  const y = a.y - b.y;
  const z = a.z - b.z;
  return x * x + y * y + z * z;
}

function compareNormals(a: PanelSeed, b: PanelSeed): number {
  if (Math.abs(a.normal.y - b.normal.y) > 1e-9) return b.normal.y - a.normal.y;
  const longitudeA = Math.atan2(a.normal.z, a.normal.x);
  const longitudeB = Math.atan2(b.normal.z, b.normal.x);
  return longitudeA - longitudeB;
}

function createIcosahedronSeeds(): {
  vertices: Vector3Data[];
  pentagons: PanelSeed[];
  squares: PanelSeed[];
} {
  const vertices = [
    vector(0, 1, PHI),
    vector(0, 1, -PHI),
    vector(0, -1, PHI),
    vector(0, -1, -PHI),
    vector(1, PHI, 0),
    vector(1, -PHI, 0),
    vector(-1, PHI, 0),
    vector(-1, -PHI, 0),
    vector(PHI, 0, 1),
    vector(PHI, 0, -1),
    vector(-PHI, 0, 1),
    vector(-PHI, 0, -1),
  ].map(normalize);

  let edgeDistanceSquared = Number.POSITIVE_INFINITY;
  for (let first = 0; first < vertices.length; first += 1) {
    for (let second = first + 1; second < vertices.length; second += 1) {
      edgeDistanceSquared = Math.min(
        edgeDistanceSquared,
        distanceSquared(vertices[first]!, vertices[second]!),
      );
    }
  }

  const edges: Array<[number, number]> = [];
  for (let first = 0; first < vertices.length; first += 1) {
    for (let second = first + 1; second < vertices.length; second += 1) {
      if (
        Math.abs(
          distanceSquared(vertices[first]!, vertices[second]!) -
            edgeDistanceSquared,
        ) < 1e-8
      ) {
        edges.push([first, second]);
      }
    }
  }

  return {
    vertices,
    pentagons: vertices
      .map((normal, sourceVertex) => ({
        faceType: "pentagon-centre" as const,
        normal,
        sourceVertex,
      }))
      .sort(compareNormals),
    squares: edges
      .map((sourceEdge) => ({
        faceType: "square-face" as const,
        normal: normalize(
          add(vertices[sourceEdge[0]]!, vertices[sourceEdge[1]]!),
        ),
        sourceEdge,
      }))
      .sort(compareNormals),
  };
}

function tangentAxes(normal: Vector3Data): {
  xAxis: Vector3Data;
  yAxis: Vector3Data;
} {
  const reference =
    Math.abs(normal.y) < 0.9 ? vector(0, 1, 0) : vector(0, 0, 1);
  const xAxis = normalize(cross(reference, normal));
  const yAxis = normalize(cross(normal, xAxis));
  return { xAxis, yAxis };
}

function equirectangularUv(position: Vector3Data): { u: number; v: number } {
  const direction = normalize(position);
  return {
    u: (Math.atan2(direction.z, direction.x) / (2 * Math.PI) + 1) % 1,
    v: Math.acos(Math.max(-1, Math.min(1, direction.y))) / Math.PI,
  };
}

/**
 * Generates the known 42-panel topology without claiming measured transforms or
 * wiring. Pentagon-centre normals use the 12 icosahedron vertices; square-face
 * normals use its 30 edge midpoints. Their adjacent normal angle is the proven
 * 31.717474 degree square/pentagon fold angle from the mechanical sources.
 */
export function createPanelizedSculptureMapping(): LedMapping {
  const { vertices, pentagons: pentagonSeeds, squares: squareSeeds } =
    createIcosahedronSeeds();
  if (pentagonSeeds.length !== 12 || squareSeeds.length !== 30) {
    throw new Error(
      "Generated panel topology must contain 12 pentagons and 30 squares.",
    );
  }

  const pentagonIdByVertex = new Map<number, string>();
  for (let index = 0; index < pentagonSeeds.length; index += 1) {
    pentagonIdByVertex.set(
      pentagonSeeds[index]!.sourceVertex!,
      `PC-${String(index + 1).padStart(2, "0")}`,
    );
  }

  const pentagonNeighbors = new Map<string, string[]>();
  const squareNeighbors = new Map<string, string[]>();
  for (let index = 0; index < squareSeeds.length; index += 1) {
    const squareId = `SQ-${String(index + 1).padStart(2, "0")}`;
    const edge = squareSeeds[index]!.sourceEdge!;
    const neighbors = edge.map(
      (vertexIndex) => pentagonIdByVertex.get(vertexIndex)!,
    );
    squareNeighbors.set(squareId, neighbors);
    for (const pentagonId of neighbors) {
      const existing = pentagonNeighbors.get(pentagonId) ?? [];
      existing.push(squareId);
      pentagonNeighbors.set(pentagonId, existing);
    }
  }

  const makePanel = (
    seed: PanelSeed,
    id: string,
    neighborPanelIds: string[],
    position: Vector3Data,
    xAxis: Vector3Data,
    yAxis: Vector3Data,
    previewWidth: number,
    previewHeight: number,
  ): PanelDefinition => {
    return {
      id,
      faceType: seed.faceType,
      transformStatus: "generated-provisional",
      position,
      normal: seed.normal,
      xAxis,
      yAxis,
      previewWidth,
      previewHeight,
      neighborPanelIds,
      ledIndices: [],
      rotationDegrees: null,
      mirrored: null,
      pixelOrder: {
        status: "unknown",
        pixelZeroCorner: null,
        serpentineAxis: null,
        firstRowDirection: null,
      },
      wiring: {
        status: "unassigned",
        output: null,
        chainPosition: null,
        previousPanelId: null,
        nextPanelId: null,
      },
    };
  };

  const squarePanels = squareSeeds.map((seed, index) => {
    const id = `SQ-${String(index + 1).padStart(2, "0")}`;
    const [firstVertex, secondVertex] = seed.sourceEdge!;
    const yAxis = normalize(
      subtract(vertices[secondVertex]!, vertices[firstVertex]!),
    );
    const xAxis = normalize(cross(yAxis, seed.normal));
    return makePanel(
      seed,
      id,
      squareNeighbors.get(id) ?? [],
      scale(seed.normal, SQUARE_FACE_DISTANCE),
      xAxis,
      yAxis,
      SCULPTURE_GEOMETRY.squarePanelWidth,
      SCULPTURE_GEOMETRY.squarePanelHeight,
    );
  });
  const pentagonPanels = pentagonSeeds.map((seed, index) => {
    const id = `PC-${String(index + 1).padStart(2, "0")}`;
    const neighborIds = pentagonNeighbors.get(id) ?? [];
    const targetDirection = tangentAxes(seed.normal).yAxis;
    const selectedSquare = squarePanels
      .filter((panel) => neighborIds.includes(panel.id))
      .map((panel) => ({
        panel,
        toEdge: normalize(
          subtract(
            panel.normal,
            scale(seed.normal, dot(panel.normal, seed.normal)),
          ),
        ),
      }))
      .sort(
        (first, second) =>
          dot(second.toEdge, targetDirection) -
            dot(first.toEdge, targetDirection) ||
          first.panel.id.localeCompare(second.panel.id),
      )[0];
    if (!selectedSquare) {
      throw new Error(`Pentagon ${id} has no surrounding square panel.`);
    }

    // pentagon_u.scad places the centre panel with its +X axis parallel to
    // the selected open edge. Project its exact (9.62, -7.04) offset through
    // the canonical 234 degree rotation into these panel-local axes.
    const yAxis = selectedSquare.toEdge;
    const xAxis = normalize(cross(yAxis, seed.normal));
    const position = add(
      add(
        scale(
          seed.normal,
          PENTAGON_FACE_DISTANCE - SCULPTURE_GEOMETRY.centerPanelRecess,
        ),
        scale(xAxis, CENTER_PANEL_OFFSET_ALONG_X),
      ),
      scale(yAxis, CENTER_PANEL_OFFSET_ALONG_Y),
    );
    return makePanel(
      seed,
      id,
      neighborIds,
      position,
      xAxis,
      yAxis,
      SCULPTURE_GEOMETRY.centerPanelWidth,
      SCULPTURE_GEOMETRY.centerPanelHeight,
    );
  });
  const panels = [...squarePanels, ...pentagonPanels];
  const entries: LedMappingEntry[] = [];

  for (let panelIndex = 0; panelIndex < panels.length; panelIndex += 1) {
    const panel = panels[panelIndex]!;
    const pitchX = panel.previewWidth / 9;
    const pitchY = panel.previewHeight / 9;
    for (let panelPixelY = 0; panelPixelY < PANEL_LED_SIDE; panelPixelY += 1) {
      for (
        let panelPixelX = 0;
        panelPixelX < PANEL_LED_SIDE;
        panelPixelX += 1
      ) {
        const physicalIndex =
          panelIndex * LEDS_PER_PANEL +
          panelPixelY * PANEL_LED_SIDE +
          panelPixelX;
        const localX = (panelPixelX - 3.5) * pitchX;
        const localY = (3.5 - panelPixelY) * pitchY;
        const position = add(
          add(panel.position, scale(panel.xAxis, localX)),
          add(
            scale(panel.yAxis, localY),
            scale(panel.normal, LED_EMITTER_OFFSET),
          ),
        );
        const { u, v } = equirectangularUv(position);
        entries.push({
          physicalIndex,
          logicalIndex: physicalIndex,
          panelId: panel.id,
          panelPixelX,
          panelPixelY,
          u,
          v,
          ...position,
        });
        panel.ledIndices.push(physicalIndex);
      }
    }
  }

  return {
    id: "generated-rhombicosidodecahedron-42-panel-preview",
    status: "provisional",
    topology: "panelized-sculpture",
    panels,
    notes: [
      "Square face planes and panel axes use the 66 mm rhombicosidodecahedron geometry and proven 31.717474 degree fold.",
      "Pentagon-centre panels use the canonical 234 degree, 9.62/-7.04 mm OpenSCAD placement relative to a selected neighboring square edge.",
      "Global sculpture rotation, the selected open edge on each pentagon, mirroring, pixel-zero corner, serpentine order, and wiring remain unmeasured.",
      "Logical and physical indices use synthetic row-major preview order only.",
    ],
    entries,
  };
}

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

  if (mapping.topology === "panelized-sculpture") {
    if (mapping.panels.length !== 42) {
      errors.push(
        `Panel topology has ${mapping.panels.length} panels; expected 42.`,
      );
    }
    const squareCount = mapping.panels.filter(
      (panel) => panel.faceType === "square-face",
    ).length;
    const pentagonCount = mapping.panels.filter(
      (panel) => panel.faceType === "pentagon-centre",
    ).length;
    if (squareCount !== 30 || pentagonCount !== 12) {
      errors.push(
        `Panel topology has ${squareCount} square and ${pentagonCount} pentagon-centre panels; expected 30 and 12.`,
      );
    }
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
    if (panelEntries.length !== LEDS_PER_PANEL) {
      errors.push(
        `Panel ${panel.id} has ${panelEntries.length} LEDs; expected 64.`,
      );
    }
    if (panel.ledIndices.length !== LEDS_PER_PANEL) {
      errors.push(
        `Panel ${panel.id} index list has ${panel.ledIndices.length} LEDs; expected 64.`,
      );
    }

    const coordinates = new Set<string>();
    for (const entry of panelEntries) {
      const x = entry.panelPixelX;
      const y = entry.panelPixelY;
      if (x === null || y === null || x < 0 || x >= 8 || y < 0 || y >= 8) {
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
