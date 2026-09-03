import { describe, expect, it } from "vitest";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import {
  createMadMapperFixtureBundle,
  madMapperAddressForPixel,
} from "../web/src/MadMapperExport.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

let contractPromise: ReturnType<typeof loadFlagshipContract> | undefined;

async function loadFlagshipContract() {
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

function flagshipContract() {
  contractPromise ??= loadFlagshipContract();
  return contractPromise;
}

function fixturePoints(svg: string): Array<Array<[number, number]>> {
  return [...svg.matchAll(/<polygon [^>]*points="([^"]+)"/g)].map((match) =>
    match[1]!.split(" ").map((point) =>
      point.split(",").map(Number) as [number, number]
    )
  );
}

function polygonArea(points: Array<[number, number]>): number {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2);
}

function segmentKey(first: [number, number], second: [number, number]): string {
  const endpoints = [first.join(","), second.join(",")].sort();
  return endpoints.join("|");
}

function boundaryIntervals(
  fixtures: Array<Array<[number, number]>>,
  boundaryY: number,
): Array<[number, number]> {
  return fixtures.flatMap((points) => points.flatMap((point, index) => {
    const next = points[(index + 1) % points.length]!;
    if (point[1] !== boundaryY || next[1] !== boundaryY) return [];
    return [[Math.min(point[0], next[0]), Math.max(point[0], next[0])] as [number, number]];
  })).sort((first, second) => first[0] - second[0]);
}

function expectDividedBoundary(intervals: Array<[number, number]>): void {
  expect(intervals.length).toBeGreaterThan(2);
  expect(intervals[0]![0]).toBe(0);
  let coveredUntil = 0;
  for (const [start, end] of intervals) {
    expect(start - coveredUntil).toBeLessThanOrEqual(0.002);
    coveredUntil = Math.max(coveredUntil, end);
  }
  expect(coveredUntil).toBe(4096);
  expect(Math.max(...intervals.map(([start, end]) => end - start))).toBeLessThan(4096);
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

  it("covers the fixed 2:1 atlas with bounded Voronoi fixtures", async () => {
    const bundle = createMadMapperFixtureBundle(await flagshipContract());
    const fixtures = fixturePoints(bundle.svg);

    expect(fixtures).toHaveLength(2_624);
    for (const points of fixtures) {
      expect(points.length).toBeGreaterThanOrEqual(3);
      const xs = points.map(([x]) => x);
      const ys = points.map(([, y]) => y);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs)).toBeLessThanOrEqual(4096);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...ys)).toBeLessThanOrEqual(2048);
    }
    const coveredArea = fixtures.reduce((area, points) => area + polygonArea(points), 0);
    expect(Math.abs(coveredArea - 4096 * 2048)).toBeLessThan(20);
  });

  it("gives neighboring cells shared polygon boundaries", async () => {
    const bundle = createMadMapperFixtureBundle(await flagshipContract());
    const fixtures = fixturePoints(bundle.svg);
    const segmentUses = new Map<string, number>();
    for (const points of fixtures) {
      points.forEach((point, index) => {
        const key = segmentKey(point, points[(index + 1) % points.length]!);
        segmentUses.set(key, (segmentUses.get(key) ?? 0) + 1);
      });
    }
    const sharedSegments = [...segmentUses.values()].filter((uses) => uses === 2);
    expect(sharedSegments.length).toBeGreaterThan(2_500);
    expect([...segmentUses.values()].every((uses) => uses <= 2)).toBe(true);
  });

  it("divides the complete top and bottom atlas edges between several LEDs", async () => {
    const bundle = createMadMapperFixtureBundle(await flagshipContract());
    const fixtures = fixturePoints(bundle.svg);
    expectDividedBoundary(boundaryIntervals(fixtures, 0));
    expectDividedBoundary(boundaryIntervals(fixtures, 2048));
  });

  it("keeps every physical Art-Net assignment unchanged", async () => {
    const bundle = createMadMapperFixtureBundle(await flagshipContract());
    const assignments = [...bundle.svg.matchAll(
      /<polygon [^>]*universe="(\d+)" channel="(\d+)"/g,
    )].map((match) => ({ universe: Number(match[1]), channel: Number(match[2]) }));
    expect(assignments).toHaveLength(2_624);
    expect(assignments).toEqual(Array.from(
      { length: 2_624 },
      (_, physicalIndex) => madMapperAddressForPixel(physicalIndex),
    ));
    expect(bundle.manifest.mappingFingerprint).toBe("e9fe0e65");
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
