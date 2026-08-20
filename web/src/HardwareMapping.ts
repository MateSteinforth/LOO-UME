import type {
  LedMapping,
  LedMappingEntry,
  PanelDefinition,
  MechanicalMountPreview,
  PrintableClosurePreview,
  SculptureSurfaceFace,
} from "./LedMapping.ts";
import type { WiringPreview } from "./WiringPreview.ts";
import {
  CANONICAL_SCULPTURE_PROJECT,
  type PanelHardwareProfile,
} from "../../src/sculpture/Definition.ts";

export interface WledLedmap {
  map: number[];
}

export interface OutputAddressRange {
  outputIndex: number;
  gpio: number | null;
  startIndex: number;
  pixelCount: number;
  panelIds: string[];
}

export interface HardwareReadiness {
  ready: boolean;
  /** Current legacy checks only; this is not MAP-021 address readiness. */
  currentChecksPass: boolean;
  blockers: string[];
  wiringLifecycle: WiringPreview["status"];
}

export interface HardwareMappingContract {
  mapping: LedMapping;
  wiring: WiringPreview;
  ledmap: WledLedmap;
  outputs: OutputAddressRange[];
  readiness: HardwareReadiness;
  fingerprint: string;
}

function panelPixelKey(
  panelId: string,
  panelPixelX: number,
  panelPixelY: number,
): string {
  return panelId + ":" + panelPixelX + ":" + panelPixelY;
}

type PanelPixelOrder = PanelDefinition["pixelOrder"];

function provisionalPixelOrder(
  panelProfile: PanelHardwareProfile,
): PanelPixelOrder {
  const order = panelProfile.pixelGrid.provisionalOrder;
  return {
    status: order.status,
    pixelZeroCorner: order.pixelZeroCorner,
    traversalAxis: order.traversalAxis,
    lineProgression: order.lineProgression,
    serpentine: order.serpentine,
    firstLineDirection: order.firstLineDirection,
  };
}

function effectivePixelOrder(
  panel: PanelDefinition,
  panelProfile: PanelHardwareProfile,
): PanelPixelOrder {
  return panel.pixelOrder.status === "measured"
    ? panel.pixelOrder
    : provisionalPixelOrder(panelProfile);
}

function panelWireIndex(
  entry: LedMappingEntry,
  order: PanelPixelOrder,
  panelProfile: PanelHardwareProfile,
): number {
  if (entry.panelPixelX === null || entry.panelPixelY === null) {
    throw new Error("Panel LED is missing panel-local coordinates.");
  }
  if (
    order.pixelZeroCorner === null ||
    order.traversalAxis === null ||
    order.lineProgression === null ||
    order.serpentine === null ||
    order.firstLineDirection === null
  ) {
    throw new Error("Panel pixel order is incomplete.");
  }

  const startsRight = order.pixelZeroCorner.endsWith("right");
  const startsBottom = order.pixelZeroCorner.startsWith("bottom");
  const expectedDirection =
    order.traversalAxis === "rows"
      ? startsRight
        ? "right-to-left"
        : "left-to-right"
      : startsBottom
        ? "bottom-to-top"
        : "top-to-bottom";
  const expectedProgression =
    order.traversalAxis === "rows"
      ? startsBottom
        ? "bottom-to-top"
        : "top-to-bottom"
      : startsRight
        ? "right-to-left"
        : "left-to-right";
  if (
    order.firstLineDirection !== expectedDirection ||
    order.lineProgression !== expectedProgression
  ) {
    throw new Error(
      "Panel start corner, first-line direction, and line progression are inconsistent.",
    );
  }
  const columns = panelProfile.pixelGrid.columns;
  const rows = panelProfile.pixelGrid.rows;
  const line =
    order.traversalAxis === "rows"
      ? order.lineProgression === "bottom-to-top"
        ? rows - 1 - entry.panelPixelY
        : entry.panelPixelY
      : order.lineProgression === "right-to-left"
        ? columns - 1 - entry.panelPixelX
        : entry.panelPixelX;
  let offset =
    order.traversalAxis === "rows"
      ? order.firstLineDirection === "right-to-left"
        ? columns - 1 - entry.panelPixelX
        : entry.panelPixelX
      : order.firstLineDirection === "bottom-to-top"
        ? rows - 1 - entry.panelPixelY
        : entry.panelPixelY;
  if (order.serpentine && line % 2 === 1) {
    offset =
      (order.traversalAxis === "rows" ? columns : rows) - 1 - offset;
  }
  return line * (order.traversalAxis === "rows" ? columns : rows) + offset;
}

