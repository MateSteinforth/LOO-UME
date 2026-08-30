import type { PanelHardwareProfile } from "./Definition.ts";
import {
  createInstalledAddressOptimizationFingerprint,
  type PanelAssemblyDefinition,
} from "./PanelAssembly.ts";
import {
  panelCenterBehindPcb,
  panelConnectorWorldPosition,
  wiringControllerGeometry,
} from "./PanelConnectorGeometry.ts";

type Vector3Tuple = [number, number, number];
type QuarterTurn = 0 | 1 | 2 | 3;

interface OrientedPanel {
  panelId: string;
  deltaTurns: QuarterTurn;
  din: Vector3Tuple;
  dout: Vector3Tuple;
}

interface RouteSolution {
  panelIds: string[];
  deltaTurns: QuarterTurn[];
  cableLengthMm: number;
}

export interface AutomaticWiringOptimizationResult {
  definition: PanelAssemblyDefinition;
  outputCount: number;
  chainLengths: number[];
  gpios: number[];
  estimatedCableLengthMm: number;
  orientationPolicy: "quarter-turns" | "half-turns-only";
  poseQuarterTurnsByPanel: Record<string, QuarterTurn>;
  discardedLegacyAddressTurnPanelIds: string[];
}

export interface AutomaticWiringOutputPolicy {
  outputCount: number;
  chainLengths: number[];
  gpios: number[];
}

export function automaticWiringOrientationPolicy(
  definition: Pick<
    PanelAssemblyDefinition,
    "generatedMechanics" | "generatedStructure" | "wiring"
  >,
): AutomaticWiringOptimizationResult["orientationPolicy"] {
  return definition.generatedMechanics ||
      definition.generatedStructure ||
      definition.wiring.panelRotationConstraint === "half-turns-only"
    ? "half-turns-only"
    : "quarter-turns";
}

const MAXIMUM_PANELS_PER_OUTPUT = 11;
const OUTPUT_GPIOS = [16, 17, 18, 19] as const;
const OUTPUT_COLORS = ["#36e0d0", "#ff9d5c", "#a78bfa", "#f472b6"] as const;
const EPSILON = 1e-9;

