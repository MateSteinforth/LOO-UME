import type { Vector3Data } from "./LedMapping.ts";
import type {
  WiringPanelNode,
  WiringPreview,
} from "./WiringPreview.ts";
import { createWiringControllerLayout } from "./WiringPreview.ts";

export type AssemblyTutorialRouteStatus =
  | "exact"
  | "requires-review"
  | "draft";

export interface AssemblyTutorialPanel {
  id: string;
  chainPosition: number;
  label: string;
}

export interface AssemblyTutorialConnection {
  index: number;
  instruction: string;
  fromPanelId: string | null;
  toPanelId: string;
  start: Vector3Data | null;
  end: Vector3Data;
}

export interface AssemblyTutorialChain {
  outputIndex: number;
  label: string;
  gpio: number | null;
  color: number;
  cssColor: string;
  routeStatus: AssemblyTutorialRouteStatus;
  routeWarning: string;
  panels: AssemblyTutorialPanel[];
  connections: AssemblyTutorialConnection[];
}

export interface AssemblyTutorialModel {
  chains: AssemblyTutorialChain[];
}

export interface AssemblyTutorialStepState {
  chainIndex: number;
  connectionIndex: number | null;
}

export function nextAssemblyTutorialWire(
  model: AssemblyTutorialModel,
  state: AssemblyTutorialStepState,
): AssemblyTutorialStepState {
  const chain = model.chains[state.chainIndex];
  if (!chain) return state;
  const connectionIndex = state.connectionIndex ?? 0;
  return {
    ...state,
    connectionIndex: Math.min(
      connectionIndex + 1,
      chain.connections.length - 1,
    ),
  };
}

export function previousAssemblyTutorialWire(
  model: AssemblyTutorialModel,
  state: AssemblyTutorialStepState,
): AssemblyTutorialStepState {
  const chain = model.chains[state.chainIndex];
  if (!chain) return state;
  return {
    ...state,
    connectionIndex: Math.max(0, (state.connectionIndex ?? 0) - 1),
  };
}

export function nextAssemblyTutorialChain(
  model: AssemblyTutorialModel,
  state: AssemblyTutorialStepState,
): AssemblyTutorialStepState {
  if (model.chains.length === 0) return state;
  return {
    chainIndex: Math.min(state.chainIndex + 1, model.chains.length - 1),
    connectionIndex: 0,
  };
}

export function previousAssemblyTutorialChain(
  _model: AssemblyTutorialModel,
  state: AssemblyTutorialStepState,
): AssemblyTutorialStepState {
  return {
    chainIndex: Math.max(0, state.chainIndex - 1),
    connectionIndex: 0,
  };
}

function routeStatus(preview: WiringPreview): AssemblyTutorialRouteStatus {
  if (preview.status === "requires-review") return "requires-review";
  if (preview.routeSource !== "authored-route") return "draft";
  return "exact";
}

function routeWarning(status: AssemblyTutorialRouteStatus): string {
  if (status === "exact") return "Saved data route";
  if (status === "requires-review") {
    return "ROUTE REQUIRES REVIEW — confirm and save it before physical assembly.";
  }
  return "DRAFT ROUTE — save the route before physical assembly.";
}

function connectorLabel(node: WiringPanelNode, connector: "DIN" | "DOUT"): string {
  const corner = connector === "DIN" ? node.dinCorner : node.doutCorner;
  return `${node.panelId} ${connector} (${corner}, back view)`;
}

export function createAssemblyTutorialModel(
  preview: WiringPreview,
): AssemblyTutorialModel {
  if (preview.status === "unavailable") return { chains: [] };
  const nodeByPanel = new Map(
    preview.nodes.map((node) => [node.panelId, node]),
  );
  const status = routeStatus(preview);
  const controllerLayout = createWiringControllerLayout(preview);
  const controllerPins = new Map(
    controllerLayout?.pins.map((pin) => [pin.outputIndex, pin.position]) ?? [],
  );

  return {
    chains: preview.outputs.map((output) => {
      const nodes = output.panelIds.map((panelId) => {
        const node = nodeByPanel.get(panelId);
        if (!node) {
          throw new Error(
            `Assembly tutorial output ${output.outputIndex + 1} has no DIN/DOUT node for ${panelId}.`,
          );
        }
        return node;
      });
      const panels = nodes.map((node, chainPosition) => ({
        id: node.panelId,
        chainPosition,
        label: `${chainPosition + 1} / ${nodes.length} · ${node.panelId}`,
      }));
      const connections = nodes.map((node, index) => {
        const previous = nodes[index - 1] ?? null;
        const controller = output.gpio === null
          ? `Controller output ${output.outputIndex + 1} (GPIO unassigned)`
          : `Controller GPIO ${output.gpio}`;
        return {
          index,
          instruction: previous
            ? `${connectorLabel(previous, "DOUT")} → ${connectorLabel(node, "DIN")}`
            : `${controller} → ${connectorLabel(node, "DIN")}`,
          fromPanelId: previous?.panelId ?? null,
          toPanelId: node.panelId,
          start: previous?.dout ?? controllerPins.get(output.outputIndex) ?? null,
          end: node.din,
        } satisfies AssemblyTutorialConnection;
      });
      return {
        outputIndex: output.outputIndex,
        label: output.label,
        gpio: output.gpio,
        color: output.color,
        cssColor: output.cssColor,
        routeStatus: status,
        routeWarning: routeWarning(status),
        panels,
        connections,
      } satisfies AssemblyTutorialChain;
    }).filter((chain) => chain.panels.length > 0),
  };
}

export function maskedPanelPositions(
  basePositions: ArrayLike<number>,
  panelIds: ReadonlyArray<string | null>,
  visiblePanelIds: ReadonlySet<string> | null,
): Float32Array {
  if (basePositions.length !== panelIds.length * 3) {
    throw new Error("Panel position metadata does not match the geometry.");
  }
  const result = Float32Array.from(basePositions);
  if (!visiblePanelIds) return result;
  for (let index = 0; index < panelIds.length; index += 1) {
    const panelId = panelIds[index] ?? null;
    if (panelId !== null && visiblePanelIds.has(panelId)) continue;
    result[index * 3] = Number.NaN;
    result[index * 3 + 1] = Number.NaN;
    result[index * 3 + 2] = Number.NaN;
  }
  return result;
}
