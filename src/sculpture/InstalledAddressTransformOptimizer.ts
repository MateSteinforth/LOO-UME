import type { PanelCorner, PanelHardwareProfile } from "./Definition.ts";
import type {
  InstalledAddressTransform,
  PanelAssemblyDefinition,
} from "./PanelAssembly.ts";
import { createInstalledAddressOptimizationFingerprint } from "./PanelAssembly.ts";

type Point3 = { x: number; y: number; z: number };

interface TransformChoice {
  turns: 0 | 1 | 2 | 3;
  din: Point3;
  dout: Point3;
}

interface DynamicState {
  distance: number;
  turns: Array<0 | 1 | 2 | 3>;
}

const TURN_CHOICES: Array<0 | 1 | 2 | 3> = [0, 1, 2, 3];
const DISTANCE_EPSILON = 1e-9;

/**
 * Remove only derived route-optimization provenance before an explicit
 * reoptimization. This lets the dedicated maintenance command migrate stale
 * optimized transforms after a profile or route authority changes while all
 * normal project loaders continue to reject stale fingerprints.
 */
export function prepareInstalledAddressTransformsForReoptimization(
  definition: PanelAssemblyDefinition,
): PanelAssemblyDefinition {
  const prepared = structuredClone(definition);
  for (const panel of prepared.panels) {
    const transform = panel.installedAddressTransform;
    if (transform?.selectionMethod !== "route-optimized") continue;
    transform.selectionMethod = "manual";
    delete transform.optimizationFingerprint;
  }
  return prepared;
}

function effectiveTransform(
  panel: PanelAssemblyDefinition["panels"][number],
): InstalledAddressTransform {
  return panel.installedAddressTransform ?? {
    status: "assumed",
    referenceView: "back",
    quarterTurnsClockwise: 0,
    mirrored: false,
    selectionMethod: "manual",
  };
}

function transformDisplayToPcb(
  x: number,
  y: number,
  transform: Pick<InstalledAddressTransform, "quarterTurnsClockwise" | "mirrored">,
  columns: number,
  rows: number,
): [number, number] {
  x = columns - 1 - x;
  x = transform.mirrored ? columns - 1 - x : x;
  switch (transform.quarterTurnsClockwise) {
    case 1:
      return [rows - 1 - y, x];
    case 2:
      return [columns - 1 - x, rows - 1 - y];
    case 3:
      return [y, columns - 1 - x];
    default:
      return [x, y];
  }
}

function cornerCoordinate(
  corner: PanelCorner,
  columns: number,
  rows: number,
): [number, number] {
  return [
    corner.endsWith("left") ? 0 : columns - 1,
    corner.startsWith("top") ? 0 : rows - 1,
  ];
}

function displayCoordinateForPcbCorner(
  corner: PanelCorner,
  transform: Pick<InstalledAddressTransform, "quarterTurnsClockwise" | "mirrored">,
  columns: number,
  rows: number,
): [number, number] {
  const [targetX, targetY] = cornerCoordinate(corner, columns, rows);
  const corners: Array<[number, number]> = [
    [0, 0],
    [columns - 1, 0],
    [0, rows - 1],
    [columns - 1, rows - 1],
  ];
  const match = corners.find(([x, y]) => {
    const [pcbX, pcbY] = transformDisplayToPcb(x, y, transform, columns, rows);
    return pcbX === targetX && pcbY === targetY;
  });
  if (!match) throw new Error("Installed transform does not map a connector corner.");
  return match;
}

function worldPositionAtDisplayCoordinate(
  panel: PanelAssemblyDefinition["panels"][number],
  x: number,
  y: number,
  columns: number,
  rows: number,
  panelProfile: PanelHardwareProfile,
): Point3 {
  const xOffset = (x / (columns - 1) - 0.5) * panelProfile.dimensions.width;
  const yOffset = (0.5 - y / (rows - 1)) * panelProfile.dimensions.height;
  const [positionX, positionY, positionZ] = panel.pose.position;
  const xAxis = panel.pose.orientation.xAxis;
  const yAxis = panel.pose.orientation.yAxis;
  return {
    x: positionX + xAxis[0] * xOffset + yAxis[0] * yOffset,
    y: positionY + xAxis[1] * xOffset + yAxis[1] * yOffset,
    z: positionZ + xAxis[2] * xOffset + yAxis[2] * yOffset,
  };
}

function connectorPosition(
  panel: PanelAssemblyDefinition["panels"][number],
  corner: PanelCorner,
  transform: Pick<InstalledAddressTransform, "quarterTurnsClockwise" | "mirrored">,
  panelProfile: PanelHardwareProfile,
): Point3 {
  const { columns, rows } = panelProfile.pixelGrid;
  const [displayX, displayY] = displayCoordinateForPcbCorner(
    corner,
    transform,
    columns,
    rows,
  );
  return worldPositionAtDisplayCoordinate(
    panel,
    displayX,
    displayY,
    columns,
    rows,
    panelProfile,
  );
}

function distance(first: Point3, second: Point3): number {
  return Math.hypot(
    first.x - second.x,
    first.y - second.y,
    first.z - second.z,
  );
}