function add(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(value: readonly number[], amount: number): Vector3Tuple {
  return [value[0]! * amount, value[1]! * amount, value[2]! * amount];
}

function distance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

function rotateBasis(
  orientation: PanelAssemblyDefinition["panels"][number]["pose"]["orientation"],
  turns: QuarterTurn,
): PanelAssemblyDefinition["panels"][number]["pose"]["orientation"] {
  const radians = turns * Math.PI / 2;
  const cosine = Math.round(Math.cos(radians));
  const sine = Math.round(Math.sin(radians));
  const xAxis = add(
    scale(orientation.xAxis, cosine),
    scale(orientation.yAxis, sine),
  );
  const yAxis = add(
    scale(orientation.xAxis, -sine),
    scale(orientation.yAxis, cosine),
  );
  return {
    xAxis,
    yAxis,
    normal: [...orientation.normal],
  };
}

function connectorPosition(
  panel: PanelAssemblyDefinition["panels"][number],
  profile: PanelHardwareProfile,
  edgeInset: number,
  surfaceOffset: number,
  kind: "din" | "dout",
): Vector3Tuple {
  return panelConnectorWorldPosition(
    {
      position: panel.pose.position,
      xAxis: panel.pose.orientation.xAxis,
      yAxis: panel.pose.orientation.yAxis,
      normal: panel.pose.orientation.normal,
    },
    profile,
    edgeInset,
    surfaceOffset,
    kind,
  );
}

function compareTextArrays(first: readonly string[], second: readonly string[]): number {
  for (let index = 0; index < Math.min(first.length, second.length); index += 1) {
    const comparison = first[index]!.localeCompare(second[index]!);
    if (comparison !== 0) return comparison;
  }
  return first.length - second.length;
}

function choicesForPanel(
  panel: PanelAssemblyDefinition["panels"][number],
  profile: PanelHardwareProfile,
  definition: PanelAssemblyDefinition,
  allowedTurns: readonly QuarterTurn[],
): OrientedPanel[] {
  return allowedTurns.map((deltaTurns) => {
    const candidate = structuredClone(panel);
    candidate.pose.orientation = rotateBasis(candidate.pose.orientation, deltaTurns);
    return {
      panelId: panel.id,
      deltaTurns,
      din: connectorPosition(
        candidate,
        profile,
        definition.wiring.connector.edgeInset,
        definition.wiring.connector.surfaceOffset,
        "din",
      ),
      dout: connectorPosition(
        candidate,
        profile,
        definition.wiring.connector.edgeInset,
        definition.wiring.connector.surfaceOffset,
        "dout",
      ),
    };
  });
}

function solveRoute(
  panelIds: readonly string[],
  panelById: ReadonlyMap<string, PanelAssemblyDefinition["panels"][number]>,
  controllerPin: Vector3Tuple,
  profile: PanelHardwareProfile,
  definition: PanelAssemblyDefinition,
  allowedTurns: readonly QuarterTurn[],
): RouteSolution {
  if (panelIds.length === 0) {
    return { panelIds: [], deltaTurns: [], cableLengthMm: 0 };
  }
  let previousChoices = choicesForPanel(
    panelById.get(panelIds[0]!)!, profile, definition, allowedTurns,
  );
  let states = previousChoices.map((choice) => ({
    cableLengthMm: distance(controllerPin, choice.din),
    deltaTurns: [choice.deltaTurns],
  }));
  for (let index = 1; index < panelIds.length; index += 1) {
    const choices = choicesForPanel(
      panelById.get(panelIds[index]!)!, profile, definition, allowedTurns,
    );
    const nextStates = choices.map((choice) => {
      let best: { cableLengthMm: number; deltaTurns: QuarterTurn[] } | undefined;
      for (let previousIndex = 0; previousIndex < states.length; previousIndex += 1) {
        const prior = states[previousIndex]!;
        const candidate = {
          cableLengthMm: prior.cableLengthMm + distance(previousChoices[previousIndex]!.dout, choice.din),
          deltaTurns: [...prior.deltaTurns, choice.deltaTurns],
        };
        if (
          !best ||
          candidate.cableLengthMm < best.cableLengthMm - EPSILON ||
          (Math.abs(candidate.cableLengthMm - best.cableLengthMm) <= EPSILON &&
            candidate.deltaTurns.join("") < best.deltaTurns.join(""))
        ) best = candidate;
      }
      return best!;
    });
    states = nextStates;
    previousChoices = choices;
  }
  let bestIndex = 0;
  for (let index = 1; index < states.length; index += 1) {
    if (
      states[index]!.cableLengthMm < states[bestIndex]!.cableLengthMm - EPSILON ||
      (Math.abs(states[index]!.cableLengthMm - states[bestIndex]!.cableLengthMm) <= EPSILON &&
        states[index]!.deltaTurns.join("") < states[bestIndex]!.deltaTurns.join(""))
    ) bestIndex = index;
  }
  return {
    panelIds: [...panelIds],
    deltaTurns: states[bestIndex]!.deltaTurns,
    cableLengthMm: states[bestIndex]!.cableLengthMm,
  };
}

function controllerPins(
  definition: PanelAssemblyDefinition,
  outputCount: number,
): Vector3Tuple[] {
  const positions = definition.panels.map((panel) => panelCenterBehindPcb(
    {
      position: panel.pose.position,
      xAxis: panel.pose.orientation.xAxis,
      yAxis: panel.pose.orientation.yAxis,
      normal: panel.pose.orientation.normal,
    },
    definition.wiring.connector.surfaceOffset,
  ));
  return wiringControllerGeometry(
    positions,
    outputCount,
    definition.wiring.controller.position,
    definition.wiring.controller.orientation,
  ).pinPositions;
}

export function calculatePoseOwnedWiringCableLength(
  definition: PanelAssemblyDefinition,
  profile: PanelHardwareProfile,
): number {
  const pins = controllerPins(definition, definition.wiring.outputs.length);
  const panelById = new Map(definition.panels.map((panel) => [panel.id, panel]));
  return definition.wiring.outputs.reduce((total, output, outputIndex) => {
    if (!output.panelIds) {
      throw new Error("Cable-length calculation requires complete saved panel routes.");
    }
    let previous = pins[outputIndex]!;
    for (const panelId of output.panelIds) {
      const panel = panelById.get(panelId);
      if (!panel) throw new Error(`Cable route references unknown panel ${panelId}.`);
      const din = connectorPosition(
        panel,
        profile,
        definition.wiring.connector.edgeInset,
        definition.wiring.connector.surfaceOffset,
        "din",
      );
      total += distance(previous, din);
      previous = connectorPosition(
        panel,
        profile,
        definition.wiring.connector.edgeInset,
        definition.wiring.connector.surfaceOffset,
        "dout",
      );
    }
    return total;
  }, 0);
}

function balancedChainLengths(panelCount: number, outputCount: number): number[] {
  const shortLength = Math.floor(panelCount / outputCount);
  const longCount = panelCount % outputCount;
  return Array.from(
    { length: outputCount },
    (_, index) => shortLength + (index < longCount ? 1 : 0),
  );
}

export function automaticWiringOutputPolicy(
  panelCount: number,
): AutomaticWiringOutputPolicy {
  if (!Number.isInteger(panelCount) || panelCount < 1 || panelCount > 41) {
    throw new Error("Automatic wiring supports 1 through 41 panels on the approved ESP32 target.");
  }
  const outputCount = Math.ceil(panelCount / MAXIMUM_PANELS_PER_OUTPUT);
  return {
    outputCount,
    chainLengths: balancedChainLengths(panelCount, outputCount),
    gpios: [...OUTPUT_GPIOS.slice(0, outputCount)],
  };
}

function sortedPanelOrders(definition: PanelAssemblyDefinition): string[][] {
  const panels = [...definition.panels];
  const longitude = (panel: typeof panels[number]): number =>
    (Math.atan2(panel.pose.position[2], panel.pose.position[0]) + 2 * Math.PI) % (2 * Math.PI);
  const sort = (compare: (a: typeof panels[number], b: typeof panels[number]) => number): string[] =>
    [...panels].sort((a, b) => compare(a, b) || a.id.localeCompare(b.id)).map((panel) => panel.id);
  return [
    sort((a, b) => longitude(a) - longitude(b) || b.pose.position[1] - a.pose.position[1]),
    sort((a, b) => b.pose.position[1] - a.pose.position[1] || longitude(a) - longitude(b)),
    sort((a, b) => a.pose.position[0] - b.pose.position[0] || a.pose.position[2] - b.pose.position[2]),
    sort((a, b) => a.pose.position[2] - b.pose.position[2] || a.pose.position[0] - b.pose.position[0]),
  ];
}

function partition(order: readonly string[], lengths: readonly number[]): string[][] {
  let offset = 0;
  return lengths.map((length) => {
    const route = order.slice(offset, offset + length);
    offset += length;
    return route;
  });
}

function completeStoredRoutes(
  definition: PanelAssemblyDefinition,
  outputCount: number,
  chainLengths: readonly number[],
): string[][] | null {
  if (
    definition.wiring.outputs.length !== outputCount ||
    !definition.wiring.outputs.every((output, index) =>
      output.panelIds?.length === chainLengths[index]
    )
  ) return null;
  const routes = definition.wiring.outputs.map((output) => [...output.panelIds!]);
  const routed = routes.flat();
  const known = new Set(definition.panels.map((panel) => panel.id));
  if (
    routed.length !== known.size ||
    new Set(routed).size !== known.size ||
    routed.some((panelId) => !known.has(panelId))
  ) return null;
  return routes;
}

function optimizeRoutes(
  seed: string[][],
  panelById: ReadonlyMap<string, PanelAssemblyDefinition["panels"][number]>,
  pins: readonly Vector3Tuple[],
  profile: PanelHardwareProfile,
  definition: PanelAssemblyDefinition,
  allowedTurns: readonly QuarterTurn[],
): RouteSolution[] {
  let routes = seed.map((panelIds, index) =>
    solveRoute(panelIds, panelById, pins[index]!, profile, definition, allowedTurns)
  );
  for (let iteration = 0; iteration < 20; iteration += 1) {
    let improvement: RouteSolution[] | undefined;
    const consider = (candidateIds: string[][], affected: readonly number[]): boolean => {
      const candidate = [...routes];
      for (const index of affected) {
        candidate[index] = solveRoute(
          candidateIds[index]!, panelById, pins[index]!, profile, definition, allowedTurns,
        );
      }
      const total = candidate.reduce((sum, route) => sum + route.cableLengthMm, 0);
      const currentTotal = routes.reduce((sum, route) => sum + route.cableLengthMm, 0);
      if (total < currentTotal - EPSILON) {
        improvement = candidate;
        return true;
      }
      return false;
    };
    search: {
    for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
      const ids = routes.map((route) => [...route.panelIds]);
      for (let first = 0; first < ids[routeIndex]!.length; first += 1) {
        for (let second = first + 1; second < ids[routeIndex]!.length; second += 1) {
          const swapped = ids.map((route) => [...route]);
          [swapped[routeIndex]![first], swapped[routeIndex]![second]] =
            [swapped[routeIndex]![second]!, swapped[routeIndex]![first]!];
          if (consider(swapped, [routeIndex])) break search;
          const reversed = ids.map((route) => [...route]);
          reversed[routeIndex]!.splice(
            first,
            second - first + 1,
            ...reversed[routeIndex]!.slice(first, second + 1).reverse(),
          );
          if (consider(reversed, [routeIndex])) break search;
        }
      }
    }
    for (let firstRoute = 0; firstRoute < routes.length; firstRoute += 1) {
      for (let secondRoute = firstRoute + 1; secondRoute < routes.length; secondRoute += 1) {
        for (let first = 0; first < routes[firstRoute]!.panelIds.length; first += 1) {
          for (let second = 0; second < routes[secondRoute]!.panelIds.length; second += 1) {
            const swapped = routes.map((route) => [...route.panelIds]);
            [swapped[firstRoute]![first], swapped[secondRoute]![second]] =
              [swapped[secondRoute]![second]!, swapped[firstRoute]![first]!];
            if (consider(swapped, [firstRoute, secondRoute])) break search;
          }
        }
      }
    }
    }
    if (!improvement) break;
    routes = improvement;
  }
  return routes;
}

