import {
  validatePanelCarrier,
  type PanelCarrierDefinition,
} from "./PanelCarrier.ts";
export type { PanelCarrierDefinition } from "./PanelCarrier.ts";

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

export type LedChannelSequence = "GRB" | "RGB" | "BRG" | "RBG" | "BGR" | "GBR";

export interface PanelColorOrderDefinition {
  status: "provisional" | "measured";
  channelSequence: LedChannelSequence;
  wledValue: 0 | 1 | 2 | 3 | 4 | 5;
  note: string;
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
  carrier?: PanelCarrierDefinition;
  pixelGrid: {
    columns: number;
    rows: number;
    emitterOffset: number;
    /** Optional row-major grid-coordinate XYZ positions in the panel pose frame. */
    localEmitterPositions?: Array<[number, number, number]>;
    colorOrder: PanelColorOrderDefinition;
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
    /** Optional exact anchors in the authoritative panel pose frame. */
    localPositions?: {
      coordinateFrame: "pose-local";
      din: [number, number, number];
      dout: [number, number, number];
    };
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

export type PanelLocalPosition = [number, number, number];

/**
 * Resolve every row-major grid coordinate to one pose-local emitter position.
 * Profiles without explicit positions retain the historical grid exactly.
 */
export function panelEmitterLocalPositions(
  profile: PanelHardwareProfile,
): PanelLocalPosition[] {
  if (profile.pixelGrid.localEmitterPositions) {
    return profile.pixelGrid.localEmitterPositions.map((position) => [
      position[0],
      position[1],
      position[2],
    ]);
  }
  const { columns, rows, emitterOffset } = profile.pixelGrid;
  const pitchX = profile.dimensions.width / (columns + 1);
  const pitchY = profile.dimensions.height / (rows + 1);
  return Array.from({ length: columns * rows }, (_, physicalIndex) => {
    const pixelX = physicalIndex % columns;
    const pixelY = Math.floor(physicalIndex / columns);
    return [
      (pixelX - (columns - 1) / 2) * pitchX,
      ((rows - 1) / 2 - pixelY) * pitchY,
      emitterOffset,
    ];
  });
}

/** Resolve DIN/DOUT to pose-local XYZ, preserving the legacy corner rule. */
export function panelConnectorLocalPosition(
  profile: PanelHardwareProfile,
  edgeInset: number,
  kind: "din" | "dout",
): PanelLocalPosition {
  const explicit = profile.dataConnectors.localPositions?.[kind];
  if (explicit) return [explicit[0], explicit[1], explicit[2]];
  const corner = kind === "din"
    ? profile.dataConnectors.dinCorner
    : profile.dataConnectors.doutCorner;
  const backX = corner.endsWith("left") ? -1 : 1;
  return [
    -backX * (profile.dimensions.width / 2 - edgeInset),
    (corner.startsWith("bottom") ? -1 : 1) *
      (profile.dimensions.height / 2 - edgeInset),
    0,
  ];
}

/** Convert measured PCB back-view XY into the outward-facing panel pose XY. */
export function panelBackViewPointToOutwardPoseLocal(
  localPosition: readonly [number, number],
): [number, number] {
  return [-localPosition[0], localPosition[1]];
}

export type WiringLifecycleStatus =
  | "draft"
  | "authored"
  | "requires-review"
  | "measured"
  | "hardware-verified";

export interface WiringDefinition {
  /** `provisional` is retained only to load pre-WIRE-013 Schema 2 files. */
  status: WiringLifecycleStatus | "provisional";
  routeStrategy:
    | "longitude-sectors-nearest-neighbor"
    | "face-adjacency-nearest-neighbor"
    | "balanced-oriented-cable-optimizer"
    | "manual-authored-route";
  chainLengths: number[];
  controller: {
    placement: "near-top";
    status: "provisional" | "measured";
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
  /** Incremented only after an operator confirms an exact route revision. */
  routeRevision?: number;
  /** Only a passed PROOF-010 record may make this wiring hardware-verified. */
  hardwareProof?: {
    kind: "proof-010-hardware-verification";
    taskId: "PROOF-010";
    status: "passed";
    deploymentIdentity: string;
    deviceReadbackSha256: string;
    asBuiltRecordSha256: string;
    parityProofSha256: string;
  };
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

export function getWiringLifecycleStatus(
  wiring: WiringDefinition,
): WiringLifecycleStatus {
  if (wiring.status !== "provisional") return wiring.status;
  return hasAuthoredWiringRoutes(wiring) ? "authored" : "draft";
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
  const profileInput: Record<string, unknown> = structuredClone(input);
  const legacyPixelGrid = isRecord(profileInput.pixelGrid)
    ? profileInput.pixelGrid
    : null;
  if (legacyPixelGrid && legacyPixelGrid.colorOrder === undefined) {
    legacyPixelGrid.colorOrder = {
      status: "provisional",
      channelSequence: "RGB",
      wledValue: 1,
      note: "Legacy schema 1.0.0 profile without recorded color-order evidence.",
    };
  }
  if (profileInput.schemaVersion !== "1.0.0") {
    throw new Error("Unsupported panel-profile schema version.");
  }
  if (profileInput.kind !== "led-panel" || profileInput.units !== "mm") {
    throw new Error("Panel profile must describe an LED panel in millimetres.");
  }

  const dimensions = requireRecord(profileInput, "dimensions");
  requirePositiveNumber(dimensions, "width");
  requirePositiveNumber(dimensions, "height");
  requirePositiveNumber(dimensions, "thickness");
  validatePanelCarrier(profileInput.carrier, dimensions as unknown as {
    width: number;
    height: number;
    thickness: number;
  });
  const pixelGrid = requireRecord(profileInput, "pixelGrid");
  const columns = requirePositiveNumber(pixelGrid, "columns");
  const rows = requirePositiveNumber(pixelGrid, "rows");
  if (!Number.isInteger(columns) || !Number.isInteger(rows)) {
    throw new Error("Pixel grid dimensions must be integers.");
  }
  requireFiniteNumber(pixelGrid, "emitterOffset");
  if (pixelGrid.localEmitterPositions !== undefined) {
    if (
      !Array.isArray(pixelGrid.localEmitterPositions) ||
      pixelGrid.localEmitterPositions.length !== columns * rows
    ) {
      throw new Error(
        "Explicit emitter positions must contain one row-major position per grid coordinate.",
      );
    }
    const positionKeys = new Set<string>();
    for (const position of pixelGrid.localEmitterPositions) {
      if (
        !Array.isArray(position) ||
        position.length !== 3 ||
        position.some((coordinate) =>
          typeof coordinate !== "number" || !Number.isFinite(coordinate)
        )
      ) {
        throw new Error(
          "Explicit emitter positions must contain three finite pose-local coordinates.",
        );
      }
      const key = position.map((coordinate) => Object.is(coordinate, -0) ? 0 : coordinate)
        .join(",");
      if (positionKeys.has(key)) {
        throw new Error("Explicit emitter positions must be unique.");
      }
      positionKeys.add(key);
    }
  }
  const colorOrder = requireRecord(pixelGrid, "colorOrder");
  requireOneOf(colorOrder, "status", ["provisional", "measured"]);
  const channelSequence = requireOneOf(colorOrder, "channelSequence", [
    "GRB",
    "RGB",
    "BRG",
    "RBG",
    "BGR",
    "GBR",
  ]);
  const wledValue = requireFiniteNumber(colorOrder, "wledValue");
  const expectedWledValue = ["GRB", "RGB", "BRG", "RBG", "BGR", "GBR"]
    .indexOf(channelSequence);
  if (!Number.isInteger(wledValue) || wledValue !== expectedWledValue) {
    throw new Error("Panel color order and WLED value are inconsistent.");
  }
  requireString(colorOrder, "note");
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

  const mounting = requireRecord(profileInput, "mounting");
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

  const dataConnectors = requireRecord(profileInput, "dataConnectors");
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
  if (dataConnectors.localPositions !== undefined) {
    const localPositions = requireRecord(dataConnectors, "localPositions");
    if (localPositions.coordinateFrame !== "pose-local") {
      throw new Error(
        "Explicit connector positions must use the pose-local coordinate frame.",
      );
    }
    for (const key of ["din", "dout"] as const) {
      const position = localPositions[key];
      if (
        !Array.isArray(position) ||
        position.length !== 3 ||
        position.some((coordinate) =>
          typeof coordinate !== "number" || !Number.isFinite(coordinate)
        )
      ) {
        throw new Error(
          "Explicit connector positions must contain three finite pose-local coordinates.",
        );
      }
    }
    if (JSON.stringify(localPositions.din) === JSON.stringify(localPositions.dout)) {
      throw new Error("Explicit DIN and DOUT positions must be different.");
    }
  }
  const cornerCoordinate = (corner: PanelCorner): [number, number] => [
    corner.endsWith("left") ? 0 : columns - 1,
    corner.startsWith("top") ? 0 : rows - 1,
  ];
  const wireIndex = (corner: PanelCorner): number => {
    const [x, y] = cornerCoordinate(corner);
    const line = order.traversalAxis === "rows"
      ? order.lineProgression === "bottom-to-top" ? rows - 1 - y : y
      : order.lineProgression === "right-to-left" ? columns - 1 - x : x;
    let offset = order.traversalAxis === "rows"
      ? order.firstLineDirection === "right-to-left" ? columns - 1 - x : x
      : order.firstLineDirection === "bottom-to-top" ? rows - 1 - y : y;
    if (order.serpentine && line % 2 === 1) {
      offset = (order.traversalAxis === "rows" ? columns : rows) - 1 - offset;
    }
    return line * (order.traversalAxis === "rows" ? columns : rows) + offset;
  };
  const corners: PanelCorner[] = [
    "top-left", "top-right", "bottom-left", "bottom-right",
  ];
  if (order.status === "measured") {
    if (wireIndex(order.pixelZeroCorner as PanelCorner) !== 0) {
      throw new Error(
        "Measured panel pixel-zero corner contradicts its traversal directions.",
      );
    }
    if (order.pixelZeroCorner !== dinCorner) {
      throw new Error("Measured panel pixel zero must be at DIN.");
    }
    const terminalCorner = corners.find(
      (corner) => wireIndex(corner) === columns * rows - 1,
    );
    if (terminalCorner !== doutCorner) {
      throw new Error("Measured panel final pixel must be at DOUT.");
    }
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

  const power = requireRecord(profileInput, "power");
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

  const keepouts = requireRecord(profileInput, "electricalKeepouts");
  requireOneOf(keepouts, "status", ["unknown", "provisional", "measured"]);
  if (!Array.isArray(keepouts.regions)) {
    throw new Error("Electrical keep-out regions must be an array.");
  }
  requireString(keepouts, "note");
  requireString(profileInput, "id");
  return profileInput as unknown as PanelHardwareProfile;
}
