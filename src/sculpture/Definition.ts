import panelProfileJson from "../../catalog/panels/ws2812b-8x8-66x65.json" with {
  type: "json",
};
import sculptureJson from "../../sculptures/rhombicosidodecahedron/sculpture.json" with {
  type: "json",
};

export type FactStatus = "unknown" | "provisional" | "measured";

export interface PixelOrderDefinition {
  status: "provisional" | "measured";
  pixelZeroCorner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  traversalAxis: "rows" | "columns";
  serpentine: boolean;
  firstLineDirection:
    | "left-to-right"
    | "right-to-left"
    | "top-to-bottom"
    | "bottom-to-top";
  description: string;
}

export interface PanelHardwareProfile {
  schemaVersion: "1.0.0";
  id: string;
  kind: "led-panel";
  units: "mm";
  dimensions: {
    width: number;
    height: number;
    thickness: number;
  };
  pixelGrid: {
    columns: number;
    rows: number;
    emitterOffset: number;
    provisionalOrder: PixelOrderDefinition;
  };
  mounting: {
    cornerHoleInset: number;
    middleHoleOffsetFromOuter: number;
    pcbHolePreviewDiameter: number;
    printedPilotDiameter: number;
    screwLeadIn: {
      diameter: number;
      depth: number;
    };
    physicalCorrections: {
      holeEdge: number;
      surfaceFlush: number;
      status: "measured";
      note: string;
    };
  };
  electricalKeepouts: {
    status: FactStatus;
    regions: unknown[];
    note: string;
  };
}

export interface TrianglePanelInterface {
  edgeIndex: 0 | 1 | 2;
  adjacentFaceType: "square";
  mountingHoleEnd: "opposite-electrical-connector";
  connectorCornerClearance: number;
  panelEnvelopeClearance: number;
}

export interface TriangleClosureDefinition {
  partId: "triangle-filler";
  canonicalSource: "parts/triangle.scad";
  generator: "verified-scad-wrapper";
  generatedFile: string;
  quantity: number;
  modes: {
    print: "print";
    assembly: "assembly";
  };
  handedness: -1 | 1;
  interfaces: TrianglePanelInterface[];
  print: {
    bedSurface: "outside-cover";
  };
}

export interface TriangleOpeningDefinition {
  faceType: "triangle";
  count: number;
  population: "all";
  closure: TriangleClosureDefinition;
}

export interface SculptureDefinition {
  schemaVersion: "1.0.0";
  id: string;
  name: string;
  units: "mm";
  status: "provisional" | "measured";
  panelProfile: string;
  topology: {
    kind: "regular-polyhedron";
    family: "rhombicosidodecahedron";
    construction: "rectified-icosahedron-dual-frames";
    orientation: "vertex-up";
    faceEdge: number;
    population: {
      squareFaces: "all";
      pentagonFaces: {
        mode: "all-except";
        excluded: Array<"north-pole">;
      };
      triangleFaces: "fillers";
    };
  };
  centerPanelMount: {
    rotationDegrees: number;
    offsetX: number;
    offsetY: number;
    recess: number;
    polarEdgeRule: "top-edge-north-bottom-edge-south";
  };
  openings: {
    triangleFaces: TriangleOpeningDefinition;
  };
  mapping: {
    projection: "equirectangular";
    logicalOrder: "north-to-south-then-longitude";
  };
  wiring: {
    status: "provisional" | "measured";
    routeStrategy: "longitude-sectors-nearest-neighbor";
    chainLengths: number[];
    connector: {
      diagonal: "top-left-to-bottom-right";
      edgeInset: number;
      surfaceOffset: number;
      dinDoutAssignmentStatus: "provisional" | "measured";
    };
    outputs: Array<{
      outputIndex: number;
      label: string;
      gpio: number | null;
      color: string;
    }>;
  };
  calibration: {
    panelTransforms: "generated-provisional" | "measured";
    installedPanelOrientation: FactStatus;
    panelPixelOrder: "provisional" | "measured";
    physicalChains: "provisional" | "measured";
  };
  notes: string[];
}

