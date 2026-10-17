import { u16le } from "./bytes.ts";

/** HID usage codes tapped in turn; modifiers (e0-e7: Ctrl, Shift, Alt, GUI) are held around the others. */
export interface Macro {
  keys: number[];
  /** Before each action; unit assumed to be ms. */
  delay: number;
}

const ACTION_KEY = 1;
const ACTION_MODIFIER = 2; // code is the modifier bitmask, as in a HID report
const PRESSED = 0x80; // or-ed into the action type; released without it

const isModifier = (code: number) => code >= 0xe0 && code <= 0xe7;
/** Left Ctrl (e0) is bit 0, …, Right GUI (e7) bit 7. */
const modifierBit = (code: number) => 1 << (code - 0xe0);

/** One 4-byte action: delay LE, code, type (| PRESSED). */
const action = (delay: number, code: number, type: number, down: boolean) => [
  ...u16le(delay),
  code,
  down ? type | PRESSED : type,
];

function actions({ keys, delay }: Macro): number[] {
  const mods = keys.filter(isModifier).map(modifierBit);
  const tap = (code: number) => [
    ...action(delay, code, ACTION_KEY, true),
    ...action(delay, code, ACTION_KEY, false),
  ];
  return [
    ...mods.flatMap((m) => action(delay, m, ACTION_MODIFIER, true)),
    ...keys.filter((c) => !isModifier(c)).flatMap(tap),
    ...mods.flatMap((m) => action(delay, m, ACTION_MODIFIER, false)),
  ];
}

/**
 * Macro blob as the hub's setMacro builds it:
 *   "aa 55", total length LE, macro count LE, 0 0, then one offset (LE, from the blob start) per macro;
 *   then per macro: action count LE, 0 0, and its 4-byte actions.
 */
export function macroBlob(macros: Macro[]): Uint8Array {
  const headerBytes = 8 + macros.length * 2;
  const offsets: number[] = [];
  const body: number[] = [];
  for (const macro of macros) {
    const acts = actions(macro);
    offsets.push(headerBytes + body.length);
    body.push(...u16le(acts.length / 4), 0, 0, ...acts);
  }
  return Uint8Array.from([
    0xaa,
    0x55,
    ...u16le(headerBytes + body.length),
    ...u16le(macros.length),
    0,
    0,
    ...offsets.flatMap(u16le),
    ...body,
  ]);
}
