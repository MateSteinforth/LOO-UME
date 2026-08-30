import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createHardwareMappingContract as createContract,
  fingerprintLedmap,
  LEDMAP_FINGERPRINT_VERSION,
  LEGACY_LEDMAP_FINGERPRINT_VERSION,
  loadGeneratedHardwareMappingContract,
  physicalAddressContractKey,
  transformInstalledPanelCoordinate,
  validateLedmapEquivalence,
} from "../web/src/HardwareMapping.ts";
import {
  createProvisionalWiringPreview as createWiringPreview,
  type WiringSourceDefinition,
} from "../web/src/WiringPreview.ts";
import {
  createPanelAssemblyMapping,
  createPanelAssemblyProject,
} from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import { validateMapping } from "../web/src/LedMapping.ts";
import { createSimulatorSetupConfig } from "../web/src/Esp32Setup.ts";

const SOURCE = "sculptures/rhombicosidodecahedron/sculpture.json";
const PROJECT = createPanelAssemblyProject(
  JSON.parse(readFileSync(SOURCE, "utf8")),
  SOURCE,
);
const PANEL_PROFILE_INPUT = JSON.parse(
  readFileSync("catalog/panels/ws2812b-8x8-66x65.json", "utf8"),
);

function createFixtureMapping() {
  return createPanelAssemblyMapping(PROJECT);
}

function createProvisionalWiringPreview(
  geometry: ReturnType<typeof createFixtureMapping>,
  definition: WiringSourceDefinition = PROJECT.sculpture,
  panelProfile = PROJECT.panelProfile,
) {
  return createWiringPreview(geometry, definition, panelProfile);
}

function createHardwareMappingContract(
  geometry: ReturnType<typeof createFixtureMapping>,
  wiring: ReturnType<typeof createProvisionalWiringPreview>,
  panelProfile = PROJECT.panelProfile,
) {
  return createContract(geometry, wiring, panelProfile);
}

