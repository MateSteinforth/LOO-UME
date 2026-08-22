import type {
  LedMapping,
  PanelDefinition,
  Vector3Data,
} from "./LedMapping.ts";
import {
  getWiringLifecycleStatus,
  hasAuthoredWiringRoutes,
  type PanelCorner,
  type PanelHardwareProfile,
  type WiringDefinition,
} from "../../src/sculpture/Definition.ts";

export interface WiringPanelNode {
  panelId: string;
  outputIndex: number;
  chainPosition: number;
  previousPanelId: string | null;
  nextPanelId: string | null;
  din: Vector3Data;
  dout: Vector3Data;
  connectorReferenceView: "back";
  dinCorner: PanelCorner;
  doutCorner: PanelCorner;
  dinDoutAssignmentStatus: "provisional" | "measured";
}

export interface WiringOutputRoute {
  outputIndex: number;
  label: string;
  gpio: number | null;
  color: number;
  cssColor: string;
  panelIds: string[];
}

export interface WiringPreview {
  status:
    | "draft"
    | "authored"
    | "requires-review"
    | "measured"
    | "hardware-verified"
    | "unavailable";
  controller: WiringDefinition["controller"] | null;
  routeSource:
    | "draft-suggestion"
    | "authored-route"
    | "temporary-draft-suggestion"
    | null;
  /** Preserved stale route evidence, distinct from a temporary preview route. */
  savedOutputPanelIds: Array<{
    outputIndex: number;
    panelIds: string[];
  }> | null;
  outputs: WiringOutputRoute[];
  nodes: WiringPanelNode[];
  notes: string[];
}

export interface WiringPreviewValidation {
  valid: boolean;
  errors: string[];
}

export interface WiringSourceDefinition {
  wiring: WiringDefinition;
}

function vector(x: number, y: number, z: number): Vector3Data {
  return { x, y, z };
}

function add(a: Vector3Data, b: Vector3Data): Vector3Data {
  return vector(a.x + b.x, a.y + b.y, a.z + b.z);
}

function scale(value: Vector3Data, amount: number): Vector3Data {
  return vector(value.x * amount, value.y * amount, value.z * amount);
}

function distanceSquared(a: PanelDefinition, b: PanelDefinition): number {
  const x = a.position.x - b.position.x;
  const y = a.position.y - b.position.y;
  const z = a.position.z - b.position.z;
  return x * x + y * y + z * z;
}

function routeNearestNeighbor(
  panels: PanelDefinition[],
  controllerPlacement: WiringDefinition["controller"]["placement"],
  preferFaceAdjacency = false,
): PanelDefinition[] {
  if (panels.length === 0) return [];
  const remaining = [...panels];
  remaining.sort((first, second) => {
    const firstDistance =
      controllerPlacement === "near-top" ? -first.position.y : 0;
    const secondDistance =
      controllerPlacement === "near-top" ? -second.position.y : 0;
    return firstDistance - secondDistance || first.id.localeCompare(second.id);
  });
  const route = [remaining.shift()!];

  while (remaining.length > 0) {
    const current = route[route.length - 1]!;
    remaining.sort((first, second) => {
      const firstPenalty =
        preferFaceAdjacency && !current.neighborPanelIds.includes(first.id)
          ? 1
          : 0;
      const secondPenalty =
        preferFaceAdjacency && !current.neighborPanelIds.includes(second.id)
          ? 1
          : 0;
      return (
        firstPenalty - secondPenalty ||
        distanceSquared(current, first) - distanceSquared(current, second) ||
        first.id.localeCompare(second.id)
      );
    });
    route.push(remaining.shift()!);
  }
  return route;
}

