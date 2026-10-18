import { isEmptyMacro, splitMacros } from "@yogo75/core";

/** A binding the browser can't capture: the key name the core parses, and the translation key of its label. */
export interface PaletteEntry {
  name: string;
  label: string;
}

/** The palette's fixed groups, in display order; the macros come from the keyboard, see `macroNumbers`. */
export const PALETTE: { label: string; entries: PaletteEntry[] }[] = [
  {
    label: "palette.groups.layers",
    entries: [
      { name: "FN", label: "palette.keys.fn" },
      { name: "MO(0)", label: "palette.keys.mo_0" },
      { name: "MO(2)", label: "palette.keys.mo_2" },
      { name: "MO(3)", label: "palette.keys.mo_3" },
      { name: "PDF(0)", label: "palette.keys.pdf_0" },
      { name: "PDF(1)", label: "palette.keys.pdf_1" },
      { name: "PDF(2)", label: "palette.keys.pdf_2" },
      { name: "PDF(3)", label: "palette.keys.pdf_3" },
    ],
  },
  {
    label: "palette.groups.keys",
    entries: [{ name: "ESC", label: "palette.keys.esc" }],
  },
  {
    label: "palette.groups.media",
    entries: [
      { name: "MPLY", label: "palette.keys.mply" },
      { name: "MSTP", label: "palette.keys.mstp" },
      { name: "MPRV", label: "palette.keys.mprv" },
      { name: "MNXT", label: "palette.keys.mnxt" },
      { name: "MUTE", label: "palette.keys.mute" },
      { name: "VOLD", label: "palette.keys.vold" },
      { name: "VOLU", label: "palette.keys.volu" },
      { name: "BRID", label: "palette.keys.brid" },
      { name: "BRIU", label: "palette.keys.briu" },
      { name: "MSEL", label: "palette.keys.msel" },
    ],
  },
  {
    label: "palette.groups.apps",
    entries: [
      { name: "MAIL", label: "palette.keys.mail" },
      { name: "CALC", label: "palette.keys.calc" },
      { name: "MYCM", label: "palette.keys.mycm" },
      { name: "WSCH", label: "palette.keys.wsch" },
      { name: "WHOM", label: "palette.keys.whom" },
      { name: "WBAK", label: "palette.keys.wbak" },
      { name: "WFWD", label: "palette.keys.wfwd" },
      { name: "WSTP", label: "palette.keys.wstp" },
      { name: "WREF", label: "palette.keys.wref" },
      { name: "WFAV", label: "palette.keys.wfav" },
      { name: "DESKTOP", label: "palette.keys.desktop" },
      { name: "LOCK", label: "palette.keys.lock" },
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
      { name: "PWR", label: "palette.keys.pwr" },
      { name: "SLEP", label: "palette.keys.slep" },
      { name: "WAKE", label: "palette.keys.wake" },
    ],
  },
  {
    label: "palette.groups.mouse",
    entries: [
      { name: "BTN1", label: "palette.keys.btn1" },
      { name: "BTN2", label: "palette.keys.btn2" },
      { name: "BTN3", label: "palette.keys.btn3" },
      { name: "BTN4", label: "palette.keys.btn4" },
      { name: "BTN5", label: "palette.keys.btn5" },
    ],
  },
  {
    label: "palette.groups.lighting",
    entries: [
      { name: "RM_TOGG", label: "palette.keys.rm_togg" },
      { name: "RM_NEXT", label: "palette.keys.rm_next" },
      { name: "RM_PREV", label: "palette.keys.rm_prev" },
      { name: "COLOR_NEXT", label: "palette.keys.color_next" },
      { name: "COLOR_PREV", label: "palette.keys.color_prev" },
      { name: "COLOR_PICKER", label: "palette.keys.color_picker" },
      { name: "RM_VALU", label: "palette.keys.rm_valu" },
      { name: "RM_VALD", label: "palette.keys.rm_vald" },
      { name: "RM_SPDU", label: "palette.keys.rm_spdu" },
      { name: "RM_SPDD", label: "palette.keys.rm_spdd" },
      { name: "SIDE_NEXT", label: "palette.keys.side_next" },
      { name: "SIDE_HUE", label: "palette.keys.side_hue" },
      { name: "SIDE_VALU", label: "palette.keys.side_valu" },
      { name: "SIDE_VALD", label: "palette.keys.side_vald" },
    ],
  },
  {
    label: "palette.groups.dot_screen",
    entries: [
      { name: "DOT_NEXT", label: "palette.keys.dot_next" },
      { name: "DOT_HUE", label: "palette.keys.dot_hue" },
      { name: "DOT_VALU", label: "palette.keys.dot_valu" },
      { name: "DOT_VALD", label: "palette.keys.dot_vald" },
      { name: "DOT_SPDU", label: "palette.keys.dot_spdu" },
      { name: "DOT_SPDD", label: "palette.keys.dot_spdd" },
    ],
  },
  {
    label: "palette.groups.keyboard",
    entries: [
      { name: "BT_1", label: "palette.keys.bt_1" },
      { name: "BT_2", label: "palette.keys.bt_2" },
      { name: "BT_3", label: "palette.keys.bt_3" },
      { name: "BAT_LVL", label: "palette.keys.bat_lvl" },
      { name: "GU_TOGG", label: "palette.keys.gu_togg" },
      { name: "MAC_TOGG", label: "palette.keys.mac_togg" },
      { name: "MAC_TOGG2", label: "palette.keys.mac_togg2" },
      { name: "WASD_TOGG", label: "palette.keys.wasd_togg" },
      { name: "LOWLAT_TOGG", label: "palette.keys.lowlat_togg" },
      { name: "FKEY_TOGG", label: "palette.keys.fkey_togg" },
      { name: "KNOB_LOCK", label: "palette.keys.knob_lock" },
      { name: "KNOB_VOLD", label: "palette.keys.knob_vold" },
      { name: "KNOB_VOLU", label: "palette.keys.knob_volu" },
      { name: "KNOB_MUTE", label: "palette.keys.knob_mute" },
    ],
  },
];

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