export interface SculptureProject {
  sculpture: SculptureDefinition;
  panelProfile: PanelHardwareProfile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(
  parent: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = parent[key];
  if (!isRecord(value)) throw new Error(`${key} must be an object.`);
  return value;
}

function requireString(parent: Record<string, unknown>, key: string): string {
  const value = parent[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} must be a non-empty string.`);
  }
  return value;
}

function requirePositiveNumber(
  parent: Record<string, unknown>,
  key: string,
): number {
  const value = parent[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${key} must be a positive finite number.`);
  }
  return value;
}

function requireFiniteNumber(
  parent: Record<string, unknown>,
  key: string,
): number {
  const value = parent[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number.`);
  }
  return value;
}

function requireOneOf<T extends string>(
  parent: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T {
  const value = parent[key];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${key} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T;
}

export function parsePanelHardwareProfile(
  input: unknown,
): PanelHardwareProfile {
  if (!isRecord(input)) throw new Error("Panel profile must be a JSON object.");
  if (input.schemaVersion !== "1.0.0") {
    throw new Error("Unsupported panel-profile schema version.");
  }
  if (input.kind !== "led-panel" || input.units !== "mm") {
    throw new Error("Panel profile must describe an LED panel in millimetres.");
  }

  const dimensions = requireRecord(input, "dimensions");
  requirePositiveNumber(dimensions, "width");
  requirePositiveNumber(dimensions, "height");
  requirePositiveNumber(dimensions, "thickness");
  const pixelGrid = requireRecord(input, "pixelGrid");
  const columns = requirePositiveNumber(pixelGrid, "columns");
  const rows = requirePositiveNumber(pixelGrid, "rows");
  if (!Number.isInteger(columns) || !Number.isInteger(rows)) {
    throw new Error("Pixel grid dimensions must be integers.");
  }
  requireFiniteNumber(pixelGrid, "emitterOffset");
  const order = requireRecord(pixelGrid, "provisionalOrder");
  requireOneOf(order, "status", ["provisional", "measured"]);
  requireOneOf(order, "pixelZeroCorner", [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ]);
  requireOneOf(order, "traversalAxis", ["rows", "columns"]);
  requireOneOf(order, "firstLineDirection", [
    "left-to-right",
    "right-to-left",
    "top-to-bottom",
    "bottom-to-top",
  ]);
  if (typeof order.serpentine !== "boolean") {
    throw new Error("Panel pixel order serpentine must be boolean.");
  }
  requireString(order, "description");

  const mounting = requireRecord(input, "mounting");
  for (const key of [
    "cornerHoleInset",
    "middleHoleOffsetFromOuter",
    "pcbHolePreviewDiameter",
    "printedPilotDiameter",
  ]) {
    requirePositiveNumber(mounting, key);
  }
  const pilotDiameter = mounting.printedPilotDiameter as number;
  const leadIn = requireRecord(mounting, "screwLeadIn");
  const leadInDiameter = requirePositiveNumber(leadIn, "diameter");
  requirePositiveNumber(leadIn, "depth");
  if (leadInDiameter <= pilotDiameter) {
    throw new Error("Screw lead-in diameter must exceed the printed pilot.");
  }
  const corrections = requireRecord(mounting, "physicalCorrections");
  requireFiniteNumber(corrections, "holeEdge");
  requireFiniteNumber(corrections, "surfaceFlush");
  if (corrections.status !== "measured") {
    throw new Error("Physical fit corrections must remain measured facts.");
  }
  requireString(corrections, "note");

  const keepouts = requireRecord(input, "electricalKeepouts");
  requireOneOf(keepouts, "status", ["unknown", "provisional", "measured"]);
  if (!Array.isArray(keepouts.regions)) {
    throw new Error("Electrical keep-out regions must be an array.");
  }
  requireString(keepouts, "note");
  requireString(input, "id");
  return input as unknown as PanelHardwareProfile;
}

export function parseSculptureDefinition(input: unknown): SculptureDefinition {
  if (!isRecord(input)) {
    throw new Error("Sculpture definition must be a JSON object.");
  }
  if (input.schemaVersion !== "1.0.0") {
    throw new Error("Unsupported sculpture schema version.");
  }
  if (input.units !== "mm") {
    throw new Error("Sculpture units must be millimetres.");
  }
  if (input.status !== "provisional" && input.status !== "measured") {
    throw new Error("Sculpture status must be provisional or measured.");
  }
  requireString(input, "id");
  requireString(input, "name");
  requireString(input, "panelProfile");

  const topology = requireRecord(input, "topology");
  if (
    topology.kind !== "regular-polyhedron" ||
    topology.family !== "rhombicosidodecahedron" ||
    topology.construction !== "rectified-icosahedron-dual-frames" ||
    topology.orientation !== "vertex-up"
  ) {
    throw new Error(
      "This compiler currently supports the vertex-up rhombicosidodecahedron recipe.",
    );
  }
  requirePositiveNumber(topology, "faceEdge");
  const population = requireRecord(topology, "population");
  const pentagons = requireRecord(population, "pentagonFaces");
  if (
    population.squareFaces !== "all" ||
    population.triangleFaces !== "fillers" ||
    pentagons.mode !== "all-except" ||
    !Array.isArray(pentagons.excluded) ||
    pentagons.excluded.length !== 1 ||
    pentagons.excluded[0] !== "north-pole"
  ) {
    throw new Error(
      "The current recipe requires all squares, triangle fillers, and an open north pentagon.",
    );
  }

  const centerMount = requireRecord(input, "centerPanelMount");
  requireFiniteNumber(centerMount, "rotationDegrees");
  requireFiniteNumber(centerMount, "offsetX");
  requireFiniteNumber(centerMount, "offsetY");
  const recess = requireFiniteNumber(centerMount, "recess");
  if (recess < 0) throw new Error("Centre-panel recess cannot be negative.");
  if (centerMount.polarEdgeRule !== "top-edge-north-bottom-edge-south") {
    throw new Error("Unsupported centre-panel polar edge rule.");
  }

  const openings = requireRecord(input, "openings");
  const triangleOpening = requireRecord(openings, "triangleFaces");
  if (
    triangleOpening.faceType !== "triangle" ||
    triangleOpening.population !== "all" ||
    triangleOpening.count !== 20
  ) {
    throw new Error("The current topology requires all 20 triangular openings.");
  }
  const closure = requireRecord(triangleOpening, "closure");
  if (
    closure.partId !== "triangle-filler" ||
    closure.canonicalSource !== "parts/triangle.scad" ||
    closure.generator !== "verified-scad-wrapper"
  ) {
    throw new Error("Unsupported triangular closure template.");
  }
  const generatedFile = requireString(closure, "generatedFile");
  if (!/^[^/]+[.]scad$/.test(generatedFile)) {
    throw new Error("Generated CAD filenames must be local .scad filenames.");
  }
  if (closure.quantity !== triangleOpening.count) {
    throw new Error("Triangle closure quantity must match the opening count.");
  }
  const modes = requireRecord(closure, "modes");
  if (modes.print !== "print" || modes.assembly !== "assembly") {
    throw new Error("Triangle closure must expose print and assembly modes.");
  }
  if (closure.handedness !== -1 && closure.handedness !== 1) {
    throw new Error("Triangle closure handedness must be -1 or 1.");
  }
  if (!Array.isArray(closure.interfaces) || closure.interfaces.length !== 3) {
    throw new Error("Triangle closure must declare exactly three panel interfaces.");
  }
  for (const [edgeIndex, panelInterface] of closure.interfaces.entries()) {
    if (!isRecord(panelInterface)) {
      throw new Error("Each triangle panel interface must be an object.");
    }
    if (
      panelInterface.edgeIndex !== edgeIndex ||
      panelInterface.adjacentFaceType !== "square" ||
      panelInterface.mountingHoleEnd !== "opposite-electrical-connector"
    ) {
      throw new Error(
        `Triangle interface ${edgeIndex} must describe its matching square edge and safe mounting end.`,
      );
    }
    requirePositiveNumber(panelInterface, "connectorCornerClearance");
    const envelopeClearance = requireFiniteNumber(
      panelInterface,
      "panelEnvelopeClearance",
    );
    if (envelopeClearance < 0) {
      throw new Error("Panel envelope clearance cannot be negative.");
    }
  }
  const referenceInterface = closure.interfaces[0] as Record<string, unknown>;
  if (
    closure.interfaces.some(
      (panelInterface) =>
        !isRecord(panelInterface) ||
        panelInterface.connectorCornerClearance !==
          referenceInterface.connectorCornerClearance ||
        panelInterface.panelEnvelopeClearance !==
          referenceInterface.panelEnvelopeClearance,
    )
  ) {
    throw new Error("The canonical triangle currently requires symmetric edge clearances.");
  }
  const print = requireRecord(closure, "print");
  if (print.bedSurface !== "outside-cover") {
    throw new Error("Triangle fillers must print on the outside cover surface.");
  }

  const mapping = requireRecord(input, "mapping");
  if (
    mapping.projection !== "equirectangular" ||
    mapping.logicalOrder !== "north-to-south-then-longitude"
  ) {
    throw new Error("Unsupported mapping policy.");
  }

  const wiring = requireRecord(input, "wiring");
  requireOneOf(wiring, "status", ["provisional", "measured"]);
  if (wiring.routeStrategy !== "longitude-sectors-nearest-neighbor") {
    throw new Error("Unsupported wiring route strategy.");
  }
  const connector = requireRecord(wiring, "connector");
  if (connector.diagonal !== "top-left-to-bottom-right") {
    throw new Error("Unsupported connector diagonal.");
  }
  const connectorInset = requireFiniteNumber(connector, "edgeInset");
  if (connectorInset < 0) {
    throw new Error("Connector edge inset cannot be negative.");
  }
  requireFiniteNumber(connector, "surfaceOffset");
  requireOneOf(connector, "dinDoutAssignmentStatus", [
    "provisional",
    "measured",
  ]);

  if (!Array.isArray(wiring.chainLengths) || !Array.isArray(wiring.outputs)) {
    throw new Error("Wiring must provide chainLengths and outputs arrays.");
  }
  if (
    wiring.chainLengths.length !== wiring.outputs.length ||
    wiring.chainLengths.some(
      (length) => typeof length !== "number" || !Number.isInteger(length) || length <= 0,
    )
  ) {
    throw new Error("Wiring chain lengths must be positive integers matching the outputs.");
  }
  const outputIndices = new Set<number>();
  for (const output of wiring.outputs) {
    if (!isRecord(output)) throw new Error("Each wiring output must be an object.");
    const outputIndex = output.outputIndex;
    if (
      typeof outputIndex !== "number" ||
      !Number.isInteger(outputIndex) ||
      outputIndex < 0 ||
      outputIndices.has(outputIndex)
    ) {
      throw new Error("Wiring output indices must be unique non-negative integers.");
    }
    outputIndices.add(outputIndex);
    requireString(output, "label");
    const color = requireString(output, "color");
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      throw new Error("Wiring output colors must use #RRGGBB syntax.");
    }
    if (
      output.gpio !== null &&
      (!Number.isInteger(output.gpio) || (output.gpio as number) < 0)
    ) {
      throw new Error("Wiring GPIO must be null or an integer.");
    }
  }
  const expectedPanelCount = 41;
  const routedPanelCount = wiring.chainLengths.reduce(
    (total, length) => total + (length as number),
    0,
  );
  if (routedPanelCount !== expectedPanelCount) {
    throw new Error(`Wiring covers ${routedPanelCount} panels; expected ${expectedPanelCount}.`);
  }

  const calibration = requireRecord(input, "calibration");
  requireOneOf(calibration, "panelTransforms", [
    "generated-provisional",
    "measured",
  ]);
  requireOneOf(calibration, "installedPanelOrientation", [
    "unknown",
    "provisional",
    "measured",
  ]);
  requireOneOf(calibration, "panelPixelOrder", ["provisional", "measured"]);
  requireOneOf(calibration, "physicalChains", ["provisional", "measured"]);

  if (!Array.isArray(input.notes) || input.notes.some((note) => typeof note !== "string")) {
    throw new Error("Sculpture notes must be an array of strings.");
  }
  return input as unknown as SculptureDefinition;
}

export function loadCanonicalSculptureProject(): SculptureProject {
  const sculpture = parseSculptureDefinition(sculptureJson);
  const panelProfile = parsePanelHardwareProfile(panelProfileJson);
  if (sculpture.panelProfile !== panelProfile.id) {
    throw new Error(
      `Sculpture requests panel profile ${sculpture.panelProfile}; loaded ${panelProfile.id}.`,
    );
  }
  return { sculpture, panelProfile };
}

export const CANONICAL_SCULPTURE_PROJECT = loadCanonicalSculptureProject();
