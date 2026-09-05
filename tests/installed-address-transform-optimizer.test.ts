import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calculateAuthoredRouteCableLength,
  optimizeInstalledAddressTransforms,
  prepareInstalledAddressTransformsForReoptimization,
} from "../src/sculpture/InstalledAddressTransformOptimizer.ts";
import {
  createInstalledAddressOptimizationFingerprint,
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";

function loadManual() {
  return parsePanelAssemblyDefinition(
    JSON.parse(
      readFileSync("sculptures/rhombicosidodecahedron/sculpture.json", "utf8"),
    ),
  );
}

const PANEL_PROFILE = createPanelAssemblyProject(
  loadManual(),
  "sculptures/rhombicosidodecahedron/sculpture.json",
).panelProfile;

function withIdentityTransforms<T extends ReturnType<typeof loadManual>>(
  definition: T,
): T {
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
  it("prepares stale route-optimized transforms only for explicit reoptimization", () => {
    const source = loadManual();
    const original = structuredClone(source);
    const prepared = prepareInstalledAddressTransformsForReoptimization(source);

    expect(source).toEqual(original);
    expect(prepared.panels.map((panel) => panel.pose)).toEqual(
      source.panels.map((panel) => panel.pose),
    );
    expect(prepared.wiring).toEqual(source.wiring);
    expect(
      prepared.panels.every(
        (panel) =>
          panel.installedAddressTransform?.selectionMethod === "manual" &&
          panel.installedAddressTransform.optimizationFingerprint === undefined,
      ),
    ).toBe(true);
  });

  it("uses only dimension-preserving turns for a rectangular pixel grid", () => {
    const definition = withIdentityTransforms(loadManual());
    const profile = structuredClone(PANEL_PROFILE);
    profile.pixelGrid.columns = 4;
    profile.pixelGrid.rows = 3;
    profile.power.worstCaseCurrentPerPanel = 0.72;
    for (const panel of definition.panels) {
      panel.installedAddressTransform = {
        status: "assumed",
        referenceView: "back",
        quarterTurnsClockwise: 0,
        mirrored: false,
        selectionMethod: "manual",
      };
    }
    const optimized = optimizeInstalledAddressTransforms(definition, profile);
    expect(
      optimized.panels.every(
        (panel) =>
          panel.installedAddressTransform!.quarterTurnsClockwise % 2 === 0,
      ),
    ).toBe(true);
  });

  it("does not mutate the input and never exceeds the identity-route cable length", () => {
    const source = loadManual();
    const sourceSnapshot = structuredClone(source);
    const optimized = optimizeInstalledAddressTransforms(source, PANEL_PROFILE);

    expect(source).toEqual(sourceSnapshot);
    expect(optimized.wiring).toEqual(source.wiring);
    expect(optimized.panels.map((panel) => panel.pose)).toEqual(
      source.panels.map((panel) => panel.pose),
    );
    expect(
      calculateAuthoredRouteCableLength(optimized, PANEL_PROFILE),
    ).toBeLessThanOrEqual(
      calculateAuthoredRouteCableLength(
        withIdentityTransforms(source),
        PANEL_PROFILE,
      ),
    );
    expect(optimized.panels).toHaveLength(41);
    const optimizationFingerprint =
      createInstalledAddressOptimizationFingerprint(optimized, PANEL_PROFILE);
    expect(
      optimized.panels.every(
        (panel) =>
          panel.installedAddressTransform?.status === "assumed" &&
          panel.installedAddressTransform.referenceView === "back" &&
          panel.installedAddressTransform.mirrored === false &&
          panel.installedAddressTransform.selectionMethod ===
            "route-optimized" &&
          panel.installedAddressTransform.optimizationFingerprint ===
            optimizationFingerprint &&
          panel.installedAddressTransform.quarterTurnsClockwise >= 0 &&
          panel.installedAddressTransform.quarterTurnsClockwise <= 3,
      ),
    ).toBe(true);
  });

  it("uses a deterministic lexicographic turn tie-break", () => {
    const source = loadManual();
    const first = optimizeInstalledAddressTransforms(source, PANEL_PROFILE);
    const second = optimizeInstalledAddressTransforms(source, PANEL_PROFILE);

    expect(first).toEqual(second);
  });

  it("accepts legacy transforms without provenance as manual selections", () => {
    const source = loadManual();
    delete source.panels[0]!.installedAddressTransform!.selectionMethod;
    delete source.panels[0]!.installedAddressTransform!.optimizationFingerprint;

    expect(() => parsePanelAssemblyDefinition(source)).not.toThrow();
  });

  it("preserves legacy optimizer fingerprints for position-only controllers", () => {
    const legacy = loadManual();
    const originalFingerprint = createInstalledAddressOptimizationFingerprint(
      legacy,
      PANEL_PROFILE,
    );
    legacy.wiring.controller.position = [120, 80, 45];
    expect(
      createInstalledAddressOptimizationFingerprint(legacy, PANEL_PROFILE),
    ).toBe(originalFingerprint);
    expect(() =>
      createPanelAssemblyProject(
        legacy,
        "sculptures/rhombicosidodecahedron/sculpture.json",
        PANEL_PROFILE,
      ),
    ).not.toThrow();
  });

  it("keeps route-optimization provenance pairing checks in the JSON parser", () => {
    const missingFingerprint = loadManual();
    delete missingFingerprint.panels[0]!.installedAddressTransform!
      .optimizationFingerprint;
    expect(() => parsePanelAssemblyDefinition(missingFingerprint)).toThrow(
      /require an optimization fingerprint/,
    );

    const manualFingerprint = loadManual();
    manualFingerprint.panels[0]!.installedAddressTransform!.selectionMethod =
      "manual";
    expect(() => parsePanelAssemblyDefinition(manualFingerprint)).toThrow(
      /Only route-optimized/,
    );
  });

  it("rejects route-optimized transforms after direct route or pose edits", () => {
    const optimized = optimizeInstalledAddressTransforms(
      loadManual(),
      PANEL_PROFILE,
    );
    const routeChanged = structuredClone(optimized);
    [
      routeChanged.wiring.outputs[0]!.panelIds![0],
      routeChanged.wiring.outputs[0]!.panelIds![1],
    ] = [
      routeChanged.wiring.outputs[0]!.panelIds![1]!,
      routeChanged.wiring.outputs[0]!.panelIds![0]!,
    ];
    expect(() =>
      createPanelAssemblyProject(
        routeChanged,
        "sculptures/rhombicosidodecahedron/sculpture.json",
        PANEL_PROFILE,
      ),
    ).toThrow(/current optimization fingerprint/);

    const poseChanged = structuredClone(optimized);
    poseChanged.panels[0]!.pose.position[0] += 1;
    expect(() =>
      createPanelAssemblyProject(
        poseChanged,
        "sculptures/rhombicosidodecahedron/sculpture.json",
        PANEL_PROFILE,
      ),
    ).toThrow(/current optimization fingerprint/);

    const controllerChanged = structuredClone(optimized);
    controllerChanged.wiring.controller.position = [120, 80, 45];
    controllerChanged.wiring.controller.orientation = {
      xAxis: [0, 1, 0],
      yAxis: [-1, 0, 0],
      normal: [0, 0, 1],
    };
    expect(() =>
      createPanelAssemblyProject(
        controllerChanged,
        "sculptures/rhombicosidodecahedron/sculpture.json",
        PANEL_PROFILE,
      ),
    ).toThrow(/current optimization fingerprint/);

    const profileChanged = structuredClone(PANEL_PROFILE);
    profileChanged.dimensions.width += 1;
    expect(() =>
      createPanelAssemblyProject(
        optimized,
        "sculptures/rhombicosidodecahedron/sculpture.json",
        profileChanged,
      ),
    ).toThrow(/current optimization fingerprint/);
  });

  it("selects the lower turn sequence for a symmetric two-panel optimum", () => {
    const source = loadManual();
    const definition = structuredClone(source);
    definition.panels = definition.panels.filter(
      (panel) => panel.id === "SQ-01" || panel.id === "SQ-02",
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
    definition.wiring.outputs = [
      {
        ...definition.wiring.outputs[0]!,
        outputIndex: 0,
        panelIds: ["SQ-01", "SQ-02"],
      },
    ];

    const exhaustive: Array<{
      turns: [0 | 1 | 2 | 3, 0 | 1 | 2 | 3];
      distance: number;
    }> = [];
    for (const first of [0, 1, 2, 3] as const) {
      for (const second of [0, 1, 2, 3] as const) {
        const candidate = structuredClone(definition);
        [first, second].forEach((turns, index) => {
          candidate.panels[index]!.installedAddressTransform = {
            status: "assumed",
            referenceView: "back",
            quarterTurnsClockwise: turns,
            mirrored: false,
            selectionMethod: "manual",
          };
        });
        exhaustive.push({
          turns: [first, second],
          distance: calculateAuthoredRouteCableLength(candidate, PANEL_PROFILE),
        });
      }
    }
    const minimumDistance = Math.min(
      ...exhaustive.map(({ distance }) => distance),
    );
    const minimumSequences = exhaustive
      .filter(({ distance }) => Math.abs(distance - minimumDistance) <= 1e-9)
      .map(({ turns }) => turns);
    const lexicographicMinimum = [...minimumSequences].sort(
      (left, right) => left[0] - right[0] || left[1] - right[1],
    )[0]!;
    expect(minimumSequences.length).toBeGreaterThan(1);

    const optimized = optimizeInstalledAddressTransforms(
      definition,
      PANEL_PROFILE,
    );
    expect(
      optimized.panels.map(
        (panel) => panel.installedAddressTransform!.quarterTurnsClockwise,
      ),
    ).toEqual(lexicographicMinimum);
  });

  it("matches exhaustive search on a three-panel chain", () => {
    const source = loadManual();
    const definition = structuredClone(source);
    const panelIds = ["SQ-01", "PC-01", "SQ-06"];
    definition.panels = definition.panels.filter((panel) =>
      panelIds.includes(panel.id),
    );
    definition.wiring.chainLengths = [3];
    definition.wiring.outputs = [
      {
        ...definition.wiring.outputs[0]!,
        outputIndex: 0,
        panelIds,
      },
    ];
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
            calculateAuthoredRouteCableLength(candidate, PANEL_PROFILE),
          );
        }
      }
    }
    const optimized = optimizeInstalledAddressTransforms(
      definition,
      PANEL_PROFILE,
    );
    expect(
      calculateAuthoredRouteCableLength(optimized, PANEL_PROFILE),
    ).toBeCloseTo(exhaustive, 9);
  });
});
