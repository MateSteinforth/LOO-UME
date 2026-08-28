import type { PanelAssemblyDefinition } from "../../src/sculpture/PanelAssembly.ts";
import type { WiringPreview } from "./WiringPreview.ts";

export interface WiringRouteEditorOutput {
  outputIndex: number;
  label: string;
  gpio: number | null;
  panelIds: string[];
}

/**
 * Browser-only working state. It is deliberately separate from the persisted
 * sculpture until the operator confirms a complete route revision.
 */
export interface WiringRouteEditorModel {
  outputs: WiringRouteEditorOutput[];
  source: WiringPreview["routeSource"];
  /** A draft suggestion cannot become an authored route until copied explicitly. */
  copiedDraftSuggestion: boolean;
}

export interface WiringRouteEditorValidation {
  valid: boolean;
  errors: string[];
}

export function createWiringRouteEditorModel(
  definition: PanelAssemblyDefinition,
  preview: WiringPreview,
): WiringRouteEditorModel | null {
  if (preview.status === "unavailable") return null;
  return {
    source: preview.routeSource,
    copiedDraftSuggestion:
      preview.routeSource !== "draft-suggestion" &&
      preview.routeSource !== "temporary-draft-suggestion",
    outputs: definition.wiring.outputs.map((output, index) => ({
      outputIndex: output.outputIndex,
      label: output.label,
      gpio: output.gpio,
      panelIds: [...(preview.outputs[index]?.panelIds ?? [])],
    })),
  };
}

function clone(model: WiringRouteEditorModel): WiringRouteEditorModel {
  return {
    source: model.source,
    copiedDraftSuggestion: model.copiedDraftSuggestion,
    outputs: model.outputs.map((output) => ({
      ...output,
      panelIds: [...output.panelIds],
    })),
  };
}

export function moveRoutePanelWithinOutput(
  model: WiringRouteEditorModel,
  outputIndex: number,
  panelId: string,
  direction: -1 | 1,
): WiringRouteEditorModel {
  const next = clone(model);
  const output = next.outputs.find((candidate) =>
    candidate.outputIndex === outputIndex
  );
  if (!output) throw new Error(`Unknown output ${outputIndex}.`);
  const index = output.panelIds.indexOf(panelId);
  if (index < 0) throw new Error(`Panel ${panelId} is not in output ${outputIndex}.`);
  const target = index + direction;
  if (target < 0 || target >= output.panelIds.length) return next;
  [output.panelIds[index], output.panelIds[target]] = [
    output.panelIds[target]!,
    output.panelIds[index]!,
  ];
  return next;
}

/** Moves one panel to a drop position measured before removal. */
export function moveRoutePanelToPosition(
  model: WiringRouteEditorModel,
  panelId: string,
  destinationOutputIndex: number,
  destinationIndex: number,
): WiringRouteEditorModel {
  if (!model.copiedDraftSuggestion) {
    throw new Error("Edit the suggested route before changing its order.");
  }
  const next = clone(model);
  const source = next.outputs.find((output) => output.panelIds.includes(panelId));
  const destination = next.outputs.find((output) =>
    output.outputIndex === destinationOutputIndex
  );
  if (!source) throw new Error(`Panel ${panelId} is not assigned to a route.`);
  if (!destination) throw new Error(`Unknown output ${destinationOutputIndex}.`);
  const sourceIndex = source.panelIds.indexOf(panelId);
  source.panelIds.splice(sourceIndex, 1);
  let insertionIndex = Math.max(
    0,
    Math.min(destinationIndex, destination.panelIds.length),
  );
  if (source === destination && sourceIndex < destinationIndex) {
    insertionIndex = Math.max(0, insertionIndex - 1);
  }
  destination.panelIds.splice(insertionIndex, 0, panelId);
  return next;
}

export function copyDraftSuggestionToRouteEditor(
  model: WiringRouteEditorModel,
): WiringRouteEditorModel {
  return { ...clone(model), copiedDraftSuggestion: true };
}

export function moveRoutePanelToOutput(
  model: WiringRouteEditorModel,
  panelId: string,
  destinationOutputIndex: number,
): WiringRouteEditorModel {
  const next = clone(model);
  const source = next.outputs.find((output) => output.panelIds.includes(panelId));
  const destination = next.outputs.find((output) =>
    output.outputIndex === destinationOutputIndex
  );
  if (!source) throw new Error(`Panel ${panelId} is not assigned to a route.`);
  if (!destination) throw new Error(`Unknown output ${destinationOutputIndex}.`);
  if (source === destination) return next;
  source.panelIds.splice(source.panelIds.indexOf(panelId), 1);
  destination.panelIds.push(panelId);
  return next;
}

export function validateWiringRouteEditorModel(
  definition: PanelAssemblyDefinition,
  model: WiringRouteEditorModel | null,
): WiringRouteEditorValidation {
  if (!model) return { valid: false, errors: ["A panelized wiring route is unavailable."] };
  const errors: string[] = [];
  if (!model.copiedDraftSuggestion) {
    errors.push("Choose Edit suggested route before saving an authored route.");
  }
  if (model.outputs.length !== definition.wiring.outputs.length) {
    errors.push("The editor route does not contain every controller output.");
  }
  const knownPanelIds = new Set(definition.panels.map((panel) => panel.id));
  const seen = new Set<string>();
  for (let index = 0; index < definition.wiring.outputs.length; index += 1) {
    const expected = definition.wiring.outputs[index]!;
    const output = model.outputs[index];
    if (!output || output.outputIndex !== expected.outputIndex) {
      errors.push(`Output ${index + 1} is missing or out of order.`);
      continue;
    }
    for (const panelId of output.panelIds) {
      if (!knownPanelIds.has(panelId)) {
        errors.push(`${panelId} is not a current panel.`);
      } else if (seen.has(panelId)) {
        errors.push(`${panelId} is assigned more than once.`);
      } else {
        seen.add(panelId);
      }
    }
  }
  for (const panelId of knownPanelIds) {
    if (!seen.has(panelId)) errors.push(`${panelId} is not assigned.`);
  }
  return { valid: errors.length === 0, errors };
}

/** Persists only a validated operator-confirmed route revision. */
export function confirmWiringRouteEditorModel(
  definition: PanelAssemblyDefinition,
  model: WiringRouteEditorModel,
): PanelAssemblyDefinition {
  const validation = validateWiringRouteEditorModel(definition, model);
  if (!validation.valid) throw new Error(validation.errors[0]!);
  const { hardwareProof: _staleProof, ...wiring } = definition.wiring;
  return {
    ...definition,
    panels: definition.panels.map((panel) => ({
      ...panel,
      installedAddressTransform: panel.installedAddressTransform
        ? {
            ...panel.installedAddressTransform,
            status: "assumed" as const,
            selectionMethod: "manual" as const,
            optimizationFingerprint: undefined,
          }
        : undefined,
    })),
    calibration: {
      ...definition.calibration,
      physicalChains: "provisional",
      installedPanelOrientation: "provisional",
    },
    wiring: {
      ...wiring,
      status: "authored",
      routeStrategy: "manual-authored-route",
      routeRevision: (definition.wiring.routeRevision ?? 0) + 1,
      chainLengths: model.outputs.map((output) => output.panelIds.length),
      outputs: definition.wiring.outputs.map((output, index) => ({
        ...output,
        panelIds: [...model.outputs[index]!.panelIds],
      })),
    },
  };
}