function createOutputRanges(
  preview: WiringPreview,
  panelProfile: PanelHardwareProfile,
): OutputAddressRange[] {
  const ledsPerPanel =
    panelProfile.pixelGrid.columns * panelProfile.pixelGrid.rows;
  let startIndex = 0;
  return [...preview.outputs]
    .sort((first, second) => first.outputIndex - second.outputIndex)
    .map((output) => {
      const pixelCount = output.panelIds.length * ledsPerPanel;
      const range = {
        outputIndex: output.outputIndex,
        gpio: output.gpio,
        startIndex,
        pixelCount,
        panelIds: [...output.panelIds],
      };
      startIndex += pixelCount;
      return range;
    });
}

function assignPanel(
  panel: PanelDefinition,
  output: OutputAddressRange,
  chainPosition: number,
  previousPanelId: string | null,
  nextPanelId: string | null,
  ledIndices: number[],
  wiringStatus: WiringPreview["status"],
  panelProfile: PanelHardwareProfile,
): PanelDefinition {
  return {
    ...panel,
    ledIndices,
    pixelOrder: effectivePixelOrder(panel, panelProfile),
    wiring: {
      status:
        wiringStatus === "measured" ||
        wiringStatus === "hardware-verified"
          ? "assigned"
          : "provisional",
      output: output.outputIndex,
      chainPosition,
      previousPanelId,
      nextPanelId,
    },
  };
}

export function createHardwareMappingContract(
  geometryMapping: LedMapping,
  wiring: WiringPreview,
  panelProfile = CANONICAL_SCULPTURE_PROJECT.panelProfile,
): HardwareMappingContract {
  if (
    geometryMapping.topology !== "panelized-sculpture" ||
    wiring.status === "unavailable"
  ) {
    throw new Error(
      "A hardware mapping contract requires the panelized sculpture and a wiring route.",
    );
  }

  const outputs = createOutputRanges(wiring, panelProfile);
  const ledsPerPanel =
    panelProfile.pixelGrid.columns * panelProfile.pixelGrid.rows;
  const assignmentByPanel = new Map<
    string,
    { output: OutputAddressRange; chainPosition: number }
  >();

  for (const output of outputs) {
    for (
      let chainPosition = 0;
      chainPosition < output.panelIds.length;
      chainPosition += 1
    ) {
      const panelId = output.panelIds[chainPosition]!;
      if (assignmentByPanel.has(panelId)) {
        throw new Error("Panel " + panelId + " occurs in multiple outputs.");
      }
      assignmentByPanel.set(panelId, { output, chainPosition });
    }
  }

  const physicalByPixel = new Map<string, number>();
  for (const entry of geometryMapping.entries) {
    if (
      entry.panelId === null ||
      entry.panelPixelX === null ||
      entry.panelPixelY === null
    ) {
      throw new Error("Panelized mapping contains a panel-free LED.");
    }
    const assignment = assignmentByPanel.get(entry.panelId);
    if (!assignment) {
      throw new Error("Panel " + entry.panelId + " has no output assignment.");
    }
    const panel = geometryMapping.panels.find(
      (candidate) => candidate.id === entry.panelId,
    );
    if (!panel) {
      throw new Error("Panel " + entry.panelId + " has no definition.");
    }
    const physicalIndex =
      assignment.output.startIndex +
      assignment.chainPosition * ledsPerPanel +
      panelWireIndex(
        entry,
        effectivePixelOrder(panel, panelProfile),
        panelProfile,
      );
    physicalByPixel.set(
      panelPixelKey(entry.panelId, entry.panelPixelX, entry.panelPixelY),
      physicalIndex,
    );
  }

  const entries = geometryMapping.entries
    .map((entry) => {
      const physicalIndex = physicalByPixel.get(
        panelPixelKey(
          entry.panelId!,
          entry.panelPixelX!,
          entry.panelPixelY!,
        ),
      );
      if (physicalIndex === undefined) {
        throw new Error("Missing physical assignment for " + entry.panelId + ".");
      }
      return { ...entry, physicalIndex };
    })
    .sort(
      (first, second) => first.physicalIndex - second.physicalIndex,
    );

  const entriesByPanel = new Map<string, LedMappingEntry[]>();
  for (const entry of entries) {
    const panelEntries = entriesByPanel.get(entry.panelId!) ?? [];
    panelEntries.push(entry);
    entriesByPanel.set(entry.panelId!, panelEntries);
  }

  const panels = geometryMapping.panels.map((panel) => {
    const assignment = assignmentByPanel.get(panel.id);
    if (!assignment) {
      throw new Error("Panel " + panel.id + " has no route metadata.");
    }
    const route = assignment.output.panelIds;
    const chainPosition = assignment.chainPosition;
    const ledIndices = (entriesByPanel.get(panel.id) ?? [])
      .map((entry) => entry.physicalIndex)
      .sort((first, second) => first - second);
    return assignPanel(
      panel,
      assignment.output,
      chainPosition,
      route[chainPosition - 1] ?? null,
      route[chainPosition + 1] ?? null,
      ledIndices,
      wiring.status,
      panelProfile,
    );
  });

  const mapping: LedMapping = {
    ...geometryMapping,
    id: geometryMapping.id + "-routed",
    status: geometryMapping.status,
    panels,
    entries,
    notes: [
      ...geometryMapping.notes,
      "Physical indices follow the displayed output routes.",
      "Within-panel physical order follows the panel profile: " +
        panelProfile.pixelGrid.provisionalOrder.description,
    ],
  };
  const ledmap = createWledLedmap(mapping);
  const readiness = assessHardwareReadiness(mapping, wiring);
  return {
    mapping,
    wiring,
    ledmap,
    outputs,
    readiness,
    fingerprint: fingerprintLedmap(ledmap),
  };
}

