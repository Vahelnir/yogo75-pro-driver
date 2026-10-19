import { isEmptyMacro, splitMacros } from "@yogo75/core";
import IconAlarmClock from "~icons/lucide/alarm-clock";
import IconBatteryMedium from "~icons/lucide/battery-medium";
import IconBluetooth from "~icons/lucide/bluetooth";
import IconCalculator from "~icons/lucide/calculator";
import IconCircleArrowLeft from "~icons/lucide/circle-arrow-left";
import IconCircleArrowRight from "~icons/lucide/circle-arrow-right";
import IconCircleX from "~icons/lucide/circle-x";
import IconGrid3x3 from "~icons/lucide/grid-3x3";
import IconHardDrive from "~icons/lucide/hard-drive";
import IconHouse from "~icons/lucide/house";
import IconLayers from "~icons/lucide/layers";
import IconLayoutGrid from "~icons/lucide/layout-grid";
import IconLightbulb from "~icons/lucide/lightbulb";
import IconListOrdered from "~icons/lucide/list-ordered";
import IconLock from "~icons/lucide/lock";
import IconMail from "~icons/lucide/mail";
import IconMonitor from "~icons/lucide/monitor";
import IconMoon from "~icons/lucide/moon";
import IconMouse from "~icons/lucide/mouse";
import IconMusic from "~icons/lucide/music";
import IconPipette from "~icons/lucide/pipette";
import IconPlay from "~icons/lucide/play";
import IconPower from "~icons/lucide/power";
import IconRadioTower from "~icons/lucide/radio-tower";
import IconRefreshCw from "~icons/lucide/refresh-cw";
import IconSearch from "~icons/lucide/search";
import IconSkipBack from "~icons/lucide/skip-back";
import IconSkipForward from "~icons/lucide/skip-forward";
import IconSquare from "~icons/lucide/square";
import IconStar from "~icons/lucide/star";
import IconSun from "~icons/lucide/sun";
import IconVolume1 from "~icons/lucide/volume-1";
import IconVolume2 from "~icons/lucide/volume-2";
import IconVolumeX from "~icons/lucide/volume-x";
import type { Component } from "vue";
import { KEY_NAMES } from "./keycodes.ts";

/** The drag data type of a palette entry, holding its key name: drops of anything else are refused. */
export const PALETTE_DRAG_TYPE = "application/x-yogo75-key";

/**
 * A binding the browser can't capture. `label`, `short` and `description` are translation keys; the key is
 * drawn as `icon`, `short` and `badge` (a number, + or −), whichever it has.
 */
export interface PaletteEntry {
  name: string;
  label: string;
  icon?: Component;
  short?: string;
  badge?: string;
  description?: string;
}

/**
 * The palette's fixed groups, in display order; the macros come from the keyboard, see `macroNumbers`.
 * The factory reset halves (`RESET_1`, `RESET_2`) are left out on purpose.
 */
