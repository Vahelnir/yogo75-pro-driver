/**
 * Readable YAML profile (version 1): a base, the factory state it builds on, plus what differs from it. Layers and
 * macros so far; per-key colours and config are kept as the keyboard has them.
 */
import {
  Document,
  isMap,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
  Scalar,
  visit,
  type Node,
  type Pair,
  type YAMLMap,
} from "yaml";
import { fromHex, hex } from "./bytes.ts";
import {
  baseForFirmware,
  baseNamed,
  BASES,
  FACTORY_1_26,
  type Base,
} from "./factory.ts";
import { keycode, keycodeName, MAX_MACRO } from "./keycode.ts";
import {
  COLS,
  keyAt,
  keyIndex,
  KEYS,
  KNOB_LEFT,
  KNOB_PRESS,
  KNOB_RIGHT,
} from "./keymap.ts";
import {
  checkStep,
  decodeMacro,
  DEFAULT_DELAY,
  EMPTY_MACRO,
  encodeMacro,
  isMacro,
  joinMacros,
  MAX_DELAY,
  splitMacros,
} from "./macro.ts";
import type { KeyboardState } from "./state.ts";

const PROFILE_VERSION = 1;
const NOT_INCLUDED = " per-key colours and config are not included yet";
const TOP_KEYS = ["version", "base", "layers", "macros"];
const LAYERS = [0, 1, 2, 3];
const KNOB_NAMES = new Map([
  [KNOB_LEFT, "KNOB_LEFT"],
  [KNOB_RIGHT, "KNOB_RIGHT"],
  [KNOB_PRESS, "KNOB_PRESS"],
]);
/** The slots a profile names, in export order: the matrix, then the knob. The firmware reads no other slot. */
const SLOTS = [...Array(KEYS).keys(), ...KNOB_NAMES.keys()];
const RAW = /^[0-9a-f]{2}( ?[0-9a-f]{2}){2}$/i;
const RAW_MACRO = /^[0-9a-f]{2}( ?[0-9a-f]{2})*$/i;
/** Longest macro exported on one line. */
const MACRO_LINE = 60;

type Problem = (
  node: Node | null | undefined,
  path: string,
  message: string,
) => void;

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

/** One line at the default delay when it fits, else the delay and one step per line; raw if it can't decode. */
function macroYaml(macro: Uint8Array) {
  const spec = decodeMacro(macro);
  if (!spec) {
    return { raw: hex(macro) };
  }

  const line = spec.steps.join(" ");
  return spec.delay === DEFAULT_DELAY && line.length <= MACRO_LINE
    ? line
    : { delay: spec.delay, steps: spec.steps };
}

/**
 * The macros that differ from the base's (an empty one past its end), and the last one, so the count comes back;
 * every macro with `full`.
 */
