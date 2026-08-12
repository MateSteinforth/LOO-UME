export const SELECTION_FOCUS_BRIGHTNESS = 0.6;
export const BACKGROUND_CLICK_THRESHOLD_PX = 5;

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface BackgroundPointerCandidate {
  pointerId: number;
  x: number;
  y: number;
}

/** Colors passed here are in the same linear/display space as the output. */
export function focusedGrey(color: RgbColor): RgbColor {
  const luminance =
    0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  const grey = luminance * SELECTION_FOCUS_BRIGHTNESS;
  return { r: grey, g: grey, b: grey };
}

export function selectionDisplayColor(
  base: RgbColor,
  ownerPanelId: string | null,
  selectedPanelId: string | null,
): RgbColor {
  return selectedPanelId !== null && ownerPanelId !== selectedPanelId
    ? focusedGrey(base)
    : base;
}

export function isBackgroundClick(
  candidate: BackgroundPointerCandidate,
  pointerId: number,
  x: number,
  y: number,
): boolean {
  return candidate.pointerId === pointerId &&
    Math.hypot(x - candidate.x, y - candidate.y) <=
      BACKGROUND_CLICK_THRESHOLD_PX;
}
