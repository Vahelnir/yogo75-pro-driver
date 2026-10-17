/** Key positions in the 6 × 16 matrix: `index = row × 16 + col`. */
import { fromHex, hex } from "./bytes.ts";
import { keycode, keycodeName } from "./keycode.ts";

export const ROWS = 6;
export const COLS = 16;
/** Matrix slots used; a layer read holds 16 more, always zero. */
export const KEYS = ROWS * COLS;
const CODE_BYTES = 3;

// Read from the keyboard with get_default_key_matrix 1 (0x16), one row per line.
const FACTORY_LAYER0 = fromHex(
  [
    "100029 10003a 10003b 10003c 10003d 10003e 10003f 100040 100041 100042 100043 100044 100045 100046 100049 10004c",
    "100035 10001e 10001f 100020 100021 100022 100023 100024 100025 100026 100027 10002d 10002e 10002a 10004a 10004d",
    "10002b 100014 10001a 100008 100015 100017 10001c 100018 10000c 100012 100013 10002f 100030 100031 30cb01 30cf00",
    "100039 100004 100016 100007 100009 10000a 10000b 10000d 10000e 10000f 100033 100034 100032 100028 10004b 10004e",
    "100200 100064 10001d 10001b 100006 100019 100005 100011 100010 100036 100037 100038 100000 102000 100052 100000",
    "100100 100800 100400 100000 100000 10002c 100000 100000 100000 104000 500200 100000 101000 100050 100051 10004f",
  ].join(""),
);

/** The `index`-th 3-byte code of a layer. */
export function keyAt(map: Uint8Array, index: number): Uint8Array {
  return map.subarray(index * CODE_BYTES, (index + 1) * CODE_BYTES);
}

/** The KEYS names of a layer, by index. */
export function keyNames(map: Uint8Array): string[] {
  return Array.from({ length: KEYS }, (_, i) => keycodeName(keyAt(map, i)));
}

/** A position as `row,col` or as the name of its key on factory layer 0 (`CAPS`); throws if not exactly one. */
export function keyIndex(position: string): number {
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
  const matches = [...Array(KEYS).keys()].filter(
    (i) => hex(keyAt(FACTORY_LAYER0, i)) === code,
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
