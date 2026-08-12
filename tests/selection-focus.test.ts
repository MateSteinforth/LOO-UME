import { describe, expect, it } from "vitest";
import {
  focusedGrey,
  isBackgroundClick,
  selectionDisplayColor,
} from "../web/src/SelectionFocus.ts";

describe("selection focus", () => {
  it("uses linear luminance and exactly 60% brightness", () => {
    const result = focusedGrey({ r: 0.8, g: 0.25, b: 0.1 });
    const expected = (0.2126 * 0.8 + 0.7152 * 0.25 + 0.0722 * 0.1) * 0.6;
    expect(result).toEqual({ r: expected, g: expected, b: expected });
  });

  it("keeps selected-panel colors and focuses every other owner", () => {
    const base = { r: 0.7, g: 0.2, b: 0.4 };
    expect(selectionDisplayColor(base, "P-01", "P-01")).toEqual(base);
    expect(selectionDisplayColor(base, "P-02", "P-01")).toEqual(
      focusedGrey(base),
    );
    expect(selectionDisplayColor(base, null, "P-01")).toEqual(
      focusedGrey(base),
    );
  });

  it("derives focused WLED colors from each new frame and restores that frame", () => {
    const first = { r: 1, g: 0, b: 0 };
    const next = { r: 0, g: 0.5, b: 1 };
    expect(selectionDisplayColor(first, "P-02", "P-01")).toEqual(
      focusedGrey(first),
    );
    expect(selectionDisplayColor(next, "P-02", "P-01")).toEqual(
      focusedGrey(next),
    );
    expect(selectionDisplayColor(next, "P-02", null)).toBe(next);
  });
});

describe("background gestures", () => {
  const candidate = { pointerId: 7, x: 100, y: 200 };

  it("classifies a stationary or threshold-distance gesture as a click", () => {
    expect(isBackgroundClick(candidate, 7, 100, 200)).toBe(true);
    expect(isBackgroundClick(candidate, 7, 103, 204)).toBe(true);
  });

  it("preserves selection for orbit movement and mismatched pointers", () => {
    expect(isBackgroundClick(candidate, 7, 106, 200)).toBe(false);
    expect(isBackgroundClick(candidate, 8, 100, 200)).toBe(false);
  });
});
