const textEncoder = new TextEncoder();

const MILLIMETRES_TO_POINTS = 72 / 25.4;

export const HERMA_4385_SHEET = {
  articleNumber: "4385",
  pageWidthMm: 210,
  pageHeightMm: 297,
  labelDiameterMm: 10,
  columns: 15,
  rows: 21,
  horizontalGapMm: 20 / 7,
  verticalGapMm: 2.85,
  leftMarginMm: 10,
  rightMarginMm: 10,
  topMarginMm: 15,
  bottomMarginMm: 15,
} as const;

export interface PanelLabelPlacement {
  panelId: string;
  pageIndex: number;
  column: number;
  row: number;
  centerXmm: number;
  centerYmmFromTop: number;
}

function pdfText(value: string): string {
  if (!/^[\x20-\x7e]+$/.test(value)) {
    throw new Error(
      `Panel label ${JSON.stringify(value)} must use printable ASCII characters.`,
    );
  }
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function point(valueMm: number): number {
  return valueMm * MILLIMETRES_TO_POINTS;
}

function number(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, "");
}

export function layoutHerma4385PanelLabels(
  panelIds: readonly string[],
): PanelLabelPlacement[] {
  const uniqueIds = new Set<string>();
  for (const panelId of panelIds) {
    if (panelId.length === 0 || uniqueIds.has(panelId)) {
      throw new Error("Panel labels require unique non-empty panel IDs.");
    }
    pdfText(panelId);
    uniqueIds.add(panelId);
  }
  const perPage = HERMA_4385_SHEET.columns * HERMA_4385_SHEET.rows;
  const pitchX = HERMA_4385_SHEET.labelDiameterMm +
    HERMA_4385_SHEET.horizontalGapMm;
  const pitchY = HERMA_4385_SHEET.labelDiameterMm +
    HERMA_4385_SHEET.verticalGapMm;
  return panelIds.map((panelId, index) => {
    const indexOnPage = index % perPage;
    const column = indexOnPage % HERMA_4385_SHEET.columns;
    const row = Math.floor(indexOnPage / HERMA_4385_SHEET.columns);
    return {
      panelId,
      pageIndex: Math.floor(index / perPage),
      column,
      row,
      centerXmm: HERMA_4385_SHEET.leftMarginMm +
        HERMA_4385_SHEET.labelDiameterMm / 2 + column * pitchX,
      centerYmmFromTop: HERMA_4385_SHEET.topMarginMm +
        HERMA_4385_SHEET.labelDiameterMm / 2 + row * pitchY,
    };
  });
}

function labelContent(placements: readonly PanelLabelPlacement[]): string {
  const availableWidthPoints = point(HERMA_4385_SHEET.labelDiameterMm - 1.4);
  return placements.map((placement) => {
    const fontSize = Math.min(
      7,
      availableWidthPoints / Math.max(1, placement.panelId.length * 0.6),
    );
    const textWidth = placement.panelId.length * fontSize * 0.6;
    const x = point(placement.centerXmm) - textWidth / 2;
    const y = point(
      HERMA_4385_SHEET.pageHeightMm - placement.centerYmmFromTop,
    ) - fontSize * 0.34;
    return [
      "BT",
      `/F1 ${number(fontSize)} Tf`,
      `1 0 0 1 ${number(x)} ${number(y)} Tm`,
      `(${pdfText(placement.panelId)}) Tj`,
      "ET",
    ].join("\n");
  }).join("\n");
}

/**
 * Create a 100%-scale A4 label sheet for HERMA 4385.
 * Stock geometry is calibrated from the operator's physical HERMA 4385 sheet.
 * Printer registration is not part of the document geometry.
 * Product reference:
 * https://www.herma.de/fileadmin/Buero-Zuhause/downloads/Stanzvorlagen/4385_SV.pdf
 */
export function createHerma4385PanelLabelsPdf(
  panelIds: readonly string[],
): Uint8Array {
  if (panelIds.length === 0) {
    throw new Error("Panel label PDF requires at least one panel.");
  }
  const placements = layoutHerma4385PanelLabels(panelIds);
  const pageCount = placements.at(-1)!.pageIndex + 1;
  const fontObjectId = 3 + pageCount * 2;
  const objects: string[] = [];
  const pageObjectIds = Array.from(
    { length: pageCount },
    (_, index) => 3 + index * 2,
  );
  objects.push(
    "<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None /PickTrayByPDFSize true >> >>",
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  );
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const content = labelContent(
      placements.filter((placement) => placement.pageIndex === pageIndex),
    ) + "\n";
    const contentObjectId = 4 + pageIndex * 2;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${number(point(HERMA_4385_SHEET.pageWidthMm))} ${number(point(HERMA_4385_SHEET.pageHeightMm))}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
      `<< /Length ${textEncoder.encode(content).length} >>\nstream\n${content}endstream`,
    );
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>");

  let document = "%PDF-1.7\n%LOOUME-HERMA-4385\n";
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