export const PALETTE: { label: string; entries: PaletteEntry[] }[] = [
  {
    label: "palette.groups.layers",
    entries: [
      {
        name: "FN",
        label: "palette.keys.fn",
        description: "palette.descriptions.momentary",
      },
      {
        name: "MO(0)",
        label: "palette.keys.mo_0",
        icon: IconLayers,
        badge: "0",
        description: "palette.descriptions.momentary",
      },
      {
        name: "MO(2)",
        label: "palette.keys.mo_2",
        icon: IconLayers,
        badge: "2",
        description: "palette.descriptions.momentary",
      },
      {
        name: "MO(3)",
        label: "palette.keys.mo_3",
        icon: IconLayers,
        badge: "3",
        description: "palette.descriptions.momentary",
      },
      {
        name: "PDF(0)",
        label: "palette.keys.pdf_0",
        short: "palette.shorts.base",
        badge: "0",
        description: "palette.descriptions.base_layer",
      },
      {
        name: "PDF(1)",
        label: "palette.keys.pdf_1",
        short: "palette.shorts.base",
        badge: "1",
        description: "palette.descriptions.base_layer",
      },
      {
        name: "PDF(2)",
        label: "palette.keys.pdf_2",
        short: "palette.shorts.base",
        badge: "2",
        description: "palette.descriptions.base_layer",
      },
      {
        name: "PDF(3)",
        label: "palette.keys.pdf_3",
        short: "palette.shorts.base",
        badge: "3",
        description: "palette.descriptions.base_layer",
      },
    ],
  },
  {
    label: "palette.groups.media",
    entries: [
      { name: "MPLY", label: "palette.keys.mply", icon: IconPlay },
      { name: "MSTP", label: "palette.keys.mstp", icon: IconSquare },
      { name: "MPRV", label: "palette.keys.mprv", icon: IconSkipBack },
      { name: "MNXT", label: "palette.keys.mnxt", icon: IconSkipForward },
      { name: "MUTE", label: "palette.keys.mute", icon: IconVolumeX },
      { name: "VOLD", label: "palette.keys.vold", icon: IconVolume1 },
      { name: "VOLU", label: "palette.keys.volu", icon: IconVolume2 },
      { name: "BRID", label: "palette.keys.brid", icon: IconSun, badge: "−" },
      { name: "BRIU", label: "palette.keys.briu", icon: IconSun, badge: "+" },
      { name: "MSEL", label: "palette.keys.msel", icon: IconMusic },
    ],
  },
  {
    label: "palette.groups.apps",
    entries: [
      { name: "MAIL", label: "palette.keys.mail", icon: IconMail },
      { name: "CALC", label: "palette.keys.calc", icon: IconCalculator },
      { name: "MYCM", label: "palette.keys.mycm", icon: IconHardDrive },
      { name: "WSCH", label: "palette.keys.wsch", icon: IconSearch },
      { name: "WHOM", label: "palette.keys.whom", icon: IconHouse },
      { name: "WBAK", label: "palette.keys.wbak", icon: IconCircleArrowLeft },
      { name: "WFWD", label: "palette.keys.wfwd", icon: IconCircleArrowRight },
      { name: "WSTP", label: "palette.keys.wstp", icon: IconCircleX },
      { name: "WREF", label: "palette.keys.wref", icon: IconRefreshCw },
      { name: "WFAV", label: "palette.keys.wfav", icon: IconStar },
      {
        name: "DESKTOP",
        label: "palette.keys.desktop",
        icon: IconMonitor,
        description: "palette.descriptions.desktop",
      },
      {
        name: "LOCK",
        label: "palette.keys.lock",
        icon: IconLock,
        description: "palette.descriptions.lock",
      },
    ],
  },
  {
    label: "palette.groups.shortcuts",
    entries: [
      { name: "LGUI(Q)", label: "palette.keys.lgui_q" },
      { name: "LGUI(W)", label: "palette.keys.lgui_w" },
      { name: "LGUI(H)", label: "palette.keys.lgui_h" },
      { name: "LGUI(M)", label: "palette.keys.lgui_m" },
      { name: "LGUI(TAB)", label: "palette.keys.lgui_tab" },
      { name: "LGUI(SPC)", label: "palette.keys.lgui_spc" },
      { name: "LCTL(LGUI(Q))", label: "palette.keys.lctl_lgui_q" },
      { name: "LALT(F4)", label: "palette.keys.lalt_f4" },
      { name: "LALT(TAB)", label: "palette.keys.lalt_tab" },
      { name: "LCTL(LALT(DEL))", label: "palette.keys.lctl_lalt_del" },
      { name: "LGUI(L)", label: "palette.keys.lgui_l" },
      { name: "LGUI(D)", label: "palette.keys.lgui_d" },
    ],
  },
  {
    label: "palette.groups.system",
    entries: [
      { name: "PWR", label: "palette.keys.pwr", icon: IconPower },
      { name: "SLEP", label: "palette.keys.slep", icon: IconMoon },
      { name: "WAKE", label: "palette.keys.wake", icon: IconAlarmClock },
    ],
  },
  {
    label: "palette.groups.mouse",
    entries: [
      { name: "BTN1", label: "palette.keys.btn1", icon: IconMouse, badge: "1" },
      { name: "BTN2", label: "palette.keys.btn2", icon: IconMouse, badge: "2" },
      { name: "BTN3", label: "palette.keys.btn3", icon: IconMouse, badge: "3" },
      { name: "BTN4", label: "palette.keys.btn4", icon: IconMouse, badge: "4" },
      { name: "BTN5", label: "palette.keys.btn5", icon: IconMouse, badge: "5" },
    ],
  },
  {
    label: "palette.groups.lighting",
    entries: [
      { name: "RM_TOGG", label: "palette.keys.rm_togg", icon: IconLightbulb },
      {
        name: "RM_NEXT",
        label: "palette.keys.rm_next",
        icon: IconLightbulb,
        badge: "fx+",
      },
      {
        name: "RM_PREV",
        label: "palette.keys.rm_prev",
        icon: IconLightbulb,
        badge: "fx−",
      },
      {
        name: "COLOR_NEXT",
        label: "palette.keys.color_next",
        icon: IconLightbulb,
        badge: "C+",
        description: "palette.descriptions.color_steps",
      },
      {
        name: "COLOR_PREV",
        label: "palette.keys.color_prev",
        icon: IconLightbulb,
        badge: "C−",
        description: "palette.descriptions.color_steps",
      },
      {
        name: "COLOR_PICKER",
        label: "palette.keys.color_picker",
        icon: IconPipette,
      },
      {
        name: "KEY_COLORS_1",
        label: "palette.keys.key_colors_1",
        icon: IconLayoutGrid,
        badge: "1",
        description: "palette.descriptions.key_colors",
      },
      {
        name: "KEY_COLORS_2",
        label: "palette.keys.key_colors_2",
        icon: IconLayoutGrid,
        badge: "2",
        description: "palette.descriptions.key_colors",
      },
      {
        name: "KEY_COLORS_3",
        label: "palette.keys.key_colors_3",
        icon: IconLayoutGrid,
        badge: "3",
        description: "palette.descriptions.key_colors",
      },
      {
        name: "KEY_COLORS_4",
        label: "palette.keys.key_colors_4",
        icon: IconLayoutGrid,
        badge: "4",
        description: "palette.descriptions.key_colors",
      },
      {
        name: "KEY_COLORS_5",
        label: "palette.keys.key_colors_5",
        icon: IconLayoutGrid,
        badge: "5",
        description: "palette.descriptions.key_colors",
      },
      {
        name: "RM_VALU",
        label: "palette.keys.rm_valu",
        icon: IconLightbulb,
        badge: "☀+",
      },
      {
        name: "RM_VALD",
        label: "palette.keys.rm_vald",
        icon: IconLightbulb,
        badge: "☀−",
      },
      {
        name: "RM_SPDU",
        label: "palette.keys.rm_spdu",
        icon: IconLightbulb,
        badge: "»+",
      },
      {
        name: "RM_SPDD",
        label: "palette.keys.rm_spdd",
        icon: IconLightbulb,
        badge: "»−",
      },
    ],
  },
  {
    label: "palette.groups.dot_screen",
    entries: [
      { name: "DOT_TOGG", label: "palette.keys.dot_togg", icon: IconGrid3x3 },
      {
        name: "DOT_NEXT",
        label: "palette.keys.dot_next",
        icon: IconGrid3x3,
        badge: "fx+",
      },
      {
        name: "DOT_PREV",
        label: "palette.keys.dot_prev",
        icon: IconGrid3x3,
        badge: "fx−",
      },
      {
        name: "DOT_HUE",
        label: "palette.keys.dot_hue",
        icon: IconGrid3x3,
        badge: "C+",
      },
      {
        name: "DOT_HUE_PREV",
        label: "palette.keys.dot_hue_prev",
        icon: IconGrid3x3,
        badge: "C−",
        description: "palette.descriptions.dot_hue_prev",
      },
      {
        name: "DOT_VALU",
        label: "palette.keys.dot_valu",
        icon: IconGrid3x3,
        badge: "☀+",
      },
      {
        name: "DOT_VALD",
        label: "palette.keys.dot_vald",
        icon: IconGrid3x3,
        badge: "☀−",
      },
      {
        name: "DOT_SPDU",
        label: "palette.keys.dot_spdu",
        icon: IconGrid3x3,
        badge: "»+",
      },
      {
        name: "DOT_SPDD",
        label: "palette.keys.dot_spdd",
        icon: IconGrid3x3,
        badge: "»−",
      },
    ],
  },
  {
    label: "palette.groups.keyboard",
    entries: [
      {
        name: "BT_1",
        label: "palette.keys.bt_1",
        icon: IconBluetooth,
        badge: "1",
        description: "palette.descriptions.bluetooth",
      },
      {
        name: "BT_2",
        label: "palette.keys.bt_2",
        icon: IconBluetooth,
        badge: "2",
        description: "palette.descriptions.bluetooth",
      },
      {
        name: "BT_3",
        label: "palette.keys.bt_3",
        icon: IconBluetooth,
        badge: "3",
        description: "palette.descriptions.bluetooth",
      },
      {
        name: "RF_PAIR",
        label: "palette.keys.rf_pair",
        icon: IconRadioTower,
        description: "palette.descriptions.rf_pair",
      },
      {
        name: "BAT_LVL",
        label: "palette.keys.bat_lvl",
        icon: IconBatteryMedium,
      },
      {
        name: "GU_TOGG",
        label: "palette.keys.gu_togg",
        short: "palette.shorts.gu_togg",
        description: "palette.descriptions.gu_togg",
      },
      {
        name: "NK_TOGG",
        label: "palette.keys.nk_togg",
        short: "palette.shorts.nk_togg",
        description: "palette.descriptions.nk_togg",
      },
      {
        name: "MAC_TOGG",
        label: "palette.keys.mac_togg",
        short: "palette.shorts.mac_togg",
        description: "palette.descriptions.mac_togg",
      },
      {
        name: "WASD_TOGG",
        label: "palette.keys.wasd_togg",
        short: "palette.shorts.wasd_togg",
        description: "palette.descriptions.wasd_togg",
      },
      {
        name: "LOWLAT_TOGG",
        label: "palette.keys.lowlat_togg",
        short: "palette.shorts.lowlat_togg",
        description: "palette.descriptions.lowlat_togg",
      },
      {
        name: "FKEY_TOGG",
        label: "palette.keys.fkey_togg",
        short: "palette.shorts.fkey_togg",
        description: "palette.descriptions.fkey_togg",
      },
      {
        name: "KNOB_LOCK",
        label: "palette.keys.knob_lock",
        short: "palette.shorts.knob_lock",
        description: "palette.descriptions.knob_lock",
      },
      {
        name: "KNOB_VOLD",
        label: "palette.keys.knob_vold",
        icon: IconVolume1,
        description: "palette.descriptions.knob",
      },
      {
        name: "KNOB_VOLU",
        label: "palette.keys.knob_volu",
        icon: IconVolume2,
        description: "palette.descriptions.knob",
      },
      {
        name: "KNOB_MUTE",
        label: "palette.keys.knob_mute",
        icon: IconVolumeX,
        description: "palette.descriptions.knob",
      },
    ],
  },
];