function foldLegacyInstalledTurns(
  definition: PanelAssemblyDefinition,
  halfTurnGateActive: boolean,
  useCurrentPosesAsFabricated: boolean,
): string[] {
  const discardedPanelIds: string[] = [];
  for (const panel of definition.panels) {
    const transform = panel.installedAddressTransform;
    if (!transform) continue;
    if (transform.mirrored) {
      throw new Error(`Automatic wiring cannot fold mirrored address calibration on ${panel.id} into a right-handed pose.`);
    }
    if (useCurrentPosesAsFabricated) {
      if (transform.quarterTurnsClockwise !== 0) discardedPanelIds.push(panel.id);
      panel.installedAddressTransform = {
        status: "assumed",
        referenceView: "back",
        quarterTurnsClockwise: 0,
        mirrored: false,
        selectionMethod: "manual",
      };
      continue;
    }
    if (halfTurnGateActive && transform.quarterTurnsClockwise % 2 !== 0) {
      throw new Error(
        `The 0/180-degree rotation gate is active and ${panel.id} has a 90-degree address-only orientation. Clear that legacy turn before migrating it into the physical pose.`,
      );
    }
    panel.pose.orientation = rotateBasis(
      panel.pose.orientation,
      transform.quarterTurnsClockwise,
    );
    panel.installedAddressTransform = {
      status: "assumed",
      referenceView: "back",
      quarterTurnsClockwise: 0,
      mirrored: false,
      selectionMethod: "manual",
    };
  }
  return discardedPanelIds;
}