function connectorPosition(
  panel: PanelDefinition,
  xDirection: -1 | 1,
  yDirection: -1 | 1,
  edgeInset: number,
  surfaceOffset: number,
): Vector3Data {
  const xOffset =
    xDirection * (panel.previewWidth / 2 - edgeInset);
  const yOffset =
    yDirection * (panel.previewHeight / 2 - edgeInset);
  return add(
    add(panel.position, scale(panel.xAxis, xOffset)),
    add(
      scale(panel.yAxis, yOffset),
      scale(panel.normal, surfaceOffset),
    ),
  );
}

function cornerDirections(corner: PanelCorner): [-1 | 1, -1 | 1] {
  return [
    corner.endsWith("left") ? -1 : 1,
    corner.startsWith("bottom") ? -1 : 1,
  ];
}

function routesMatchCurrentPanels(
  definition: WiringSourceDefinition,
  panelById: ReadonlyMap<string, PanelDefinition>,
): boolean {
  if (!hasAuthoredWiringRoutes(definition.wiring)) return false;
  const routed = new Set<string>();
  for (let index = 0; index < definition.wiring.outputs.length; index += 1) {
    const route = definition.wiring.outputs[index]!.panelIds!;
    if (route.length !== definition.wiring.chainLengths[index]!) return false;
    for (const panelId of route) {
      if (!panelById.has(panelId) || routed.has(panelId)) return false;
      routed.add(panelId);
    }
  }
  return routed.size === panelById.size;
}

function assertStoredRoutesAreStructurallySound(
  definition: WiringSourceDefinition,
): void {
  const routed = new Set<string>();
  for (const output of definition.wiring.outputs) {
    const route = output.panelIds!;
    for (const panelId of route) {
      if (typeof panelId !== "string") {
        throw new Error("Authored wiring routes must contain only panel IDs.");
      }
      if (routed.has(panelId)) {
        throw new Error("Authored wiring routes cannot repeat a panel ID.");
      }
      routed.add(panelId);
    }
  }
}

/**
 * Produces complete view-only output routes using measured panel connector
 * corners without claiming exact pad centres or GPIO assignments. Persisted
 * authored routes retain their exact controller-to-DIN order. Draft projects
 * use deterministic nearest-neighbor suggestions only.
 */
