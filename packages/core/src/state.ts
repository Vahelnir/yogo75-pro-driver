import { fromHex, hex } from "./bytes.ts";
import { CMD_GET_KEYMAP, MATRIX_BYTES } from "./commands.ts";
import { CONFIG_BYTES } from "./config.ts";
import { MACRO_AREA_BYTES, splitMacros } from "./macro.ts";

/** Everything the keyboard can read back (the dot screen image has no read command). */
export interface KeyboardState {
  config: Uint8Array;
  /** Layers 0..3. */
  keymaps: Uint8Array[];
  leds: Uint8Array;
  macros: Uint8Array;
}

/** Files without `version` are the full backups from before it existed: same shape. */
const STATE_VERSION = 1;
const LAYERS = CMD_GET_KEYMAP.map((_, layer) => layer);

/** Resource name in the file → expected size; the macro area's varies, see `macros`. */
const SIZES: Record<string, number> = {
  config: CONFIG_BYTES,
  ...Object.fromEntries(LAYERS.map((l) => [`keymap${l}`, MATRIX_BYTES])),
  leds: MATRIX_BYTES,
};

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

/** Version 1 file: one hex string per resource. */
export function stateToJson(state: KeyboardState): string {
  const file = {
    version: STATE_VERSION,
    ...Object.fromEntries(
      resources(state).map(([name, bytes]) => [name, hex(bytes)]),
    ),
  };

  return JSON.stringify(file, null, 2) + "\n";
}

/** Parses a `stateToJson` file, or a version-less full backup; throws on anything incomplete or malformed. */
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

  const version = file.version ?? STATE_VERSION;
  if (version !== STATE_VERSION) {
    throw new Error(`unknown version ${version}`);
  }

  const data: Record<string, Uint8Array> = {};
  for (const [name, size] of Object.entries(SIZES)) {
    data[name] = resource(file[name], name, size);
  }

  return {
    config: data.config,
    keymaps: LAYERS.map((l) => data[`keymap${l}`]),
    leds: data.leds,
    macros: macros(file.macros),
  };
}

/** The area as `readMacros` returns it: header length, or the 224 bytes of an area without header. */
function macros(value: unknown) {
  const bytes = resource(value, "macros");
  if (!bytes.length || bytes.length > MACRO_AREA_BYTES) {
    throw new Error(
      `macros: ${bytes.length} bytes, expected 1 to ${MACRO_AREA_BYTES}`,
    );
  }

  try {
    splitMacros(bytes);
  } catch (e) {
    throw new Error(`macros: ${(e as Error).message}`);
  }

  return bytes;
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
