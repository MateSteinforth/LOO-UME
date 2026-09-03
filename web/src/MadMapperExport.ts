import {
  fingerprintLedmap,
  validateLedmapEquivalence,
  type HardwareMappingContract,
} from "./HardwareMapping.ts";

const CHANNELS_PER_UNIVERSE = 512;
const CHANNELS_PER_RGB_PIXEL = 3;
const RGB_PIXELS_PER_UNIVERSE = 170;
const ATLAS_WIDTH = 4096;
const ATLAS_HEIGHT = 2048;
const FIXTURE_SIZE = 28;
const PROJECTION_WIDTH = Math.min(
  ATLAS_WIDTH - FIXTURE_SIZE,
  2 * (ATLAS_HEIGHT - FIXTURE_SIZE),
);
const PROJECTION_HEIGHT = PROJECTION_WIDTH / 2;
// Use one stable seam for the complete atlas. A one-fifth turn puts the
// flagship seam in its natural longitude gap without per-panel wrapping.
const ATLAS_LONGITUDE_SEAM = 0.2;
const FIXTURE_DEFINITION = "Generic - Pixel RGB";

export interface MadMapperExportOptions {
  startUniverse?: number;
}

export interface MadMapperAddress {
  universe: number;
  channel: number;
}

export interface MadMapperPanelPatch {
  id: string;
  outputIndex: number;
  chainPosition: number;
  physicalStart: number;
  physicalEnd: number;
  pixelCount: number;
  startAddress: MadMapperAddress;
  endAddress: MadMapperAddress;
  installedAddressTransform: HardwareMappingContract["mapping"]["panels"][number]["installedAddressTransform"];
}

export interface MadMapperPatchManifest {
  schemaVersion: "1.1.0";
  generator: "loo-ume-madmapper-svg";
  minimumMadMapperVersion: "6.1";
  mappingFingerprint: string;
  mappingFingerprintVersion: HardwareMappingContract["fingerprintVersion"];
  addressOrder: "physical-wire-order";
  fixtureDefinition: typeof FIXTURE_DEFINITION;
  fixtureLayout: "individual-physical-pixels";
  panelFixtureCount: number;
  pixelFixtureCount: number;
  pixelCount: number;
  channelsPerPixel: typeof CHANNELS_PER_RGB_PIXEL;
  channelsPerUniverse: typeof CHANNELS_PER_UNIVERSE;
  pixelsPerUniverse: typeof RGB_PIXELS_PER_UNIVERSE;
  startUniverse: number;
  endUniverse: number;
  universeCount: number;
  requiredMadMapperSettings: {
    avoidCrossUniversePixels: true;
  };
  requiredWledRealtimeAddressing: {
    useMainSegmentOnly: false;
    realtimeRespectLedMaps: false;
    status: "requires-LIVE-010-hardware-validation";
  };
  panels: MadMapperPanelPatch[];
}