/** Plain keys whose meaning doesn't depend on the OS layout → the translation key of their label. */
export const KEY_LABELS: Record<string, string> = {
  P0: "key_labels.p0",
  P1: "key_labels.p1",
  P2: "key_labels.p2",
  P3: "key_labels.p3",
  P4: "key_labels.p4",
  P5: "key_labels.p5",
  P6: "key_labels.p6",
  P7: "key_labels.p7",
  P8: "key_labels.p8",
  P9: "key_labels.p9",
  PSLS: "key_labels.psls",
  PAST: "key_labels.past",
  PMNS: "key_labels.pmns",
  PPLS: "key_labels.ppls",
  PENT: "key_labels.pent",
  PDOT: "key_labels.pdot",
  PEQL: "key_labels.peql",
  PCMM: "key_labels.pcmm",
  NUM: "key_labels.num",
  ENT: "key_labels.ent",
  ESC: "key_labels.esc",
  BSPC: "key_labels.bspc",
  TAB: "key_labels.tab",
  SPC: "key_labels.spc",
  CAPS: "key_labels.caps",
  PSCR: "key_labels.pscr",
  SCRL: "key_labels.scrl",
  PAUS: "key_labels.paus",
  INS: "key_labels.ins",
  HOME: "key_labels.home",
  PGUP: "key_labels.pgup",
  DEL: "key_labels.del",
  END: "key_labels.end",
  PGDN: "key_labels.pgdn",
  RGHT: "key_labels.rght",
  LEFT: "key_labels.left",
  DOWN: "key_labels.down",
  UP: "key_labels.up",
  APP: "key_labels.app",
  LCTL: "key_labels.lctl",
  LSFT: "key_labels.lsft",
  LALT: "key_labels.lalt",
  LGUI: "key_labels.lgui",
  RCTL: "key_labels.rctl",
  RSFT: "key_labels.rsft",
  RALT: "key_labels.ralt",
  RGUI: "key_labels.rgui",
};

