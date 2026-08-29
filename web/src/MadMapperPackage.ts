import { zipSync } from "fflate";
import type { HardwareMappingContract } from "./HardwareMapping.ts";
import {
  createMadMapperFixtureBundle,
  type MadMapperPatchManifest,
} from "./MadMapperExport.ts";

const textEncoder = new TextEncoder();

export interface MadMapperPackageOptions {
  startUniverse?: number;
}

function jsonBytes(value: unknown): Uint8Array {
  return textEncoder.encode(JSON.stringify(value, null, 2) + "\n");
}

function safeFolderName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "sculpture";
}

function createLoopbackUnicastRoutingTable(
  manifest: MadMapperPatchManifest,
): Uint8Array {
  const lines = [
    "IP,Short Name,Universe,Active (0 or 1),Long Name,Remapped (0 or 1),Remapped Universe,Was Autodetected (via polling - 0 or 1)",
  ];
  for (
    let universe = manifest.startUniverse;
    universe <= manifest.endUniverse;
    universe += 1
  ) {
    lines.push(
      `127.0.0.1,LOO-UME,${universe},1,LOO-UME MadMapper preview,0,0,0`,
    );
  }
  return textEncoder.encode(lines.join("\n") + "\n");
}

function asciiPdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7e]/g, "?")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function wrapLine(value: string, width = 78): string[] {
  if (value.length <= width) return [value];
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line === "" ? word : `${line} ${word}`;
    if (next.length > width && line !== "") {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

function guideLines(
  sculptureId: string,
  manifest: MadMapperPatchManifest,
): string[] {
  const boundaryPanel = manifest.panels.find(
    (panel) => panel.startAddress.universe !== panel.endAddress.universe,
  );
  return [
    "LOO/UME MADMAPPER SETUP GUIDE",
    "DRAFT - ART-NET HARDWARE SETTINGS REQUIRE LIVE-010 VALIDATION",
    "",
    `Sculpture: ${sculptureId}`,
    `Mapping fingerprint: ${manifest.mappingFingerprint}`,
    `MadMapper: ${manifest.minimumMadMapperVersion} or later`,
    `Patch: ${manifest.pixelFixtureCount} individual RGB fixtures in ${manifest.panelFixtureCount} panel groups`,
    `Address range: universe ${manifest.startUniverse}, channel 1 through universe ${manifest.endUniverse}, channel ${manifest.panels.at(-1)?.endAddress.channel ?? "?"}`,
    "",
    "IMPORT FIXTURES",
    "1. Extract this ZIP and open MadMapper 6.1 or later.",
    "2. Select File > Import Fixtures and choose fixtures.svg.",
    `3. Confirm ${manifest.panelFixtureCount} panel groups and ${manifest.pixelFixtureCount} individual RGB fixtures.`,
    "4. Confirm the fixture definition is Generic - Pixel RGB.",
    "5. In the fixture definition, enable Avoid Cross Universe Pixels.",
    boundaryPanel
      ? `6. Open the DMX Monitor. ${boundaryPanel.id} must start at universe ${boundaryPanel.startAddress.universe}, channel ${boundaryPanel.startAddress.channel},`
      : "6. Open the DMX Monitor and inspect the first and last fixture addresses.",
    boundaryPanel
      ? `   cross the boundary, and end at universe ${boundaryPanel.endAddress.universe}, channel ${boundaryPanel.endAddress.channel}.`
      : "",
    "",
    "LOCAL LOO/UME PREVIEW",
    "1. In Preferences > Project > DMX, select Art-Net, lo0 / 127.0.0.1, and 30 FPS.",
    "2. Enable Use Unicast and disable Enable Universe Synchronization.",
    "3. Import artnet-unicast-loopback.csv in the ArtNet Interface table.",
    "4. Start the MadMapper preview in LOO/UME.",
    "",
    "ART-NET OUTPUT - HARDWARE REVIEW VALUES",
    "1. Add or enable a DMX output and select Art-Net.",
    "2. Select the wired Ethernet interface connected to the ESP32 network.",
    "3. Select unicast and enter the ESP32 Ethernet IP address.",
    `4. Use start universe ${manifest.startUniverse}; the patch uses ${manifest.universeCount} consecutive universes.`,
    "5. Start review at 30 FPS. LIVE-010 will select the final proven FPS.",
    "6. Do not claim ArtSync/universe-sync behavior until LIVE-010 validates it.",
    "",
    "WLED ART-NET INPUT - HARDWARE REVIEW VALUES",
    `1. Use UDP port 6454, Multiple RGB mode, start universe ${manifest.startUniverse}, DMX address 1.`,
    "2. Use physical realtime addressing: Main Segment Only off and",
    "   Respect LED Maps for realtime data off.",
    "3. Native WLED effects continue to use the installed ledmap.",
    "4. Keep a finite realtime timeout and the selected native-preset fallback.",
    "",
    "BOUNDED TEST",
    "1. Black out all fixtures before connecting powered panels.",
    "2. Test one low-brightness RGB pixel at physical index 0.",
    `3. Test physical indices 169 and 170 across universe ${manifest.startUniverse} to ${manifest.startUniverse + 1}.`,
    boundaryPanel
      ? `4. Test the four corners of ${boundaryPanel.id} to confirm physical pixel placement.`
      : "4. Test the four corners of one panel to confirm physical pixel placement.",
    "5. Stop if an address, RGB channel, or orientation is wrong.",
    "",
    "The SVG, CSV, JSON, WLED deployment, and device must have the same",
    "mapping fingerprint and physical route before release.",
  ].flatMap((line) => wrapLine(line));
}

export function createMadMapperSettingsPdf(
  sculptureId: string,
  manifest: MadMapperPatchManifest,
): Uint8Array {
  const lines = guideLines(sculptureId, manifest);
  if (lines.length > 49) {
    throw new Error("MadMapper settings PDF exceeds one page.");
  }
  const content = [
    "BT",
    "/F1 10 Tf",
    "48 798 Td",
    "14 TL",
    ...lines.flatMap((line) => [`(${asciiPdfText(line)}) Tj`, "T*"]),
    "ET",
    "",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${textEncoder.encode(content).length} >>\nstream\n${content}endstream`,
  ];
  let document = "%PDF-1.4\n%LOOUME\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(textEncoder.encode(document).length);
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = textEncoder.encode(document).length;
  document += `xref\n0 ${objects.length + 1}\n`;
  document += "0000000000 65535 f \n";
  document += offsets.slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  document += `startxref\n${xrefOffset}\n%%EOF\n`;
  return textEncoder.encode(document);
}

export function createMadMapperPackageFiles(
  contract: HardwareMappingContract,
  sculptureId: string,
  options: MadMapperPackageOptions = {},
): Map<string, Uint8Array> {
  const bundle = createMadMapperFixtureBundle(contract, options);
  return new Map([
    ["fixtures.svg", textEncoder.encode(bundle.svg)],
    [
      "artnet-unicast-loopback.csv",
      createLoopbackUnicastRoutingTable(bundle.manifest),
    ],
    ["patch.csv", textEncoder.encode(bundle.patchCsv)],
    ["manifest.json", jsonBytes(bundle.manifest)],
    ["SETUP.pdf", createMadMapperSettingsPdf(sculptureId, bundle.manifest)],
  ]);
}

export function createMadMapperPackageZip(
  contract: HardwareMappingContract,
  sculptureId: string,
  options: MadMapperPackageOptions = {},
): Uint8Array {
  const folder = `${safeFolderName(sculptureId)}-madmapper`;
  const entries: Record<string, Uint8Array> = {};
  for (const [path, bytes] of createMadMapperPackageFiles(
    contract,
    sculptureId,
    options,
  )) {
    entries[`${folder}/${path}`] = Uint8Array.from(bytes);
  }
  return zipSync(entries, {
    level: 6,
    mtime: new Date("1980-01-01T00:00:00.000Z"),
  });
}