describe("hardware mapping contract", () => {
  it("separates spatial LED order from the physical route and address contract", () => {
    const geometry = createFixtureMapping();
    const wiring = createProvisionalWiringPreview(geometry);
    const contract = createHardwareMappingContract(geometry, wiring);
    const poseOnly = structuredClone(contract);
    for (const entry of poseOnly.mapping.entries) {
      entry.logicalIndex = poseOnly.mapping.entries.length - 1 - entry.logicalIndex;
      entry.x += 10;
    }
    expect(physicalAddressContractKey(poseOnly)).toBe(
      physicalAddressContractKey(contract),
    );

    const changedRoute = structuredClone(contract);
    changedRoute.outputs[0]!.panelIds.reverse();
    expect(physicalAddressContractKey(changedRoute)).not.toBe(
      physicalAddressContractKey(contract),
    );

    const changedCalibration = structuredClone(contract);
    changedCalibration.mapping.entries[0]!.physicalIndex += 1;
    expect(physicalAddressContractKey(changedCalibration)).not.toBe(
      physicalAddressContractKey(contract),
    );
  });

  it("versions full-width ledmap fingerprints without breaking legacy reload", () => {
    const low = { map: [1] };
    const high = { map: [65_537] };

    expect(fingerprintLedmap(low)).not.toBe(fingerprintLedmap(high));
    expect(fingerprintLedmap(low, LEGACY_LEDMAP_FINGERPRINT_VERSION)).toBe(
      fingerprintLedmap(high, LEGACY_LEDMAP_FINGERPRINT_VERSION),
    );
  });
  it("parses, maps, validates, exports, and reloads a 4x3 panel profile", () => {
    const definition = structuredClone(PROJECT.sculpture);
    const profile = structuredClone(PANEL_PROFILE_INPUT);
    profile.id = "test-ws2812b-4x3";
    profile.pixelGrid.columns = 4;
    profile.pixelGrid.rows = 3;
    profile.power.worstCaseCurrentPerPanel = 0.72;
    definition.panelProfile = {
      id: profile.id,
      source: "test-ws2812b-4x3.json",
    };
    for (const panel of definition.panels) {
      panel.installedAddressTransform = {
        status: "assumed",
        referenceView: "back",
        quarterTurnsClockwise: 0,
        mirrored: false,
        selectionMethod: "manual",
      };
    }

    const project = createPanelAssemblyProject(
      definition,
      "test-4x3-sculpture.json",
      profile,
    );
    const geometry = createPanelAssemblyMapping(project);
    expect(geometry.panelPixelGrid).toEqual({ columns: 4, rows: 3 });
    expect(geometry.entries).toHaveLength(41 * 12);
    expect(validateMapping(geometry, geometry.entries.length)).toEqual({
      valid: true,
      errors: [],
    });

    const wiring = createWiringPreview(
      geometry,
      project.sculpture,
      project.panelProfile,
    );
    const oddTurnGeometry = structuredClone(geometry);
    oddTurnGeometry.panels[0]!.installedAddressTransform.quarterTurnsClockwise = 1;
    expect(() => createContract(
      oddTurnGeometry,
      wiring,
      project.panelProfile,
    )).toThrow(/square pixel grid/);
    const contract = createContract(geometry, wiring, project.panelProfile);
    expect(contract.outputs.map((output) => output.pixelCount)).toEqual([
      132, 120, 120, 120,
    ]);
    const panelMap = JSON.parse(JSON.stringify({
      schemaVersion: "1.0.0",
      id: contract.mapping.id,
      status: contract.mapping.status,
      topology: contract.mapping.topology,
      panelPixelGrid: contract.mapping.panelPixelGrid,
      notes: contract.mapping.notes,
      hardwareReady: contract.readiness.ready,
      mappingReady: contract.readiness.mappingReady,
      ledmapFingerprint: contract.fingerprint,
      ledmapFingerprintVersion: contract.fingerprintVersion,
      readinessBlockers: contract.readiness.blockers,
      wiringLifecycle: contract.readiness.wiringLifecycle,
      outputs: contract.outputs,
      wiring: contract.wiring,
      panels: contract.mapping.panels,
      surfaceFaces: contract.mapping.surfaceFaces,
      mechanicalMounts: contract.mapping.mechanicalMounts,
      printableClosures: contract.mapping.printableClosures,
      leds: contract.mapping.entries,
    })) as unknown;
    const ledmap = JSON.parse(JSON.stringify(contract.ledmap)) as unknown;
    const reloaded = loadGeneratedHardwareMappingContract(panelMap, ledmap);
    expect(reloaded.mapping.panelPixelGrid).toEqual({ columns: 4, rows: 3 });
    expect(reloaded.mapping.entries).toHaveLength(492);
    expect(reloaded.outputs.map((output) => output.pixelCount)).toEqual([
      132, 120, 120, 120,
    ]);
  });

  it("maps a 1x12 circular emitter fixture through the WLED contract", () => {
    const definition = structuredClone(PROJECT.sculpture);
    const profile = structuredClone(PANEL_PROFILE_INPUT);
    profile.id = "test-flexible-ring-1x12";
    profile.dimensions = { width: 70, height: 70, thickness: 1 };
    profile.carrier = {
      kind: "flexible-path",
      path: Array.from({ length: 12 }, (_, index) => {
        const radians = -index * Math.PI / 6;
        return [
          Math.cos(radians) * 30,
          Math.sin(radians) * 30,
          0,
        ];
      }),
      closed: true,
      width: 6,
      thickness: 1,
    };
    profile.pixelGrid.columns = 12;
    profile.pixelGrid.rows = 1;
    profile.pixelGrid.localEmitterPositions = Array.from(
      { length: 12 },
      (_, index) => {
        const radians = -index * Math.PI / 6;
        return [
          Math.cos(radians) * 30,
          Math.sin(radians) * 30,
          0,
        ];
      },
    );
    profile.dataConnectors.doutCorner = "top-left";
    profile.dataConnectors.localPositions = {
      coordinateFrame: "pose-local",
      din: [30, 0, 0],
      dout: profile.pixelGrid.localEmitterPositions[11],
    };
    const oldDout = profile.mounting.holes.find(
      (hole: { id: string }) => hole.id === "bottom-left",
    );
    oldDout.mechanicalUse = "eligible";
    delete oldDout.blockedBy;
    const newDout = profile.mounting.holes.find(
      (hole: { id: string }) => hole.id === "top-left",
    );
    newDout.mechanicalUse = "blocked";
    newDout.blockedBy = "DOUT";
    profile.power.worstCaseCurrentPerPanel = 0.72;
    definition.panelProfile = {
      id: profile.id,
      source: "test-flexible-ring-1x12.json",
    };
    for (const panel of definition.panels) {
      panel.installedAddressTransform = {
        status: "assumed",
        referenceView: "back",
        quarterTurnsClockwise: 0,
        mirrored: false,
        selectionMethod: "manual",
      };
    }

    const project = createPanelAssemblyProject(
      definition,
      "test-flexible-ring-sculpture.json",
      profile,
    );
    const geometry = createPanelAssemblyMapping(project);
    const firstPanel = geometry.panels[0]!;
    const firstEntry = geometry.entries.find(
      (entry) => entry.panelId === firstPanel.id && entry.physicalIndex === 0,
    )!;
    expect(firstEntry.x).toBeCloseTo(
      firstPanel.position.x + firstPanel.xAxis.x * 30,
      10,
    );
    expect(firstEntry.y).toBeCloseTo(
      firstPanel.position.y + firstPanel.xAxis.y * 30,
      10,
    );
    expect(firstEntry.z).toBeCloseTo(
      firstPanel.position.z + firstPanel.xAxis.z * 30,
      10,
    );
    expect(geometry.entries).toHaveLength(41 * 12);
    expect(validateMapping(geometry, geometry.entries.length)).toEqual({
      valid: true,
      errors: [],
    });

    const wiring = createWiringPreview(
      geometry,
      project.sculpture,
      project.panelProfile,
    );
    const contract = createContract(geometry, wiring, project.panelProfile);
    expect(contract.mapping.panelPixelGrid).toEqual({ columns: 12, rows: 1 });
    expect(contract.outputs.map((output) => output.pixelCount)).toEqual([
      132, 120, 120, 120,
    ]);
    expect(contract.mapping.entries).toHaveLength(492);
    const setupConfig = createSimulatorSetupConfig(
      JSON.parse(readFileSync("firmware/one-panel-smoke-cfg.json", "utf8")),
      contract.outputs.map((output) => ({
        startIndex: output.startIndex,
        pixelCount: output.pixelCount,
        gpio: output.gpio!,
      })),
      contract.wledColorOrder.wledValue,
      12,
    ) as { hw: { led: { total: number; maxpwr: number; ins: unknown[] } } };
    expect(setupConfig.hw.led).toMatchObject({
      total: 492,
      maxpwr: 7_688,
      ins: [
        { start: 0, len: 132, pin: [16], maxpwr: 2_063 },
        { start: 132, len: 120, pin: [17], maxpwr: 1_875 },
        { start: 252, len: 120, pin: [18], maxpwr: 1_875 },
        { start: 372, len: 120, pin: [19], maxpwr: 1_875 },
      ],
    });
  });

  it("rotates fixed back-view corner vectors clockwise after mirroring", () => {
    const transform = (
      x: number,
      y: number,
      quarterTurnsClockwise: 0 | 1 | 2 | 3,
      mirrored: boolean,
    ) => transformInstalledPanelCoordinate(
      x,
      y,
      { status: "assumed", referenceView: "back", quarterTurnsClockwise, mirrored },
      8,
      8,
    );
    expect(transform(0, 0, 1, false)).toEqual({ x: 7, y: 7 });
    expect(transform(0, 0, 2, false)).toEqual({ x: 0, y: 7 });
    expect(transform(0, 0, 1, true)).toEqual({ x: 7, y: 0 });
  });

  it("uses the documented back-view corner and row-transition vectors", () => {
    const pixelZeroByTransform = [
      { turns: 0, mirrored: false, local: [0, 7] },
      { turns: 0, mirrored: true, local: [7, 7] },
      { turns: 1, mirrored: false, local: [0, 0] },
      { turns: 1, mirrored: true, local: [7, 0] },
      { turns: 2, mirrored: false, local: [7, 0] },
      { turns: 2, mirrored: true, local: [0, 0] },
      { turns: 3, mirrored: false, local: [7, 7] },
      { turns: 3, mirrored: true, local: [0, 7] },
    ] as const;
    for (const vector of pixelZeroByTransform) {
      const geometry = createFixtureMapping();
      const wiring = createProvisionalWiringPreview(geometry);
      const panelId = wiring.outputs[0]!.panelIds[0]!;
      geometry.panels.find((panel) => panel.id === panelId)!.installedAddressTransform = {
        status: "measured",
        referenceView: "back",
        quarterTurnsClockwise: vector.turns,
        mirrored: vector.mirrored,
      };
      const contract = createHardwareMappingContract(geometry, wiring);
      const physicalAt = (x: number, y: number): number =>
        contract.mapping.entries.find((entry) =>
          entry.panelId === panelId &&
          entry.panelPixelX === x &&
          entry.panelPixelY === y
        )!.physicalIndex;
      expect(physicalAt(vector.local[0], vector.local[1])).toBe(0);
      if (vector.turns === 0 && !vector.mirrored) {
        expect(physicalAt(7, 7)).toBe(7);
        expect(physicalAt(0, 6)).toBe(8);
        expect(physicalAt(7, 6)).toBe(15);
        expect(physicalAt(0, 5)).toBe(16);
        expect(physicalAt(0, 0)).toBe(56);
        expect(physicalAt(7, 0)).toBe(63);
      }
      if (vector.turns === 3 && vector.mirrored) {
        expect(physicalAt(0, 0)).toBe(7);
        expect(physicalAt(1, 7)).toBe(8);
      }
    }
  });

  it("combines all eight installed transforms with all supported panel orders", () => {
    const corners = [
      "top-left",
      "top-right",
      "bottom-left",
      "bottom-right",
    ] as const;
    const transformCoordinate = (
      x: number,
      y: number,
      turns: 0 | 1 | 2 | 3,
      mirrored: boolean,
    ): [number, number] => {
      let transformedX = 7 - x;
      if (mirrored) transformedX = 7 - transformedX;
      let transformedY = y;
      if (turns === 1) [transformedX, transformedY] = [7 - transformedY, transformedX];
      if (turns === 2) [transformedX, transformedY] = [7 - transformedX, 7 - transformedY];
      if (turns === 3) [transformedX, transformedY] = [transformedY, 7 - transformedX];
      return [transformedX, transformedY];
    };
    const expectedWireIndex = (
      x: number,
      y: number,
      corner: typeof corners[number],
      traversalAxis: "rows" | "columns",
      serpentine: boolean,
    ): number => {
      const startsRight = corner.endsWith("right");
      const startsBottom = corner.startsWith("bottom");
      const line = traversalAxis === "rows"
        ? startsBottom ? 7 - y : y
        : startsRight ? 7 - x : x;
      let offset = traversalAxis === "rows"
        ? startsRight ? 7 - x : x
        : startsBottom ? 7 - y : y;
      if (serpentine && line % 2 === 1) offset = 7 - offset;
      return line * 8 + offset;
    };

    for (const mirrored of [false, true]) {
      for (const turns of [0, 1, 2, 3] as const) {
        for (const corner of corners) {
          for (const traversalAxis of ["rows", "columns"] as const) {
            for (const serpentine of [false, true]) {
              const geometry = createFixtureMapping();
              const wiring = createProvisionalWiringPreview(geometry);
              const panelId = wiring.outputs[0]!.panelIds[0]!;
              const panel = geometry.panels.find((candidate) => candidate.id === panelId)!;
              const startsRight = corner.endsWith("right");
              const startsBottom = corner.startsWith("bottom");
              panel.installedAddressTransform = {
                status: "measured",
                referenceView: "back",
                quarterTurnsClockwise: turns,
                mirrored,
              };
              panel.pixelOrder = {
                status: "measured",
                pixelZeroCorner: corner,
                traversalAxis,
                lineProgression: traversalAxis === "rows"
                  ? startsBottom ? "bottom-to-top" : "top-to-bottom"
                  : startsRight ? "right-to-left" : "left-to-right",
                serpentine,
                firstLineDirection: traversalAxis === "rows"
                  ? startsRight ? "right-to-left" : "left-to-right"
                  : startsBottom ? "bottom-to-top" : "top-to-bottom",
              };
              const contract = createHardwareMappingContract(geometry, wiring);
              const panelEntries = contract.mapping.entries.filter(
                (entry) => entry.panelId === panelId,
              );
              expect(new Set(panelEntries.map((entry) => entry.physicalIndex)).size).toBe(64);
              for (const entry of panelEntries) {
                const [wireX, wireY] = transformCoordinate(
                  entry.panelPixelX!,
                  entry.panelPixelY!,
                  turns,
                  mirrored,
                );
                expect(entry.physicalIndex).toBe(
                  expectedWireIndex(wireX, wireY, corner, traversalAxis, serpentine),
                );
              }
            }
          }
        }
      }
    }
  });

  it("uses a persisted authored panel order for physical output addresses", () => {
    const geometry = createFixtureMapping();
    const draft = createProvisionalWiringPreview(geometry);
    const definition = structuredClone(PROJECT.sculpture);
    for (let index = 0; index < definition.wiring.outputs.length; index += 1) {
      definition.wiring.outputs[index]!.panelIds = [
        ...draft.outputs[index]!.panelIds,
      ];
    }
    definition.wiring.status = "authored";
    definition.wiring.outputs[0]!.panelIds!.reverse();

    const wiring = createProvisionalWiringPreview(geometry, definition);
    const contract = createHardwareMappingContract(geometry, wiring);

    expect(wiring.status).toBe("authored");
    expect(contract.outputs[0]!.panelIds).toEqual(
      definition.wiring.outputs[0]!.panelIds,
    );
    expect(contract.mapping.panels.find(
      (panel) => panel.id === definition.wiring.outputs[0]!.panelIds![0],
    )?.wiring).toMatchObject({ output: 0, chainPosition: 0 });
  });

  it("uses the displayed route as the physical WLED address order", () => {
    const geometry = createFixtureMapping();
    const wiring = createProvisionalWiringPreview(geometry);
    const contract = createHardwareMappingContract(geometry, wiring);

    expect(contract.outputs.map((output) => output.startIndex)).toEqual([
      0, 704, 1344, 1984,
    ]);
    expect(contract.outputs.map((output) => output.pixelCount)).toEqual([
      704, 640, 640, 640,
    ]);
    expect(validateLedmapEquivalence(contract.mapping, contract.ledmap)).toEqual(
      [],
    );

    for (const output of contract.outputs) {
      for (
        let chainPosition = 0;
        chainPosition < output.panelIds.length;
        chainPosition += 1
      ) {
        const panelId = output.panelIds[chainPosition]!;
        const panel = contract.mapping.panels.find(
          (candidate) => candidate.id === panelId,
        )!;
        expect(panel.wiring).toMatchObject({
          status: "provisional",
          output: output.outputIndex,
          chainPosition,
        });
        expect(panel.ledIndices[0]).toBe(
          output.startIndex + chainPosition * 64,
        );
        expect(panel.ledIndices[63]).toBe(
          output.startIndex + chainPosition * 64 + 63,
        );
      }
    }
  });

  it("changes physical addresses when measured panel order changes", () => {
    const geometry = createFixtureMapping();
    const wiring = createProvisionalWiringPreview(geometry);
    const firstPanelId = wiring.outputs[0]!.panelIds[0]!;
    const firstPanel = geometry.panels.find(
      (panel) => panel.id === firstPanelId,
    )!;
    firstPanel.installedAddressTransform = {
      status: "measured",
      referenceView: "back",
      quarterTurnsClockwise: 0,
      mirrored: false,
    };
    firstPanel.pixelOrder = {
      status: "measured",
      pixelZeroCorner: "bottom-right",
      traversalAxis: "columns",
      lineProgression: "right-to-left",
      serpentine: false,
      firstLineDirection: "bottom-to-top",
    };

    const contract = createHardwareMappingContract(geometry, wiring);
    const findPhysical = (x: number, y: number): number =>
      contract.mapping.entries.find(
        (entry) =>
          entry.panelId === firstPanelId &&
          entry.panelPixelX === x &&
          entry.panelPixelY === y,
      )!.physicalIndex;

    expect(findPhysical(0, 7)).toBe(0);
    expect(findPhysical(0, 6)).toBe(1);
    expect(findPhysical(1, 7)).toBe(8);
  });

  it("replays the exported ledmap exactly like the renderer", () => {
    const geometry = createFixtureMapping();
    const wiring = createProvisionalWiringPreview(geometry);
    const contract = createHardwareMappingContract(geometry, wiring);
    const logicalFrame = Uint32Array.from(
      { length: contract.mapping.entries.length },
      (_, index) => (index * 2654435761) >>> 0,
    );
    const hardwareFrame = new Uint32Array(logicalFrame.length);

    for (
      let logicalIndex = 0;
      logicalIndex < logicalFrame.length;
      logicalIndex += 1
    ) {
      hardwareFrame[contract.ledmap.map[logicalIndex]!] =
        logicalFrame[logicalIndex]!;
    }

    for (const led of contract.mapping.entries) {
      expect(hardwareFrame[led.physicalIndex]).toBe(
        logicalFrame[led.logicalIndex],
      );
    }
  });

  it("keeps generated JSON artifacts fingerprint-identical", async () => {
    const project = await loadPanelAssemblyProjectFromFile(
      "sculptures/rhombicosidodecahedron/sculpture.json",
      process.cwd(),
    );
    const geometry = createPanelAssemblyMapping(project);
    const wiring = createProvisionalWiringPreview(
      geometry,
      project.sculpture,
      project.panelProfile,
    );
    const contract = createHardwareMappingContract(
      geometry,
      wiring,
      project.panelProfile,
    );
    const generatedLayout = JSON.parse(
      readFileSync("layout/panel-map.json", "utf8"),
    ) as {
      ledmapFingerprint: string;
      ledmapFingerprintVersion: string;
      leds: Array<{ logicalIndex: number; physicalIndex: number }>;
    };
    const generatedLedmap = JSON.parse(
      readFileSync("wled/diagnostic/ledmap.diagnostic.json", "utf8"),
    ) as { map: number[] };

    expect(generatedLayout.ledmapFingerprint).toBe(contract.fingerprint);
    expect(generatedLayout.ledmapFingerprintVersion).toBe(
      LEDMAP_FINGERPRINT_VERSION,
    );
    expect(generatedLedmap).toEqual(contract.ledmap);
    for (const led of generatedLayout.leds) {
      expect(generatedLedmap.map[led.logicalIndex]).toBe(led.physicalIndex);
    }
  });

  it("loads the actual JSON artifacts and rejects divergence", () => {
    const panelMap = JSON.parse(
      readFileSync("layout/panel-map.json", "utf8"),
    ) as unknown;
    const ledmap = JSON.parse(
      readFileSync("wled/diagnostic/ledmap.diagnostic.json", "utf8"),
    ) as { map: number[] };
    const loaded = loadGeneratedHardwareMappingContract(panelMap, ledmap);

    expect(loaded.fingerprintVersion).toBe(LEDMAP_FINGERPRINT_VERSION);
    expect(loaded.wiring.status).toBe("authored");
    expect(loaded.wiring.outputs.map((output) => output.gpio)).toEqual([
      16, 17, 18, 19,
    ]);
    expect(loaded.mapping.entries).toHaveLength(2624);
    expect(loaded.wiring.outputs).toHaveLength(4);
    expect(loaded.readiness.mappingReady).toBe(true);

    const legacyFingerprintMap = structuredClone(panelMap) as {
      ledmapFingerprint: string;
      ledmapFingerprintVersion?: string;
    };
    delete legacyFingerprintMap.ledmapFingerprintVersion;
    legacyFingerprintMap.ledmapFingerprint = fingerprintLedmap(
      ledmap,
      LEGACY_LEDMAP_FINGERPRINT_VERSION,
    );
    expect(loadGeneratedHardwareMappingContract(
      legacyFingerprintMap,
      ledmap,
    ).fingerprintVersion).toBe(LEGACY_LEDMAP_FINGERPRINT_VERSION);

    const unsupportedFingerprintMap = structuredClone(panelMap) as {
      ledmapFingerprintVersion?: string;
    };
    unsupportedFingerprintMap.ledmapFingerprintVersion = "unknown-v3";
    expect(() => loadGeneratedHardwareMappingContract(
      unsupportedFingerprintMap,
      ledmap,
    )).toThrow(/unsupported ledmap fingerprint version/);

    const legacyGridMap = structuredClone(panelMap) as {
      panelPixelGrid?: unknown;
    };
    delete legacyGridMap.panelPixelGrid;
    expect(loadGeneratedHardwareMappingContract(
      legacyGridMap,
      ledmap,
    ).mapping.panelPixelGrid).toEqual({ columns: 8, rows: 8 });

    const legacyTransformMap = structuredClone(panelMap) as {
      panels: Array<{ installedAddressTransform?: unknown }>;
      mappingReady?: boolean;
    };
    delete legacyTransformMap.panels[0]!.installedAddressTransform;
    delete legacyTransformMap.mappingReady;
    expect(loadGeneratedHardwareMappingContract(
      legacyTransformMap,
      ledmap,
    ).mapping.panels[0]!.installedAddressTransform).toEqual({
      status: "assumed",
      referenceView: "back",
      quarterTurnsClockwise: 0,
      mirrored: false,
    });

    const invalidTransformMap = structuredClone(panelMap) as {
      panels: Array<{ installedAddressTransform: { quarterTurnsClockwise: number } }>;
    };
    invalidTransformMap.panels[0]!.installedAddressTransform.quarterTurnsClockwise = 4;
    expect(() => loadGeneratedHardwareMappingContract(
      invalidTransformMap,
      ledmap,
    )).toThrow(/invalid installed address transform/);

    const divergentLedmap = {
      map: [...ledmap.map],
    };
    divergentLedmap.map[0] = divergentLedmap.map[0]! + 1;
    expect(() =>
      loadGeneratedHardwareMappingContract(panelMap, divergentLedmap),
    ).toThrow();

    const contradictoryLifecycle = structuredClone(panelMap) as {
      wiringLifecycle?: string;
    };
    contradictoryLifecycle.wiringLifecycle = "measured";
    expect(() =>
      loadGeneratedHardwareMappingContract(contradictoryLifecycle, ledmap),
    ).toThrow(/lifecycle disagrees/);

    const hardwareReadyTamper = structuredClone(panelMap) as {
      hardwareReady?: boolean;
    };
    hardwareReadyTamper.hardwareReady = true;
    expect(() =>
      loadGeneratedHardwareMappingContract(hardwareReadyTamper, ledmap),
    ).toThrow(/hardware-ready status disagrees/);

    const hardwareVerifiedTamper = structuredClone(panelMap) as {
      wiring: { status: string };
    };
    hardwareVerifiedTamper.wiring.status = "hardware-verified";
    expect(() =>
      loadGeneratedHardwareMappingContract(hardwareVerifiedTamper, ledmap),
    ).toThrow(/accepted PROOF-010/);
  });

  it("refuses to describe a draft route with unknown GPIOs as hardware-ready", () => {
    const definition = structuredClone(PROJECT.sculpture);
    definition.wiring.status = "provisional";
    delete definition.wiring.routeRevision;
    for (const output of definition.wiring.outputs) {
      delete output.panelIds;
      output.gpio = null;
    }
    for (const panel of definition.panels) {
      if (panel.installedAddressTransform?.selectionMethod === "route-optimized") {
        panel.installedAddressTransform.selectionMethod = "manual";
        delete panel.installedAddressTransform.optimizationFingerprint;
      }
    }
    const project = createPanelAssemblyProject(definition, SOURCE);
    const geometry = createPanelAssemblyMapping(project);
    const wiring = createWiringPreview(
      geometry, project.sculpture, project.panelProfile,
    );
    const contract = createHardwareMappingContract(geometry, wiring);

    expect(contract.readiness.ready).toBe(false);
    expect(contract.readiness.blockers.join(" ")).toContain("GPIO");
    expect(contract.readiness.blockers.join(" ")).toContain("draft");
  });
});
