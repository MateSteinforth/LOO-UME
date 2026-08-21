import type { ManifoldToplevel } from "manifold-3d";
import type { CrossSection } from "manifold-3d";

/** 5x7 bitmap rows, MSB = left column. Covers simulator panel IDs such as P-01. */
const GLYPH_5X7: Record<string, number[]> = {
  " ": [0, 0, 0, 0, 0, 0, 0],
  "-": [0, 0, 0, 0b01110, 0, 0, 0],
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  "3": [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
};

const PIXEL_COLUMNS = 5;
const PIXEL_ROWS = 7;
const CHAR_STEP = 6;

function pixelSquare(
  wasm: ManifoldToplevel,
  column: number,
  row: number,
  pixel: number,
): CrossSection {
  const x0 = column * pixel;
  const y0 = (PIXEL_ROWS - 1 - row) * pixel;
  return new wasm.CrossSection([[
    [x0, y0],
    [x0 + pixel, y0],
    [x0 + pixel, y0 + pixel],
    [x0, y0 + pixel],
  ]]);
}

/**
 * Builds a 2D panel-ID label in the XY plane, origin at the string centre.
 * X increases to the right and Y upward as read from +Z.
 */
export function panelIdLabelSection(
  wasm: ManifoldToplevel,
  text: string,
  pixel = 0.62,
): CrossSection | undefined {
  const characters = [...text].filter((character) => GLYPH_5X7[character]);
  if (characters.length === 0) return undefined;
  const squares: CrossSection[] = [];
  characters.forEach((character, index) => {
    const glyph = GLYPH_5X7[character]!;
    const xOffset = index * CHAR_STEP;
    glyph.forEach((rowBits, row) => {
      for (let column = 0; column < PIXEL_COLUMNS; column += 1) {
        if ((rowBits & (1 << (PIXEL_COLUMNS - 1 - column))) === 0) continue;
        squares.push(pixelSquare(wasm, xOffset + column, row, pixel));
      }
    });
  });
  if (squares.length === 0) return undefined;
  let combined = squares[0]!;
  for (const extra of squares.slice(1)) {
    const next = combined.add(extra);
    combined.delete();
    extra.delete();
    combined = next;
  }
  const width = characters.length * CHAR_STEP * pixel - pixel;
  const height = PIXEL_ROWS * pixel;
  return combined.translate(-width / 2, -height / 2);
}

export function panelIdLabelSize(text: string, pixel = 0.62): {
  width: number;
  height: number;
} {
  const characters = [...text].filter((character) => GLYPH_5X7[character]);
  return {
    width: Math.max(0, characters.length * CHAR_STEP * pixel - pixel),
    height: PIXEL_ROWS * pixel,
  };
}
