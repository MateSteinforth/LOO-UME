import { describe, expect, it } from "vitest";
import {
  createHerma4385PanelLabelsPdf,
  HERMA_4385_SHEET,
  layoutHerma4385PanelLabels,
} from "../web/src/PanelLabelSheet.ts";

describe("HERMA 4385 panel label sheet", () => {
  it("uses the exact official 15 by 21 A4 punch geometry", () => {
    expect(HERMA_4385_SHEET).toMatchObject({
      articleNumber: "4385",
      pageWidthMm: 210,
      pageHeightMm: 297,
      labelDiameterMm: 10,
      columns: 15,
      rows: 21,
      horizontalGapMm: 2.7,
      verticalGapMm: 2.7,
      leftMarginMm: 11.1,
      topMarginMm: 16.5,
    });
    const placements = layoutHerma4385PanelLabels(
      Array.from({ length: 315 }, (_, index) => `P-${index + 1}`),
    );
    expect(placements[0]).toMatchObject({
      pageIndex: 0,
      column: 0,
      row: 0,
      centerXmm: 16.1,
      centerYmmFromTop: 21.5,
    });
    expect(placements.at(-1)).toMatchObject({
      pageIndex: 0,
      column: 14,
      row: 20,
      centerYmmFromTop: 275.5,
    });
    expect(placements.at(-1)!.centerXmm).toBeCloseTo(193.9, 10);
  });

  it("creates a deterministic one-page PDF for the 41-panel sculpture", () => {
    const panelIds = Array.from(
      { length: 41 },
      (_, index) => `P-${String(index + 1).padStart(2, "0")}`,
    );
    const first = createHerma4385PanelLabelsPdf(panelIds);
    const second = createHerma4385PanelLabelsPdf(panelIds);
    expect(first).toEqual(second);
    const pdf = new TextDecoder().decode(first);
    expect(pdf.startsWith("%PDF-1.7\n%LOOUME-HERMA-4385")).toBe(true);
    expect(pdf).toContain("/MediaBox [0 0 595.276 841.89]");
    expect(pdf).toContain("/PrintScaling /None");
    expect(pdf).toContain("/Count 1");
    expect(pdf).toContain("(P-01) Tj");
    expect(pdf).toContain("(P-41) Tj");
    expect(pdf).not.toContain("(P-42) Tj");
  });

  it("continues onto another exact sheet without changing label order", () => {
    const panelIds = Array.from({ length: 316 }, (_, index) => `P${index + 1}`);
    const placements = layoutHerma4385PanelLabels(panelIds);
    expect(placements[315]).toMatchObject({
      panelId: "P316",
      pageIndex: 1,
      column: 0,
      row: 0,
      centerXmm: 16.1,
      centerYmmFromTop: 21.5,
    });
    expect(new TextDecoder().decode(
      createHerma4385PanelLabelsPdf(panelIds),
    )).toContain("/Count 2");
  });

  it("fails closed for ambiguous or unsupported physical IDs", () => {
    expect(() => createHerma4385PanelLabelsPdf([])).toThrow(
      "at least one panel",
    );
    expect(() => layoutHerma4385PanelLabels(["P-01", "P-01"])).toThrow(
      "unique non-empty",
    );
    expect(() => layoutHerma4385PanelLabels(["P-α"])).toThrow(
      "printable ASCII",
    );
  });
});
