import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parsePanelHardwareProfile,
  type PanelHardwareProfile,
} from "../src/sculpture/Definition.ts";
import {
  automaticWiringOutputPolicy,
  calculatePoseOwnedWiringCableLength,
  optimizeAutomaticWiring,
} from "../src/sculpture/AutomaticWiringOptimizer.ts";
import {
  createGeneratedMechanicsFingerprint,
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
  getGeneratedMechanicsState,
  parsePanelAssemblyDefinition,
  type GeneratedMechanicsManifest,
  type PanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import {
  createStructuralFingerprint,
  getGeneratedStructuralState,
  type GeneratedStructuralManifest,
} from "../src/sculpture/StructuralDesign.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import {
  createProvisionalWiringPreview,
  createWiringControllerLayout,
} from "../web/src/WiringPreview.ts";

const THREE_PANEL_SOURCE = "sculptures/structural-three-panel-trail/sculpture.json";
const hash = (character: string): string => character.repeat(64);

function mechanicsManifest(sourceFingerprint: string): GeneratedMechanicsManifest {
  return {
    generator: { id: "wled-orbital-lab/planar-boundary", version: "0.3.0" },
    sourceFingerprint: { algorithm: "sha256", value: sourceFingerprint },
    status: { generation: "complete", validation: "passed" },
    boundary: {
      kind: "closed-boundary-mesh",
      format: "stl",
      source: "mechanics/boundary.stl",
      sha256: hash("a"),
    },
    parts: [{
      id: "part-001",
      format: "stl",
      source: "mechanics/parts/part-001.stl",
      sha256: hash("b"),
    }],
  };
}

function structuralManifest(sourceFingerprint: string): GeneratedStructuralManifest {
  return {
    schemaVersion: "1.0.0",
    generator: { id: "wled-orbital-lab/structural-truss", version: "0.1.0" },
    sourceFingerprint: { algorithm: "sha256", value: sourceFingerprint },
    status: { generation: "complete", validation: "passed" },
    artifacts: [
      { id: "part", role: "part", format: "stl", source: "structure/part.stl", sha256: hash("c") },
      { id: "preview", role: "preview", format: "stl", source: "structure/preview.stl", sha256: hash("d") },
      { id: "package", role: "package", format: "3mf", source: "structure/structure.3mf", sha256: hash("e") },
      { id: "analysis", role: "analysis", format: "json", source: "structure/analysis.json", sha256: hash("f") },
      { id: "report", role: "report", format: "markdown", source: "structure/report.md", sha256: hash("0") },
    ],
  };
}

function load(source = THREE_PANEL_SOURCE) {
  const definition = parsePanelAssemblyDefinition(JSON.parse(readFileSync(source, "utf8")));
  const project = createPanelAssemblyProject(definition, source);
  return { definition, profile: project.panelProfile };
}

function identityTransforms(definition: PanelAssemblyDefinition): PanelAssemblyDefinition {
  const result = structuredClone(definition);
  for (const panel of result.panels) {
    panel.installedAddressTransform = {
      status: "assumed",
      referenceView: "back",
      quarterTurnsClockwise: 0,
      mirrored: false,
      selectionMethod: "manual",
    };
  }
  return result;
}

function rotateQuarterTurns(
  definition: PanelAssemblyDefinition,
  panelId: string,
  turns: number,
): void {
  const panel = definition.panels.find((candidate) => candidate.id === panelId)!;
  const { xAxis, yAxis } = panel.pose.orientation;
  const radians = turns * Math.PI / 2;
  const cosine = Math.round(Math.cos(radians));
  const sine = Math.round(Math.sin(radians));
  panel.pose.orientation.xAxis = [
    xAxis[0] * cosine + yAxis[0] * sine,
    xAxis[1] * cosine + yAxis[1] * sine,
    xAxis[2] * cosine + yAxis[2] * sine,
  ];
  panel.pose.orientation.yAxis = [
    xAxis[0] * -sine + yAxis[0] * cosine,
    xAxis[1] * -sine + yAxis[1] * cosine,
    xAxis[2] * -sine + yAxis[2] * cosine,
  ];
}

function permutations(values: string[]): string[][] {
  if (values.length < 2) return [values];
  return values.flatMap((value, index) =>
    permutations(values.filter((_, candidate) => candidate !== index)).map((rest) => [value, ...rest])
  );
}

