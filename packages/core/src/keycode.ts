/**
 * Key names ↔ 3-byte keymap codes (`[type, x, y]`, see docs/protocol.md, "Key encoding"). Names follow QMK:
 * case-insensitive, `KC_` optional; the first name of each entry is the one printed. ATK-only functions get
 * project names in QMK style. Unknown codes print and parse as `0x` + 6 hex digits.
 */
import { fromHex, hex, u16le } from "./bytes.ts";

const KEY = 0x10; // [KEY, modifier mask, HID usage]
const CONSUMER = 0x30; // [CONSUMER, usage LE]
const MOUSE_SYSTEM = 0x40; // [MOUSE_SYSTEM, system action, mouse button]
const FUNCTION = 0x50; // [FUNCTION, function number, 0]
const MACRO = 0x60; // [MACRO, macro number, mode 0-3]
const MACRO_MODES = 4;
const MACRO_TIMES = 0x61; // [MACRO_TIMES, macro number, runs]: mode 4, "run N times"
const MACRO_TIMES_MODE = 4;
const MAX_RUNS = 249; // the hub's "execute N times" input (`frequency`) stops there
export const MAX_MACRO = 0xff; // the macro number is one byte

/** A code and its names: the first one is printed, all are accepted. */
type Entry<T> = [T, string, ...string[]];

// Codes are kept as hex strings: a Uint8Array can't be a Map key.
function key(mask: number, usage: number) {
  return hex(Uint8Array.of(KEY, mask, usage));
}

function consumer(usage: number) {
  return hex(Uint8Array.of(CONSUMER, ...u16le(usage)));
}

function system(action: number) {
  return hex(Uint8Array.of(MOUSE_SYSTEM, action, 0));
}

function mouse(button: number) {
  return hex(Uint8Array.of(MOUSE_SYSTEM, 0, button));
}

function fn(n: number) {
  return hex(Uint8Array.of(FUNCTION, n, 0));
}

