/**
 * Readable YAML profile (version 1): a base, the factory state it builds on, plus what differs from it. Only the
 * layers so far; macros, per-key colours and config are kept as the keyboard has them.
 */
import {
  Document,
  isMap,
  isScalar,
  LineCounter,
  parseDocument,
  Scalar,
  visit,
  type Node,
  type YAMLMap,
} from "yaml";
import { fromHex, hex } from "./bytes.ts";
import { baseForFirmware, baseNamed, BASES, FACTORY_1_26 } from "./factory.ts";
import { keycode, keycodeName } from "./keycode.ts";
import {
  COLS,
  keyAt,
  keyIndex,
  KEYS,
  KNOB_LEFT,
  KNOB_PRESS,
  KNOB_RIGHT,
} from "./keymap.ts";
import type { KeyboardState } from "./state.ts";

const PROFILE_VERSION = 1;
const NOT_INCLUDED = " macros, per-key colours and config are not included yet";
const TOP_KEYS = ["version", "base", "layers"];
const LAYERS = [0, 1, 2, 3];
const KNOB_NAMES = new Map([
  [KNOB_LEFT, "KNOB_LEFT"],
  [KNOB_RIGHT, "KNOB_RIGHT"],
  [KNOB_PRESS, "KNOB_PRESS"],
]);
/** The slots a profile names, in export order: the matrix, then the knob. The firmware reads no other slot. */
const SLOTS = [...Array(KEYS).keys(), ...KNOB_NAMES.keys()];
const RAW = /^[0-9a-f]{2}( ?[0-9a-f]{2}){2}$/i;

/** The slot's factory layer-0 name when it resolves back to it, else `row,col`. */
function positionName(index: number) {
  const knob = KNOB_NAMES.get(index);
  if (knob) {
    return knob;
  }

  const name = keycodeName(keyAt(FACTORY_1_26.keymaps[0], index));
  try {
    if (keyIndex(name) === index) {
      return name;
    }
  } catch {
    // ambiguous (NO) or not a position
  }

  return `${Math.floor(index / COLS)},${index % COLS}`;
}

function binding(code: Uint8Array) {
  const name = keycodeName(code);
  return name.startsWith("0x") ? { raw: hex(code) } : name;
}

/**
 * The state as a profile: the layers that differ from the base matching `firmware` (the latest base otherwise,
 * with a warning), or every slot with `full`.
 */
export function profileToYaml(
  state: KeyboardState,
  firmware: string,
  { full = false } = {},
): { text: string; warnings: string[] } {
  const warnings = [];
  let base = baseForFirmware(firmware);
  if (!base) {
    base = BASES.at(-1)!;
    warnings.push(`no base for firmware ${firmware}: ${base.name} used`);
  }

  const layers = new Map();
  for (const l of LAYERS) {
    const slots = new Map();
    for (const i of SLOTS) {
      const code = keyAt(state.keymaps[l], i);
      if (full || hex(code) !== hex(keyAt(base.keymaps[l], i))) {
        slots.set(positionName(i), binding(code));
      }
    }

    if (slots.size) {
      layers.set(l, slots);
    }
  }

  const doc = new Document({
    version: PROFILE_VERSION,
    base: base.name,
    ...(layers.size ? { layers } : {}),
  });
  doc.commentBefore = NOT_INCLUDED;
  visit(doc, {
    Pair(_, pair, path) {
      if (isScalar(pair.key) && pair.key.value === "raw") {
        (path.at(-1) as YAMLMap).flow = true;
        (pair.value as Scalar).type = Scalar.QUOTE_DOUBLE;
      }
    },
  });

  return { text: doc.toString(), warnings };
}

/**
 * The state a profile gives: its base with the profile's slots, and `current`'s macros, colours and config.
 * Throws one error listing every problem, each with its line and path.
 */
