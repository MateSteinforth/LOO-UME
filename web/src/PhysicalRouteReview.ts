import {
  parsePanelAssemblyDefinition,
  type InstalledAddressTransform,
  type PanelAssemblyDefinition,
} from "../../src/sculpture/PanelAssembly.ts";
import {
  transformInstalledPanelCoordinate,
  type HardwareMappingContract,
} from "./HardwareMapping.ts";

export interface PhysicalRouteReviewSlot {
  outputIndex: number;
  outputLabel: string;
  chainPosition: number;
  physicalStartIndex: number;
  pixelCount: number;
  expectedPanelId: string;
  panelId: string;
  quarterTurnsClockwise: 0 | 1 | 2 | 3;
  mirrored: boolean;
  confirmed: boolean;
}

export interface PhysicalRouteReviewSession {
  slots: PhysicalRouteReviewSlot[];
  currentSlotIndex: number;
  ledCount: number;
  columns: number;
  rows: number;
  rotationStepQuarterTurns: 1 | 2;
  canSwapRowsColumns: boolean;
  panelSamples: Record<
    string,
    Array<{
      logicalIndex: number;
      color: [number, number, number];
      physicalOffsets: [number[], number[]];
    }>
  >;
}

function installedTransform(
  definition: PanelAssemblyDefinition,
  panelId: string,
): Pick<InstalledAddressTransform, "quarterTurnsClockwise" | "mirrored"> {
  const panel = definition.panels.find((candidate) => candidate.id === panelId);
  if (!panel)
    throw new Error(`Physical route review found unknown panel ${panelId}.`);
  return {
    quarterTurnsClockwise:
      panel.installedAddressTransform?.quarterTurnsClockwise ?? 0,
    mirrored: panel.installedAddressTransform?.mirrored ?? false,
  };
}

export function createPhysicalRouteReviewSession(
  definition: PanelAssemblyDefinition,
  contract: HardwareMappingContract,
): PhysicalRouteReviewSession {
  if (!contract.readiness.mappingReady) {
    throw new Error(
      "Physical route review requires a current mapping-ready route.",
    );
  }
  const columns = contract.mapping.panelPixelGrid?.columns;
  const rows = contract.mapping.panelPixelGrid?.rows;
  if (!columns || !rows) {
    throw new Error("Physical route review requires a panelized pixel grid.");
  }
  const pixelCount = columns * rows;
  const slots = contract.outputs.flatMap((output) =>
    output.panelIds.map((panelId, chainPosition) => ({
      outputIndex: output.outputIndex,
      outputLabel:
        definition.wiring.outputs[output.outputIndex]?.label ??
        `Output ${output.outputIndex + 1}`,
      chainPosition,
      physicalStartIndex: output.startIndex + chainPosition * pixelCount,
      pixelCount,
      expectedPanelId: panelId,
      panelId,
      ...installedTransform(definition, panelId),
      confirmed: false,
    })),
  );
  if (
    slots.length !== definition.panels.length ||
    slots.some(
      (slot) =>
        slot.physicalStartIndex < 0 ||
        slot.physicalStartIndex + slot.pixelCount >
          contract.mapping.entries.length,
    )
  ) {
    throw new Error(
      "Physical route review requires complete contiguous panel blocks.",
    );
  }
  const panelSamples: PhysicalRouteReviewSession["panelSamples"] = {};
  for (const slot of slots) {
    const entries = contract.mapping.entries.filter(
      (entry) => entry.panelId === slot.panelId,
    );
    const wireOffsets = new Map<number, number>();
    // Recover PCB wire indices from the saved contract before testing candidate transforms.
    for (const entry of entries) {
      const wire = transformInstalledPanelCoordinate(
        entry.panelPixelX!,
        entry.panelPixelY!,
        {
          quarterTurnsClockwise: slot.quarterTurnsClockwise,
          mirrored: slot.mirrored,
        },
        columns,
        rows,
      );
      const offset = entry.physicalIndex - slot.physicalStartIndex;
      wireOffsets.set(wire.y * columns + wire.x, offset);
    }
    // Keep this pose-local RGBW reference fixed. Candidate transforms move only
    // the physical output offsets; the logical simulator reference stays stable.
    panelSamples[slot.panelId] = entries.map((entry) => ({
      logicalIndex: entry.logicalIndex,
      color: reviewColor(entry.panelPixelX!, entry.panelPixelY!, columns, rows),
      physicalOffsets: ([false, true] as const).map((mirrored) =>
        ([0, 1, 2, 3] as const).map((quarterTurnsClockwise) => {
          if (columns !== rows && quarterTurnsClockwise % 2 === 1) return -1;
          const wire = transformInstalledPanelCoordinate(
            entry.panelPixelX!,
            entry.panelPixelY!,
            { quarterTurnsClockwise, mirrored },
            columns,
            rows,
          );
          const offset = wireOffsets.get(wire.y * columns + wire.x);
          if (offset === undefined)
            throw new Error("Physical review requires a complete panel grid.");
          return offset;
        }),
      ) as [number[], number[]],
    }));
  }
  return {
    slots,
    currentSlotIndex: 0,
    ledCount: contract.mapping.entries.length,
    columns,
    rows,
    rotationStepQuarterTurns: columns === rows ? 1 : 2,
    canSwapRowsColumns: columns === rows,
    panelSamples,
  };
}

