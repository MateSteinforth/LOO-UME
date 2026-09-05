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
    match[1]!
      .split(" ")
      .map((point) => point.split(",").map(Number) as [number, number]),
  );
}

function rectangleBounds(points: Array<[number, number]>) {
  return {
    minX: Math.min(...points.map(([x]) => x)),
    maxX: Math.max(...points.map(([x]) => x)),
    minY: Math.min(...points.map(([, y]) => y)),
    maxY: Math.max(...points.map(([, y]) => y)),
  };
}

describe("MadMapper fixture export", () => {
  it("patches the flagship as 2,624 pose-positioned physical pixels", async () => {
    const contract = await flagshipContract();
    const bundle = createMadMapperFixtureBundle(contract);

    expect(bundle.manifest).toMatchObject({
      schemaVersion: "1.2.0",
      minimumMadMapperVersion: "6.1",
      mappingFingerprint: "524500f5",
      addressOrder: "physical-wire-order",
      fixtureLayout: "individual-physical-pixels",
      panelFixtureCount: 41,
      pixelFixtureCount: 2_624,
      pixelCount: 2_624,
      startUniverse: 1,
      endUniverse: 16,
      universeCount: 16,
      requiredMadMapperSettings: { avoidCrossUniversePixels: true },
      plannedLiveOutput: {
        transport: "LOO/UME-WLAN-DDP",
        status: "requires-LIVE-020-hardware-validation",
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
    expect(bundle.svg).toContain(
      'width="4096" height="2048" viewBox="0 0 4096 2048"',
    );
    expect(bundle.svg).toContain('fixture_definition="Generic - Pixel RGB"');
    expect(bundle.svg).not.toContain("Generic – Pixel RGB");
    expect(bundle.svg).not.toContain("matrix_width=");
    expect(bundle.svg).toContain('id="SQ-03-pixel-0-0"');
    expect(bundle.svg).toContain('id="PC-04-pixel-');
    expect(bundle.patchCsv.trim().split("\n")).toHaveLength(42);
  });

  it("centers small fixtures on every LED in the fixed 2:1 atlas", async () => {
    const contract = await flagshipContract();
    const bundle = createMadMapperFixtureBundle(contract);
    const fixtures = fixturePoints(bundle.svg);
    const physicalEntries = [...contract.mapping.entries].sort(
      (first, second) => first.physicalIndex - second.physicalIndex,
    );

    expect(fixtures).toHaveLength(2_624);
    for (const [index, points] of fixtures.entries()) {
      expect(points).toHaveLength(4);
      const bounds = rectangleBounds(points);
      expect(new Set(points.map(([x]) => x)).size).toBe(2);
      expect(new Set(points.map(([, y]) => y)).size).toBe(2);
      expect(bounds.minX).toBeGreaterThanOrEqual(0);
      expect(bounds.maxX).toBeLessThanOrEqual(4096);
      expect(bounds.minY).toBeGreaterThanOrEqual(0);
      expect(bounds.maxY).toBeLessThanOrEqual(2048);
      const entry = physicalEntries[index]!;
      const siteX = ((entry.u - 0.2 + 1) % 1) * 4096;
      const siteY = entry.v * 2048;
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      expect(Math.abs(centerX - siteX)).toBeLessThan(0.000002);
      expect(Math.abs(centerY - siteY)).toBeLessThan(0.000002);
      expect(bounds.maxX - bounds.minX).toBeGreaterThan(0);
      expect(bounds.maxY - bounds.minY).toBeGreaterThan(0);
      expect(bounds.maxX - bounds.minX).toBeLessThanOrEqual(1.000001);
      expect(bounds.maxY - bounds.minY).toBeLessThanOrEqual(1.000001);
      // Test several diagonal edges in both directions against the authored samples.
      for (const slope of [-0.5, 0.5]) {
        for (const offset of [256, 768, 1280, 1792]) {
          expect(centerY > slope * centerX + offset).toBe(
            siteY > slope * siteX + offset,
          );
        }
      }
    }
  });

  it("does not give two fixtures overlapping interiors", async () => {
    const bundle = createMadMapperFixtureBundle(await flagshipContract());
    const bounds = fixturePoints(bundle.svg).map(rectangleBounds);
    let overlap: [number, number] | undefined;
    for (let first = 0; first < bounds.length; first += 1) {
      for (let second = first + 1; second < bounds.length; second += 1) {
        const overlapWidth =
          Math.min(bounds[first]!.maxX, bounds[second]!.maxX) -
          Math.max(bounds[first]!.minX, bounds[second]!.minX);
        const overlapHeight =
          Math.min(bounds[first]!.maxY, bounds[second]!.maxY) -
          Math.max(bounds[first]!.minY, bounds[second]!.minY);
        if (overlapWidth > 0.001 && overlapHeight > 0.001) {
          overlap = [first, second];
          break;
        }
      }
      if (overlap) break;
    }
    expect(overlap).toBeUndefined();
  });

  it("keeps seam and pole samples inside the frame without a material center shift", async () => {
    const contract = structuredClone(await flagshipContract());
    contract.mapping.entries[0]!.u = 0.2;
    contract.mapping.entries[0]!.v = 0;
    contract.mapping.entries[1]!.u = 0.7;
    contract.mapping.entries[1]!.v = 1;
    const bundle = createMadMapperFixtureBundle(contract);
    const physicalEntries = [...contract.mapping.entries].sort(
      (first, second) => first.physicalIndex - second.physicalIndex,
    );
    for (const [index, points] of fixturePoints(bundle.svg).entries()) {
      const bounds = rectangleBounds(points);
      const entry = physicalEntries[index]!;
      expect(bounds.minX).toBeGreaterThanOrEqual(0);
      expect(bounds.maxX).toBeLessThanOrEqual(4096);
      expect(bounds.minY).toBeGreaterThanOrEqual(0);
      expect(bounds.maxY).toBeLessThanOrEqual(2048);
      expect(bounds.maxX).toBeGreaterThan(bounds.minX);
      expect(bounds.maxY).toBeGreaterThan(bounds.minY);
      expect(
        Math.abs(
          (bounds.minX + bounds.maxX) / 2 - ((entry.u - 0.2 + 1) % 1) * 4096,
        ),
      ).toBeLessThan(0.000002);
      expect(
        Math.abs((bounds.minY + bounds.maxY) / 2 - entry.v * 2048),
      ).toBeLessThan(0.000002);
    }
  });

  it("keeps every physical Art-Net assignment unchanged", async () => {
    const bundle = createMadMapperFixtureBundle(await flagshipContract());
    const assignments = [
      ...bundle.svg.matchAll(/<polygon [^>]*universe="(\d+)" channel="(\d+)"/g),
    ].map((match) => ({
      universe: Number(match[1]),
      channel: Number(match[2]),
    }));
    expect(assignments).toHaveLength(2_624);
    expect(assignments).toEqual(
      Array.from({ length: 2_624 }, (_, physicalIndex) =>
        madMapperAddressForPixel(physicalIndex),
      ),
    );
    expect(bundle.manifest.mappingFingerprint).toBe("524500f5");
  });

  it("never splits one RGB pixel across universes", () => {
    const addresses = Array.from({ length: 2_624 }, (_, index) =>
      madMapperAddressForPixel(index),
    );
    expect(new Set(addresses.map((address) => address.universe)).size).toBe(16);
    expect(
      new Set(
        addresses.map((address) => `${address.universe}:${address.channel}`),
      ).size,
    ).toBe(2_624);
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
