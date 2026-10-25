import { fromHex, hex } from "./bytes.ts";
import { CMD_GET_KEYMAP, LAYER_BYTES, MATRIX_BYTES } from "./commands.ts";
import { CONFIG_BYTES } from "./config.ts";
import { withoutFullBytes } from "./flash.ts";
import { MACRO_AREA_BYTES, macroAreaLength, splitMacros } from "./macro.ts";

/** Everything the keyboard can read back (the dot screen image has no read command). */
export interface KeyboardState {
  config: Uint8Array;
  /** Layers 0..3 with their knob; an older file's hold only the matrix, and leave the knob as it is. */
  keymaps: Uint8Array[];
  leds: Uint8Array;
  macros: Uint8Array;
}

/** Version 2 adds the knob to each layer. Files without `version` are version 1 backups from before it existed. */
const STATE_VERSION = 2;
const MATRIX_ONLY_VERSION = 1;
const LAYERS = CMD_GET_KEYMAP.map((_, layer) => layer);

/** Resource name in the file → expected size for each version; the macro area's varies, see `parseMacroArea`. */
function sizes(version: number): Record<string, number> {
  const layer = version === MATRIX_ONLY_VERSION ? MATRIX_BYTES : LAYER_BYTES;
  return {
    config: CONFIG_BYTES,
    ...Object.fromEntries(LAYERS.map((l) => [`keymap${l}`, layer])),
    leds: MATRIX_BYTES,
  };
}

/** Each resource under its name in the file, in write order. */
function resources(state: KeyboardState): [string, Uint8Array][] {
  return [
    ["config", state.config],
    ...state.keymaps.map((map, l): [string, Uint8Array] => [`keymap${l}`, map]),
    ["leds", state.leds],
    ["macros", state.macros],
  ];
}

/** Names of the resources that differ between `a` and `b`. */
export function stateDiff(a: KeyboardState, b: KeyboardState): string[] {
  const other = new Map(resources(b));
  return resources(a)
    .filter(([name, bytes]) => hex(bytes) !== hex(other.get(name)!))
    .map(([name]) => name);
}

/**
 * Names of the resources that `read`, read back after writing `wanted`, doesn't hold. Colours read back 0xFE where
 * `wanted` has 0xFF (see `withoutFullBytes`); a layer without its knob is compared without it.
 */
export function loadMismatches(
  wanted: KeyboardState,
  read: KeyboardState,
): string[] {
  return stateDiff(
    {
      ...read,
      keymaps: read.keymaps.map((map, l) =>
        map.subarray(0, wanted.keymaps[l].length),
      ),
    },
    { ...wanted, leds: withoutFullBytes(wanted.leds) },
  );
}

/** Version 2 file: one hex string per resource. Throws on a state without the knob (an older file's). */
export function stateToJson(state: KeyboardState): string {
  const expected = sizes(STATE_VERSION);
  for (const [name, bytes] of resources(state)) {
    if (expected[name] !== undefined && bytes.length !== expected[name]) {
      throw new Error(
        `${name}: ${bytes.length} bytes, expected ${expected[name]}`,
      );
    }
  }

  const file = {
    version: STATE_VERSION,
    ...Object.fromEntries(
      resources(state).map(([name, bytes]) => [name, hex(bytes)]),
    ),
  };

  return JSON.stringify(file, null, 2) + "\n";
}

/** Parses a `stateToJson` file, an older version, or a version-less full backup; throws on anything incomplete or malformed. */
export function stateFromJson(text: string): KeyboardState {
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error("not JSON");
  }

  if (typeof file !== "object" || file === null || Array.isArray(file)) {
    throw new Error("not a saved keyboard state");
  }

  const version = file.version ?? MATRIX_ONLY_VERSION;
  if (version !== MATRIX_ONLY_VERSION && version !== STATE_VERSION) {
    throw new Error(`unknown version ${version}`);
  }

  const data: Record<string, Uint8Array> = {};
  for (const [name, size] of Object.entries(sizes(version))) {
    data[name] = resource(file[name], name, size);
  }

  return {
    config: data.config,
    keymaps: LAYERS.map((l) => data[`keymap${l}`]),
    leds: data.leds,
    macros: parseMacroArea(file.macros),
  };
}

/**
 * The area as `readMacros` returns it: cut to its header length, or kept whole without header. Old files hold
 * 224 bytes whatever the header says; one whose header announces more was cut short and is refused.
 */
function parseMacroArea(value: unknown) {
  const bytes = resource(value, "macros");
  if (!bytes.length || bytes.length > MACRO_AREA_BYTES) {
    throw new Error(
      `macros: ${bytes.length} bytes, expected 1 to ${MACRO_AREA_BYTES}`,
    );
  }

  try {
    splitMacros(bytes);

    return bytes.slice(0, macroAreaLength(bytes));
  } catch (e) {
    throw new Error(`macros: ${(e as Error).message}`);
  }
}

function resource(value: unknown, name: string, size?: number) {
  if (typeof value !== "string") {
    throw new Error(`${name}: missing`);
  }

  if (!/^[0-9a-f ]*$/i.test(value) || value.replaceAll(" ", "").length % 2) {
    throw new Error(`${name}: not hex bytes`);
  }

  const bytes = fromHex(value);
  if (size !== undefined && bytes.length !== size) {
    throw new Error(`${name}: ${bytes.length} bytes, expected ${size}`);
  }

  return bytes;
}
