/**
 * Macro area (docs/protocol.md, "Macros"): a header, an offset table, then each macro back to back as
 * action count LE, 0 0, and its 4-byte actions. Macros are handled as their bytes, so one the spec can't
 * express is written back unchanged.
 *
 * Spec, one string per step, QMK vocabulary: `X` taps a plain key (`LCTL(C)` holds Ctrl around C),
 * `DOWN(X)` / `UP(X)` press or release it, `DELAY(ms)` waits longer before the next action.
 */
import { hex, readU16le, u16le } from "./bytes.ts";
import { plainKey, plainKeyName } from "./keycode.ts";

/** A macro as steps; `delay` (ms) comes before every action, `DELAY` steps add to the next one's. */
export interface MacroSpec {
  steps: string[];
  delay: number;
}

/** Probable size of the area: foreign data starts at offset 1024 (hypothesis, see docs/protocol.md). */
export const MACRO_AREA_BYTES = 1024;
/** get_keyboard_info's macroSize. */
export const MACRO_SLOTS = 4;
export const DEFAULT_DELAY = 20;

const MAGIC = [0xaa, 0x55];
const AREA_HEADER_BYTES = 8;
const MACRO_HEADER_BYTES = 4;
const ACTION_BYTES = 4;
const MAX_DELAY = 0xffff;

const ACTION_KEY = 1; // code: HID usage
const ACTION_MODIFIER = 2; // code: one modifier's mask bit, as in the keymap
const PRESSED = 0x80; // or-ed into the type; released without it

interface Action {
  delay: number;
  code: number;
  type: number;
  down: boolean;
}

/** Bits set in a modifier mask, lowest first. */
function bits(mask: number) {
  return [1, 2, 4, 8, 16, 32, 64, 128].filter((b) => mask & b);
}

function macroBytes(actions: Action[]) {
  return Uint8Array.from([
    ...u16le(actions.length),
    0,
    0,
    ...actions.flatMap((a) => [
      ...u16le(a.delay),
      a.code,
      a.down ? a.type | PRESSED : a.type,
    ]),
  ]);
}

function macroActions(macro: Uint8Array): Action[] {
  const actions = [];
  for (let at = MACRO_HEADER_BYTES; at < macro.length; at += ACTION_BYTES) {
    const type = macro[at + 3];
    actions.push({
      delay: readU16le(macro, at),
      code: macro[at + 2],
      type: type & ~PRESSED,
      down: (type & PRESSED) !== 0,
    });
  }

  return actions;
}

/**
 * A no-op: mask 00 pressed then released. A macro with 0 actions is not empty for the firmware: it runs on
 * into the next macro (verified).
 */
export const EMPTY_MACRO = macroBytes(
  [true, false].map((down) => ({
    delay: 0,
    code: 0,
    type: ACTION_MODIFIER,
    down,
  })),
);

export function isEmptyMacro(macro: Uint8Array): boolean {
  return hex(macro) === hex(EMPTY_MACRO);
}

/** Presses for a plain key: its modifiers in mask order, then the key itself. */
function presses(mods: number, usage: number): Action[] {
  const keys = bits(mods).map((code) => ({ code, type: ACTION_MODIFIER }));
  if (usage) {
    keys.push({ code: usage, type: ACTION_KEY });
  }

  return keys.map((k) => ({ ...k, delay: 0, down: true }));
}

function releases(pressed: Action[]): Action[] {
  return pressed.map((a) => ({ ...a, down: false })).reverse();
}

function stepActions(step: string): Action[] {
  const half = step.match(/^(DOWN|UP)\((.+)\)$/i);
  const { mods, usage } = plainKey(half ? half[2] : step);
  const pressed = presses(mods, usage);

  if (!half) {
    return [...pressed, ...releases(pressed)];
  }

  return half[1].toUpperCase() === "DOWN" ? pressed : releases(pressed);
}

function actionId(a: Action) {
  return `${a.type}:${a.code}`;
}

function actionName(a: Action) {
  return a.type === ACTION_MODIFIER
    ? plainKeyName(a.code, 0)
    : plainKeyName(0, a.code);
}

/** Every press released, nothing pressed twice or released unpressed: a malformed macro can leave a key stuck. */
function checkBalanced(actions: Action[]) {
  const held = new Set<string>();
  for (const a of actions) {
    const id = actionId(a);
    if (a.down === held.has(id)) {
      throw new Error(
        `${actionName(a)} ${a.down ? "pressed twice" : "released while not pressed"}`,
      );
    }

    if (a.down) {
      held.add(id);
    } else {
      held.delete(id);
    }
  }

  const left = actions.find((a) => held.has(actionId(a)));
  if (left) {
    const name = actionName(left);
    throw new Error(`${name} left pressed: add UP(${name})`);
  }
}