function reviewColor(
  x: number,
  y: number,
  columns: number,
  rows: number,
): [number, number, number] {
  const right = x >= columns / 2;
  const bottom = y >= rows / 2;
  if (bottom) return right ? [0, 255, 0] : [255, 0, 0];
  return right ? [255, 255, 255] : [0, 0, 255];
}

function assertSlotIndex(
  session: PhysicalRouteReviewSession,
  slotIndex: number,
): PhysicalRouteReviewSlot {
  const slot = session.slots[slotIndex];
  if (!slot) throw new Error("Physical route review slot is out of range.");
  return slot;
}

export function assignPhysicalRouteReviewPanel(
  source: PhysicalRouteReviewSession,
  slotIndex: number,
  panelId: string,
  confirmed = true,
): PhysicalRouteReviewSession {
  const session = structuredClone(source);
  const slot = assertSlotIndex(session, slotIndex);
  const otherIndex = session.slots.findIndex(
    (candidate) => candidate.panelId === panelId,
  );
  if (otherIndex < 0)
    throw new Error(`Physical route review found unknown panel ${panelId}.`);
  if (otherIndex !== slotIndex) {
    const other = session.slots[otherIndex]!;
    const displaced = {
      panelId: slot.panelId,
      quarterTurnsClockwise: slot.quarterTurnsClockwise,
      mirrored: slot.mirrored,
    };
    slot.panelId = other.panelId;
    slot.quarterTurnsClockwise = other.quarterTurnsClockwise;
    slot.mirrored = other.mirrored;
    other.panelId = displaced.panelId;
    other.quarterTurnsClockwise = displaced.quarterTurnsClockwise;
    other.mirrored = displaced.mirrored;
    other.confirmed = false;
  }
  slot.confirmed = confirmed;
  return session;
}

export function rotatePhysicalRouteReviewPanel(
  source: PhysicalRouteReviewSession,
  slotIndex: number,
  deltaQuarterTurns: -1 | 1,
): PhysicalRouteReviewSession {
  const session = structuredClone(source);
  const slot = assertSlotIndex(session, slotIndex);
  slot.quarterTurnsClockwise = ((slot.quarterTurnsClockwise +
    deltaQuarterTurns * session.rotationStepQuarterTurns +
    4) %
    4) as 0 | 1 | 2 | 3;
  slot.confirmed = false;
  return session;
}

/**
 * Swap the panel traversal axes while retaining the DIN and DOUT corners.
 * In LED-side pose-local coordinates this is the anti-diagonal transpose:
 * (x, y) -> (columns - 1 - y, rows - 1 - x). It is square-grid only.
 */
export function swapPhysicalRouteReviewRowsColumns(
  source: PhysicalRouteReviewSession,
  slotIndex: number,
): PhysicalRouteReviewSession {
  const session = structuredClone(source);
  if (!session.canSwapRowsColumns) {
    throw new Error(
      "Physical route review can swap rows and columns only on square grids.",
    );
  }
  const slot = assertSlotIndex(session, slotIndex);
  const transpose = (x: number, y: number): { x: number; y: number } => ({
    x: session.columns - 1 - y,
    y: session.rows - 1 - x,
  });
  const candidates = ([false, true] as const).flatMap((mirrored) =>
    ([0, 1, 2, 3] as const).map((quarterTurnsClockwise) => ({
      mirrored,
      quarterTurnsClockwise,
    })),
  );
  const corners = [
    [0, 0],
    [session.columns - 1, 0],
    [0, session.rows - 1],
    [session.columns - 1, session.rows - 1],
  ] as const;
  const next = candidates.find((candidate) =>
    corners.every(([x, y]) => {
      const transposed = transpose(x, y);
      const expected = transformInstalledPanelCoordinate(
        transposed.x,
        transposed.y,
        slot,
        session.columns,
        session.rows,
      );
      const actual = transformInstalledPanelCoordinate(
        x,
        y,
        candidate,
        session.columns,
        session.rows,
      );
      return actual.x === expected.x && actual.y === expected.y;
    }),
  );
  if (!next)
    throw new Error(
      "Physical route review could not compose the row/column swap.",
    );
  slot.mirrored = next.mirrored;
  slot.quarterTurnsClockwise = next.quarterTurnsClockwise;
  slot.confirmed = false;
  return session;
}

export function confirmPhysicalRouteReviewSlot(
  source: PhysicalRouteReviewSession,
  slotIndex: number,
): PhysicalRouteReviewSession {
  const session = structuredClone(source);
  assertSlotIndex(session, slotIndex).confirmed = true;
  return session;
}

export function nextPhysicalRouteReviewSlot(
  session: PhysicalRouteReviewSession,
  fromIndex = session.currentSlotIndex,
): number | null {
  for (let index = fromIndex + 1; index < session.slots.length; index += 1) {
    if (!session.slots[index]!.confirmed) return index;
  }
  for (let index = 0; index <= fromIndex; index += 1) {
    if (!session.slots[index]!.confirmed) return index;
  }
  return null;
}

