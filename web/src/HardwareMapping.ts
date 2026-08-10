import type {
  LedMapping,
  LedMappingEntry,
  PanelDefinition,
} from "./LedMapping.ts";
import type { WiringPreview } from "./WiringPreview.ts";

const PANEL_SIDE = 8;
const LEDS_PER_PANEL = PANEL_SIDE * PANEL_SIDE;

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
  blockers: string[];
}

export interface HardwareMappingContract {
  mapping: LedMapping;
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

const PROVISIONAL_PIXEL_ORDER: PanelPixelOrder = {
  status: "provisional",
  pixelZeroCorner: "top-left",
  traversalAxis: "rows",
  serpentine: false,
  firstLineDirection: "left-to-right",
};

function effectivePixelOrder(panel: PanelDefinition): PanelPixelOrder {
  return panel.pixelOrder.status === "measured"
    ? panel.pixelOrder
    : PROVISIONAL_PIXEL_ORDER;
}

function panelWireIndex(
  entry: LedMappingEntry,
  order: PanelPixelOrder,
): number {
  if (entry.panelPixelX === null || entry.panelPixelY === null) {
    throw new Error("Panel LED is missing panel-local coordinates.");
  }
  if (
    order.pixelZeroCorner === null ||
    order.traversalAxis === null ||
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
  if (order.firstLineDirection !== expectedDirection) {
    throw new Error(
      "Panel start corner and first-line direction are inconsistent.",
    );
  }
  const x = startsRight
    ? PANEL_SIDE - 1 - entry.panelPixelX
    : entry.panelPixelX;
  const y = startsBottom
    ? PANEL_SIDE - 1 - entry.panelPixelY
    : entry.panelPixelY;
  const line = order.traversalAxis === "rows" ? y : x;
  let offset = order.traversalAxis === "rows" ? x : y;
  if (order.serpentine && line % 2 === 1) {
    offset = PANEL_SIDE - 1 - offset;
  }
  return line * PANEL_SIDE + offset;
}

function createOutputRanges(preview: WiringPreview): OutputAddressRange[] {
  let startIndex = 0;
  return [...preview.outputs]
    .sort((first, second) => first.outputIndex - second.outputIndex)
    .map((output) => {
      const pixelCount = output.panelIds.length * LEDS_PER_PANEL;
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
): PanelDefinition {
  return {
    ...panel,
    ledIndices,
    pixelOrder: effectivePixelOrder(panel),
    wiring: {
      status: wiringStatus === "measured" ? "assigned" : "provisional",
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
): HardwareMappingContract {
  if (
    geometryMapping.topology !== "panelized-sculpture" ||
    wiring.status === "unavailable"
  ) {
    throw new Error(
      "A hardware mapping contract requires the panelized sculpture and a wiring route.",
    );
  }

  const outputs = createOutputRanges(wiring);
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
      assignment.chainPosition * LEDS_PER_PANEL +
      panelWireIndex(entry, effectivePixelOrder(panel));
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
      "Physical indices follow the displayed four-output route.",
      "Within-panel physical order is provisional top-left row-major and must be bench-calibrated.",
    ],
  };
  const ledmap = createWledLedmap(mapping);
  const readiness = assessHardwareReadiness(mapping, wiring);
  return {
    mapping,
    ledmap,
    outputs,
    readiness,
    fingerprint: fingerprintLedmap(ledmap),
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
  const blockers = new Set<string>();
  if (mapping.status !== "measured") {
    blockers.add("Sculpture transforms and UV placement are provisional.");
  }
  if (wiring.status !== "measured") {
    blockers.add("The four panel chains are still provisional.");
  }
  if (wiring.outputs.some((output) => output.gpio === null)) {
    blockers.add("Controller GPIO assignments are unknown.");
  }
  if (
    wiring.nodes.some(
      (node) => node.dinDoutAssignmentStatus !== "measured",
    )
  ) {
    blockers.add("DIN/DOUT endpoint assignment is not bench-verified.");
  }
  if (
    mapping.panels.some(
      (panel) => panel.pixelOrder.status !== "measured",
    )
  ) {
    blockers.add("Panel pixel-zero and within-panel order are not bench-verified.");
  }
  if (
    mapping.panels.some((panel) => panel.wiring.status !== "assigned")
  ) {
    blockers.add("The four panel chains are still provisional.");
  }
  if (
    mapping.panels.some(
      (panel) => panel.rotationDegrees === null || panel.mirrored === null,
    )
  ) {
    blockers.add("Installed panel rotation and mirroring are unmeasured.");
  }
  return { ready: blockers.size === 0, blockers: [...blockers] };
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
