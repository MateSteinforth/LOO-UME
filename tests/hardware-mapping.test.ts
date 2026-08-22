import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createHardwareMappingContract as createContract,
  loadGeneratedHardwareMappingContract,
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

const SOURCE = "sculptures/rhombicosidodecahedron/sculpture.json";
const PROJECT = createPanelAssemblyProject(
  JSON.parse(readFileSync(SOURCE, "utf8")),
  SOURCE,
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
    expect(transform(0, 0, 1, false)).toEqual({ x: 7, y: 0 });
    expect(transform(0, 0, 2, false)).toEqual({ x: 7, y: 7 });
    expect(transform(0, 0, 1, true)).toEqual({ x: 7, y: 7 });
  });

  it("uses the documented back-view corner and row-transition vectors", () => {
    const pixelZeroByTransform = [
      { turns: 0, mirrored: false, local: [0, 7] },
      { turns: 0, mirrored: true, local: [7, 7] },
      { turns: 1, mirrored: false, local: [7, 7] },
      { turns: 1, mirrored: true, local: [0, 7] },
      { turns: 2, mirrored: false, local: [7, 0] },
      { turns: 2, mirrored: true, local: [0, 0] },
      { turns: 3, mirrored: false, local: [0, 0] },
      { turns: 3, mirrored: true, local: [7, 0] },
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
      if (vector.turns === 3 && vector.mirrored) {
        expect(physicalAt(7, 7)).toBe(7);
        expect(physicalAt(6, 7)).toBe(8);
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
      let transformedX = mirrored ? 7 - x : x;
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

    expect(findPhysical(7, 7)).toBe(0);
    expect(findPhysical(7, 6)).toBe(1);
    expect(findPhysical(6, 7)).toBe(8);
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
      leds: Array<{ logicalIndex: number; physicalIndex: number }>;
    };
    const generatedLedmap = JSON.parse(
      readFileSync("wled/diagnostic/ledmap.diagnostic.json", "utf8"),
    ) as { map: number[] };

    expect(generatedLayout.ledmapFingerprint).toBe(contract.fingerprint);
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

    expect(loaded.fingerprint).toBe("bc5054d1");
    expect(loaded.wiring.status).toBe("authored");
    expect(loaded.wiring.outputs.map((output) => output.gpio)).toEqual([
      16, 17, 18, 19,
    ]);
    expect(loaded.mapping.entries).toHaveLength(2624);
    expect(loaded.wiring.outputs).toHaveLength(4);
    expect(loaded.readiness.mappingReady).toBe(true);

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