function exportedMacros(state: KeyboardState, base: Base, full: boolean) {
  const macros = splitMacros(state.macros);
  const baseMacros = splitMacros(base.macros);
  const exported = new Map<number, ReturnType<typeof macroYaml>>();
  // shortcut: fewer macros than the base can't be written back, revisit when a base ships macros
  macros.forEach((macro, i) => {
    const last = i === macros.length - 1 && i >= baseMacros.length;
    if (full || last || hex(macro) !== hex(baseMacros[i] ?? EMPTY_MACRO)) {
      exported.set(i, macroYaml(macro));
    }
  });

  return exported;
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

  const macros = exportedMacros(state, base, full);
  const doc = new Document({
    version: PROFILE_VERSION,
    base: base.name,
    ...(layers.size ? { layers } : {}),
    ...(macros.size ? { macros } : {}),
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

  // lineWidth 0: never fold a long raw macro
  return { text: doc.toString({ lineWidth: 0 }), warnings };
}

/**
 * The state a profile gives: its base with the profile's slots and macros, and `current`'s colours and config.
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

  // with an unknown base, the latest one, to go on finding errors
  const merged = base ?? BASES.at(-1)!;
  const keymaps = merged.keymaps.map((map) => map.slice());
  const macros = parseMacros(
    top.items.find((p) => isScalar(p.key) && p.key.value === "macros"),
    merged,
    current,
    problem,
  );
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
    macros: macros!,
  };
}

/**
 * The base's macros with the profile's, gaps filled with empty macros; `current`'s area when that gives the same
 * macros (a keyboard that never had any keeps its headerless area).
 */
function parseMacros(
  pair: Pair | undefined,
  base: Base,
  current: KeyboardState,
  problem: Problem,
): Uint8Array | undefined {
  const node = pair?.value as Node | null | undefined;
  const macros: Uint8Array[] = splitMacros(base.macros);
  // an empty `macros:` changes nothing
  if (node && !isMap(node) && !(isScalar(node) && node.value === null)) {
    problem(node, "macros", "expected macros by number");
  }

  const seen = new Map<number, string>();
  for (const item of isMap(node) ? node.items : []) {
    const key = isScalar(item.key) ? String(item.key.value) : "";
    const path = `macros.${key}`;
    if (!/^\d+$/.test(key) || Number(key) > MAX_MACRO) {
      problem(item.key as Node, path, "unknown key");
      continue;
    }

    // 0, "0" and 00 are the same macro
    if (seen.has(Number(key))) {
      problem(item.key as Node, path, `same macro as ${seen.get(Number(key))}`);
      continue;
    }

    seen.set(Number(key), key);

    const macro = parseMacro(item.value as Node | null, path, problem);
    if (macro) {
      macros[Number(key)] = macro;
    }
  }

  const filled = Array.from(macros, (macro) => macro ?? EMPTY_MACRO);
  const kept = splitMacros(current.macros);
  if (
    filled.length === kept.length &&
    filled.every((m, i) => hex(m) === hex(kept[i]))
  ) {
    return current.macros.slice();
  }

  try {
    return joinMacros(filled);
  } catch (e) {
    problem(pair?.key as Node, "macros", (e as Error).message);
    return undefined;
  }
}

/** A string of steps, `{ delay, steps }` or `{ raw: "<hex>" }`; reports and gives nothing on anything else. */
function parseMacro(
  node: Node | null,
  path: string,
  problem: Problem,
): Uint8Array | undefined {
  if (isScalar(node) && node.value !== null) {
    const steps = String(node.value).trim().split(/\s+/);
    return encodeSteps(
      steps.map((step) => ({ step, node, path })),
      DEFAULT_DELAY,
      node,
      path,
      problem,
    );
  }

  if (!isMap(node) || !(node.has("raw") || node.has("steps"))) {
    problem(
      node,
      path,
      "expected a string of steps, { delay, steps } or { raw }",
    );
    return undefined;
  }

  const fields = node.has("raw") ? ["raw"] : ["delay", "steps"];
  for (const item of node.items) {
    const key = isScalar(item.key) ? String(item.key.value) : "";
    if (!fields.includes(key)) {
      problem(item.key as Node, `${path}.${key}`, "unknown key");
    }
  }

  if (node.has("raw")) {
    const raw = node.get("raw");
    const bytes =
      typeof raw === "string" && RAW_MACRO.test(raw) ? fromHex(raw) : undefined;
    if (bytes && isMacro(bytes)) {
      return bytes;
    }

    problem(
      node.get("raw", true) as Node,
      `${path}.raw`,
      "not a macro's bytes",
    );
    return undefined;
  }

  const steps = node.get("steps", true) as Node | undefined;
  const delay = node.get("delay") ?? DEFAULT_DELAY;
  if (
    !isSeq(steps) ||
    !steps.items.every((s) => isScalar(s) && s.value !== null)
  ) {
    problem(steps, `${path}.steps`, "expected one step per item");
    return undefined;
  }

  if (
    typeof delay !== "number" ||
    !Number.isInteger(delay) ||
    delay < 0 ||
    delay > MAX_DELAY
  ) {
    problem(
      node.get("delay", true) as Node,
      `${path}.delay`,
      `must be 0 to ${MAX_DELAY} ms`,
    );
    return undefined;
  }

  return encodeSteps(
    steps.items.map((s, i) => ({
      step: String((s as Scalar).value),
      node: s as Node,
      path: `${path}.steps.${i}`,
    })),
    delay,
    node,
    path,
    problem,
  );
}

/** Reports each unreadable step where it is, then what makes the whole macro invalid (an unbalanced press…). */
function encodeSteps(
  steps: { step: string; node: Node; path: string }[],
  delay: number,
  node: Node,
  path: string,
  problem: Problem,
): Uint8Array | undefined {
  let readable = true;
  for (const s of steps) {
    try {
      checkStep(s.step);
    } catch (e) {
      problem(s.node, s.path, (e as Error).message);
      readable = false;
    }
  }

  if (!readable) {
    return undefined;
  }

  try {
    return encodeMacro(
      steps.map((s) => s.step),
      delay,
    );
  } catch (e) {
    problem(node, path, (e as Error).message);
    return undefined;
  }
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