export interface MadMapperFixtureBundle {
  svg: string;
  patchCsv: string;
  manifest: MadMapperPatchManifest;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function madMapperAddressForPixel(
  physicalIndex: number,
  startUniverse = 1,
): MadMapperAddress {
  if (!Number.isInteger(physicalIndex) || physicalIndex < 0) {
    throw new Error("MadMapper physical pixel index must be a non-negative integer.");
  }
  if (!Number.isInteger(startUniverse) || startUniverse < 0 || startUniverse > 32767) {
    throw new Error("MadMapper start universe must be an integer from 0 to 32767.");
  }
  const universe = startUniverse + Math.floor(physicalIndex / RGB_PIXELS_PER_UNIVERSE);
  if (universe > 32767) {
    throw new Error("MadMapper patch exceeds universe 32767.");
  }
  return {
    universe,
    channel: (physicalIndex % RGB_PIXELS_PER_UNIVERSE) * CHANNELS_PER_RGB_PIXEL + 1,
  };
}

function assertExportable(contract: HardwareMappingContract): void {
  if (!contract.readiness.mappingReady) {
    throw new Error(
      "MadMapper export requires a mapping-ready authored route and panel addressing.",
    );
  }
  if (
    contract.mapping.topology !== "panelized-sculpture" ||
    !contract.mapping.panelPixelGrid
  ) {
    throw new Error("MadMapper export requires a panelized pixel-grid mapping.");
  }
  if (fingerprintLedmap(contract.ledmap, contract.fingerprintVersion) !== contract.fingerprint) {
    throw new Error("MadMapper export mapping fingerprint is stale or inconsistent.");
  }
  const equivalenceErrors = validateLedmapEquivalence(contract.mapping, contract.ledmap);
  if (equivalenceErrors.length > 0) {
    throw new Error("MadMapper export ledmap is inconsistent: " + equivalenceErrors.join(" "));
  }
  const physicalIndices = contract.mapping.entries
    .map((entry) => entry.physicalIndex)
    .sort((first, second) => first - second);
  if (physicalIndices.some((index, position) => index !== position)) {
    throw new Error("MadMapper export requires complete physical pixel indices from zero.");
  }
}

interface MadMapperPixelFixture {
  id: string;
  address: MadMapperAddress;
  points: Array<{ x: number; y: number }>;
}

function panelFixtures(
  contract: HardwareMappingContract,
  startUniverse: number,
): Array<{
  patch: MadMapperPanelPatch;
  pixels: MadMapperPixelFixture[];
}> {
  const columns = contract.mapping.panelPixelGrid!.columns;
  const rows = contract.mapping.panelPixelGrid!.rows;
  const pixelsPerPanel = columns * rows;
  const outputByPanel = new Map<string, { outputIndex: number; chainPosition: number }>();
  for (const output of contract.outputs) {
    output.panelIds.forEach((panelId, chainPosition) => {
      outputByPanel.set(panelId, { outputIndex: output.outputIndex, chainPosition });
    });
  }

  return contract.mapping.panels.map((panel) => {
    const entries = contract.mapping.entries
      .filter((entry) => entry.panelId === panel.id)
      .sort((first, second) => first.physicalIndex - second.physicalIndex);
    if (
      entries.length !== pixelsPerPanel ||
      entries.some((entry, offset) => entry.physicalIndex !== entries[0]!.physicalIndex + offset)
    ) {
      throw new Error(`MadMapper panel ${panel.id} is not one contiguous physical matrix.`);
    }
    const route = outputByPanel.get(panel.id);
    if (!route) {
      throw new Error(`MadMapper panel ${panel.id} has no output route.`);
    }
    const halfFixture = FIXTURE_SIZE / 2;
    const pixels = entries.map((entry) => {
      const atlasU = (entry.u - ATLAS_LONGITUDE_SEAM + 1) % 1;
      const centerX = (ATLAS_WIDTH - PROJECTION_WIDTH) / 2 + atlasU * PROJECTION_WIDTH;
      const centerY = (ATLAS_HEIGHT - PROJECTION_HEIGHT) / 2 + entry.v * PROJECTION_HEIGHT;
      return {
        id: `${panel.id}-pixel-${entry.panelPixelX}-${entry.panelPixelY}`,
        address: madMapperAddressForPixel(entry.physicalIndex, startUniverse),
        points: [
          { x: centerX - halfFixture, y: centerY - halfFixture },
          { x: centerX + halfFixture, y: centerY - halfFixture },
          { x: centerX + halfFixture, y: centerY + halfFixture },
          { x: centerX - halfFixture, y: centerY + halfFixture },
        ],
      };
    });
    const physicalStart = entries[0]!.physicalIndex;
    const physicalEnd = entries.at(-1)!.physicalIndex;
    return {
      patch: {
        id: panel.id,
        outputIndex: route.outputIndex,
        chainPosition: route.chainPosition,
        physicalStart,
        physicalEnd,
        pixelCount: pixelsPerPanel,
        startAddress: madMapperAddressForPixel(physicalStart, startUniverse),
        endAddress: madMapperAddressForPixel(physicalEnd, startUniverse),
        installedAddressTransform: panel.installedAddressTransform,
      },
      pixels,
    };
  }).sort(
    (first, second) => first.patch.physicalStart - second.patch.physicalStart,
  );
}

function renderSvg(
  fixtures: ReturnType<typeof panelFixtures>,
  fingerprint: string,
): string {
  const groups = fixtures.map(({ patch, pixels }) => {
    const pixelElements = pixels.map((pixel) => {
      const pointText = pixel.points
        .map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`)
        .join(" ");
      return `    <polygon id="${xmlEscape(pixel.id)}" points="${pointText}" universe="${pixel.address.universe}" channel="${pixel.address.channel}" fixture_type="fixture_quad" fixture_definition="${FIXTURE_DEFINITION}"/>`;
    }).join("\n");
    return [
      `  <g id="${xmlEscape(patch.id)}">`,
      pixelElements,
      "  </g>",
    ].join("\n");
  }).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ATLAS_WIDTH}" height="${ATLAS_HEIGHT}" viewBox="0 0 ${ATLAS_WIDTH} ${ATLAS_HEIGHT}">`,
    "  <title>LOO/UME MadMapper SVG fixtures</title>",
    `  <desc>Individual physical-pixel fixture atlas; mapping fingerprint ${xmlEscape(fingerprint)}</desc>`,
    "  <style>svg { background: black; } * { stroke: white; fill: none; }</style>",
    groups,
    "</svg>",
    "",
  ].join("\n");
}

function renderCsv(panels: MadMapperPanelPatch[]): string {
  const header = [
    "panel_id", "output", "chain_position", "physical_start", "physical_end",
    "pixel_count", "start_universe", "start_channel", "end_universe", "end_channel",
    "quarter_turns_clockwise_back_view", "mirrored",
  ];
  const rows = panels.map((panel) => [
    panel.id,
    panel.outputIndex,
    panel.chainPosition,
    panel.physicalStart,
    panel.physicalEnd,
    panel.pixelCount,
    panel.startAddress.universe,
    panel.startAddress.channel,
    panel.endAddress.universe,
    panel.endAddress.channel,
    panel.installedAddressTransform.quarterTurnsClockwise,
    panel.installedAddressTransform.mirrored,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function createMadMapperFixtureBundle(
  contract: HardwareMappingContract,
  options: MadMapperExportOptions = {},
): MadMapperFixtureBundle {
  assertExportable(contract);
  const startUniverse = options.startUniverse ?? 1;
  madMapperAddressForPixel(0, startUniverse);
  const fixtures = panelFixtures(contract, startUniverse);
  const pixelCount = contract.mapping.entries.length;
  const endUniverse = madMapperAddressForPixel(pixelCount - 1, startUniverse).universe;
  const manifest: MadMapperPatchManifest = {
    schemaVersion: "1.1.0",
    generator: "loo-ume-madmapper-svg",
    minimumMadMapperVersion: "6.1",
    mappingFingerprint: contract.fingerprint,
    mappingFingerprintVersion: contract.fingerprintVersion,
    addressOrder: "physical-wire-order",
    fixtureDefinition: FIXTURE_DEFINITION,
    fixtureLayout: "individual-physical-pixels",
    panelFixtureCount: fixtures.length,
    pixelFixtureCount: pixelCount,
    pixelCount,
    channelsPerPixel: CHANNELS_PER_RGB_PIXEL,
    channelsPerUniverse: CHANNELS_PER_UNIVERSE,
    pixelsPerUniverse: RGB_PIXELS_PER_UNIVERSE,
    startUniverse,
    endUniverse,
    universeCount: endUniverse - startUniverse + 1,
    requiredMadMapperSettings: { avoidCrossUniversePixels: true },
    requiredWledRealtimeAddressing: {
      useMainSegmentOnly: false,
      realtimeRespectLedMaps: false,
      status: "requires-LIVE-010-hardware-validation",
    },
    panels: fixtures.map((fixture) => fixture.patch),
  };
  return {
    svg: renderSvg(fixtures, contract.fingerprint),
    patchCsv: renderCsv(manifest.panels),
    manifest,
  };
}