export function profileFromYaml(
  text: string,
  current: KeyboardState,
): KeyboardState {
  const lines = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lines });
  const errors: { line: number; message: string }[] = [];

  function lineOf(node: Node | null | undefined) {
    return lines.linePos(node?.range?.[0] ?? 0).line;
  }

  function problem(
    node: Node | null | undefined,
    path: string,
    message: string,
  ) {
    errors.push({ line: lineOf(node), message: `${path}: ${message}` });
  }

  function fail(): never {
    throw new Error(
      errors
        .sort((a, b) => a.line - b.line)
        .map(({ line, message }) => `line ${line}: ${message}`)
        .join("\n"),
    );
  }

  for (const e of doc.errors) {
    errors.push({
      line: e.linePos?.[0].line ?? 1,
      message: e.message.split(" at line")[0],
    });
  }

  if (errors.length) {
    fail();
  }

  const top = doc.contents;
  if (!isMap(top)) {
    errors.push({
      line: lineOf(top),
      message: "not a profile: expected version, base and layers",
    });
    fail();
  }

  for (const pair of top.items) {
    const key = isScalar(pair.key) ? String(pair.key.value) : "";
    if (!TOP_KEYS.includes(key)) {
      problem(pair.key as Node, key, "unknown key");
    }
  }

  const version = top.get("version", true) as Scalar | undefined;
  if (!version) {
    problem(top, "version", `missing, expected ${PROFILE_VERSION}`);
  } else if (version.value !== PROFILE_VERSION) {
    problem(
      version,
      "version",
      `unknown version ${version.value}, expected ${PROFILE_VERSION}`,
    );
  }

  const known = `known bases: ${BASES.map((b) => b.name).join(", ")}`;
  const baseNode = top.get("base", true) as Scalar | undefined;
  const base = baseNode ? baseNamed(String(baseNode.value)) : undefined;
  if (!baseNode) {
    problem(top, "base", `missing; ${known}`);
  } else if (!base) {
    problem(baseNode, "base", `unknown base ${baseNode.value}; ${known}`);
  }

  const keymaps = (base ?? BASES.at(-1)!).keymaps.map((map) => map.slice());
  const layers = top.get("layers", true) as Node | undefined;
  // an empty `layers:` changes nothing
  if (
    layers &&
    !isMap(layers) &&
    !(isScalar(layers) && layers.value === null)
  ) {
    problem(layers, "layers", "expected layers 0-3");
  }

  for (const pair of isMap(layers) ? layers.items : []) {
    const key = isScalar(pair.key) ? String(pair.key.value) : "";
    const path = `layers.${key}`;
    const layer = LAYERS.find((l) => String(l) === key);
    if (layer === undefined) {
      problem(pair.key as Node, path, "unknown key");
      continue;
    }

    if (!isMap(pair.value)) {
      problem(pair.value as Node, path, "expected keys and their bindings");
      continue;
    }

    const seen = new Map<number, string>();
    for (const slot of pair.value.items) {
      const position = isScalar(slot.key) ? String(slot.key.value) : "";
      const at = `${path}.${position}`;
      let index;
      try {
        index = keyIndex(position);
      } catch (e) {
        problem(slot.key as Node, at, (e as Error).message);
        continue;
      }

      if (seen.has(index)) {
        problem(slot.key as Node, at, `same key as ${seen.get(index)}`);
        continue;
      }

      seen.set(index, position);
      const code = parseBinding(slot.value as Node | null, (message) =>
        problem((slot.value ?? slot.key) as Node, at, message),
      );
      if (code) {
        keyAt(keymaps[layer], index).set(code);
      }
    }
  }

  if (errors.length) {
    fail();
  }

  return {
    config: current.config.slice(),
    keymaps,
    leds: current.leds.slice(),
    macros: current.macros.slice(),
  };
}

/** A key name or `{ raw: "<hex>" }`; reports and gives nothing on anything else. */
function parseBinding(
  node: Node | null,
  report: (message: string) => void,
): Uint8Array | undefined {
  if (isScalar(node) && node.value !== null) {
    try {
      return keycode(String(node.value));
    } catch (e) {
      report((e as Error).message);
      return undefined;
    }
  }

  if (isMap(node) && node.items.length === 1 && node.has("raw")) {
    const raw = node.get("raw");
    if (typeof raw === "string" && RAW.test(raw)) {
      return fromHex(raw);
    }

    report('raw must be 3 hex bytes, e.g. "30 9f 02"');
    return undefined;
  }

  report(
    node === null || isScalar(node)
      ? "missing binding"
      : "expected a key name or { raw }",
  );
  return undefined;
}