export function physicalRouteReviewChanges(
  session: PhysicalRouteReviewSession,
  definition: PanelAssemblyDefinition,
): string[] {
  const originalTransforms = new Map(
    definition.panels.map((panel) => [
      panel.id,
      {
        quarterTurnsClockwise:
          panel.installedAddressTransform?.quarterTurnsClockwise ?? 0,
        mirrored: panel.installedAddressTransform?.mirrored ?? false,
      },
    ]),
  );
  return session.slots.flatMap((slot) => {
    const changes: string[] = [];
    const location = `${slot.outputLabel} position ${slot.chainPosition + 1}`;
    if (slot.panelId !== slot.expectedPanelId) {
      changes.push(
        `${location}: ${slot.expectedPanelId} becomes ${slot.panelId}.`,
      );
    }
    const previous = originalTransforms.get(slot.panelId) ?? {
      quarterTurnsClockwise: 0,
      mirrored: false,
    };
    if (
      slot.quarterTurnsClockwise !== previous.quarterTurnsClockwise ||
      slot.mirrored !== previous.mirrored
    ) {
      changes.push(
        `${slot.panelId}: address orientation ${describeAddressTransform(previous)} becomes ` +
          `${describeAddressTransform(slot)} in PCB back view.`,
      );
    }
    return changes;
  });
}

function describeAddressTransform(
  transform: Pick<
    PhysicalRouteReviewSlot,
    "quarterTurnsClockwise" | "mirrored"
  >,
): string {
  return `${transform.quarterTurnsClockwise * 90}° clockwise${
    transform.mirrored ? ", mirrored" : ""
  }`;
}

export function applyPhysicalRouteReview(
  source: PanelAssemblyDefinition,
  session: PhysicalRouteReviewSession,
): PanelAssemblyDefinition {
  if (
    session.slots.length !== source.panels.length ||
    session.slots.some((slot) => !slot.confirmed) ||
    new Set(session.slots.map((slot) => slot.panelId)).size !==
      source.panels.length
  ) {
    throw new Error(
      "Confirm every unique physical panel before applying the review.",
    );
  }
  const definition = structuredClone(source);
  const slotsByOutput = new Map<number, PhysicalRouteReviewSlot[]>();
  for (const slot of session.slots) {
    const slots = slotsByOutput.get(slot.outputIndex) ?? [];
    slots.push(slot);
    slotsByOutput.set(slot.outputIndex, slots);
  }
  const { hardwareProof: _staleProof, ...wiring } = definition.wiring;
  definition.wiring = {
    ...wiring,
    status: "authored",
    routeStrategy: "manual-authored-route",
    routeRevision: (definition.wiring.routeRevision ?? 0) + 1,
    outputs: definition.wiring.outputs.map((output) => ({
      ...output,
      panelIds: [...(slotsByOutput.get(output.outputIndex) ?? [])]
        .sort((left, right) => left.chainPosition - right.chainPosition)
        .map((slot) => slot.panelId),
    })),
  };
  const reviewedByPanel = new Map(
    session.slots.map((slot) => [slot.panelId, slot]),
  );
  definition.panels = definition.panels.map((panel) => {
    const reviewed = reviewedByPanel.get(panel.id);
    if (!reviewed)
      throw new Error(`Physical route review omitted panel ${panel.id}.`);
    return {
      ...panel,
      installedAddressTransform: {
        status: "measured",
        referenceView: "back",
        quarterTurnsClockwise: reviewed.quarterTurnsClockwise,
        mirrored: reviewed.mirrored,
        selectionMethod: "manual",
      },
    };
  });
  definition.calibration = {
    ...definition.calibration,
    installedPanelOrientation: "measured",
    physicalChains: "measured",
  };
  return parsePanelAssemblyDefinition(definition);
}

export function createPhysicalPanelReviewFrame(
  session: PhysicalRouteReviewSession,
  slotIndex: number,
): Array<[number, number, number]> {
  const slot = assertSlotIndex(session, slotIndex);
  const frame = Array.from(
    { length: session.ledCount },
    (): [number, number, number] => [0, 0, 0],
  );
  for (const sample of session.panelSamples[slot.panelId]!) {
    const offset =
      sample.physicalOffsets[slot.mirrored ? 1 : 0][
        slot.quarterTurnsClockwise
      ]!;
    frame[slot.physicalStartIndex + offset] = [...sample.color];
  }
  return frame;
}

export function createPhysicalPanelReviewReference(
  session: PhysicalRouteReviewSession,
  slotIndex: number,
): Uint32Array {
  const slot = assertSlotIndex(session, slotIndex);
  const pixels = new Uint32Array(session.ledCount);
  for (const sample of session.panelSamples[slot.panelId]!) {
    const [red, green, blue] = sample.color;
    pixels[sample.logicalIndex] = (red << 16) | (green << 8) | blue;
  }
  return pixels;
}