export function createProvisionalWiringPreview(
  mapping: LedMapping,
  definition?: WiringSourceDefinition,
  panelProfile?: PanelHardwareProfile,
): WiringPreview {
  if (mapping.topology !== "panelized-sculpture") {
    return {
      status: "unavailable",
      controller: null,
      routeSource: null,
      savedOutputPanelIds: null,
      outputs: [],
      nodes: [],
      notes: ["Wiring preview is available only for the panelized sculpture."],
    };
  }
  if (!definition || !panelProfile) {
    throw new Error(
      "Panelized wiring preview requires a Schema 2 wiring definition and panel profile.",
    );
  }

  const byLongitude = [...mapping.panels].sort((first, second) => {
    const firstLongitude =
      (Math.atan2(first.position.z, first.position.x) + 2 * Math.PI) %
      (2 * Math.PI);
    const secondLongitude =
      (Math.atan2(second.position.z, second.position.x) + 2 * Math.PI) %
      (2 * Math.PI);
    return (
      firstLongitude - secondLongitude ||
      second.position.y - first.position.y ||
      first.id.localeCompare(second.id)
    );
  });

  const outputs: WiringOutputRoute[] = [];
  const nodes: WiringPanelNode[] = [];
  const lifecycle = getWiringLifecycleStatus(definition.wiring);
  if (lifecycle === "hardware-verified") {
    throw new Error(
      "Hardware-verified wiring cannot activate before accepted PROOF-010 validation exists.",
    );
  }
  const hasStoredRoutes = hasAuthoredWiringRoutes(definition.wiring);
  const routeFieldCount = definition.wiring.outputs.filter(
    (output) => "panelIds" in output,
  ).length;
  const authoredRouteCount = definition.wiring.outputs.filter(
    (output) => Array.isArray(output.panelIds),
  ).length;
  if (
    routeFieldCount > 0 &&
    (routeFieldCount !== definition.wiring.outputs.length ||
      authoredRouteCount !== definition.wiring.outputs.length)
  ) {
    throw new Error(
      "Authored wiring routes must provide ordered panelIds for every output.",
    );
  }
  const panelById = new Map(mapping.panels.map((panel) => [panel.id, panel]));
  if (hasStoredRoutes) assertStoredRoutesAreStructurallySound(definition);
  const usesAuthoredRoutes = routesMatchCurrentPanels(definition, panelById);
  for (let index = 0; index < definition.wiring.outputs.length; index += 1) {
    if (definition.wiring.outputs[index]!.outputIndex !== index) {
      throw new Error("Wiring output indices must match their array order.");
    }
  }
  if (hasStoredRoutes && !usesAuthoredRoutes && lifecycle !== "requires-review") {
    throw new Error(
      "Authored wiring routes must match chain lengths and cover each panel exactly once.",
    );
  }
  const [dinXDirection, dinYDirection] = cornerDirections(
    panelProfile.dataConnectors.dinCorner,
  );
  const [doutXDirection, doutYDirection] = cornerDirections(
    panelProfile.dataConnectors.doutCorner,
  );
  let offset = 0;

  for (
    let routeIndex = 0;
    routeIndex < definition.wiring.outputs.length;
    routeIndex += 1
  ) {
    const outputDefinition = definition.wiring.outputs[routeIndex]!;
    const outputIndex = outputDefinition.outputIndex;
    const length = definition.wiring.chainLengths[routeIndex]!;
    const panels = usesAuthoredRoutes
      ? definition.wiring.outputs[routeIndex]!.panelIds!.map((panelId) => {
          const panel = panelById.get(panelId);
          if (!panel) {
            throw new Error(
              `Authored output ${outputIndex + 1} references unknown ${panelId}.`,
            );
          }
          return panel;
        })
      : routeNearestNeighbor(
          byLongitude.slice(offset, offset + length),
          definition.wiring.controller.placement,
          definition.wiring.routeStrategy === "face-adjacency-nearest-neighbor",
        );
    offset += length;
    outputs.push({
      outputIndex,
      label: outputDefinition.label,
      gpio: outputDefinition.gpio,
      color: Number.parseInt(outputDefinition.color.slice(1), 16),
      cssColor: outputDefinition.color,
      panelIds: panels.map((panel) => panel.id),
    });

    for (
      let chainPosition = 0;
      chainPosition < panels.length;
      chainPosition += 1
    ) {
      const panel = panels[chainPosition]!;
      nodes.push({
        panelId: panel.id,
        outputIndex,
        chainPosition,
        previousPanelId: panels[chainPosition - 1]?.id ?? null,
        nextPanelId: panels[chainPosition + 1]?.id ?? null,
        din: connectorPosition(
          panel,
          dinXDirection,
          dinYDirection,
          definition.wiring.connector.edgeInset,
          definition.wiring.connector.surfaceOffset,
        ),
        dout: connectorPosition(
          panel,
          doutXDirection,
          doutYDirection,
          definition.wiring.connector.edgeInset,
          definition.wiring.connector.surfaceOffset,
        ),
        connectorReferenceView: panelProfile.dataConnectors.referenceView,
        dinCorner: panelProfile.dataConnectors.dinCorner,
        doutCorner: panelProfile.dataConnectors.doutCorner,
        dinDoutAssignmentStatus:
          panelProfile.dataConnectors.cornerAssignmentStatus,
      });
    }
  }

  return {
    status: lifecycle,
    controller: definition.wiring.controller,
    routeSource: usesAuthoredRoutes
      ? "authored-route"
      : lifecycle === "requires-review"
        ? "temporary-draft-suggestion"
        : "draft-suggestion",
    savedOutputPanelIds:
      lifecycle === "requires-review" && hasStoredRoutes
        ? definition.wiring.outputs.map((output) => ({
            outputIndex: output.outputIndex,
            panelIds: [...output.panelIds!],
          }))
        : null,
    outputs,
    nodes,
    notes: [
      lifecycle === "requires-review"
        ? usesAuthoredRoutes
          ? "The stored panel route remains displayed but requires review before assembly."
          : "The stored panel route no longer matches the panel set, so the displayed route is a draft suggestion. The stored route remains unchanged for review."
        : usesAuthoredRoutes
          ? "Panel route order is authored and persists exactly as saved."
          : "Draft route suggestion begins near the sculpture top according to the provisional controller placement.",
      "DIN is bottom-left and DOUT is top-right in the measured back-view panel convention.",
      "The connector marker inset remains schematic until exact pad centres are measured.",
      lifecycle === "measured"
        ? "Route and controller facts are measured. Hardware verification still requires the separate PROOF-010 evidence record."
        : usesAuthoredRoutes
        ? definition.wiring.outputs.every((output) => output.gpio !== null)
          ? "GPIO numbers are assigned but not measured. Installed panel orientation and within-panel pixel order remain provisional."
          : "GPIO numbers remain TBD. Installed panel orientation and within-panel pixel order remain provisional."
        : "GPIO numbers and the final per-output chain order remain TBD.",
    ],
  };
}