function physicalPosesChanged(
  source: PanelAssemblyDefinition,
  result: PanelAssemblyDefinition,
): boolean {
  const originalById = new Map(source.panels.map((panel) => [panel.id, panel.pose]));
  return result.panels.some((panel) => {
    const original = originalById.get(panel.id);
    return !original || JSON.stringify(original) !== JSON.stringify(panel.pose);
  });
}

export function optimizeAutomaticWiring(
  source: PanelAssemblyDefinition,
  profile: PanelHardwareProfile,
): AutomaticWiringOptimizationResult {
  const outputPolicy = automaticWiringOutputPolicy(source.panels.length);
  if (
    source.wiring.status === "measured" ||
    source.wiring.status === "hardware-verified" ||
    source.calibration.installedPanelOrientation === "measured"
  ) {
    throw new Error("Automatic wiring does not rewrite measured or hardware-verified installation evidence.");
  }
  const definition = structuredClone(source);
  const generatedManifestGate = Boolean(
    definition.generatedMechanics || definition.generatedStructure,
  );
  const manualGate =
    definition.wiring.panelRotationConstraint === "half-turns-only";
  const orientationPolicy = automaticWiringOrientationPolicy(definition);
  const halfTurnGateActive = orientationPolicy === "half-turns-only";
  const discardedLegacyAddressTurnPanelIds = foldLegacyInstalledTurns(
    definition,
    halfTurnGateActive,
    manualGate && !generatedManifestGate,
  );
  const allowedTurns: readonly QuarterTurn[] = halfTurnGateActive
    ? [0, 2]
    : [0, 1, 2, 3];
  const { outputCount, chainLengths } = outputPolicy;
  const pins = controllerPins(definition, outputCount);
  const panelById = new Map(definition.panels.map((panel) => [panel.id, panel]));
  let bestRoutes: RouteSolution[] | undefined;
  const storedRoutes = completeStoredRoutes(definition, outputCount, chainLengths);
  const seeds = [
    ...(storedRoutes ? [storedRoutes] : []),
    ...sortedPanelOrders(definition).map((order) => partition(order, chainLengths)),
  ];
  for (const seed of seeds) {
    const candidate = optimizeRoutes(
      seed, panelById, pins, profile, definition, allowedTurns,
    );
    const candidateTotal = candidate.reduce((sum, route) => sum + route.cableLengthMm, 0);
    const bestTotal = bestRoutes?.reduce((sum, route) => sum + route.cableLengthMm, 0) ?? Infinity;
    if (
      candidateTotal < bestTotal - EPSILON ||
      (Math.abs(candidateTotal - bestTotal) <= EPSILON &&
        compareTextArrays(candidate.flatMap((route) => route.panelIds), bestRoutes?.flatMap((route) => route.panelIds) ?? []) < 0)
    ) bestRoutes = candidate;
  }
  const routes = bestRoutes!;
  const poseQuarterTurnsByPanel: Record<string, QuarterTurn> = {};
  for (const route of routes) {
    route.panelIds.forEach((panelId, index) => {
      const panel = panelById.get(panelId)!;
      const turns = route.deltaTurns[index]!;
      panel.pose.orientation = rotateBasis(panel.pose.orientation, turns);
      poseQuarterTurnsByPanel[panelId] = turns;
    });
  }
  definition.wiring.status = "authored";
  definition.wiring.routeStrategy = "balanced-oriented-cable-optimizer";
  definition.wiring.chainLengths = [...chainLengths];
  definition.wiring.outputs = routes.map((route, outputIndex) => ({
    outputIndex,
    label: `Output ${outputIndex + 1}`,
    gpio: OUTPUT_GPIOS[outputIndex]!,
    color: OUTPUT_COLORS[outputIndex]!,
    panelIds: [...route.panelIds],
  }));
  definition.wiring.routeRevision = (source.wiring.routeRevision ?? 0) + 1;
  delete definition.wiring.hardwareProof;
  definition.status = "provisional";
  definition.calibration.panelTransforms = "generated-provisional";
  definition.calibration.installedPanelOrientation = "provisional";
  definition.calibration.physicalChains = "provisional";
  if (definition.mechanicalShell && physicalPosesChanged(source, definition)) {
    definition.mechanicalShell.derivationStatus = "requires-regeneration";
  }
  const optimizationFingerprint = createInstalledAddressOptimizationFingerprint(definition, profile);
  for (const panel of definition.panels) {
    panel.installedAddressTransform = {
      status: "assumed",
      referenceView: "back",
      quarterTurnsClockwise: 0,
      mirrored: false,
      selectionMethod: "route-optimized",
      optimizationFingerprint,
    };
  }
  const estimatedCableLengthMm = routes.reduce((sum, route) => sum + route.cableLengthMm, 0);
  definition.notes.push(
    `Automatic wiring revision ${definition.wiring.routeRevision} selected ${outputCount} balanced output${outputCount === 1 ? "" : "s"}, GPIO ${OUTPUT_GPIOS.slice(0, outputCount).join("/")}, and ${orientationPolicy === "quarter-turns" ? "quarter-turn" : "0/180-degree"} physical panel poses; estimated data cable ${estimatedCableLengthMm.toFixed(1)} mm.`,
  );
  if (discardedLegacyAddressTurnPanelIds.length > 0) {
    definition.notes.push(
      `The manual 0/180-degree rotation gate used current saved poses as fabricated authority and discarded assumed legacy address-only turns on ${discardedLegacyAddressTurnPanelIds.join(", ")}.`,
    );
  }
  return {
    definition,
    outputCount,
    chainLengths,
    gpios: outputPolicy.gpios,
    estimatedCableLengthMm,
    orientationPolicy,
    poseQuarterTurnsByPanel,
    discardedLegacyAddressTurnPanelIds,
  };
}