/**
 * Keys that type a character, then another with Shift, on US QWERTY: what the keyboard sends whatever the OS
 * layout, so the OS may type something else.
 */
const US_CHARACTERS: Record<string, [string, string]> = {
  GRV: ["`", "~"],
  1: ["1", "!"],
  2: ["2", "@"],
  3: ["3", "#"],
  4: ["4", "$"],
  5: ["5", "%"],
  6: ["6", "^"],
  7: ["7", "&"],
  8: ["8", "*"],
  9: ["9", "("],
  0: ["0", ")"],
  MINS: ["-", "_"],
  EQL: ["=", "+"],
  LBRC: ["[", "{"],
  RBRC: ["]", "}"],
  BSLS: ["\\", "|"],
  SCLN: [";", ":"],
  QUOT: ["'", '"'],
  COMM: [",", "<"],
  DOT: [".", ">"],
  SLSH: ["/", "?"],
};

/** `MACRO(n[,mode[,runs]])`, as the core prints it. */
const MACRO_NAME = /^MACRO\((\d+)(?:,(\d))?(?:,(\d+))?\)$/;

/** The description of each macro mode, by mode number. */
const MACRO_MODES = [
  "palette.macro_modes.once",
  "palette.macro_modes.loop",
  "palette.macro_modes.toggle",
  "palette.macro_modes.hold",
  "palette.macro_modes.times",
];