interface GeneratedPanelMap {
  schemaVersion: string;
  id: string;
  status: LedMapping["status"];
  topology: LedMapping["topology"];
  notes: string[];
  hardwareReady: boolean;
  ledmapFingerprint: string;
  readinessBlockers: string[];
  wiringLifecycle?: string;
  outputs: OutputAddressRange[];
  wiring: WiringPreview;
  panels: PanelDefinition[];
  surfaceFaces?: SculptureSurfaceFace[];
  mechanicalMounts?: MechanicalMountPreview[];
  printableClosures?: PrintableClosurePreview[];
  leds: LedMappingEntry[];
}

export function loadGeneratedHardwareMappingContract(
  panelMapInput: unknown,
  ledmapInput: unknown,
): HardwareMappingContract {
  if (
    typeof panelMapInput !== "object" ||
    panelMapInput === null ||
    typeof ledmapInput !== "object" ||
    ledmapInput === null
  ) {
    throw new Error("Generated mapping artifacts must be JSON objects.");
  }
  const panelMap = panelMapInput as GeneratedPanelMap;
  const ledmap = ledmapInput as WledLedmap;
  if (panelMap.schemaVersion !== "1.0.0") {
    throw new Error("Unsupported panel-map schema version.");
  }
  if (
    !Array.isArray(panelMap.panels) ||
    !Array.isArray(panelMap.leds) ||
    !Array.isArray(panelMap.outputs) ||
    !Array.isArray(panelMap.readinessBlockers) ||
    !Array.isArray(ledmap.map)
  ) {
    throw new Error("Generated mapping artifacts are incomplete.");
  }
  const legacyStatus = panelMap.wiring.status as string;
  const normalizedStatus = legacyStatus === "generated-provisional"
    ? "draft"
    : legacyStatus === "authored-provisional"
      ? "authored"
      : legacyStatus;
  if (normalizedStatus === "hardware-verified") {
    throw new Error("Hardware-verified mapping artifacts require accepted PROOF-010 validation.");
  }
  if (
    normalizedStatus !== "draft" &&
    normalizedStatus !== "authored" &&
    normalizedStatus !== "requires-review" &&
    normalizedStatus !== "measured" &&
    normalizedStatus !== "unavailable"
  ) {
    throw new Error("Panel map has an unsupported wiring lifecycle.");
  }
  if (
    panelMap.wiringLifecycle !== undefined &&
    panelMap.wiringLifecycle !== normalizedStatus
  ) {
    throw new Error("Panel map wiring lifecycle disagrees with the wiring preview.");
  }
  if (panelMap.hardwareReady) {
    throw new Error("Generated mapping artifacts cannot claim hardware-ready status before MAP-021, MAP-030, and PWR-010.");
  }
  const wiring = {
    ...panelMap.wiring,
    status: normalizedStatus,
    routeSource:
      panelMap.wiring.routeSource ??
      (normalizedStatus === "requires-review"
        ? "temporary-draft-suggestion"
        : normalizedStatus === "draft" || normalizedStatus === "unavailable"
          ? "draft-suggestion"
          : "authored-route"),
    savedOutputPanelIds: panelMap.wiring.savedOutputPanelIds ?? null,
  } as WiringPreview;

  const mapping: LedMapping = {
    id: panelMap.id,
    status: panelMap.status,
    topology: panelMap.topology,
    notes: panelMap.notes,
    panels: panelMap.panels,
    surfaceFaces: panelMap.surfaceFaces,
    mechanicalMounts: panelMap.mechanicalMounts,
    printableClosures: panelMap.printableClosures,
    entries: panelMap.leds,
  };
  const equivalenceErrors = validateLedmapEquivalence(mapping, ledmap);
  if (equivalenceErrors.length > 0) {
    throw new Error(equivalenceErrors[0]);
  }
  const fingerprint = fingerprintLedmap(ledmap);
  if (fingerprint !== panelMap.ledmapFingerprint) {
    throw new Error("Panel map and WLED ledmap fingerprints differ.");
  }

  const readiness = assessHardwareReadiness(mapping, wiring);
  return {
    mapping,
    wiring,
    ledmap,
    outputs: panelMap.outputs,
    readiness,
    fingerprint,
  };
}

