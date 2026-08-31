import {
  parsePanelAssemblyDefinition,
  type InstalledAddressTransform,
  type PanelAssemblyDefinition,
} from "../../src/sculpture/PanelAssembly.ts";
import type { HardwareMappingContract } from "./HardwareMapping.ts";

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
}

function installedTransform(
  definition: PanelAssemblyDefinition,
  panelId: string,
): Pick<InstalledAddressTransform, "quarterTurnsClockwise" | "mirrored"> {
  const panel = definition.panels.find((candidate) => candidate.id === panelId);
  if (!panel) throw new Error(`Physical route review found unknown panel ${panelId}.`);
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
    throw new Error("Physical route review requires a current mapping-ready route.");
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
    slots.some((slot) =>
      slot.physicalStartIndex < 0 ||
      slot.physicalStartIndex + slot.pixelCount > contract.mapping.entries.length
    )
  ) {
    throw new Error("Physical route review requires complete contiguous panel blocks.");
  }
  if (slots.some((slot) => slot.mirrored)) {
    throw new Error(
      "Physical route review does not silently validate a mirrored address transform.",
    );
  }
  return {
    slots,
    currentSlotIndex: 0,
    ledCount: contract.mapping.entries.length,
    rotationStepQuarterTurns: columns === rows ? 1 : 2,
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
  const otherIndex = session.slots.findIndex((candidate) => candidate.panelId === panelId);
  if (otherIndex < 0) throw new Error(`Physical route review found unknown panel ${panelId}.`);
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
  slot.quarterTurnsClockwise = (
    (slot.quarterTurnsClockwise +
      deltaQuarterTurns * session.rotationStepQuarterTurns + 4) % 4
  ) as 0 | 1 | 2 | 3;
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
  const originalTurns = new Map(definition.panels.map((panel) => [
    panel.id,
    panel.installedAddressTransform?.quarterTurnsClockwise ?? 0,
  ]));
  return session.slots.flatMap((slot) => {
    const changes: string[] = [];
    const location = `${slot.outputLabel} position ${slot.chainPosition + 1}`;
    if (slot.panelId !== slot.expectedPanelId) {
      changes.push(`${location}: ${slot.expectedPanelId} becomes ${slot.panelId}.`);
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
    new Set(session.slots.map((slot) => slot.panelId)).size !== source.panels.length
  ) {
    throw new Error("Confirm every unique physical panel before applying the review.");
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
  const reviewedByPanel = new Map(session.slots.map((slot) => [slot.panelId, slot]));
  definition.panels = definition.panels.map((panel) => {
    const reviewed = reviewedByPanel.get(panel.id);
    if (!reviewed) throw new Error(`Physical route review omitted panel ${panel.id}.`);
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
  for (let offset = 0; offset < slot.pixelCount; offset += 1) {
    const progress = slot.pixelCount === 1 ? 0 : offset / (slot.pixelCount - 1);
    frame[slot.physicalStartIndex + offset] = [
      Math.round(96 * progress),
      Math.round(220 * (1 - progress)),
      Math.round(24 + 112 * progress),
    ];
  }
  frame[slot.physicalStartIndex] = [0, 255, 0];
  if (slot.pixelCount > 1) {
    frame[slot.physicalStartIndex + slot.pixelCount - 1] = [128, 0, 160];
  }
  return frame;
}