function compareTurnSequences(
  first: readonly number[],
  second: readonly number[],
): number {
  for (let index = 0; index < first.length; index += 1) {
    const difference = first[index]! - second[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

function isBetterState(candidate: DynamicState, current: DynamicState | undefined): boolean {
  if (!current) return true;
  if (candidate.distance < current.distance - DISTANCE_EPSILON) return true;
  return Math.abs(candidate.distance - current.distance) <= DISTANCE_EPSILON &&
    compareTurnSequences(candidate.turns, current.turns) < 0;
}

function requiredCurrentRoutes(
  definition: PanelAssemblyDefinition,
): Array<{ panelIds: string[] }> {
  if (definition.wiring.status !== "authored" && definition.wiring.status !== "measured") {
    throw new Error("Installed-transform optimization requires a current authored wiring route.");
  }
  if (definition.wiring.outputs.length !== definition.wiring.chainLengths.length) {
    throw new Error("Wiring output and chain-length counts must agree.");
  }
  const seen = new Set<string>();
  for (let outputIndex = 0; outputIndex < definition.wiring.outputs.length; outputIndex += 1) {
    const route = definition.wiring.outputs[outputIndex]!.panelIds;
    if (!route || route.length !== definition.wiring.chainLengths[outputIndex]!) {
      throw new Error("Installed-transform optimization requires complete authored panel routes.");
    }
    for (const panelId of route) {
      if (seen.has(panelId)) {
        throw new Error("Authored panel routes cannot repeat a panel during installed-transform optimization.");
      }
      seen.add(panelId);
    }
  }
  if (seen.size !== definition.panels.length) {
    throw new Error("Authored panel routes must cover every panel during installed-transform optimization.");
  }
  return definition.wiring.outputs.map((output) => ({ panelIds: output.panelIds! }));
}

function choicesForPanel(
  panel: PanelAssemblyDefinition["panels"][number],
  panelProfile: PanelHardwareProfile,
): TransformChoice[] {
  const turnChoices = panelProfile.pixelGrid.columns === panelProfile.pixelGrid.rows
    ? TURN_CHOICES
    : ([0, 2] as const);
  return turnChoices.map((turns) => ({
    turns,
    din: connectorPosition(panel, panelProfile.dataConnectors.dinCorner, {
      quarterTurnsClockwise: turns,
      mirrored: false,
    }, panelProfile),
    dout: connectorPosition(panel, panelProfile.dataConnectors.doutCorner, {
      quarterTurnsClockwise: turns,
      mirrored: false,
    }, panelProfile),
  }));
}

function optimalTurnsForRoute(
  route: PanelAssemblyDefinition["panels"],
  panelProfile: PanelHardwareProfile,
): Array<0 | 1 | 2 | 3> {
  if (route.length === 0) return [];
  let previous = choicesForPanel(route[0]!, panelProfile).map((choice) => ({
    distance: 0,
    turns: [choice.turns],
  }));
  let previousChoices = choicesForPanel(route[0]!, panelProfile);

  for (let index = 1; index < route.length; index += 1) {
    const choices = choicesForPanel(route[index]!, panelProfile);
    const next: DynamicState[] = [];
    for (const choice of choices) {
      let best: DynamicState | undefined;
      for (let previousIndex = 0; previousIndex < previous.length; previousIndex += 1) {
        const previousState = previous[previousIndex]!;
        const candidate: DynamicState = {
          distance: previousState.distance + distance(
            previousChoices[previousIndex]!.dout,
            choice.din,
          ),
          turns: [...previousState.turns, choice.turns],
        };
        if (isBetterState(candidate, best)) best = candidate;
      }
      next.push(best!);
    }
    previous = next;
    previousChoices = choices;
  }

  let best: DynamicState | undefined;
  for (const state of previous) {
    if (isBetterState(state, best)) best = state;
  }
  return best!.turns;
}

/**
 * Return the total DOUT-to-next-DIN cable length for the saved output routes.
 * Connector positions use the profile's named PCB corners, not unmeasured pads.
 */
export function calculateAuthoredRouteCableLength(
  definition: PanelAssemblyDefinition,
  panelProfile: PanelHardwareProfile,
): number {
  const routes = requiredCurrentRoutes(definition);
  const panelById = new Map(definition.panels.map((panel) => [panel.id, panel]));
  let total = 0;
  for (const route of routes) {
    for (let index = 1; index < route.panelIds.length; index += 1) {
      const previous = panelById.get(route.panelIds[index - 1]!);
      const next = panelById.get(route.panelIds[index]!);
      if (!previous || !next) throw new Error("Authored panel route references an unknown panel.");
      const previousTransform = effectiveTransform(previous);
      const nextTransform = effectiveTransform(next);
      total += distance(
        connectorPosition(
          previous,
          panelProfile.dataConnectors.doutCorner,
          previousTransform,
          panelProfile,
        ),
        connectorPosition(
          next,
          panelProfile.dataConnectors.dinCorner,
          nextTransform,
          panelProfile,
        ),
      );
    }
  }
  return total;
}

/**
 * Clone an authored assembly and choose non-mirrored assumed quarter turns that
 * globally minimize DOUT-to-next-DIN cable length inside every saved output.
 */
export function optimizeInstalledAddressTransforms(
  definition: PanelAssemblyDefinition,
  panelProfile: PanelHardwareProfile,
): PanelAssemblyDefinition {
  const routes = requiredCurrentRoutes(definition);
  const optimized = structuredClone(definition);
  const optimizationFingerprint = createInstalledAddressOptimizationFingerprint(
    optimized,
    panelProfile,
  );
  const panelById = new Map(optimized.panels.map((panel) => [panel.id, panel]));

  for (const route of routes) {
    const panels = route.panelIds.map((panelId) => {
      const panel = panelById.get(panelId);
      if (!panel) throw new Error("Authored panel route references an unknown panel.");
      return panel;
    });
    const turns = optimalTurnsForRoute(panels, panelProfile);
    for (let index = 0; index < panels.length; index += 1) {
      panels[index]!.installedAddressTransform = {
        status: "assumed",
        referenceView: "back",
        quarterTurnsClockwise: turns[index]!,
        mirrored: false,
        selectionMethod: "route-optimized",
        optimizationFingerprint,
      };
    }
  }
  optimized.calibration.installedPanelOrientation = "provisional";
  return optimized;
}
