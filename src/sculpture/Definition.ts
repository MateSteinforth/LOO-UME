import panelProfileJson from "../../catalog/panels/ws2812b-8x8-66x65.json" with {
  type: "json",
};
import sculptureJson from "../../sculptures/rhombicosidodecahedron/legacy-migration-source.json" with {
  type: "json",
};

export type FactStatus = "unknown" | "provisional" | "measured";

export type PanelCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type PanelMountingHoleId =
  | "top-left"
  | "middle-left"
  | "bottom-left"
  | "top-right"
  | "middle-right"
  | "bottom-right";

export interface PanelMountingHoleDefinition {
  id: PanelMountingHoleId;
  localPosition: [number, number];
  mechanicalUse: "eligible" | "blocked";
  blockedBy?: "DIN" | "DOUT";
}

export interface PixelOrderDefinition {
  status: "provisional" | "measured";
  pixelZeroCorner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  traversalAxis: "rows" | "columns";
  lineProgression:
    | "top-to-bottom"
    | "bottom-to-top"
    | "left-to-right"
    | "right-to-left";
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
    holes: PanelMountingHoleDefinition[];
    capAllocation: {
      strategy: "minimum-total-edge-distance";
      useAllEligibleHolesWhenPossible: true;
      distinctClosurePerHole: true;
    };
    physicalCorrections: {
      holeEdge: number;
      surfaceFlush: number;
      status: "measured";
      note: string;
    };
  };
  dataConnectors: {
    referenceView: "back";
    orientationReference: "three-mounting-holes-vertical";
    cornerAssignmentStatus: "measured";
    dinCorner: PanelCorner;
    doutCorner: PanelCorner;
    padPositionStatus: FactStatus;
    note: string;
  };
  power: {
    status: "provisional";
    basis: "panel-photo-and-conservative-worst-case";
    nominalVoltage: 5;
    worstCaseCurrentPerPixel: number;
    worstCaseCurrentPerPanel: number;
    pads: {
      status: "provisional";
      availableAt: Array<"din-end" | "dout-end">;
      roles: Array<"V+" | "V-">;
      supportsIndependentFeedAndInjection: true;
    };
    singlePanelLead: {
      scope: "short-5v-and-ground-leads";
      minimumCrossSectionMm2: number;
      approximateAwg: number;
      sharedFeedsRequireLargerConductors: true;
    };
    voltageDrop: {
      maximumFraction: number;
      minimumPanelVoltage: number;
    };
    fusing: {
      status: "provisional";
      grouping: "one-fuse-per-small-panel-group";
      panelsPerFuse: number | null;
      sizingRule: "protect-wire";
    };
    note: string;
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

export interface PentagonUFrameDefinition {
  partId: "pentagon-u-frame";
  canonicalSource: "parts/pentagon_u.scad";
  generator: "verified-scad-wrapper";
  generatedFile: string;
  quantity: number;
  modes: {
    print: "print";
    assembly: "assembly";
    center: "center";
  };
  interfaces: {
    outerPanelEdges: number[];
    centerPanelHoles: Array<
      "bottom-left-corner" | "bottom-middle-edge" | "top-right-corner"
    >;
    centerPanelClearance: number;
    connectorCornerClearance: number;
  };
  print: {
    bedSurface: "outside-cover";
  };
}

export interface MiddlePanelConnectorDefinition {
  partId: "middle-panel-connector";
  canonicalSource: "parts/middle_panel_connector.scad";
  generator: "verified-scad-wrapper";
  generatedFile: string;
  quantity: number;
  modes: {
    print: "print";
    assembly: "assembly";
    installed: "part";
  };
  interfaces: Array<{
    panel: "center" | "outer";
    hole: "top-middle-edge" | "middle-edge";
    outerEdgeIndex?: number;
    edgeDistance: number;
  }>;
  print: {
    bedSurface: "center-panel-pad";
  };
}

export interface PentagonOpeningDefinition {
  faceType: "pentagon";
  count: number;
  population: {
    mode: "all-except";
    excluded: Array<"north-pole">;
    populatedCount: number;
  };
  closure: {
    assemblyId: "populated-pentagon-panel-mount";
    quantity: number;
    openOuterEdge: number;
    parts: [PentagonUFrameDefinition, MiddlePanelConnectorDefinition];
    assembly: {
      generatedFile: string;
      preview: "center-and-five-outer-panels";
    };
  };
}

export interface WiringDefinition {
  status: "provisional" | "measured";
  routeStrategy:
    | "longitude-sectors-nearest-neighbor"
    | "face-adjacency-nearest-neighbor";
  chainLengths: number[];
  controller: {
    placement: "near-top";
    status: "provisional";
  };
  connector: {
    edgeInset: number;
    surfaceOffset: number;
  };
  outputs: Array<{
    outputIndex: number;
    label: string;
    gpio: number | null;
    color: string;
    /**
     * Optional only for legacy draft projects. When present on every output,
     * this is the authoritative controller-to-DIN panel order.
     */
    panelIds?: string[];
  }>;
}

/**
 * Schema 2 treats routes as authored only when every output carries an exact
 * ordered panel list. Older chain-length-only projects remain draft inputs for
 * the deterministic preview heuristic.
 */
export function hasAuthoredWiringRoutes(
  wiring: WiringDefinition,
): boolean {
  return (
    wiring.outputs.length > 0 &&
    wiring.outputs.every((output) => Array.isArray(output.panelIds))
  );
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
    pentagonFaces: PentagonOpeningDefinition;
  };
  mapping: {
    projection: "equirectangular";
    logicalOrder: "north-to-south-then-longitude";
  };
  wiring: WiringDefinition;
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
  requireOneOf(order, "lineProgression", [
    "top-to-bottom",
    "bottom-to-top",
    "left-to-right",
    "right-to-left",
  ]);
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
  if (!Array.isArray(mounting.holes) || mounting.holes.length !== 6) {
    throw new Error("Panel mounting must declare all six physical holes.");
  }
  const expectedHoleIds: PanelMountingHoleId[] = [
    "top-left",
    "middle-left",
    "bottom-left",
    "top-right",
    "middle-right",
    "bottom-right",
  ];
  const mountingHoleIds = new Set<string>();
  for (const hole of mounting.holes) {
    if (
      !isRecord(hole) ||
      !expectedHoleIds.includes(hole.id as PanelMountingHoleId)
    ) {
      throw new Error("Panel mounting holes require known back-view IDs.");
    }
    if (mountingHoleIds.has(hole.id as string)) {
      throw new Error("Panel mounting hole IDs must be unique.");
    }
    mountingHoleIds.add(hole.id as string);
    if (
      !Array.isArray(hole.localPosition) ||
      hole.localPosition.length !== 2 ||
      hole.localPosition.some(
        (coordinate) =>
          typeof coordinate !== "number" || !Number.isFinite(coordinate),
      )
    ) {
      throw new Error(
        "Panel mounting-hole positions must contain two finite coordinates.",
      );
    }
    if (hole.mechanicalUse === "eligible") {
      if (hole.blockedBy !== undefined) {
        throw new Error(
          "Eligible mounting holes cannot be marked as connector-blocked.",
        );
      }
    } else if (
      hole.mechanicalUse !== "blocked" ||
      (hole.blockedBy !== "DIN" && hole.blockedBy !== "DOUT")
    ) {
      throw new Error("Blocked mounting holes must identify DIN or DOUT.");
    }
  }
  if (expectedHoleIds.some((id) => !mountingHoleIds.has(id))) {
    throw new Error(
      "Panel mounting must declare each of the six back-view holes once.",
    );
  }
  const eligibleHoleCount = mounting.holes.filter(
    (hole) => isRecord(hole) && hole.mechanicalUse === "eligible",
  ).length;
  if (eligibleHoleCount !== 4) {
    throw new Error(
      "This panel must expose exactly four mechanically eligible holes.",
    );
  }
  const capAllocation = requireRecord(mounting, "capAllocation");
  if (
    capAllocation.strategy !== "minimum-total-edge-distance" ||
    capAllocation.useAllEligibleHolesWhenPossible !== true ||
    capAllocation.distinctClosurePerHole !== true
  ) {
    throw new Error(
      "Cap allocation must use all eligible holes with one distinct closure per hole.",
    );
  }
  const corrections = requireRecord(mounting, "physicalCorrections");
  requireFiniteNumber(corrections, "holeEdge");
  requireFiniteNumber(corrections, "surfaceFlush");
  if (corrections.status !== "measured") {
    throw new Error("Physical fit corrections must remain measured facts.");
  }
  requireString(corrections, "note");

  const dataConnectors = requireRecord(input, "dataConnectors");
  if (
    dataConnectors.referenceView !== "back" ||
    dataConnectors.orientationReference !== "three-mounting-holes-vertical" ||
    dataConnectors.cornerAssignmentStatus !== "measured"
  ) {
    throw new Error(
      "Data connector corners require the measured back-view orientation.",
    );
  }
  const dinCorner = requireOneOf(dataConnectors, "dinCorner", [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ]);
  const doutCorner = requireOneOf(dataConnectors, "doutCorner", [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ]);
  if (dinCorner === doutCorner) {
    throw new Error("DIN and DOUT must use different panel corners.");
  }
  const holeById = new Map(
    mounting.holes.map((hole) => [
      (hole as Record<string, unknown>).id,
      hole as Record<string, unknown>,
    ]),
  );
  if (
    holeById.get(dinCorner)?.blockedBy !== "DIN" ||
    holeById.get(doutCorner)?.blockedBy !== "DOUT"
  ) {
    throw new Error(
      "DIN and DOUT corner holes must be blocked for mechanical use.",
    );
  }
  requireOneOf(dataConnectors, "padPositionStatus", [
    "unknown",
    "provisional",
    "measured",
  ]);
  requireString(dataConnectors, "note");

  const power = requireRecord(input, "power");
  if (
    power.status !== "provisional" ||
    power.basis !== "panel-photo-and-conservative-worst-case"
  ) {
    throw new Error("Panel power facts must remain explicitly provisional.");
  }
  const nominalVoltage = requirePositiveNumber(power, "nominalVoltage");
  if (nominalVoltage !== 5) {
    throw new Error("This panel profile requires a 5 V nominal supply.");
  }
  const currentPerPixel = requirePositiveNumber(
    power,
    "worstCaseCurrentPerPixel",
  );
  const currentPerPanel = requirePositiveNumber(
    power,
    "worstCaseCurrentPerPanel",
  );
  if (
    Math.abs(currentPerPanel - columns * rows * currentPerPixel) > 1e-9
  ) {
    throw new Error("Panel worst-case current must equal pixel count times per-pixel current.");
  }
  const pads = requireRecord(power, "pads");
  if (
    pads.status !== "provisional" ||
    pads.supportsIndependentFeedAndInjection !== true ||
    !Array.isArray(pads.availableAt) ||
    pads.availableAt.length !== 2 ||
    !pads.availableAt.includes("din-end") ||
    !pads.availableAt.includes("dout-end") ||
    !Array.isArray(pads.roles) ||
    pads.roles.length !== 2 ||
    !pads.roles.includes("V+") ||
    !pads.roles.includes("V-")
  ) {
    throw new Error("Power pads must provide provisional V+ and V- injection at both data ends.");
  }
  const singlePanelLead = requireRecord(power, "singlePanelLead");
  if (
    singlePanelLead.scope !== "short-5v-and-ground-leads" ||
    singlePanelLead.sharedFeedsRequireLargerConductors !== true
  ) {
    throw new Error("Single-panel wire sizing must not be applied to shared feeds.");
  }
  requirePositiveNumber(singlePanelLead, "minimumCrossSectionMm2");
  const approximateAwg = requirePositiveNumber(singlePanelLead, "approximateAwg");
  if (!Number.isInteger(approximateAwg)) {
    throw new Error("Approximate AWG must be an integer.");
  }
  const voltageDrop = requireRecord(power, "voltageDrop");
  const maximumDrop = requirePositiveNumber(voltageDrop, "maximumFraction");
  if (maximumDrop >= 1) {
    throw new Error("Maximum voltage-drop fraction must be below one.");
  }
  const minimumPanelVoltage = requirePositiveNumber(
    voltageDrop,
    "minimumPanelVoltage",
  );
  if (
    Math.abs(minimumPanelVoltage - nominalVoltage * (1 - maximumDrop)) > 1e-9
  ) {
    throw new Error("Minimum panel voltage must match the configured drop limit.");
  }
  const fusing = requireRecord(power, "fusing");
  if (
    fusing.status !== "provisional" ||
    fusing.grouping !== "one-fuse-per-small-panel-group" ||
    fusing.sizingRule !== "protect-wire" ||
    (fusing.panelsPerFuse !== null &&
      (!Number.isInteger(fusing.panelsPerFuse) ||
        (fusing.panelsPerFuse as number) <= 0))
  ) {
    throw new Error("Fuse grouping must remain provisional and protect the external wire.");
  }
  requireString(power, "note");

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

  const pentagonOpening = requireRecord(openings, "pentagonFaces");
  const pentagonPopulation = requireRecord(pentagonOpening, "population");
  if (
    pentagonOpening.faceType !== "pentagon" ||
    pentagonOpening.count !== 12 ||
    pentagonPopulation.mode !== "all-except" ||
    !Array.isArray(pentagonPopulation.excluded) ||
    pentagonPopulation.excluded.length !== 1 ||
    pentagonPopulation.excluded[0] !== "north-pole" ||
    pentagonPopulation.populatedCount !== 11
  ) {
    throw new Error("The current topology requires 11 populated pentagons and an open north pole.");
  }
  const pentagonClosure = requireRecord(pentagonOpening, "closure");
  if (
    pentagonClosure.assemblyId !== "populated-pentagon-panel-mount" ||
    pentagonClosure.quantity !== pentagonPopulation.populatedCount ||
    pentagonClosure.openOuterEdge !== 1
  ) {
    throw new Error("Unsupported populated-pentagon closure policy.");
  }
  if (!Array.isArray(pentagonClosure.parts) || pentagonClosure.parts.length !== 2) {
    throw new Error("Populated pentagons require a U-frame and middle connector.");
  }

  const uFrame = pentagonClosure.parts[0];
  if (!isRecord(uFrame)) throw new Error("Pentagon U-frame must be an object.");
  if (
    uFrame.partId !== "pentagon-u-frame" ||
    uFrame.canonicalSource !== "parts/pentagon_u.scad" ||
    uFrame.generator !== "verified-scad-wrapper" ||
    uFrame.quantity !== pentagonClosure.quantity
  ) {
    throw new Error("Unsupported pentagon U-frame template or quantity.");
  }
  const uFrameFile = requireString(uFrame, "generatedFile");
  if (!/^[^/]+[.]scad$/.test(uFrameFile)) {
    throw new Error("Generated U-frame filename must be a local .scad filename.");
  }
  const uFrameModes = requireRecord(uFrame, "modes");
  if (
    uFrameModes.print !== "print" ||
    uFrameModes.assembly !== "assembly" ||
    uFrameModes.center !== "center"
  ) {
    throw new Error("Pentagon U-frame must expose print, assembly, and center modes.");
  }
  const uFrameInterfaces = requireRecord(uFrame, "interfaces");
  if (
    !Array.isArray(uFrameInterfaces.outerPanelEdges) ||
    JSON.stringify(uFrameInterfaces.outerPanelEdges) !== JSON.stringify([0, 2, 3, 4]) ||
    !Array.isArray(uFrameInterfaces.centerPanelHoles) ||
    JSON.stringify(uFrameInterfaces.centerPanelHoles) !==
      JSON.stringify([
        "bottom-left-corner",
        "bottom-middle-edge",
        "top-right-corner",
      ])
  ) {
    throw new Error("Pentagon U-frame interfaces do not match its open-edge handedness.");
  }
  requirePositiveNumber(uFrameInterfaces, "centerPanelClearance");
  requirePositiveNumber(uFrameInterfaces, "connectorCornerClearance");
  const uFramePrint = requireRecord(uFrame, "print");
  if (uFramePrint.bedSurface !== "outside-cover") {
    throw new Error("Pentagon U-frame must print on its outside cover.");
  }

  const middleConnector = pentagonClosure.parts[1];
  if (!isRecord(middleConnector)) {
    throw new Error("Middle-panel connector must be an object.");
  }
  if (
    middleConnector.partId !== "middle-panel-connector" ||
    middleConnector.canonicalSource !== "parts/middle_panel_connector.scad" ||
    middleConnector.generator !== "verified-scad-wrapper" ||
    middleConnector.quantity !== pentagonClosure.quantity
  ) {
    throw new Error("Unsupported middle-panel connector template or quantity.");
  }
  const middleConnectorFile = requireString(middleConnector, "generatedFile");
  if (!/^[^/]+[.]scad$/.test(middleConnectorFile)) {
    throw new Error("Generated connector filename must be a local .scad filename.");
  }
  const middleConnectorModes = requireRecord(middleConnector, "modes");
  if (
    middleConnectorModes.print !== "print" ||
    middleConnectorModes.assembly !== "assembly" ||
    middleConnectorModes.installed !== "part"
  ) {
    throw new Error("Middle connector must expose print, assembly, and installed modes.");
  }
  if (!Array.isArray(middleConnector.interfaces) || middleConnector.interfaces.length !== 2) {
    throw new Error("Middle connector must declare center and outer panel interfaces.");
  }
  const centerInterface = middleConnector.interfaces[0];
  const outerInterface = middleConnector.interfaces[1];
  if (
    !isRecord(centerInterface) ||
    centerInterface.panel !== "center" ||
    centerInterface.hole !== "top-middle-edge" ||
    centerInterface.edgeDistance !== 8 ||
    !isRecord(outerInterface) ||
    outerInterface.panel !== "outer" ||
    outerInterface.outerEdgeIndex !== pentagonClosure.openOuterEdge ||
    outerInterface.hole !== "middle-edge" ||
    outerInterface.edgeDistance !== 8.2
  ) {
    throw new Error("Middle connector interfaces do not match the open pentagon edge.");
  }
  const middleConnectorPrint = requireRecord(middleConnector, "print");
  if (middleConnectorPrint.bedSurface !== "center-panel-pad") {
    throw new Error("Middle connector must print on its center-panel pad.");
  }
  const pentagonAssembly = requireRecord(pentagonClosure, "assembly");
  const pentagonAssemblyFile = requireString(pentagonAssembly, "generatedFile");
  if (
    !/^[^/]+[.]scad$/.test(pentagonAssemblyFile) ||
    pentagonAssembly.preview !== "center-and-five-outer-panels"
  ) {
    throw new Error("Unsupported generated pentagon assembly preview.");
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
  const controller = requireRecord(wiring, "controller");
  if (
    controller.placement !== "near-top" ||
    controller.status !== "provisional"
  ) {
    throw new Error("Data controller placement must be provisional and near the top.");
  }
  if (wiring.routeStrategy !== "longitude-sectors-nearest-neighbor") {
    throw new Error("Unsupported wiring route strategy.");
  }
  const connector = requireRecord(wiring, "connector");
  const connectorInset = requireFiniteNumber(connector, "edgeInset");
  if (connectorInset < 0) {
    throw new Error("Connector edge inset cannot be negative.");
  }
  requireFiniteNumber(connector, "surfaceOffset");

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