/** HID keyboard usages, as QMK's basic keycodes. */
const HID_KEYS: Entry<number>[] = [
  [0x00, "NO", "NONE"],
  ...[..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((c, i): Entry<number> => [
    0x04 + i,
    c,
  ]),
  ...[..."1234567890"].map((c, i): Entry<number> => [0x1e + i, c]),
  [0x28, "ENT", "ENTER"],
  [0x29, "ESC", "ESCAPE"],
  [0x2a, "BSPC", "BACKSPACE"],
  [0x2b, "TAB"],
  [0x2c, "SPC", "SPACE"],
  [0x2d, "MINS", "MINUS"],
  [0x2e, "EQL", "EQUAL"],
  [0x2f, "LBRC", "LEFT_BRACKET"],
  [0x30, "RBRC", "RIGHT_BRACKET"],
  [0x31, "BSLS", "BACKSLASH"],
  [0x32, "NUHS", "NONUS_HASH"],
  [0x33, "SCLN", "SEMICOLON"],
  [0x34, "QUOT", "QUOTE"],
  [0x35, "GRV", "GRAVE"],
  [0x36, "COMM", "COMMA"],
  [0x37, "DOT"],
  [0x38, "SLSH", "SLASH"],
  [0x39, "CAPS", "CAPS_LOCK"],
  ...Array.from({ length: 12 }, (_, i): Entry<number> => [
    0x3a + i,
    `F${i + 1}`,
  ]),
  [0x46, "PSCR", "PRINT_SCREEN"],
  [0x47, "SCRL", "SCROLL_LOCK"],
  [0x48, "PAUS", "PAUSE", "BRK"],
  [0x49, "INS", "INSERT"],
  [0x4a, "HOME"],
  [0x4b, "PGUP", "PAGE_UP"],
  [0x4c, "DEL", "DELETE"],
  [0x4d, "END"],
  [0x4e, "PGDN", "PAGE_DOWN"],
  [0x4f, "RGHT", "RIGHT"],
  [0x50, "LEFT"],
  [0x51, "DOWN"],
  [0x52, "UP"],
  [0x53, "NUM", "NUM_LOCK"],
  [0x54, "PSLS", "KP_SLASH"],
  [0x55, "PAST", "KP_ASTERISK"],
  [0x56, "PMNS", "KP_MINUS"],
  [0x57, "PPLS", "KP_PLUS"],
  [0x58, "PENT", "KP_ENTER"],
  ...Array.from({ length: 9 }, (_, i): Entry<number> => [
    0x59 + i,
    `P${i + 1}`,
    `KP_${i + 1}`,
  ]),
  [0x62, "P0", "KP_0"],
  [0x63, "PDOT", "KP_DOT"],
  [0x64, "NUBS", "NONUS_BACKSLASH"],
  [0x65, "APP", "APPLICATION"],
  [0x66, "KB_POWER"],
  [0x67, "PEQL", "KP_EQUAL"],
  ...Array.from({ length: 12 }, (_, i): Entry<number> => [
    0x68 + i,
    `F${i + 13}`,
  ]),
  [0x74, "EXEC", "EXECUTE"],
  [0x75, "HELP"],
  [0x76, "MENU"],
  [0x77, "SLCT", "SELECT"],
  [0x78, "STOP"],
  [0x79, "AGIN", "AGAIN"],
  [0x7a, "UNDO"],
  [0x7b, "CUT"],
  [0x7c, "COPY"],
  [0x7d, "PSTE", "PASTE"],
  [0x7e, "FIND"],
  [0x85, "PCMM", "KP_COMMA"],
  ...Array.from({ length: 9 }, (_, i): Entry<number> => [
    0x87 + i,
    `INT${i + 1}`,
    `INTERNATIONAL_${i + 1}`,
  ]),
  ...Array.from({ length: 9 }, (_, i): Entry<number> => [
    0x90 + i,
    `LNG${i + 1}`,
    `LANGUAGE_${i + 1}`,
  ]),
];

/** Modifier keys are a mask bit with no usage; the same names wrap a key: `LGUI(TAB)`. */
const MODIFIERS: Entry<number>[] = [
  [0x01, "LCTL", "LEFT_CTRL"],
  [0x02, "LSFT", "LEFT_SHIFT"],
  [0x04, "LALT", "LEFT_ALT", "LOPT"],
  [0x08, "LGUI", "LEFT_GUI", "LCMD", "LWIN"],
  [0x10, "RCTL", "RIGHT_CTRL"],
  [0x20, "RSFT", "RIGHT_SHIFT"],
  [0x40, "RALT", "RIGHT_ALT", "ROPT", "ALGR"],
  [0x80, "RGUI", "RIGHT_GUI", "RCMD", "RWIN"],
];

/** Consumer usages (QMK names) and ATK's two side buttons. */
const CONSUMER_KEYS: Entry<string>[] = [
  [consumer(0xe2), "MUTE", "AUDIO_MUTE"],
  [consumer(0xe9), "VOLU", "AUDIO_VOL_UP"],
  [consumer(0xea), "VOLD", "AUDIO_VOL_DOWN"],
  [consumer(0xb5), "MNXT", "MEDIA_NEXT_TRACK"],
  [consumer(0xb6), "MPRV", "MEDIA_PREV_TRACK"],
  [consumer(0xb7), "MSTP", "MEDIA_STOP"],
  [consumer(0xcd), "MPLY", "MEDIA_PLAY_PAUSE"],
  [consumer(0x183), "MSEL", "MEDIA_SELECT"],
  [consumer(0x18a), "MAIL"],
  [consumer(0x192), "CALC", "CALCULATOR"],
  [consumer(0x194), "MYCM", "MY_COMPUTER"],
  [consumer(0x221), "WSCH", "WWW_SEARCH"],
  [consumer(0x223), "WHOM", "WWW_HOME"],
  [consumer(0x224), "WBAK", "WWW_BACK"],
  [consumer(0x225), "WFWD", "WWW_FORWARD"],
  [consumer(0x226), "WSTP", "WWW_STOP"],
  [consumer(0x227), "WREF", "WWW_REFRESH"],
  [consumer(0x22a), "WFAV", "WWW_FAVORITES"],
  [consumer(0x6f), "BRIU", "BRIGHTNESS_UP"],
  [consumer(0x70), "BRID", "BRIGHTNESS_DOWN"],
  // the side buttons' factory codes: the hub's "show desktop" and "lock session"
  [consumer(0x1cb), "DESKTOP"],
  [consumer(0xcf), "LOCK"],
];

/** System actions and mouse buttons (QMK names). */
const MOUSE_SYSTEM_KEYS: Entry<string>[] = [
  [system(0x01), "PWR", "SYSTEM_POWER"],
  [system(0x02), "SLEP", "SYSTEM_SLEEP"],
  [system(0x04), "WAKE", "SYSTEM_WAKE"],
  [mouse(0x01), "BTN1", "MS_BTN1"],
  [mouse(0x02), "BTN2", "MS_BTN2"],
  [mouse(0x04), "BTN3", "MS_BTN3"],
  [mouse(0x08), "BTN4", "MS_BTN4"],
  [mouse(0x10), "BTN5", "MS_BTN5"],
];

/** Keyboard functions: QMK names where QMK has the same action, project names otherwise. */
const FUNCTIONS: Entry<string>[] = [
  [fn(0x02), "FN", "MO(1)"],
  [fn(0x03), "MO(2)"],
  [fn(0x04), "MO(3)"],
  [fn(0x09), "RM_TOGG", "RGB_TOG"],
  [fn(0x0a), "RM_NEXT", "RGB_MOD"],
  [fn(0x0b), "RM_PREV", "RGB_RMOD"],
  // palette steps, not QMK's hue steps
  [fn(0x0c), "COLOR_NEXT"],
  [fn(0x0d), "COLOR_PREV"],
  [fn(0x0e), "RM_VALU", "RGB_VAI"],
  [fn(0x0f), "RM_VALD", "RGB_VAD"],
  [fn(0x10), "RM_SPDU", "RGB_SPI"],
  [fn(0x11), "RM_SPDD", "RGB_SPD"],
  [fn(0x19), "SIDE_NEXT"],
  [fn(0x1b), "SIDE_HUE"],
  [fn(0x1d), "SIDE_VALU"],
  [fn(0x1e), "SIDE_VALD"],
  [fn(0x2b), "DOT_NEXT"],
  [fn(0x2d), "DOT_HUE"],
  [fn(0x2f), "DOT_VALU"],
  [fn(0x30), "DOT_VALD"],
  [fn(0x31), "DOT_SPDU"],
  [fn(0x32), "DOT_SPDD"],
  [fn(0x34), "BT_1"],
  [fn(0x35), "BT_2"],
  [fn(0x36), "BT_3"],
  [fn(0x39), "BAT_LVL"],
  [fn(0x3c), "GU_TOGG"],
  // the knob's volume, off while config wheelMode is not 0
  [fn(0x47), "KNOB_VOLD", "KNOB_LEFT"],
  [fn(0x48), "KNOB_VOLU", "KNOB_RIGHT"],
];

const ENTRIES: Entry<string>[] = [
  ...HID_KEYS.map(([usage, ...names]): Entry<string> => [
    key(0, usage),
    ...names,
  ]),
  ...MODIFIERS.map(([mask, ...names]): Entry<string> => [
    key(mask, 0),
    ...names,
  ]),
  ...CONSUMER_KEYS,
  ...MOUSE_SYSTEM_KEYS,
  ...FUNCTIONS,
];

/** Every name of every entry → its code. */
function byName<T>(entries: Entry<T>[]) {
  return new Map(
    entries.flatMap(([code, ...names]) => names.map((n) => [n, code] as const)),
  );
}

/** Code → its printed name. */
function byCode<T>(entries: Entry<T>[]) {
  return new Map(entries.map(([code, name]) => [code, name] as const));
}

const BY_NAME = byName(ENTRIES);
const BY_CODE = byCode(ENTRIES);
const MODIFIER_MASK = byName(MODIFIERS);
const MODIFIER_NAME = byCode(MODIFIERS);

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

  const macro = n.match(/^MACRO\((\d+)(?:,(\d+))?(?:,(\d+))?\)$/);
  const [index, mode] = [Number(macro?.[1]), Number(macro?.[2] ?? 0)];
  const runs = macro?.[3] === undefined ? undefined : Number(macro[3]);
  if (macro && index <= MAX_MACRO && mode < MACRO_MODES && runs === undefined) {
    return Uint8Array.of(MACRO, index, mode);
  }

  const validRuns = runs !== undefined && runs >= 1 && runs <= MAX_RUNS;
  if (macro && index <= MAX_MACRO && mode === MACRO_TIMES_MODE && validRuns) {
    return Uint8Array.of(MACRO_TIMES, index, runs);
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

  if (type === MACRO_TIMES && y >= 1 && y <= MAX_RUNS) {
    return `MACRO(${x},${MACRO_TIMES_MODE},${y})`;
  }

  const usage = BY_CODE.get(key(0, y));
  if (type === KEY && x && usage) {
    // innermost first, in mask order; with no usage, the first modifier is the key itself
    let name = y ? usage : "";
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

/** A plain key (`H`, `LCTL(C)`, `LSFT`): its modifier mask and HID usage; throws on anything else (media, Fn…). */
export function plainKey(name: string): { mods: number; usage: number } {
  const [type, mods, usage] = keycode(name);
  if (type !== KEY) {
    throw new Error(`${name} is not a plain key`);
  }

  return { mods, usage };
}

/** The name `plainKey` parses back to `mods` and `usage`. */
export function plainKeyName(mods: number, usage: number): string {
  return keycodeName(Uint8Array.of(KEY, mods, usage));
}
