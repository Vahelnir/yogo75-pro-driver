/**
 * Key names ↔ 3-byte keymap codes (`[type, x, y]`, see docs/protocol.md, "Key encoding"). Names follow QMK:
 * case-insensitive, `KC_` optional; the first name of each entry is the one printed. ATK-only functions get
 * project names in QMK style. Unknown codes print and parse as `0x` + 6 hex digits.
 */
import { fromHex, hex } from "./bytes.ts";

const KEY = 0x10; // [KEY, modifier mask, HID usage]
const CONSUMER = 0x30; // [CONSUMER, usage LE]
const MOUSE_SYSTEM = 0x40;
const FUNCTION = 0x50; // [FUNCTION, function number, 0]
const MACRO = 0x60; // [MACRO, macro number, mode 0-3]
const MACRO_MODES = 4;
const MAX_MACRO = 0xff; // the macro number is one byte

/** HID keyboard usages, as QMK's basic keycodes. */
const HID_KEYS: [number, string][] = [
  [0x00, "NO NONE"],
  ...[..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((c, i): [number, string] => [
    0x04 + i,
    c,
  ]),
  ...[..."1234567890"].map((c, i): [number, string] => [0x1e + i, c]),
  [0x28, "ENT ENTER"],
  [0x29, "ESC ESCAPE"],
  [0x2a, "BSPC BACKSPACE"],
  [0x2b, "TAB"],
  [0x2c, "SPC SPACE"],
  [0x2d, "MINS MINUS"],
  [0x2e, "EQL EQUAL"],
  [0x2f, "LBRC LEFT_BRACKET"],
  [0x30, "RBRC RIGHT_BRACKET"],
  [0x31, "BSLS BACKSLASH"],
  [0x32, "NUHS NONUS_HASH"],
  [0x33, "SCLN SEMICOLON"],
  [0x34, "QUOT QUOTE"],
  [0x35, "GRV GRAVE"],
  [0x36, "COMM COMMA"],
  [0x37, "DOT"],
  [0x38, "SLSH SLASH"],
  [0x39, "CAPS CAPS_LOCK"],
  ...Array.from({ length: 12 }, (_, i): [number, string] => [
    0x3a + i,
    `F${i + 1}`,
  ]),
  [0x46, "PSCR PRINT_SCREEN"],
  [0x47, "SCRL SCROLL_LOCK"],
  [0x48, "PAUS PAUSE BRK"],
  [0x49, "INS INSERT"],
  [0x4a, "HOME"],
  [0x4b, "PGUP PAGE_UP"],
  [0x4c, "DEL DELETE"],
  [0x4d, "END"],
  [0x4e, "PGDN PAGE_DOWN"],
  [0x4f, "RGHT RIGHT"],
  [0x50, "LEFT"],
  [0x51, "DOWN"],
  [0x52, "UP"],
  [0x53, "NUM NUM_LOCK"],
  [0x54, "PSLS KP_SLASH"],
  [0x55, "PAST KP_ASTERISK"],
  [0x56, "PMNS KP_MINUS"],
  [0x57, "PPLS KP_PLUS"],
  [0x58, "PENT KP_ENTER"],
  ...Array.from({ length: 9 }, (_, i): [number, string] => [
    0x59 + i,
    `P${i + 1} KP_${i + 1}`,
  ]),
  [0x62, "P0 KP_0"],
  [0x63, "PDOT KP_DOT"],
  [0x64, "NUBS NONUS_BACKSLASH"],
  [0x65, "APP APPLICATION"],
  [0x66, "KB_POWER"],
  [0x67, "PEQL KP_EQUAL"],
  ...Array.from({ length: 12 }, (_, i): [number, string] => [
    0x68 + i,
    `F${i + 13}`,
  ]),
  [0x74, "EXEC EXECUTE"],
  [0x75, "HELP"],
  [0x76, "MENU"],
  [0x77, "SLCT SELECT"],
  [0x78, "STOP"],
  [0x79, "AGIN AGAIN"],
  [0x7a, "UNDO"],
  [0x7b, "CUT"],
  [0x7c, "COPY"],
  [0x7d, "PSTE PASTE"],
  [0x7e, "FIND"],
  [0x85, "PCMM KP_COMMA"],
  ...Array.from({ length: 9 }, (_, i): [number, string] => [
    0x87 + i,
    `INT${i + 1} INTERNATIONAL_${i + 1}`,
  ]),
  ...Array.from({ length: 9 }, (_, i): [number, string] => [
    0x90 + i,
    `LNG${i + 1} LANGUAGE_${i + 1}`,
  ]),
];

/** Modifier keys are a mask bit with no usage; the same names wrap a key: `LGUI(TAB)`. */
const MODIFIERS: [number, string][] = [
  [0x01, "LCTL LEFT_CTRL"],
  [0x02, "LSFT LEFT_SHIFT"],
  [0x04, "LALT LEFT_ALT LOPT"],
  [0x08, "LGUI LEFT_GUI LCMD LWIN"],
  [0x10, "RCTL RIGHT_CTRL"],
  [0x20, "RSFT RIGHT_SHIFT"],
  [0x40, "RALT RIGHT_ALT ROPT ALGR"],
  [0x80, "RGUI RIGHT_GUI RCMD RWIN"],
];

/** Consumer usages (QMK names), ATK's two extra keys, mouse and system, keyboard functions. */
const OTHERS: [string, string][] = [
  ["30 e2 00", "MUTE AUDIO_MUTE"],
  ["30 e9 00", "VOLU AUDIO_VOL_UP"],
  ["30 ea 00", "VOLD AUDIO_VOL_DOWN"],
  ["30 b5 00", "MNXT MEDIA_NEXT_TRACK"],
  ["30 b6 00", "MPRV MEDIA_PREV_TRACK"],
  ["30 b7 00", "MSTP MEDIA_STOP"],
  ["30 cd 00", "MPLY MEDIA_PLAY_PAUSE"],
  ["30 83 01", "MSEL MEDIA_SELECT"],
  ["30 8a 01", "MAIL"],
  ["30 92 01", "CALC CALCULATOR"],
  ["30 94 01", "MYCM MY_COMPUTER"],
  ["30 21 02", "WSCH WWW_SEARCH"],
  ["30 23 02", "WHOM WWW_HOME"],
  ["30 24 02", "WBAK WWW_BACK"],
  ["30 25 02", "WFWD WWW_FORWARD"],
  ["30 26 02", "WSTP WWW_STOP"],
  ["30 27 02", "WREF WWW_REFRESH"],
  ["30 2a 02", "WFAV WWW_FAVORITES"],
  ["30 6f 00", "BRIU BRIGHTNESS_UP"],
  ["30 70 00", "BRID BRIGHTNESS_DOWN"],
  // the side buttons' factory codes: the hub's "show desktop" and "lock session"
  ["30 cb 01", "DESKTOP"],
  ["30 cf 00", "LOCK"],
  ["40 01 00", "PWR SYSTEM_POWER"],
  ["40 02 00", "SLEP SYSTEM_SLEEP"],
  ["40 04 00", "WAKE SYSTEM_WAKE"],
  ["40 00 01", "BTN1 MS_BTN1"],
  ["40 00 02", "BTN2 MS_BTN2"],
  ["40 00 04", "BTN3 MS_BTN3"],
  ["40 00 08", "BTN4 MS_BTN4"],
  ["40 00 10", "BTN5 MS_BTN5"],
  ["50 02 00", "FN MO(1)"],
  ["50 03 00", "MO(2)"],
  ["50 04 00", "MO(3)"],
  ["50 09 00", "RM_TOGG RGB_TOG"],
  ["50 0a 00", "RM_NEXT RGB_MOD"],
  ["50 0b 00", "RM_PREV RGB_RMOD"],
  // palette steps, not QMK's hue steps
  ["50 0c 00", "COLOR_NEXT"],
  ["50 0d 00", "COLOR_PREV"],
  ["50 0e 00", "RM_VALU RGB_VAI"],
  ["50 0f 00", "RM_VALD RGB_VAD"],
  ["50 10 00", "RM_SPDU RGB_SPI"],
  ["50 11 00", "RM_SPDD RGB_SPD"],
  ["50 19 00", "SIDE_NEXT"],
  ["50 1b 00", "SIDE_HUE"],
  ["50 1d 00", "SIDE_VALU"],
  ["50 1e 00", "SIDE_VALD"],
  ["50 2b 00", "DOT_NEXT"],
  ["50 2d 00", "DOT_HUE"],
  ["50 2f 00", "DOT_VALU"],
  ["50 30 00", "DOT_VALD"],
  ["50 31 00", "DOT_SPDU"],
  ["50 32 00", "DOT_SPDD"],
  ["50 34 00", "BT_1"],
  ["50 35 00", "BT_2"],
  ["50 36 00", "BT_3"],
  ["50 39 00", "BAT_LVL"],
  ["50 3c 00", "GU_TOGG"],
  ["50 47 00", "KNOB_LEFT"],
  ["50 48 00", "KNOB_RIGHT"],
];

const ENTRIES: [string, string][] = [
  ...HID_KEYS.map(([usage, names]): [string, string] => [
    hex(Uint8Array.of(KEY, 0, usage)),
    names,
  ]),
  ...MODIFIERS.map(([mask, names]): [string, string] => [
    hex(Uint8Array.of(KEY, mask, 0)),
    names,
  ]),
  ...OTHERS,
];

const BY_NAME = new Map(
  ENTRIES.flatMap(([code, names]) =>
    names.split(" ").map((n): [string, string] => [n, code]),
  ),
);
const BY_CODE = new Map(
  ENTRIES.map(([code, names]): [string, string] => [code, names.split(" ")[0]]),
);
const MODIFIER_MASK = new Map(
  MODIFIERS.flatMap(([mask, names]) =>
    names.split(" ").map((n): [string, number] => [n, mask]),
  ),
);
const MODIFIER_NAME = new Map(
  MODIFIERS.map(([mask, names]): [number, string] => [
    mask,
    names.split(" ")[0],
  ]),
);

/** The 3-byte code of a key name; throws on an unknown one. */
export function keycode(name: string): Uint8Array {
  const n = name.toUpperCase().replace(/\s/g, "").replace(/^KC_/, "");
  const known = BY_NAME.get(n);
  if (known) {
    return fromHex(known);
  }

  if (/^0X[0-9A-F]{6}$/.test(n)) {
    return fromHex(n.slice(2));
  }

  const macro = n.match(/^MACRO\((\d+)(?:,(\d+))?\)$/);
  const [index, mode] = [Number(macro?.[1]), Number(macro?.[2] ?? 0)];
  if (macro && index <= MAX_MACRO && mode < MACRO_MODES) {
    return Uint8Array.of(MACRO, index, mode);
  }

  // LGUI(TAB): the modifier's bit or-ed into a key code
  const wrapped = n.match(/^(\w+)\((.+)\)$/);
  const mask = MODIFIER_MASK.get(wrapped?.[1] ?? "");
  if (wrapped && mask) {
    const inner = keycode(wrapped[2]);
    if (inner[0] === KEY) {
      return Uint8Array.of(KEY, inner[1] | mask, inner[2]);
    }
  }

  throw new Error(`unknown key name: ${name}`);
}

/** The name `keycode` parses back to `code` (3 bytes). */
export function keycodeName(code: Uint8Array): string {
  const known = BY_CODE.get(hex(code));
  if (known) {
    return known;
  }

  const [type, x, y] = code;
  if (type === MACRO && y < MACRO_MODES) {
    return y ? `MACRO(${x},${y})` : `MACRO(${x})`;
  }

  if (type === KEY && x && BY_CODE.has(hex(Uint8Array.of(KEY, 0, y)))) {
    // innermost first, in mask order; with no usage, the first modifier is the key itself
    let name = y ? BY_CODE.get(hex(Uint8Array.of(KEY, 0, y)))! : "";
    for (const [mask] of MODIFIERS) {
      if (x & mask) {
        const modifier = MODIFIER_NAME.get(mask)!;
        name = name ? `${modifier}(${name})` : modifier;
      }
    }

    return name;
  }

  return `0x${hex(code).replaceAll(" ", "")}`;
}
