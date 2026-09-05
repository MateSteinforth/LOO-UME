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
  rotationStepQuarterTurns: 1 | 2;
  panelSamples: Record<
    string,
    Array<{ logicalIndex: number; red: number; physicalOffsets: number[] }>
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
  if (slots.some((slot) => slot.mirrored)) {
    throw new Error(
      "Physical route review does not silently validate a mirrored address transform.",
    );
  }
  const panelSamples: PhysicalRouteReviewSession["panelSamples"] = {};
  for (const slot of slots) {
    const entries = contract.mapping.entries.filter(
      (entry) => entry.panelId === slot.panelId,
    );
    const wireOffsets = new Map<number, number>();
    // Recover PCB wire indices from the saved contract before testing candidate turns.
    let dinX = 0;
    let dinY = 0;
    for (const entry of entries) {
      const wire = transformInstalledPanelCoordinate(
        entry.panelPixelX!,
        entry.panelPixelY!,
        { quarterTurnsClockwise: slot.quarterTurnsClockwise, mirrored: false },
        columns,
        rows,
      );
      const offset = entry.physicalIndex - slot.physicalStartIndex;
      wireOffsets.set(wire.y * columns + wire.x, offset);
      if (offset === 0) {
        dinX = columns - 1 - wire.x;
        dinY = wire.y;
      }
    }
    // Unequal axis slopes distinguish a row/column swap from a matching pattern.
    // Keep the reference fixed in pose-local coordinates. Only the output offsets rotate.
    panelSamples[slot.panelId] = entries.map((entry) => ({
      logicalIndex: entry.logicalIndex,
      red: Math.round(
        255 *
          (1 -
            (2 * Math.abs(entry.panelPixelX! - dinX) +
              Math.abs(entry.panelPixelY! - dinY)) /
              Math.max(1, 2 * (columns - 1) + rows - 1)),
      ),
      physicalOffsets: ([0, 1, 2, 3] as const).map((quarterTurnsClockwise) => {
        if (columns !== rows && quarterTurnsClockwise % 2 === 1) return -1;
        const wire = transformInstalledPanelCoordinate(
          entry.panelPixelX!,
          entry.panelPixelY!,
          { quarterTurnsClockwise, mirrored: false },
          columns,
          rows,
        );
        const offset = wireOffsets.get(wire.y * columns + wire.x);
        if (offset === undefined)
          throw new Error("Physical review requires a complete panel grid.");
        return offset;
      }),
    }));
  }
  return {
    slots,
    currentSlotIndex: 0,
    ledCount: contract.mapping.entries.length,
    rotationStepQuarterTurns: columns === rows ? 1 : 2,
    panelSamples,
  };
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
  const originalTurns = new Map(
    definition.panels.map((panel) => [
      panel.id,
      panel.installedAddressTransform?.quarterTurnsClockwise ?? 0,
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
    const previousTurns = originalTurns.get(slot.panelId) ?? 0;
    if (slot.quarterTurnsClockwise !== previousTurns) {
      changes.push(
        `${slot.panelId}: address orientation ${previousTurns * 90}° becomes ` +
          `${slot.quarterTurnsClockwise * 90}° clockwise in PCB back view.`,
      );
    }
    return changes;
  });
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
    const offset = sample.physicalOffsets[slot.quarterTurnsClockwise]!;
    frame[slot.physicalStartIndex + offset] = [sample.red, 0, 0];
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
    pixels[sample.logicalIndex] = sample.red << 16;
  }
  return pixels;
}