export function createWledLedmap(mapping: LedMapping): WledLedmap {
  const map = new Array<number>(mapping.entries.length).fill(-1);
  for (const entry of mapping.entries) {
    if (
      entry.logicalIndex < 0 ||
      entry.logicalIndex >= map.length ||
      map[entry.logicalIndex] !== -1
    ) {
      throw new Error(
        "Logical index " + entry.logicalIndex + " cannot be exported.",
      );
    }
    map[entry.logicalIndex] = entry.physicalIndex;
  }
  return { map };
}

export function validateLedmapEquivalence(
  mapping: LedMapping,
  ledmap: WledLedmap,
): string[] {
  const errors: string[] = [];
  if (ledmap.map.length !== mapping.entries.length) {
    errors.push(
      "ledmap has " +
        ledmap.map.length +
        " entries; expected " +
        mapping.entries.length +
        ".",
    );
    return errors;
  }

  const physical = new Set<number>();
  for (const entry of mapping.entries) {
    const mappedPhysical = ledmap.map[entry.logicalIndex];
    if (mappedPhysical !== entry.physicalIndex) {
      errors.push(
        "Logical " +
          entry.logicalIndex +
          " maps to " +
          mappedPhysical +
          "; renderer expects " +
          entry.physicalIndex +
          ".",
      );
    }
    if (
      entry.physicalIndex < 0 ||
      entry.physicalIndex >= mapping.entries.length
    ) {
      errors.push("Physical index " + entry.physicalIndex + " is out of range.");
    }
    if (physical.has(entry.physicalIndex)) {
      errors.push("Physical index " + entry.physicalIndex + " is duplicated.");
    }
    physical.add(entry.physicalIndex);
  }
  return errors;
}

export function assessHardwareReadiness(
  mapping: LedMapping,
  wiring: WiringPreview,
): HardwareReadiness {
  const currentCheckBlockers = new Set<string>();
  if (mapping.status !== "measured") {
    currentCheckBlockers.add("Sculpture transforms and UV placement are provisional.");
  }
  if (wiring.status !== "measured") {
    currentCheckBlockers.add(
      wiring.status === "requires-review"
        ? "The stored panel data chains require review."
        : wiring.status === "authored"
          ? "The panel data chains are authored but not measured."
          : wiring.status === "hardware-verified"
            ? "Hardware-verified wiring cannot activate before accepted PROOF-010 validation exists."
          : "The panel data chains are still a draft suggestion.",
    );
  }
  if (wiring.outputs.some((output) => output.gpio === null)) {
    currentCheckBlockers.add("Controller GPIO assignments are unknown.");
  }
  if (
    wiring.nodes.some(
      (node) => node.dinDoutAssignmentStatus !== "measured",
    )
  ) {
    currentCheckBlockers.add("DIN/DOUT endpoint assignment is not bench-verified.");
  }
  if (
    mapping.panels.some(
      (panel) => panel.pixelOrder.status !== "measured",
    )
  ) {
    currentCheckBlockers.add("Panel pixel-zero and within-panel order are not bench-verified.");
  }
  if (
    mapping.panels.some((panel) => panel.wiring.status !== "assigned")
  ) {
    currentCheckBlockers.add("The panel data chains are still provisional.");
  }
  if (
    mapping.panels.some(
      (panel) => panel.rotationDegrees === null || panel.mirrored === null,
    )
  ) {
    currentCheckBlockers.add("Legacy rotation and mirroring fields are unmeasured.");
  }
  const currentChecksPass = currentCheckBlockers.size === 0;
  const blockers = new Set(currentCheckBlockers);
  blockers.add("MAP-021 installed address transforms are not implemented.");
  blockers.add("MAP-030 WLED bus, color-order, and deployment contract is not implemented.");
  blockers.add("PWR-010 power-plan approval is required before hardware export.");
  return {
    ready: false,
    currentChecksPass,
    blockers: [...blockers],
    wiringLifecycle: wiring.status,
  };
}

export function fingerprintLedmap(ledmap: WledLedmap): string {
  let hash = 0x811c9dc5;
  for (const value of ledmap.map) {
    hash ^= value & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (value >> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
