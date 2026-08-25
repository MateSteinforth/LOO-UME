import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createPanelAssemblyProject,
  parsePanelAssemblyDefinition,
  type PanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import {
  createStructuralFingerprint,
  getGeneratedStructuralState,
  normalizeStructuralDesign,
  STRUCTURAL_CONNECTOR_DEFAULTS,
  STRUCTURAL_PREVIEW_DEFAULTS,
  type GeneratedStructuralManifest,
  type StructuralDesignDefinition,
} from "../src/sculpture/StructuralDesign.ts";
import {
  rotatePanelAroundLocalZ,
  sculptureJson,
} from "../src/sculpture/SculptureEditor.ts";

async function definition(): Promise<PanelAssemblyDefinition> {
  return parsePanelAssemblyDefinition(JSON.parse(await readFile(
    "sculptures/pose-only-two-panel/sculpture.json",
    "utf8",
  )));
}

async function emptyDefinition(): Promise<PanelAssemblyDefinition> {
  return parsePanelAssemblyDefinition(JSON.parse(await readFile(
    "sculptures/pose-only-empty/sculpture.json",
    "utf8",
  )));
}

function design(): StructuralDesignDefinition {
  return {
    schemaVersion: "1.0.0",
    material: {
      id: "petg-user-input",
      youngsModulusMpa: 2100,
      yieldStrengthMpa: 45,
      densityKgPerCubicMeter: 1270,
    },
    panelMassKg: 0.12,
    safetyFactor: 2.5,
    maximumDisplacementMm: 1.5,
    gravity: {
      installedDirection: [0, -2, 0],
      accelerationMetersPerSecondSquared: 9.81,
      includeWorldAxisTransportCases: false,
    },
    fabrication: {
      minimumMemberDiameterMm: 5,
      maximumMemberDiameterMm: 18,
      memberDiameterIncrementMm: 0.5,
      maximumUnsupportedCompressionLengthMm: 120,
      bracketOffsetMm: 9,
      cableClearanceMm: 14,
    },
    supports: [
      {
        id: "wall-panel",
        kind: "panel",
        panelId: "P-02",
        constrainedTranslations: ["x", "y", "z"],
      },
      {
        id: "left-anchor",
        kind: "anchor",
        panelId: "P-01",
        holeId: "middle-left",
        constrainedTranslations: ["x", "z"],
      },
    ],
    loads: [
      {
        id: "face-push",
        kind: "panel-face-force",
        panelId: "P-01",
        forceNewtons: [0, -10, 0],
      },
      {
        id: "corner-push",
        kind: "panel-corner-force",
        panelId: "P-01",
        corner: "top-left",
        forceNewtons: [3, 0, 0],
      },
      {
        id: "din-pull",
        kind: "cable-pull",
        panelId: "P-01",
        connector: "DIN",
        forceNewtons: [0, 0, 4],
      },
    ],
  };
}

function hash(character: string): string {
  return character.repeat(64);
}

function manifest(fingerprint: string): GeneratedStructuralManifest {
  return {
    schemaVersion: "1.0.0",
    generator: { id: "wled-orbital-lab/structural-truss", version: "0.1.0" },
    sourceFingerprint: { algorithm: "sha256", value: fingerprint },
    status: { generation: "complete", validation: "passed" },
    artifacts: [
      { id: "bracket-p-01", role: "part", format: "stl", source: "structure/parts/bracket-p-01.stl", sha256: hash("a") },
      { id: "assembly-preview", role: "preview", format: "stl", source: "structure/preview.stl", sha256: hash("b") },
      { id: "print-package", role: "package", format: "3mf", source: "structure/structure.3mf", sha256: hash("c") },
      { id: "analysis", role: "analysis", format: "json", source: "structure/analysis.json", sha256: hash("d") },
      { id: "engineering-report", role: "report", format: "markdown", source: "structure/report.md", sha256: hash("e") },
    ],
  };
}

