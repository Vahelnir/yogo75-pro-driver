/**
 * ATK Yogo 75 PRO protocol (EVISION_V2, reversed from v3-hub.atk.store), browser-safe: the keyboard is reached
 * through an injected `Transport`. Packet layout in packet.ts.
 */
export { fromHex, hex } from "./bytes.ts";
export { rgb565, toRgb565le } from "./color.ts";
export {
  firmwareVersion,
  isDangerous,
  LED_MATRIX_BYTES,
  MACROS_BYTES,
  MATRIX_BYTES,
} from "./commands.ts";
export { CONFIG_BYTES, FIELDS } from "./config.ts";
export {
  LINKS,
  PID_CABLE,
  PID_DONGLE,
  USAGE_PAGE,
  VENDOR_ID,
  type Link,
} from "./device.ts";
export {
  Keyboard,
  NoReplyError,
  type PacketLogger,
  type Transport,
} from "./keyboard.ts";
export {
  decodeMacro,
  DEFAULT_DELAY,
  EMPTY_MACRO,
  encodeMacro,
  isEmptyMacro,
  joinMacros,
  MACRO_AREA_BYTES,
  MAX_DELAY,
  splitMacros,
  type MacroSpec,
} from "./macro.ts";
export { keycode, keycodeName, MAX_MACRO } from "./keycode.ts";
export { openKeyboard, type OpenOptions } from "./open.ts";
export {
  COLS,
  keyAt,
  keyIndex,
  keyNames,
  KEYS,
  knobNames,
  KNOB_LEFT,
  KNOB_PRESS,
  KNOB_RIGHT,
  ROWS,
} from "./keymap.ts";
export { KNOB, LAYOUT, type KeyRect } from "./layout.ts";
export {
  stateDiff,
  stateFromJson,
  stateToJson,
  type KeyboardState,
} from "./state.ts";