/** The bytes of one macro; throws on an unknown or non-plain key, a misplaced or too long delay, or an unbalanced press. */
export function encodeMacro(
  steps: string[],
  delay = DEFAULT_DELAY,
): Uint8Array {
  if (!Number.isInteger(delay) || delay < 0 || delay > MAX_DELAY) {
    throw new Error(`delay must be 0 to ${MAX_DELAY} ms`);
  }

  const actions: Action[] = [];
  let wait = 0;
  for (const step of steps) {
    const extra = step.match(/^DELAY\((\d+)\)$/i);
    if (extra) {
      wait += Number(extra[1]);
      continue;
    }

    const added = stepActions(step).map((a) => ({ ...a, delay }));
    if (!added.length) {
      throw new Error(`${step} does nothing`);
    }

    // the keyboard waits an action's delay before running it (verified)
    added[0].delay += wait;
    if (added[0].delay > MAX_DELAY) {
      throw new Error(`a delay can't exceed ${MAX_DELAY} ms`);
    }

    wait = 0;
    actions.push(...added);
  }

  if (!actions.length) {
    throw new Error("a macro needs at least one key");
  }

  if (wait) {
    throw new Error("DELAY() needs a key after it");
  }

  checkBalanced(actions);
  return macroBytes(actions);
}

/** The plain-key tap starting at `actions[i]`, all its actions but the first at the base `delay`. */
function tapAt(actions: Action[], i: number, delay: number) {
  let k = 0;
  while (
    actions[i + k]?.type === ACTION_MODIFIER &&
    actions[i + k].down &&
    (k === 0 || actions[i + k].code > actions[i + k - 1].code)
  ) {
    k++;
  }

  for (; k >= 0; k--) {
    const mods = actions.slice(i, i + k).reduce((m, a) => m | a.code, 0);
    const key = actions[i + k];
    const usages = key?.type === ACTION_KEY && key.down ? [key.code, 0] : [0];
    for (const usage of usages) {
      const pressed = presses(mods, usage);
      const tap = [...pressed, ...releases(pressed)];
      const got = actions.slice(i, i + tap.length);
      const matches =
        tap.length > 0 &&
        got.length === tap.length &&
        got.every(
          (a, j) =>
            a.type === tap[j].type &&
            a.code === tap[j].code &&
            a.down === tap[j].down &&
            (j === 0 || a.delay === delay),
        );
      if (matches) {
        return { name: plainKeyName(mods, usage), length: tap.length };
      }
    }
  }

  return undefined;
}

/**
 * The spec `encodeMacro` turns back into exactly these bytes, or undefined for a macro it can't express
 * (mouse actions, 0 actions, a key left pressed…). The base delay is the shortest one.
 */
export function decodeMacro(macro: Uint8Array): MacroSpec | undefined {
  const actions = macroActions(macro);
  const known = actions.every(
    (a) =>
      a.type === ACTION_KEY ||
      (a.type === ACTION_MODIFIER && bits(a.code).length === 1),
  );
  if (!actions.length || !known) {
    return undefined;
  }

  const delay = Math.min(...actions.map((a) => a.delay));
  const steps = [];
  for (let i = 0; i < actions.length;) {
    const tap = tapAt(actions, i, delay);
    const first = actions[i];
    if (first.delay > delay) {
      steps.push(`DELAY(${first.delay - delay})`);
    }

    steps.push(
      tap?.name ?? `${first.down ? "DOWN" : "UP"}(${actionName(first)})`,
    );
    i += tap?.length ?? 1;
  }

  try {
    if (hex(encodeMacro(steps, delay)) === hex(macro)) {
      return { steps, delay };
    }
  } catch {
    // unbalanced presses: shown raw
  }

  return undefined;
}

/** Total length announced by the area's header, or undefined if no macro was ever written (no header). */
export function macroAreaLength(head: Uint8Array): number | undefined {
  if (head[0] !== MAGIC[0] || head[1] !== MAGIC[1]) {
    return undefined;
  }

  const length = readU16le(head, 2);
  if (length < AREA_HEADER_BYTES || length > MACRO_AREA_BYTES) {
    throw new Error(`macro area announces ${length} bytes`);
  }

  return length;
}

/** Each macro's bytes, in order; none for an area without header. Throws on a malformed area. */
export function splitMacros(area: Uint8Array): Uint8Array[] {
  const length = macroAreaLength(area);
  if (length === undefined) {
    return [];
  }

  const count = readU16le(area, 4);
  if (length > area.length || AREA_HEADER_BYTES + 2 * count > length) {
    throw new Error("malformed macro area");
  }

  return Array.from({ length: count }, (_, i) => {
    const start = readU16le(area, AREA_HEADER_BYTES + 2 * i);
    const end =
      start + MACRO_HEADER_BYTES + readU16le(area, start) * ACTION_BYTES;
    if (start + MACRO_HEADER_BYTES > length || end > length) {
      throw new Error("malformed macro area");
    }

    return area.slice(start, end);
  });
}

/** The area holding `macros` back to back, as the hub's setMacro builds it; throws if it outgrows the area. */
export function joinMacros(macros: Uint8Array[]): Uint8Array {
  const offsets = [];
  let length = AREA_HEADER_BYTES + 2 * macros.length;
  for (const macro of macros) {
    offsets.push(length);
    length += macro.length;
  }

  if (length > MACRO_AREA_BYTES) {
    throw new Error(
      `macros would take ${length} bytes, over the ${MACRO_AREA_BYTES}-byte area`,
    );
  }

  return Uint8Array.from([
    ...MAGIC,
    ...u16le(length),
    ...u16le(macros.length),
    0,
    0,
    ...offsets.flatMap(u16le),
    ...macros.flatMap((m) => [...m]),
  ]);
}
