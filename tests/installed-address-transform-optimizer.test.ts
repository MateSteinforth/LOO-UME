import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CANONICAL_SCULPTURE_PROJECT } from "../src/sculpture/Definition.ts";
import {
  calculateAuthoredRouteCableLength,
  optimizeInstalledAddressTransforms,
} from "../src/sculpture/InstalledAddressTransformOptimizer.ts";
import {
  createInstalledAddressOptimizationFingerprint,
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";

function loadManual() {
  return parsePanelAssemblyDefinition(JSON.parse(readFileSync(
    "sculptures/rhombicosidodecahedron/sculpture.json",
    "utf8",
  )));
}

function withIdentityTransforms<T extends ReturnType<typeof loadManual>>(definition: T): T {
  const identity = structuredClone(definition);
  for (const panel of identity.panels) {
    panel.installedAddressTransform = {
      status: "assumed",
      referenceView: "back",
      quarterTurnsClockwise: 0,
      mirrored: false,
    };
  }
  return identity;
}

describe("installed address transform optimizer", () => {
  it("does not mutate the input and never exceeds the identity-route cable length", () => {
    const source = loadManual();
    const sourceSnapshot = structuredClone(source);
    const optimized = optimizeInstalledAddressTransforms(
      source,
      CANONICAL_SCULPTURE_PROJECT.panelProfile,
    );

    expect(source).toEqual(sourceSnapshot);
    expect(optimized.wiring).toEqual(source.wiring);
    expect(optimized.panels.map((panel) => panel.pose)).toEqual(
      source.panels.map((panel) => panel.pose),
    );
    expect(calculateAuthoredRouteCableLength(
      optimized,
      CANONICAL_SCULPTURE_PROJECT.panelProfile,
    )).toBeLessThanOrEqual(calculateAuthoredRouteCableLength(
      withIdentityTransforms(source),
      CANONICAL_SCULPTURE_PROJECT.panelProfile,
    ));
    expect(optimized.panels).toHaveLength(41);
    const optimizationFingerprint = createInstalledAddressOptimizationFingerprint(
      optimized,
      CANONICAL_SCULPTURE_PROJECT.panelProfile,
    );
    expect(optimized.panels.every((panel) =>
      panel.installedAddressTransform?.status === "assumed" &&
      panel.installedAddressTransform.referenceView === "back" &&
      panel.installedAddressTransform.mirrored === false &&
      panel.installedAddressTransform.selectionMethod === "route-optimized" &&
      panel.installedAddressTransform.optimizationFingerprint === optimizationFingerprint &&
      panel.installedAddressTransform.quarterTurnsClockwise >= 0 &&
      panel.installedAddressTransform.quarterTurnsClockwise <= 3
    )).toBe(true);
  });

  it("uses a deterministic lexicographic turn tie-break", () => {
    const source = loadManual();
    const first = optimizeInstalledAddressTransforms(
      source,
      CANONICAL_SCULPTURE_PROJECT.panelProfile,
    );
    const second = optimizeInstalledAddressTransforms(
      source,
      CANONICAL_SCULPTURE_PROJECT.panelProfile,
    );

    expect(first).toEqual(second);
  });

  it("accepts legacy transforms without provenance as manual selections", () => {
    const source = loadManual();
    delete source.panels[0]!.installedAddressTransform!.selectionMethod;
    delete source.panels[0]!.installedAddressTransform!.optimizationFingerprint;

    expect(() => parsePanelAssemblyDefinition(source)).not.toThrow();
  });

  it("keeps route-optimization provenance pairing checks in the JSON parser", () => {
    const missingFingerprint = loadManual();
    delete missingFingerprint.panels[0]!.installedAddressTransform!
      .optimizationFingerprint;
    expect(() => parsePanelAssemblyDefinition(missingFingerprint)).toThrow(
      /require an optimization fingerprint/,
    );

    const manualFingerprint = loadManual();
    manualFingerprint.panels[0]!.installedAddressTransform!.selectionMethod = "manual";
    expect(() => parsePanelAssemblyDefinition(manualFingerprint)).toThrow(
      /Only route-optimized/,
    );
  });

  it("rejects route-optimized transforms after direct route or pose edits", () => {
    const optimized = optimizeInstalledAddressTransforms(
      loadManual(),
      CANONICAL_SCULPTURE_PROJECT.panelProfile,
    );
    const routeChanged = structuredClone(optimized);
    [routeChanged.wiring.outputs[0]!.panelIds![0], routeChanged.wiring.outputs[0]!.panelIds![1]] = [
      routeChanged.wiring.outputs[0]!.panelIds![1]!,
      routeChanged.wiring.outputs[0]!.panelIds![0]!,
    ];
    expect(() => createPanelAssemblyProject(
      routeChanged,
      "sculptures/rhombicosidodecahedron/sculpture.json",
      CANONICAL_SCULPTURE_PROJECT.panelProfile,
    )).toThrow(
      /current optimization fingerprint/,
    );

    const poseChanged = structuredClone(optimized);
    poseChanged.panels[0]!.pose.position[0] += 1;
    expect(() => createPanelAssemblyProject(
      poseChanged,
      "sculptures/rhombicosidodecahedron/sculpture.json",
      CANONICAL_SCULPTURE_PROJECT.panelProfile,
    )).toThrow(
      /current optimization fingerprint/,
    );

    const profileChanged = structuredClone(CANONICAL_SCULPTURE_PROJECT.panelProfile);
    profileChanged.dimensions.width += 1;
    expect(() => createPanelAssemblyProject(
      optimized,
      "sculptures/rhombicosidodecahedron/sculpture.json",
      profileChanged,
    )).toThrow(/current optimization fingerprint/);
  });

  it("selects the lower turn sequence for a symmetric two-panel optimum", () => {
    const source = loadManual();
    const definition = structuredClone(source);
    definition.panels = definition.panels.filter((panel) =>
      panel.id === "SQ-01" || panel.id === "SQ-02"
    );
    definition.panels[0]!.pose.position = [0, 0, 0];
    definition.panels[0]!.pose.orientation = {
      xAxis: [1, 0, 0],
      yAxis: [0, 1, 0],
      normal: [0, 0, 1],
    };
    definition.panels[1]!.pose.position = [0, 200, 0];
    definition.panels[1]!.pose.orientation = {
      xAxis: [1, 0, 0],
      yAxis: [0, 1, 0],
      normal: [0, 0, 1],
    };
    definition.wiring.status = "authored";
    definition.wiring.chainLengths = [2];
    definition.wiring.outputs = [{
      ...definition.wiring.outputs[0]!,
      outputIndex: 0,
      panelIds: ["SQ-01", "SQ-02"],
    }];

    const optimized = optimizeInstalledAddressTransforms(
      definition,
      CANONICAL_SCULPTURE_PROJECT.panelProfile,
    );
    expect(optimized.panels.map((panel) =>
      panel.installedAddressTransform!.quarterTurnsClockwise
    )).toEqual([0, 1]);
  });

  it("matches exhaustive search on a three-panel chain", () => {
    const source = loadManual();
    const definition = structuredClone(source);
    const panelIds = ["SQ-01", "PC-01", "SQ-06"];
    definition.panels = definition.panels.filter((panel) => panelIds.includes(panel.id));
    definition.wiring.chainLengths = [3];
    definition.wiring.outputs = [{
      ...definition.wiring.outputs[0]!,
      outputIndex: 0,
      panelIds,
    }];
    let exhaustive = Number.POSITIVE_INFINITY;
    for (const first of [0, 1, 2, 3] as const) {
      for (const second of [0, 1, 2, 3] as const) {
        for (const third of [0, 1, 2, 3] as const) {
          const candidate = structuredClone(definition);
          [first, second, third].forEach((turns, index) => {
            candidate.panels[index]!.installedAddressTransform = {
              status: "assumed",
              referenceView: "back",
              quarterTurnsClockwise: turns,
              mirrored: false,
              selectionMethod: "manual",
            };
          });
          exhaustive = Math.min(
            exhaustive,
            calculateAuthoredRouteCableLength(
              candidate,
              CANONICAL_SCULPTURE_PROJECT.panelProfile,
            ),
          );
        }
      }
    }
    const optimized = optimizeInstalledAddressTransforms(
      definition,
      CANONICAL_SCULPTURE_PROJECT.panelProfile,
    );
    expect(calculateAuthoredRouteCableLength(
      optimized,
      CANONICAL_SCULPTURE_PROJECT.panelProfile,
    )).toBeCloseTo(exhaustive, 9);
  });
});
