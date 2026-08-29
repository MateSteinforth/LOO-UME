import type {
  WiringAssemblyManualModel,
  WiringManualOutput,
} from "./WiringAssemblyManual.ts";

const textEncoder = new TextEncoder();
const PAGE_WIDTH_POINTS = 595;
const PAGE_HEIGHT_POINTS = 842;
const MAX_LINE_CHARACTERS = 88;
const MAX_PAGE_LINES = 55;

function asciiPdfText(value: string): string {
  return value
    .replace(/[^\x20-\x7e]/g, "?")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function wrapLine(value: string): string[] {
  if (value.length <= MAX_LINE_CHARACTERS) return [value];
  const lines: string[] = [];
  let remaining = value;
  while (remaining.length > MAX_LINE_CHARACTERS) {
    const candidate = remaining.slice(0, MAX_LINE_CHARACTERS + 1);
    const split = Math.max(candidate.lastIndexOf(" "), candidate.lastIndexOf("/"));
    const boundary = split > 0 ? split : MAX_LINE_CHARACTERS;
    lines.push(remaining.slice(0, boundary).trimEnd());
    remaining = remaining.slice(boundary).trimStart();
  }
  if (remaining !== "") lines.push(remaining);
  return lines;
}

function outputLines(output: WiringManualOutput): string[] {
  const gpio = output.gpio === null ? "unassigned" : String(output.gpio);
  const lines = [
    `OUTPUT ${output.outputIndex + 1}: ${output.label}`,
    `GPIO ${gpio} | ${output.panels.length} panels | physical LEDs ${output.physicalStart}-${output.physicalEnd}`,
    "",
  ].flatMap(wrapLine);
  output.panels.forEach((panel, index) => {
    lines.push(...[
      `${String(index + 1).padStart(2, "0")}. ${panel.id} | LEDs ${panel.physicalStart}-${panel.physicalEnd} | back-view turn ${panel.turnDegrees} deg CW`,
      `    IN: ${panel.dataIn} -> ${panel.id} DIN (${panel.dinCorner})`,
      `    OUT: ${panel.id} DOUT (${panel.doutCorner}) -> ${panel.dataOut}`,
      "",
    ].flatMap(wrapLine));
  });
  return lines;
}

function paginateLines(
  lines: readonly string[],
  continuationHeading: string,
): string[][] {
  const pages: string[][] = [];
  let offset = 0;
  while (offset < lines.length || pages.length === 0) {
    const prefix = pages.length === 0 ? [] : [continuationHeading, ""];
    const capacity = MAX_PAGE_LINES - prefix.length;
    pages.push([...prefix, ...lines.slice(offset, offset + capacity)]);
    offset += capacity;
  }
  return pages;
}

function coverLines(model: WiringAssemblyManualModel): string[] {
  const mappingStatus = model.mappingReady ? "MAPPING READY" : "DRAFT SUGGESTION";
  return [
    "LOO/UME MANUFACTURING MANUAL",
    "",
    model.sculptureName,
    `Sculpture ID: ${model.sculptureId}`,
    `Status: ${mappingStatus}`,
    `LEDs: ${model.totalPixels} | outputs: ${model.outputs.length} | color order: ${model.colorOrder}`,
    `Pixel order: ${model.pixelOrder}`,
    `Route source: ${model.routeSource} | revision: ${model.routeRevision}`,
    `Mapping fingerprint: ${model.mappingFingerprint}`,
    `Orientation fingerprint: ${model.optimizationFingerprint ?? "not route-optimized"}`,
    "",
    "BUILD SEQUENCE",
    "1. Print the current STL/3MF files in this fabrication ZIP.",
    "2. Print panel-labels-herma-4385.pdf at A4, 100% or Actual size.",
    "3. Put each panel-ID label beside the DIN connector on the PCB back.",
    "4. Install panels at their saved sculpture poses and back-view turns.",
    "5. Wire each output from controller GPIO to DIN, then DOUT to the next DIN.",
    "6. Use the interactive assembly view to isolate the same data connection.",
    "7. Flash and verify the current project before final operation.",
    "",
    "PACKAGE RULES",
    "Only current hash-verified printable files are included. Missing or stale geometry is omitted.",
    "Panel power distribution is separate from this data-wiring manual.",
    "",
    "OUTPUT SUMMARY",
    ...model.outputs.map((output) => {
      const gpio = output.gpio === null ? "unassigned" : String(output.gpio);
      const first = output.panels[0]?.id ?? "empty";
      const last = output.panels.at(-1)?.id ?? "empty";
      return `Output ${output.outputIndex + 1} | GPIO ${gpio} | ${output.panels.length} panels | ${first} -> ${last}`;
    }),
  ].flatMap(wrapLine);
}

function pageContent(lines: readonly string[], pageIndex: number, pageCount: number): string {
  if (lines.length > MAX_PAGE_LINES) {
    throw new Error(`Manufacturing manual page ${pageIndex + 1} exceeds its printable line limit.`);
  }
  const contentLines = [
    ...lines,
    "",
    `Page ${pageIndex + 1} / ${pageCount}`,
  ];
  return [
    "BT",
    "/F1 9 Tf",
    "42 800 Td",
    "13 TL",
    ...contentLines.flatMap((line) => [`(${asciiPdfText(line)}) Tj`, "T*"]),
    "ET",
    "",
  ].join("\n");
}

/** Create a deterministic printable A4 manual from the current wiring contract. */
export function createManufacturingManualPdf(
  model: WiringAssemblyManualModel,
): Uint8Array {
  const pages = [
    ...paginateLines(
      coverLines(model),
      "LOO/UME MANUFACTURING MANUAL (continued)",
    ),
    ...model.outputs.flatMap((output) =>
      paginateLines(
        outputLines(output),
        `OUTPUT ${output.outputIndex + 1} (continued)`,
      )
    ),
  ];
  const pageObjectIds = pages.map((_, index) => 3 + index * 2);
  const fontObjectId = 3 + pages.length * 2;
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>",
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];
  pages.forEach((lines, pageIndex) => {
    const content = pageContent(lines, pageIndex, pages.length);
    const contentObjectId = 4 + pageIndex * 2;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH_POINTS} ${PAGE_HEIGHT_POINTS}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      `<< /Length ${textEncoder.encode(content).length} >>\nstream\n${content}endstream`,
    );
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let document = "%PDF-1.7\n%LOOUME-MANUFACTURING-MANUAL\n";
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
