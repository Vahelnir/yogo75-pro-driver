/** Physical layout of the Yogo 75 PRO, to draw it. Units are key widths, from the top-left corner. */

/** A key's rectangle, in key units. */
export interface KeyRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Matrix indices left to right, one row per line, as the hub's /keymaps/yogo_75pro.json orders them. Its widths
// include its gaps; these are the standard 75 % ANSI ones. 31 and 63 sit in the right column, below 30 and 62.
const GRID = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
  [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 31],
  [48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 61, 62],
  [64, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 77, 78, 63],
  [80, 81, 82, 85, 89, 90, 92, 93, 94, 95],
];

/** Keys wider than 1, by index. */
const WIDTHS: Record<number, number> = {
  29: 2, // Backspace
  32: 1.5, // Tab
  45: 1.5, // backslash
  48: 1.75, // Caps Lock
  61: 2.25, // Enter
  64: 2.25, // left Shift
  77: 1.75, // right Shift
  80: 1.25,
  81: 1.25,
  82: 1.25,
  85: 6.25, // Space
};

/** Left edge of the column right of the grid: the knob, then the two side buttons under it. */
const SIDE_X = 16.5;

/** The knob; its actions are in each layer, past the matrix (`KNOB_LEFT`…). */
export const KNOB: KeyRect = { x: SIDE_X, y: 0, w: 2, h: 2 };

/** Every key that exists, by matrix index: the 84 of the grid, then the side buttons 46 (top) and 47. */
export const LAYOUT: ReadonlyMap<number, KeyRect> = new Map([
  ...GRID.flatMap((row, y) => {
    let x = 0;
    return row.map((index): [number, KeyRect] => {
      const w = WIDTHS[index] ?? 1;
      const rect = { x, y, w, h: 1 };
      x += w;
      return [index, rect];
    });
  }),
  [46, { x: SIDE_X + 0.5, y: 2.5, w: 1, h: 1 }],
  [47, { x: SIDE_X + 0.5, y: 3.5, w: 1, h: 1 }],
]);
