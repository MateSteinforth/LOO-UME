import { describe, expect, it } from "vitest";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import {
  createMadMapperFixtureBundle,
  madMapperAddressForPixel,
} from "../web/src/MadMapperExport.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

async function flagshipContract() {
  const project = await loadPanelAssemblyProjectFromFile(
    "sculptures/rhombicosidodecahedron/sculpture.json",
    process.cwd(),
  );
  const mapping = createPanelAssemblyMapping(project);
  const wiring = createProvisionalWiringPreview(
    mapping,
    project.sculpture,
    project.panelProfile,
  );
  return createHardwareMappingContract(mapping, wiring, project.panelProfile);
}

describe("MadMapper fixture export", () => {
  it("patches the flagship as 41 oriented matrices over 16 universes", async () => {
    const contract = await flagshipContract();
    const bundle = createMadMapperFixtureBundle(contract);

    expect(bundle.manifest).toMatchObject({
      minimumMadMapperVersion: "6.1",
      mappingFingerprint: "73b36d49",
      addressOrder: "physical-wire-order",
      panelFixtureCount: 41,
      pixelCount: 2_624,
      startUniverse: 1,
      endUniverse: 16,
      universeCount: 16,
      requiredMadMapperSettings: { avoidCrossUniversePixels: true },
      requiredWledRealtimeAddressing: {
        useMainSegmentOnly: false,
        realtimeRespectLedMaps: false,
        status: "requires-LIVE-010-hardware-validation",
      },
    });
    expect(bundle.manifest.panels[0]).toMatchObject({
      id: "SQ-03",
      outputIndex: 0,
      chainPosition: 0,
      physicalStart: 0,
      physicalEnd: 63,
      startAddress: { universe: 1, channel: 1 },
      endAddress: { universe: 1, channel: 190 },
    });
    expect(bundle.manifest.panels[2]).toMatchObject({
      id: "PC-04",
      physicalStart: 128,
      physicalEnd: 191,
      startAddress: { universe: 1, channel: 385 },
      endAddress: { universe: 2, channel: 64 },
    });
    expect(bundle.svg.match(/<g id=/g)).toHaveLength(41);
    expect(bundle.svg.match(/<polygon /g)).toHaveLength(41);
    expect(bundle.svg).toContain('fixture_definition="Generic - Pixel RGB"');
    expect(bundle.svg).not.toContain("Generic – Pixel RGB");
    expect(bundle.svg).toContain('matrix_width="8" matrix_height="8"');
    expect(bundle.patchCsv.trim().split("\n")).toHaveLength(42);
  });

  it("never splits one RGB pixel across universes", () => {
    const addresses = Array.from({ length: 2_624 }, (_, index) =>
      madMapperAddressForPixel(index),
    );
    expect(new Set(addresses.map((address) => address.universe)).size).toBe(16);
    expect(new Set(addresses.map(
      (address) => `${address.universe}:${address.channel}`,
    )).size).toBe(2_624);
    expect(addresses.every((address) => address.channel <= 510)).toBe(true);
    expect(addresses[169]).toEqual({ universe: 1, channel: 508 });
    expect(addresses[170]).toEqual({ universe: 2, channel: 1 });
  });

  it("rejects mapping data whose fingerprint no longer matches", async () => {
    const contract = await flagshipContract();
    const stale = structuredClone(contract);
    stale.ledmap.map[0] = stale.ledmap.map[1]!;
    expect(() => createMadMapperFixtureBundle(stale)).toThrow(
      "mapping fingerprint is stale or inconsistent",
    );
  });

  it("rejects a mapping that is not ready for installation", async () => {
    const contract = await flagshipContract();
    const blocked = structuredClone(contract);
    blocked.readiness.mappingReady = false;
    expect(() => createMadMapperFixtureBundle(blocked)).toThrow(
      "requires a mapping-ready authored route",
    );
  });
});
