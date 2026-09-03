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

function fixtureCenter(svg: string, fixtureId: string): [number, number] {
  const match = svg.match(new RegExp(`id="${fixtureId}" points="([^"]+)"`));
  if (!match) throw new Error(`Missing fixture ${fixtureId}.`);
  const points = match[1]!.split(" ").map((point) =>
    point.split(",").map(Number) as [number, number]
  );
  return [
    points.reduce((total, point) => total + point[0], 0) / points.length,
    points.reduce((total, point) => total + point[1], 0) / points.length,
  ];
}

function fixturePoints(svg: string): Array<Array<[number, number]>> {
  return [...svg.matchAll(/<polygon [^>]*points="([^"]+)"/g)].map((match) =>
    match[1]!.split(" ").map((point) =>
      point.split(",").map(Number) as [number, number]
    )
  );
}

function fixtureRowAngle(svg: string, panelId: string): number {
  const start = fixtureCenter(svg, `${panelId}-pixel-0-0`);
  const end = fixtureCenter(svg, `${panelId}-pixel-7-0`);
  return Math.atan2(end[1] - start[1], end[0] - start[0]) * 180 / Math.PI;
}

describe("MadMapper fixture export", () => {
  it("patches the flagship as 2,624 pose-positioned physical pixels", async () => {
    const contract = await flagshipContract();
    const bundle = createMadMapperFixtureBundle(contract);

    expect(bundle.manifest).toMatchObject({
      minimumMadMapperVersion: "6.1",
      mappingFingerprint: "e9fe0e65",
      addressOrder: "physical-wire-order",
      fixtureLayout: "individual-physical-pixels",
      panelFixtureCount: 41,
      pixelFixtureCount: 2_624,
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
      id: "SQ-04",
      outputIndex: 0,
      chainPosition: 0,
      physicalStart: 0,
      physicalEnd: 63,
      startAddress: { universe: 1, channel: 1 },
      endAddress: { universe: 1, channel: 190 },
    });
    expect(bundle.manifest.panels[2]).toMatchObject({
      id: "SQ-08",
      physicalStart: 128,
      physicalEnd: 191,
      startAddress: { universe: 1, channel: 385 },
      endAddress: { universe: 2, channel: 64 },
    });
    expect(bundle.svg.match(/<g id=/g)).toHaveLength(41);
    expect(bundle.svg.match(/<polygon /g)).toHaveLength(2_624);
    expect(bundle.svg).toContain('width="4096" height="2048" viewBox="0 0 4096 2048"');
    expect(bundle.svg).toContain('fixture_definition="Generic - Pixel RGB"');
    expect(bundle.svg).not.toContain("Generic – Pixel RGB");
    expect(bundle.svg).not.toContain("matrix_width=");
    expect(bundle.svg).toContain('id="SQ-03-pixel-0-0"');
    expect(bundle.svg).toContain('id="PC-04-pixel-');
    expect(bundle.patchCsv.trim().split("\n")).toHaveLength(42);
  });

  it("places equal LED squares inside one fixed 2:1 UV atlas", async () => {
    const bundle = createMadMapperFixtureBundle(await flagshipContract());
    const fixtures = fixturePoints(bundle.svg);

    expect(fixtures).toHaveLength(2_624);
    for (const points of fixtures) {
      const xs = points.map(([x]) => x);
      const ys = points.map(([, y]) => y);
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(28, 3);
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(28, 3);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs)).toBeLessThanOrEqual(4096);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...ys)).toBeLessThanOrEqual(2048);
    }
  });

  it("preserves different panel pose rotations in individual fixture positions", async () => {
    const bundle = createMadMapperFixtureBundle(await flagshipContract());

    expect(fixtureRowAngle(bundle.svg, "SQ-03")).toBeCloseTo(0, 1);
    expect(fixtureRowAngle(bundle.svg, "SQ-11")).toBeCloseTo(31.65, 2);
    expect(fixtureRowAngle(bundle.svg, "SQ-20")).toBeCloseTo(148.35, 2);
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
