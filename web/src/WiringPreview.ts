import type {
  LedMapping,
  PanelDefinition,
  Vector3Data,
} from "./LedMapping.ts";
import {
  CANONICAL_SCULPTURE_PROJECT,
  type SculptureDefinition,
} from "../../src/sculpture/Definition.ts";

export interface WiringPanelNode {
  panelId: string;
  outputIndex: number;
  chainPosition: number;
  previousPanelId: string | null;
  nextPanelId: string | null;
  din: Vector3Data;
  dout: Vector3Data;
  connectorDiagonal: "top-left-to-bottom-right";
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
  status: "generated-provisional" | "measured" | "unavailable";
  outputs: WiringOutputRoute[];
  nodes: WiringPanelNode[];
  notes: string[];
}

export interface WiringPreviewValidation {
  valid: boolean;
  errors: string[];
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

function routeNearestNeighbor(panels: PanelDefinition[]): PanelDefinition[] {
  if (panels.length === 0) return [];
  const remaining = [...panels];
  remaining.sort(
    (first, second) =>
      second.position.y - first.position.y ||
      first.id.localeCompare(second.id),
  );
  const route = [remaining.shift()!];

  while (remaining.length > 0) {
    const current = route[route.length - 1]!;
    remaining.sort(
      (first, second) =>
        distanceSquared(current, first) - distanceSquared(current, second) ||
        first.id.localeCompare(second.id),
    );
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

/**
 * Produces a complete view-only four-output route without claiming physical
 * connector corners, GPIO assignments, or chain order. The generator divides
 * the globe into four longitude sectors, then uses a short nearest-neighbor
 * route within each sector.
 */
export function createProvisionalWiringPreview(
  mapping: LedMapping,
  definition: SculptureDefinition = CANONICAL_SCULPTURE_PROJECT.sculpture,
): WiringPreview {
  if (mapping.topology !== "panelized-sculpture") {
    return {
      status: "unavailable",
      outputs: [],
      nodes: [],
      notes: ["Wiring preview is available only for the panelized sculpture."],
    };
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
  let offset = 0;

  for (
    let routeIndex = 0;
    routeIndex < definition.wiring.outputs.length;
    routeIndex += 1
  ) {
    const outputDefinition = definition.wiring.outputs[routeIndex]!;
    const outputIndex = outputDefinition.outputIndex;
    const length = definition.wiring.chainLengths[routeIndex]!;
    const panels = routeNearestNeighbor(
      byLongitude.slice(offset, offset + length),
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
          -1,
          1,
          definition.wiring.connector.edgeInset,
          definition.wiring.connector.surfaceOffset,
        ),
        dout: connectorPosition(
          panel,
          1,
          -1,
          definition.wiring.connector.edgeInset,
          definition.wiring.connector.surfaceOffset,
        ),
        connectorDiagonal: definition.wiring.connector.diagonal,
        dinDoutAssignmentStatus:
          definition.wiring.connector.dinDoutAssignmentStatus,
      });
    }
  }

  return {
    status:
      definition.wiring.status === "measured"
        ? "measured"
        : "generated-provisional",
    outputs,
    nodes,
    notes: [
      "Four colored routes are a generated geographic preview, not physical wiring.",
      "The free top-left/bottom-right diagonal follows the canonical 3D-part clearances; marker inset remains schematic.",
      "Which diagonal endpoint is DIN versus DOUT remains provisional until checked on the physical PCB.",
      "GPIO numbers and the final per-output chain order remain TBD.",
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
  if (preview.outputs.length !== 4) {
    errors.push(
      `Wiring preview has ${preview.outputs.length} outputs; expected 4.`,
    );
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