export function validateWiringPreview(
  preview: WiringPreview,
  mapping: LedMapping,
): WiringPreviewValidation {
  const errors: string[] = [];
  if (preview.status === "unavailable") {
    return { valid: mapping.panels.length === 0, errors };
  }
  if (preview.controller?.placement !== "near-top") {
    errors.push("Wiring preview requires a near-top controller.");
  }
  if (
    (preview.status === "measured" ||
      preview.status === "hardware-verified") &&
    preview.controller?.status !== "measured"
  ) {
    errors.push("Measured wiring requires a measured controller.");
  }
  if (preview.status === "requires-review") {
    errors.push("The stored wiring route requires review before assembly.");
  }
  if (preview.outputs.length === 0 && mapping.panels.length > 0) {
    errors.push("Wiring preview has no outputs.");
  }

  const panelIds = new Set(mapping.panels.map((panel) => panel.id));
  const routed = new Set<string>();
  for (const output of preview.outputs) {
    for (let index = 0; index < output.panelIds.length; index += 1) {
      const panelId = output.panelIds[index]!;
      if (!panelIds.has(panelId)) {
        errors.push(
          `Output ${output.outputIndex + 1} references unknown ${panelId}.`,
        );
      }
      if (routed.has(panelId)) {
        errors.push(`Panel ${panelId} appears in multiple output routes.`);
      }
      routed.add(panelId);

      const node = preview.nodes.find(
        (candidate) => candidate.panelId === panelId,
      );
      if (!node) {
        errors.push(`Panel ${panelId} has no DIN/DOUT node.`);
        continue;
      }
      if (
        node.outputIndex !== output.outputIndex ||
        node.chainPosition !== index
      ) {
        errors.push(`Panel ${panelId} has inconsistent chain metadata.`);
      }
      const expectedPrevious = output.panelIds[index - 1] ?? null;
      const expectedNext = output.panelIds[index + 1] ?? null;
      if (
        node.previousPanelId !== expectedPrevious ||
        node.nextPanelId !== expectedNext
      ) {
        errors.push(`Panel ${panelId} has a discontinuous route.`);
      }
    }
  }

  if (routed.size !== mapping.panels.length) {
    errors.push(
      `Wiring preview covers ${routed.size} panels; expected ${mapping.panels.length}.`,
    );
  }
  if (preview.nodes.length !== mapping.panels.length) {
    errors.push(
      `Wiring preview has ${preview.nodes.length} nodes; expected ${mapping.panels.length}.`,
    );
  }

  return { valid: errors.length === 0, errors };
}
