import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPanelizedSculptureMapping } from "../web/src/LedMapping.ts";
import {
  createHardwareMappingContract,
  loadGeneratedHardwareMappingContract,
  validateLedmapEquivalence,
} from "../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";
import { CANONICAL_SCULPTURE_PROJECT } from "../src/sculpture/Definition.ts";

describe("hardware mapping contract", () => {
  it("uses a persisted authored panel order for physical output addresses", () => {
    const geometry = createPanelizedSculptureMapping();
    const draft = createProvisionalWiringPreview(geometry);
    const definition = structuredClone(CANONICAL_SCULPTURE_PROJECT.sculpture);
    for (let index = 0; index < definition.wiring.outputs.length; index += 1) {
      definition.wiring.outputs[index]!.panelIds = [
        ...draft.outputs[index]!.panelIds,
      ];
    }
    definition.wiring.outputs[0]!.panelIds!.reverse();

    const wiring = createProvisionalWiringPreview(geometry, definition);
    const contract = createHardwareMappingContract(geometry, wiring);

    expect(wiring.status).toBe("authored-provisional");
    expect(contract.outputs[0]!.panelIds).toEqual(
      definition.wiring.outputs[0]!.panelIds,
    );
    expect(contract.mapping.panels.find(
      (panel) => panel.id === definition.wiring.outputs[0]!.panelIds![0],
    )?.wiring).toMatchObject({ output: 0, chainPosition: 0 });
  });

  it("uses the displayed route as the physical WLED address order", () => {
    const geometry = createPanelizedSculptureMapping();
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
    const geometry = createPanelizedSculptureMapping();
    const wiring = createProvisionalWiringPreview(geometry);
    const firstPanelId = wiring.outputs[0]!.panelIds[0]!;
    const firstPanel = geometry.panels.find(
      (panel) => panel.id === firstPanelId,
    )!;
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
    const geometry = createPanelizedSculptureMapping();
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

  it("keeps generated JSON artifacts fingerprint-identical", () => {
    const geometry = createPanelizedSculptureMapping();
    const wiring = createProvisionalWiringPreview(geometry);
    const contract = createHardwareMappingContract(geometry, wiring);
    const generatedLayout = JSON.parse(
      readFileSync("layout/panel-map.json", "utf8"),
    ) as {
      ledmapFingerprint: string;
      leds: Array<{ logicalIndex: number; physicalIndex: number }>;
    };
    const generatedLedmap = JSON.parse(
      readFileSync("wled/ledmap.provisional.json", "utf8"),
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
      readFileSync("wled/ledmap.provisional.json", "utf8"),
    ) as { map: number[] };
    const loaded = loadGeneratedHardwareMappingContract(panelMap, ledmap);

    expect(loaded.fingerprint).toBe("31291c59");
    expect(loaded.mapping.entries).toHaveLength(2624);
    expect(loaded.wiring.outputs).toHaveLength(4);

    const divergentLedmap = {
      map: [...ledmap.map],
    };
    divergentLedmap.map[0] = divergentLedmap.map[0]! + 1;
    expect(() =>
      loadGeneratedHardwareMappingContract(panelMap, divergentLedmap),
    ).toThrow();
  });

  it("refuses to describe provisional routing as hardware-ready", () => {
    const geometry = createPanelizedSculptureMapping();
    const wiring = createProvisionalWiringPreview(geometry);
    const contract = createHardwareMappingContract(geometry, wiring);

    expect(contract.readiness.ready).toBe(false);
    expect(contract.readiness.blockers.join(" ")).toContain("GPIO");
    expect(contract.readiness.blockers.join(" ")).not.toContain("DIN/DOUT");
    expect(contract.readiness.blockers.join(" ")).toContain("pixel-zero");
    expect(contract.readiness.blockers.join(" ")).toContain("chains");
  });
});