const ENTRIES = new Map(
  PALETTE.flatMap((group) => group.entries.map((e) => [e.name, e] as const)),
);

/** A binding, translated: what the drawing, the palette and their tooltips show. */
export interface Binding {
  name: string;
  label: string;
  icon?: Component;
  short?: string;
  /** The character the key types with Shift, drawn above `short`. */
  shifted?: string;
  badge?: string;
  description?: string;
}

export type Translate = (
  key: string,
  params?: Record<string, unknown>,
) => string;

/** Everything shown for a key name: the palette's entry, a macro, a plain key, or the bare name (`0x…`). */
export function describe(name: string, t: Translate): Binding {
  const entry = ENTRIES.get(name);
  if (entry) {
    return {
      ...entry,
      label: t(entry.label),
      short: entry.short && t(entry.short),
      description: entry.description && t(entry.description),
    };
  }

  const macro = MACRO_NAME.exec(name);
  if (macro) {
    const [, n, mode = "0", runs] = macro;
    return {
      name,
      label: t("palette.macro", { n }),
      icon: IconListOrdered,
      badge: n,
      description: t(MACRO_MODES[Number(mode)], { runs }),
    };
  }

  if (KEY_LABELS[name]) {
    const label = t(KEY_LABELS[name]);
    return { name, label, short: label };
  }

  if (US_CHARACTERS[name]) {
    const [character, shifted] = US_CHARACTERS[name];
    return {
      name,
      label: `${character} ${shifted}`,
      short: character,
      shifted,
      description: t("palette.descriptions.us_character", {
        character,
        shifted,
      }),
    };
  }

  return { name, label: name };
}

/** The `KeyboardEvent.code`s of the numeric keypad, which has a tab of its own. */
function isNumpad(code: string): boolean {
  return code.startsWith("Numpad") || code === "NumLock";
}

/** The QMK names of the captured keys that `keep` accepts, but those another group holds (media…). */
function capturedKeys(keep: (code: string) => boolean): string[] {
  return Object.entries(KEY_NAMES)
    .filter(([code]) => keep(code))
    .map(([, name]) => name)
    .filter((name) => !ENTRIES.has(name));
}

/** Every plain key the capture knows, but the keypad: the way back to a plain key when no key types any more. */
export const TYPED_KEYS = capturedKeys((code) => !isNumpad(code));

export const NUMPAD_KEYS = capturedKeys(isNumpad);

/** The number of each macro of the area that holds actions; none for a malformed area. */
export function macroNumbers(area: Uint8Array): number[] {
  try {
    return splitMacros(area).flatMap((macro, n) =>
      isEmptyMacro(macro) ? [] : [n],
    );
  } catch {
    return [];
  }
}