function renderedCableLength(
  definition: PanelAssemblyDefinition,
  profile: PanelHardwareProfile,
  source: string,
): number {
  const project = createPanelAssemblyProject(definition, source, profile);
  const mapping = createPanelAssemblyMapping(project);
  const preview = createProvisionalWiringPreview(mapping, definition, profile);
  const controller = createWiringControllerLayout(preview)!;
  let total = 0;
  for (const output of preview.outputs) {
    let previous = controller.pins.find((pin) =>
      pin.outputIndex === output.outputIndex
    )!.position;
    for (const node of preview.nodes.filter((candidate) =>
      candidate.outputIndex === output.outputIndex
    ).sort((first, second) => first.chainPosition - second.chainPosition)) {
      total += Math.hypot(
        previous.x - node.din.x,
        previous.y - node.din.y,
        previous.z - node.din.z,
      );
      previous = node.dout;
    }
  }
  return total;
}

describe("automatic wiring optimizer", () => {
  it.each([
    [1, [1], [16]],
    [11, [11], [16]],
    [12, [6, 6], [16, 17]],
    [22, [11, 11], [16, 17]],
    [23, [8, 8, 7], [16, 17, 18]],
    [33, [11, 11, 11], [16, 17, 18]],
    [34, [9, 9, 8, 8], [16, 17, 18, 19]],
    [41, [11, 10, 10, 10], [16, 17, 18, 19]],
  ])("assigns balanced output policy for %i panels", (panelCount, lengths, gpios) => {
    expect(automaticWiringOutputPolicy(panelCount)).toEqual({
      outputCount: lengths.length,
      chainLengths: lengths,
      gpios,
    });
  });

  it("matches exhaustive route and quarter-turn search on three panels", () => {
    const loaded = load();
    const source = identityTransforms(loaded.definition);
    const panelIds = source.panels.map((panel) => panel.id);
    let exact = Number.POSITIVE_INFINITY;
    for (const route of permutations(panelIds)) {
      for (let first = 0; first < 4; first += 1) {
        for (let second = 0; second < 4; second += 1) {
          for (let third = 0; third < 4; third += 1) {
            const candidate = structuredClone(source);
            candidate.wiring.status = "authored";
            candidate.wiring.chainLengths = [3];
            candidate.wiring.outputs = [{
              outputIndex: 0,
              label: "Output 1",
              gpio: 16,
              color: "#36e0d0",
              panelIds: route,
            }];
            [first, second, third].forEach((turns, index) =>
              rotateQuarterTurns(candidate, route[index]!, turns)
            );
            exact = Math.min(
              exact,
              calculatePoseOwnedWiringCableLength(candidate, loaded.profile),
            );
          }
        }
      }
    }
    const optimized = optimizeAutomaticWiring(source, loaded.profile);
    expect(optimized.orientationPolicy).toBe("quarter-turns");
    expect(optimized.outputCount).toBe(1);
    expect(optimized.chainLengths).toEqual([3]);
    expect(optimized.gpios).toEqual([16]);
    expect(optimized.estimatedCableLengthMm).toBeCloseTo(exact, 8);
    expect(calculatePoseOwnedWiringCableLength(
      optimized.definition,
      loaded.profile,
    )).toBeCloseTo(exact, 8);

    expect(renderedCableLength(
      optimized.definition,
      loaded.profile,
      THREE_PANEL_SOURCE,
    )).toBeCloseTo(optimized.estimatedCableLengthMm, 10);
  });

  it("prices the rendered controller pins for an adjacent DIN/DOUT profile", () => {
    const loaded = load();
    const adjacentProfileInput = structuredClone(loaded.profile);
    adjacentProfileInput.pixelGrid.provisionalOrder.serpentine = true;
    adjacentProfileInput.dataConnectors.doutCorner = "bottom-right";
    const oldDout = adjacentProfileInput.mounting.holes.find(({ id }) =>
      id === "bottom-left"
    )!;
    oldDout.mechanicalUse = "eligible";
    delete oldDout.blockedBy;
    const newDout = adjacentProfileInput.mounting.holes.find(({ id }) =>
      id === "bottom-right"
    )!;
    newDout.mechanicalUse = "blocked";
    newDout.blockedBy = "DOUT";
    const adjacentProfile = parsePanelHardwareProfile(adjacentProfileInput);
    const optimized = optimizeAutomaticWiring(
      identityTransforms(loaded.definition),
      adjacentProfile,
    );
    expect(renderedCableLength(
      optimized.definition,
      adjacentProfile,
      THREE_PANEL_SOURCE,
    )).toBeCloseTo(optimized.estimatedCableLengthMm, 10);
  });

  it("uses explicit pose-local DIN and DOUT anchors during optimization", () => {
    const loaded = load();
    const source = identityTransforms(loaded.definition);
    const legacy = optimizeAutomaticWiring(source, loaded.profile);
    const explicitProfileInput = structuredClone(loaded.profile);
    explicitProfileInput.dataConnectors.localPositions = {
      coordinateFrame: "pose-local",
      din: [8, 23, 0],
      dout: [-17, -11, 0],
    };
    const explicitProfile = parsePanelHardwareProfile(explicitProfileInput);
    const optimized = optimizeAutomaticWiring(source, explicitProfile);

    expect(optimized.estimatedCableLengthMm).not.toBeCloseTo(
      legacy.estimatedCableLengthMm,
      6,
    );
    expect(renderedCableLength(
      optimized.definition,
      explicitProfile,
      THREE_PANEL_SOURCE,
    )).toBeCloseTo(optimized.estimatedCableLengthMm, 10);
  });

  it("is deterministic when panel storage order changes", () => {
    const loaded = load();
    const source = identityTransforms(loaded.definition);
    const shuffled = structuredClone(source);
    shuffled.panels.reverse();
    const first = optimizeAutomaticWiring(source, loaded.profile);
    const second = optimizeAutomaticWiring(shuffled, loaded.profile);
    expect(second.definition.wiring).toEqual(first.definition.wiring);
    expect(second.poseQuarterTurnsByPanel).toEqual(first.poseQuarterTurnsByPanel);
    expect(second.estimatedCableLengthMm).toBeCloseTo(first.estimatedCableLengthMm, 10);
  });

  it("ignores an incomplete requires-review route seed", () => {
    const loaded = load();
    const source = identityTransforms(loaded.definition);
    source.wiring.status = "requires-review";
    source.wiring.outputs[0]!.panelIds = [
      source.panels[0]!.id,
      source.panels[1]!.id,
      "REMOVED-PANEL",
    ];
    const optimized = optimizeAutomaticWiring(source, loaded.profile);
    expect(new Set(optimized.definition.wiring.outputs[0]!.panelIds)).toEqual(
      new Set(source.panels.map((panel) => panel.id)),
    );
  });

  it("keeps valid current mechanics gated and mapping-ready through reload", () => {
    const sourcePath = "sculptures/pose-only-two-panel/sculpture.json";
    const loaded = load(sourcePath);
    const source = identityTransforms(loaded.definition);
    source.generatedMechanics = mechanicsManifest(
      createGeneratedMechanicsFingerprint(source, loaded.profile),
    );
    expect(getGeneratedMechanicsState(source, loaded.profile)).toBe("current");
    const optimized = optimizeAutomaticWiring(source, loaded.profile);
    expect(optimized.orientationPolicy).toBe("half-turns-only");
    expect(Object.values(optimized.poseQuarterTurnsByPanel).every((turns) =>
      turns === 0 || turns === 2
    )).toBe(true);
    expect(Object.values(optimized.poseQuarterTurnsByPanel)).toEqual([0, 0]);
    const reopened = createPanelAssemblyProject(
      parsePanelAssemblyDefinition(JSON.parse(JSON.stringify(optimized.definition))),
      sourcePath,
      loaded.profile,
    );
    expect(getGeneratedMechanicsState(reopened.sculpture, loaded.profile)).toBe("current");
    const mapping = createPanelAssemblyMapping(reopened);
    const wiring = createProvisionalWiringPreview(
      mapping,
      reopened.sculpture,
      loaded.profile,
    );
    expect(createHardwareMappingContract(mapping, wiring, loaded.profile).readiness.mappingReady)
      .toBe(true);
  });

  it("keeps a valid stale mechanics manifest as a durable half-turn gate", () => {
    const loaded = load("sculptures/pose-only-two-panel/sculpture.json");
    const source = identityTransforms(loaded.definition);
    source.generatedMechanics = mechanicsManifest(
      createGeneratedMechanicsFingerprint(source, loaded.profile),
    );
    rotateQuarterTurns(source, source.panels[0]!.id, 1);
    expect(getGeneratedMechanicsState(source, loaded.profile)).toBe("stale");
    const optimized = optimizeAutomaticWiring(source, loaded.profile);
    expect(optimized.orientationPolicy).toBe("half-turns-only");
    expect(Object.values(optimized.poseQuarterTurnsByPanel).every((turns) =>
      turns === 0 || turns === 2
    )).toBe(true);
    const reopened = parsePanelAssemblyDefinition(
      JSON.parse(JSON.stringify(optimized.definition)),
    );
    expect(getGeneratedMechanicsState(reopened, loaded.profile)).toBe("stale");
  });

  it("makes valid structural assets stale after an allowed 180-degree pose change", () => {
    const loaded = load();
    const source = identityTransforms(loaded.definition);
    source.generatedStructure = structuralManifest(
      createStructuralFingerprint(source, loaded.profile),
    );
    expect(getGeneratedStructuralState(source, loaded.profile)).toBe("current");
    const optimized = optimizeAutomaticWiring(source, loaded.profile);
    expect(optimized.orientationPolicy).toBe("half-turns-only");
    expect(Object.values(optimized.poseQuarterTurnsByPanel)).toContain(2);
    const reopened = createPanelAssemblyProject(
      parsePanelAssemblyDefinition(JSON.parse(JSON.stringify(optimized.definition))),
      THREE_PANEL_SOURCE,
      loaded.profile,
    );
    expect(getGeneratedStructuralState(reopened.sculpture, loaded.profile)).toBe("stale");
  });

  it("keeps a regenerated mechanical shell current when route optimization changes no pose", () => {
    const sourcePath = "sculptures/cuboctahedron/sculpture.json";
    const loaded = load(sourcePath);
    const first = optimizeAutomaticWiring(loaded.definition, loaded.profile).definition;
    expect(first.mechanicalShell?.derivationStatus).toBe("requires-regeneration");
    first.mechanicalShell!.derivationStatus = "authored";
    first.generatedMechanics = mechanicsManifest(
      createGeneratedMechanicsFingerprint(first, loaded.profile),
    );
    const second = optimizeAutomaticWiring(first, loaded.profile);
    expect(Object.values(second.poseQuarterTurnsByPanel).every((turns) => turns === 0))
      .toBe(true);
    expect(second.definition.mechanicalShell?.derivationStatus).toBe("authored");
    expect(getGeneratedMechanicsState(second.definition, loaded.profile)).toBe("current");
  });

  it("rejects an odd legacy address-only turn after fabrication", () => {
    const loaded = load();
    const unsafe = identityTransforms(loaded.definition);
    unsafe.generatedMechanics = mechanicsManifest(
      createGeneratedMechanicsFingerprint(unsafe, loaded.profile),
    );

    unsafe.panels[0]!.installedAddressTransform!.quarterTurnsClockwise = 1;
    expect(() => optimizeAutomaticWiring(unsafe, loaded.profile)).toThrow(
      /Printable parts exist.*90-degree address-only orientation/,
    );

    const mirrored = identityTransforms(loaded.definition);
    mirrored.panels[0]!.installedAddressTransform!.mirrored = true;
    expect(() => optimizeAutomaticWiring(mirrored, loaded.profile)).toThrow(
      /cannot fold mirrored address calibration/,
    );
  });

  it("assigns the approved balanced 41-panel output policy", () => {
    const source = "sculptures/rhombicosidodecahedron/sculpture.json";
    const loaded = load(source);
    const poseOwnedBaseline = calculatePoseOwnedWiringCableLength(
      loaded.definition,
      loaded.profile,
    );
    const optimized = optimizeAutomaticWiring(loaded.definition, loaded.profile);
    expect(() => createPanelAssemblyProject(
      optimized.definition,
      source,
      loaded.profile,
    )).not.toThrow();
    expect(optimized.outputCount).toBe(4);
    expect(optimized.chainLengths).toEqual([11, 10, 10, 10]);
    expect(optimized.gpios).toEqual([16, 17, 18, 19]);
    expect(optimized.estimatedCableLengthMm).toBeLessThanOrEqual(poseOwnedBaseline);
    expect(new Set(optimized.definition.wiring.outputs.flatMap((output) => output.panelIds!)).size)
      .toBe(41);
    expect(optimized.definition.panels.every((panel) =>
      panel.installedAddressTransform?.quarterTurnsClockwise === 0 &&
      panel.installedAddressTransform.selectionMethod === "route-optimized"
    )).toBe(true);
  }, 20_000);
});
