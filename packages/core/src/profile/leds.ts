/** `leds.<position>: "#rrggbb"`: the per-key colours, by key position. */
import { fromHex, hex } from "../bytes.ts";
import { keyIndex, KEYS, positionName } from "../keymap.ts";
import { entries, text, type Section } from "./section.ts";

const NO = -1;
/** Key index → LED number, one matrix row per line: firmware 1.26's table at 0x0204b816 (code), equal to the 0x32 read. */
// prettier-ignore
const KEY_LEDS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 45,
  31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, NO, NO,
  46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, NO, 58, 59, 73,
  60, NO, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, NO, 71, 72, NO,
  74, 75, 76, NO, NO, 77, NO, NO, NO, 78, 79, NO, 80, 81, 82, 83,
];
const COLOR = /^#[0-9a-f]{6}$/i;
const RGB = 3;

// shortcut: LEDs past 83 (the dot screen's pixels) have no key and always take the base's value; give them a key if the firmware is found reading them in mode 253
export const leds: Section = {
  key: "leds",

  toYaml(state, base, full) {
    const colors = new Map<string, string>();
    for (let index = 0; index < KEYS; index++) {
      const color = colorAt(state.leds, index);
      if (
        color !== undefined &&
        (full || color !== colorAt(base.leds, index))
      ) {
        colors.set(positionName(index), color);
      }
    }

    return colors.size ? colors : undefined;
  },

  fromYaml(node, _, state, problems) {
    const seen = new Map<number, string>();
    for (const { key, keyNode, value, path } of entries(
      node,
      "leds",
      problems,
    )) {
      let index;
      try {
        index = keyIndex(key);
      } catch (e) {
        problems.add(keyNode, path, (e as Error).message);
        continue;
      }

      const led = KEY_LEDS[index] ?? NO;
      if (led === NO) {
        problems.add(keyNode, path, "this key has no LED");
        continue;
      }

      if (seen.has(index)) {
        problems.add(keyNode, path, `same key as ${seen.get(index)}`);
        continue;
      }
      seen.set(index, path);

      const color = text(value);
      if (color === undefined || !COLOR.test(color)) {
        problems.add(value ?? keyNode, path, "must be a colour #rrggbb");
        continue;
      }

      state.leds.set(fromHex(color.slice(1)), led * RGB);
    }
  },
};

/** `#rrggbb` of the key at `index`, or undefined for a key with no LED. */
function colorAt(area: Uint8Array, index: number): string | undefined {
  const led = KEY_LEDS[index];
  if (led === NO) {
    return undefined;
  }

  return `#${hex(area.subarray(led * RGB, led * RGB + RGB)).replaceAll(" ", "")}`;
}
