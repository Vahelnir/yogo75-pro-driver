/** Key positions in the 6 × 16 matrix: `index = row × 16 + col`. */
import { BASES } from "./base.ts";
import { hex } from "./bytes.ts";
import { keycode, keycodeName } from "./keycode.ts";

export const ROWS = 6;
export const COLS = 16;
/** Matrix slots used; a layer read holds 16 more, always zero. */
export const KEYS = ROWS * COLS;
export const CODE_BYTES = 3;
/** The knob's slots, past the matrix in each layer: rotate left, rotate right, press. */
export const KNOB_LEFT = 112;
export const KNOB_RIGHT = 113;
export const KNOB_PRESS = 114;
export const KNOB_BYTES = 3 * CODE_BYTES;
const KNOB_POSITIONS: Record<string, number> = {
  KNOB_LEFT,
  KNOB_RIGHT,
  KNOB_PRESS,
};

/** The `index`-th 3-byte code of a layer. */
export function keyAt(map: Uint8Array, index: number): Uint8Array {
  return map.subarray(index * CODE_BYTES, (index + 1) * CODE_BYTES);
}

/** The KEYS names of a layer, by index. */
export function keyNames(map: Uint8Array): string[] {
  return Array.from({ length: KEYS }, (_, i) => keycodeName(keyAt(map, i)));
}

/** The names of a layer's knob actions. */
export function knobNames(map: Uint8Array): {
  left: string;
  right: string;
  press: string;
} {
  return {
    left: keycodeName(keyAt(map, KNOB_LEFT)),
    right: keycodeName(keyAt(map, KNOB_RIGHT)),
    press: keycodeName(keyAt(map, KNOB_PRESS)),
  };
}

/**
 * A position as `row,col`, as the name of its key on factory layer 0 (`CAPS`) or as a knob action
 * (`KNOB_LEFT`, `KNOB_RIGHT`, `KNOB_PRESS`); throws if not exactly one.
 */
export function keyIndex(position: string): number {
  const knob = KNOB_POSITIONS[position.trim().toUpperCase()];
  if (knob !== undefined) {
    return knob;
  }

  const rowCol = position.match(/^\s*(\d+)\s*,\s*(\d+)\s*$/);
  if (rowCol) {
    const [row, col] = [Number(rowCol[1]), Number(rowCol[2])];
    if (row >= ROWS) {
      throw new Error(`row must be 0-${ROWS - 1}`);
    }

    if (col >= COLS) {
      throw new Error(`col must be 0-${COLS - 1}`);
    }

    return row * COLS + col;
  }

  const code = hex(keycode(position));
  // every base has the same layer 0 names; the first is the reference
  const layer0 = BASES[0].keymaps[0];
  const matches = [...Array(KEYS).keys()].filter(
    (i) => hex(keyAt(layer0, i)) === code,
  );
  if (matches.length === 0) {
    throw new Error(`no factory key ${position}: use row,col`);
  }

  if (matches.length > 1) {
    throw new Error(
      `${position} is ambiguous (indices ${matches.join(", ")}): use row,col`,
    );
  }

  return matches[0];
}