describe("Schema 2 structural design normalization", () => {
  it("uses explicit preview defaults and the first stable panel as a warned reference support", async () => {
    const project = createPanelAssemblyProject(
      await definition(),
      "sculptures/pose-only-two-panel/sculpture.json",
    );
    const normalized = normalizeStructuralDesign(project);

    expect(normalized.inputSource).toBe("preview-defaults");
    expect(normalized.connectorization).toEqual({
      surfaceStyle: "screw-shoe-ribbon",
      maximumNeighborDistanceMm: 200,
      maximumAutomaticNeighborsPerPanel: 2,
      minimumAnchorsPerPanelSide: 2,
      printBedSizeMm: [250, 250, 250],
      printBedMarginMm: 5,
      maximumStrutSegmentLengthMm: 220,
      panelPairOverrides: [],
    });
    expect(normalized.referencePanelId).toBe("P-01");
    expect(normalized.panels.map(({ id }) => id)).toEqual(["P-01", "P-02"]);
    expect(normalized.panels.every(({ emitterPlaneOffsetMm }) => emitterPlaneOffsetMm === 1.2))
      .toBe(true);
    expect(normalized.anchors).toHaveLength(8);
    expect(normalized.cableClearances).toHaveLength(4);
    expect(normalized.cableClearances.find(({ id }) =>
      id === "P-01:cable-clearance:din"
    )).toMatchObject({
      panelId: "P-01",
      holeId: "bottom-left",
      blockedBy: "DIN",
      positionMm: [25, 50, 24.5],
      diameterMm: 12,
    });
    expect(normalized.anchors.filter(({ panelId }) => panelId === "P-01").map(
      ({ holeId }) => holeId,
    )).toEqual(["bottom-right", "middle-left", "middle-right", "top-left"]);
    expect(normalized.anchors.some(({ holeId }) =>
      holeId === "bottom-left" || holeId === "top-right"
    )).toBe(false);
    expect(normalized.anchors.find(({ id }) => id === "P-01:top-left")?.positionMm)
      .toEqual([25, 50, -24.5]);
    expect(normalized.anchors.find(({ id }) => id === "P-01:bottom-right"))
      .toMatchObject({
        localPositionMm: [-25, -24.5],
        positionMm: [-25, 50, 24.5],
      });
    expect(normalized.supports).toHaveLength(4);
    expect(normalized.supports.every(({ source }) => source === "preview-reference-panel"))
      .toBe(true);
    expect(normalized.loadCases.map(({ id }) => id)).toEqual([
      "installed-gravity",
      "transport-positive-x",
      "transport-negative-x",
      "transport-positive-y",
      "transport-negative-y",
      "transport-positive-z",
      "transport-negative-z",
    ]);
    expect(normalized.warnings.map(({ code }) => code)).toEqual([
      "STRUCTURAL_PREVIEW_DEFAULTS",
      "NO_REAL_SUPPORTS",
      "ELECTRICAL_KEEPOUTS_UNMEASURED",
    ]);
    expect(normalized.warnings[1]!.message).toMatch(
      /preview only.*requires real mounting conditions/,
    );
    expect(normalized.sourceFingerprint.value).toMatch(/^[0-9a-f]{64}$/);
    expect(normalized.sourceFingerprint.value).not.toBe(
      "d4261e242511c6e65c53b22889a4abf141098022ec4e17154c11627b8e9e599e",
    );
  });

  it("maps back-view connector sides into a rotated outward-facing pose", async () => {
    const source = await definition();
    source.panels[0]!.pose = {
      position: [0, 0, 0],
      orientation: {
        xAxis: [0, 1, 0],
        yAxis: [-1, 0, 0],
        normal: [0, 0, 1],
      },
    };
    const normalized = normalizeStructuralDesign(createPanelAssemblyProject(
      source,
      "rotated-back-view/sculpture.json",
    ));

    expect(normalized.cableClearances.find(({ blockedBy, panelId }) =>
      blockedBy === "DIN" && panelId === "P-01"
    )).toMatchObject({
      holeId: "bottom-left",
      positionMm: [24.5, 25, 0],
    });
    expect(normalized.cableClearances.find(({ blockedBy, panelId }) =>
      blockedBy === "DOUT" && panelId === "P-01"
    )).toMatchObject({
      holeId: "top-right",
      positionMm: [-24.5, -25, 0],
    });
    expect(normalized.anchors.find(({ id }) => id === "P-01:bottom-right")?.positionMm)
      .toEqual([24.5, -25, 0]);
    expect(normalized.anchors.find(({ id }) => id === "P-01:top-left")?.positionMm)
      .toEqual([-24.5, 25, 0]);
  });

  it("keeps preview provenance when only connector policy is stored", async () => {
    const source = await definition();
    const design = structuredClone(STRUCTURAL_PREVIEW_DEFAULTS);
    design.connectorization = {
      ...structuredClone(STRUCTURAL_CONNECTOR_DEFAULTS),
      maximumNeighborDistanceMm: 125,
    };
    source.structuralDesign = design;

    const normalized = normalizeStructuralDesign(createPanelAssemblyProject(source, "connector-only"));

    expect(normalized.inputSource).toBe("preview-defaults");
    expect(normalized.warnings.map(({ code }) => code)).toContain("STRUCTURAL_PREVIEW_DEFAULTS");
    expect(normalized.connectorization.maximumNeighborDistanceMm).toBe(125);
  });

  it("resolves authored panel and anchor supports plus face, corner, and cable loads", async () => {
    const source = await definition();
    source.structuralDesign = design();
    const normalized = normalizeStructuralDesign(createPanelAssemblyProject(
      source,
      "structural/sculpture.json",
    ));

    expect(normalized.inputSource).toBe("authored");
    expect(normalized.referencePanelId).toBeNull();
    expect(normalized.design.gravity.installedDirection).toEqual([0, -2, 0]);
    expect(normalized.loadCases[0]).toMatchObject({
      id: "installed-gravity",
      direction: [0, -1, 0],
    });
    expect(normalized.supports).toHaveLength(5);
    expect(normalized.supports.find(({ id }) => id === "left-anchor")).toEqual({
      id: "left-anchor",
      anchorId: "P-01:middle-left",
      constrainedTranslations: ["x", "z"],
      source: "authored-anchor",
    });
    expect(normalized.loadCases.find(({ id }) => id === "force:face-push"))
      .toMatchObject({ applicationPointMm: [0, 50, 0], forceNewtons: [0, -10, 0] });
    expect(normalized.loadCases.find(({ id }) => id === "force:corner-push"))
      .toMatchObject({ applicationPointMm: [-33, 50, -32.5] });
    expect(normalized.loadCases.find(({ id }) => id === "force:din-pull"))
      .toMatchObject({ applicationPointMm: [-33, 50, 32.5] });
    expect(normalized.warnings.map(({ code }) => code)).toEqual([
      "ELECTRICAL_KEEPOUTS_UNMEASURED",
    ]);
  });

  it("warns when connector pad positions are unknown even if keepout regions are measured", async () => {
    const source = await definition();
    const base = createPanelAssemblyProject(
      source,
      "sculptures/pose-only-two-panel/sculpture.json",
    );
    const profile = structuredClone(base.panelProfile);
    profile.electricalKeepouts.status = "measured";

    const normalized = normalizeStructuralDesign(createPanelAssemblyProject(
      source,
      "sculptures/pose-only-two-panel/sculpture.json",
      profile,
    ));

    expect(profile.dataConnectors.padPositionStatus).toBe("unknown");
    expect(normalized.warnings.map(({ code }) => code)).toContain(
      "ELECTRICAL_KEEPOUTS_UNMEASURED",
    );
    expect(normalized.warnings.find(({ code }) => code === "ELECTRICAL_KEEPOUTS_UNMEASURED")?.message)
      .toMatch(/connector pad and keep-out geometry is not fully measured/i);
  });

  it("is independent of panel and profile-hole storage order", async () => {
    const source = await definition();
    source.structuralDesign = design();
    const first = createPanelAssemblyProject(source, "first/sculpture.json");
    const reorderedDefinition = structuredClone(source);
    reorderedDefinition.panels.reverse();
    reorderedDefinition.structuralDesign!.supports.reverse();
    reorderedDefinition.structuralDesign!.supports[0]!.constrainedTranslations.reverse();
    reorderedDefinition.structuralDesign!.loads.reverse();
    const reorderedProfile = structuredClone(first.panelProfile);
    reorderedProfile.mounting.holes.reverse();
    const second = createPanelAssemblyProject(
      reorderedDefinition,
      "second/sculpture.json",
      reorderedProfile,
    );
    expect(normalizeStructuralDesign(second).sourceFingerprint)
      .toEqual(normalizeStructuralDesign(first).sourceFingerprint);
    expect(normalizeStructuralDesign(second).anchors)
      .toEqual(normalizeStructuralDesign(first).anchors);
  });

  it("rejects invalid limits, unknown panels, blocked anchors, and zero directions", async () => {
    const invalidSafety = await definition();
    invalidSafety.structuralDesign = design();
    invalidSafety.structuralDesign.safetyFactor = 0.5;
    expect(() => parsePanelAssemblyDefinition(invalidSafety)).toThrow(/Safety factor/);

    const unknownPanel = await definition();
    unknownPanel.structuralDesign = design();
    unknownPanel.structuralDesign.loads[0]!.panelId = "UNKNOWN";
    expect(() => parsePanelAssemblyDefinition(unknownPanel)).toThrow(/unknown panel UNKNOWN/);

    const blockedAnchor = await definition();
    blockedAnchor.structuralDesign = design();
    blockedAnchor.structuralDesign.supports[1] = {
      id: "blocked-din",
      kind: "anchor",
      panelId: "P-01",
      holeId: "bottom-left",
      constrainedTranslations: ["x", "y", "z"],
    };
    expect(() => createPanelAssemblyProject(blockedAnchor, "blocked/sculpture.json"))
      .toThrow(/blocked or unknown anchor P-01:bottom-left/);

    const zeroGravity = await definition();
    zeroGravity.structuralDesign = design();
    zeroGravity.structuralDesign.gravity.installedDirection = [0, 0, 0];
    expect(() => parsePanelAssemblyDefinition(zeroGravity)).toThrow(/not all zero/);

    const unknownField = await definition();
    unknownField.structuralDesign = design();
    (unknownField.structuralDesign as StructuralDesignDefinition & { secondPose: unknown })
      .secondPose = [1, 2, 3];
    expect(() => parsePanelAssemblyDefinition(unknownField)).toThrow(
      /unsupported field secondPose/,
    );
  });

  it("normalizes modular connector policy and fingerprints pair overrides", async () => {
    const source = await definition();
    source.structuralDesign = design();
    source.structuralDesign.connectorization = {
      surfaceStyle: "led-surface-bridge",
      maximumNeighborDistanceMm: 180,
      maximumAutomaticNeighborsPerPanel: 2,
      minimumAnchorsPerPanelSide: 2,
      printBedSizeMm: [250, 245, 240],
      printBedMarginMm: 6,
      maximumStrutSegmentLengthMm: 210,
      panelPairOverrides: [{ panelIds: ["P-02", "P-01"], action: "include" }],
    };
    const project = createPanelAssemblyProject(source, "connector/sculpture.json");
    const normalized = normalizeStructuralDesign(project);

    expect(normalized.connectorization.panelPairOverrides).toEqual([
      { panelIds: ["P-01", "P-02"], action: "include" },
    ]);
    expect(normalized.connectorization.surfaceStyle).toBe("led-surface-bridge");
    const firstFingerprint = normalized.sourceFingerprint.value;
    source.structuralDesign.connectorization.panelPairOverrides[0]!.action = "exclude";
    expect(createStructuralFingerprint(source, project.panelProfile)).not.toBe(firstFingerprint);
  });

  it("fingerprints the selected surface style and profile emitter plane", async () => {
    const source = await definition();
    source.structuralDesign = design();
    source.structuralDesign.connectorization = structuredClone(STRUCTURAL_CONNECTOR_DEFAULTS);
    const project = createPanelAssemblyProject(source, "connector-style/sculpture.json");
    const ribbonFingerprint = createStructuralFingerprint(source, project.panelProfile);
    source.structuralDesign.connectorization.surfaceStyle = "led-surface-bridge";
    expect(createStructuralFingerprint(source, project.panelProfile)).not.toBe(ribbonFingerprint);
    const movedEmitterProfile = structuredClone(project.panelProfile);
    movedEmitterProfile.pixelGrid.emitterOffset += 0.1;
    expect(createStructuralFingerprint(source, movedEmitterProfile)).not.toBe(
      createStructuralFingerprint(source, project.panelProfile),
    );
  });

  it("rejects invalid print envelopes and contradictory or unknown panel pairs", async () => {
    const invalidBed = await definition();
    invalidBed.structuralDesign = design();
    invalidBed.structuralDesign.connectorization = {
      maximumNeighborDistanceMm: 200,
      maximumAutomaticNeighborsPerPanel: 2,
      minimumAnchorsPerPanelSide: 2,
      printBedSizeMm: [250, 250, 250],
      printBedMarginMm: 20,
      maximumStrutSegmentLengthMm: 220,
      panelPairOverrides: [],
    };
    expect(() => parsePanelAssemblyDefinition(invalidBed)).toThrow(/segment length must fit/);

    invalidBed.structuralDesign.connectorization.maximumStrutSegmentLengthMm = 0.5;
    invalidBed.structuralDesign.connectorization.printBedMarginMm = 5;
    expect(() => parsePanelAssemblyDefinition(invalidBed)).toThrow(/at least 1 mm/);
    invalidBed.structuralDesign.connectorization.maximumStrutSegmentLengthMm = 220;

    const duplicate = await definition();
    duplicate.structuralDesign = design();
    duplicate.structuralDesign.connectorization = {
      ...structuredClone(invalidBed.structuralDesign.connectorization),
      printBedMarginMm: 5,
      panelPairOverrides: [
        { panelIds: ["P-01", "P-02"], action: "include" },
        { panelIds: ["P-02", "P-01"], action: "exclude" },
      ],
    };
    expect(() => parsePanelAssemblyDefinition(duplicate)).toThrow(/duplicated or contradictory/);

    const unknown = await definition();
    unknown.structuralDesign = design();
    unknown.structuralDesign.connectorization = {
      ...structuredClone(invalidBed.structuralDesign.connectorization),
      printBedMarginMm: 5,
      panelPairOverrides: [{ panelIds: ["P-01", "UNKNOWN"], action: "include" }],
    };
    expect(() => parsePanelAssemblyDefinition(unknown)).toThrow(/unknown panel UNKNOWN/);
  });

  it("round-trips a structural manifest and becomes stale after a pose edit", async () => {
    const source = await definition();
    source.structuralDesign = design();
    const project = createPanelAssemblyProject(source, "structure/sculpture.json");
    source.generatedStructure = manifest(
      createStructuralFingerprint(source, project.panelProfile),
    );
    const reopened = createPanelAssemblyProject(
      JSON.parse(sculptureJson(source)),
      "structure/sculpture.json",
      project.panelProfile,
    );
    expect(getGeneratedStructuralState(reopened.sculpture, reopened.panelProfile))
      .toBe("current");
    expect(reopened.sculpture.generatedStructure).toEqual(source.generatedStructure);

    const edited = rotatePanelAroundLocalZ(reopened.sculpture, "P-01", 15);
    expect(getGeneratedStructuralState(edited, reopened.panelProfile)).toBe("stale");
    expect(edited.generatedStructure).toEqual(source.generatedStructure);
  });

  it("makes pre-conversion structural artifacts stale", async () => {
    const source = await definition();
    source.generatedStructure = manifest(
      "d4261e242511c6e65c53b22889a4abf141098022ec4e17154c11627b8e9e599e",
    );
    const project = createPanelAssemblyProject(
      source,
      "pre-back-view-conversion/sculpture.json",
    );

    expect(getGeneratedStructuralState(project.sculpture, project.panelProfile))
      .toBe("stale");
  });

  it("keeps structural artifacts separate from planar mechanics", async () => {
    const source = await definition();
    source.structuralDesign = design();
    const project = createPanelAssemblyProject(source, "structure/sculpture.json");
    source.generatedStructure = manifest(
      createStructuralFingerprint(source, project.panelProfile),
    );
    source.generatedMechanics = {
      generator: { id: "other", version: "1" },
      sourceFingerprint: { algorithm: "sha256", value: hash("f") },
      status: { generation: "complete", validation: "passed" },
      boundary: { kind: "closed-boundary-mesh", format: "stl", source: "mechanics/boundary.stl", sha256: hash("1") },
      parts: [{ id: "part", format: "stl", source: "mechanics/part.stl", sha256: hash("2") }],
    };
    expect(() => parsePanelAssemblyDefinition(source)).toThrow(
      /cannot be combined with planar mechanics/,
    );
  });

  it("validates structural artifact roles, formats, hashes, and unique paths", async () => {
    const source = await definition();
    source.structuralDesign = design();
    const project = createPanelAssemblyProject(source, "structure/sculpture.json");
    source.generatedStructure = manifest(
      createStructuralFingerprint(source, project.panelProfile),
    );
    source.generatedStructure.artifacts[0]!.format = "json";
    expect(() => parsePanelAssemblyDefinition(source)).toThrow(/invalid role or format/);

    const duplicate = await definition();
    duplicate.structuralDesign = design();
    const duplicateProject = createPanelAssemblyProject(duplicate, "structure/sculpture.json");
    duplicate.generatedStructure = manifest(
      createStructuralFingerprint(duplicate, duplicateProject.panelProfile),
    );
    duplicate.generatedStructure.artifacts[1]!.source =
      duplicate.generatedStructure.artifacts[0]!.source;
    expect(() => parsePanelAssemblyDefinition(duplicate)).toThrow(
      /duplicates project asset source/,
    );

    const duplicatePreview = await definition();
    duplicatePreview.structuralDesign = design();
    const previewProject = createPanelAssemblyProject(
      duplicatePreview,
      "structure/sculpture.json",
    );
    duplicatePreview.generatedStructure = manifest(
      createStructuralFingerprint(duplicatePreview, previewProject.panelProfile),
    );
    duplicatePreview.generatedStructure.artifacts.push({
      id: "second-preview",
      role: "preview",
      format: "stl",
      source: "structure/second-preview.stl",
      sha256: hash("f"),
    });
    expect(() => parsePanelAssemblyDefinition(duplicatePreview)).toThrow(
      /exactly one preview artifact/,
    );

    const schema = JSON.parse(await readFile("schemas/panel-assembly.schema.json", "utf8")) as {
      properties: { generatedStructure: { properties: { artifacts: { allOf: Array<{ maxContains?: number }> } } } };
      $defs: { structuralArtifact: { oneOf: Array<{ properties: { role: { const: string }; format: { const: string } } }> } };
    };
    expect(schema.properties.generatedStructure.properties.artifacts.allOf)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ maxContains: 1 }),
      ]));
    expect(schema.$defs.structuralArtifact.oneOf.map(({ properties }) => [
      properties.role.const,
      properties.format.const,
    ])).toEqual([
      ["part", "stl"],
      ["preview", "stl"],
      ["package", "3mf"],
      ["analysis", "json"],
      ["report", "markdown"],
    ]);
  });

  it("rejects structural state until an authoring project has a panel pose", async () => {
    const withDesign = await emptyDefinition();
    withDesign.structuralDesign = design();
    withDesign.structuralDesign.supports = [];
    withDesign.structuralDesign.loads = [];
    expect(() => parsePanelAssemblyDefinition(withDesign)).toThrow(
      /require at least one panel pose/,
    );

    const withArtifacts = await emptyDefinition();
    withArtifacts.generatedStructure = manifest(hash("f"));
    expect(() => parsePanelAssemblyDefinition(withArtifacts)).toThrow(
      /require at least one panel pose/,
    );
  });
});
