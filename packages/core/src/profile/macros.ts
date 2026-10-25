/** `macros.<n>`: one string of steps, `{ delay, steps }`, or `{ raw }` for a macro the decoder can't express. */
import { isSeq, type Node } from "yaml";
import { fromHex, hex } from "../bytes.ts";
import { MAX_MACRO } from "../keycode.ts";
import {
  checkStep,
  decodeMacro,
  DEFAULT_DELAY,
  EMPTY_MACRO,
  encodeMacro,
  joinMacros,
  splitMacros,
} from "../macro.ts";
import { entries, text, type Problems, type Section } from "./section.ts";

/** Longest steps string exported on one line. */
const ONE_LINE = 60;
const INDEX = /^(0|[1-9]\d*)$/;
const HEX = /^ *([0-9a-f]{2} *)+$/i;

export const macros: Section = {
  key: "macros",

  toYaml(state, base, full) {
    const list = splitMacros(state.macros);
    const baseList = splitMacros(base.macros);
    const found = new Map<number, unknown>();
    list.forEach((macro, i) => {
      // the last one even when empty: the macro count must survive
      const last = i === list.length - 1 && list.length > baseList.length;
      if (full || last || hex(macro) !== hex(baseList[i] ?? EMPTY_MACRO)) {
        found.set(i, macroValue(macro));
      }
    });

    return found.size ? found : undefined;
  },

  fromYaml(node, base, state, problems) {
    const list = splitMacros(base.macros);
    for (const entry of entries(node, "macros", problems)) {
      if (!INDEX.test(entry.key) || Number(entry.key) > MAX_MACRO) {
        problems.add(
          entry.keyNode,
          entry.path,
          `unknown macro: macros are 0-${MAX_MACRO}`,
        );
        continue;
      }

      const macro = parseMacro(
        entry.value ?? entry.keyNode,
        entry.path,
        problems,
      );
      if (macro) {
        const index = Number(entry.key);
        while (list.length < index) {
          list.push(EMPTY_MACRO);
        }
        list[index] = macro;
      }
    }

    try {
      state.macros = joinMacros(list);
    } catch (e) {
      problems.add(node, "macros", (e as Error).message);
    }
  },
};

function macroValue(macro: Uint8Array): unknown {
  const spec = decodeMacro(macro);
  if (!spec) {
    return { raw: hex(macro) };
  }

  const line = spec.steps.join(" ");
  return spec.delay === DEFAULT_DELAY && line.length <= ONE_LINE
    ? line
    : new Map<string, unknown>([
        ["delay", spec.delay],
        ["steps", spec.steps],
      ]);
}

/** Whether two areas hold the same macros, whatever their bytes past them (an area never written has no header). */
export function sameMacros(a: Uint8Array, b: Uint8Array): boolean {
  return macroList(a) === macroList(b);
}

/** The macros of `area` as `|`-separated hex, or undefined for an area `splitMacros` refuses. */
function macroList(area: Uint8Array) {
  try {
    return splitMacros(area).map(hex).join("|");
  } catch {
    return undefined;
  }
}

function parseMacro(node: Node, path: string, problems: Problems) {
  const line = text(node);
  if (line !== undefined) {
    const steps = line.split(/\s+/).filter(Boolean);
    return encode(steps, DEFAULT_DELAY, node, path, problems);
  }

  const found = new Map(entries(node, path, problems).map((e) => [e.key, e]));
  for (const entry of found.values()) {
    if (!["raw", "delay", "steps"].includes(entry.key)) {
      problems.add(entry.keyNode, entry.path, "unknown key");
    }
  }

  const raw = found.get("raw");
  if (raw) {
    if (found.has("delay") || found.has("steps")) {
      problems.add(
        raw.keyNode,
        raw.path,
        "raw goes alone, without delay or steps",
      );
    }

    return parseRaw(raw.value ?? raw.keyNode, raw.path, problems);
  }

  const delay = found.get("delay");
  const steps = found.get("steps");
  const ms = delay ? Number(text(delay.value)) : DEFAULT_DELAY;
  if (!steps || !isSeq(steps.value)) {
    problems.add(
      steps?.value ?? node,
      `${path}.steps`,
      "expected a list of steps",
    );
    return undefined;
  }

  const list: string[] = [];
  let valid = true;
  steps.value.items.forEach((item, i) => {
    const step = text(item as Node);
    try {
      if (step === undefined) {
        throw new Error("a step is one key, DOWN(), UP() or DELAY()");
      }
      checkStep(step);
      list.push(step);
    } catch (e) {
      problems.add(item as Node, `${steps.path}.${i}`, (e as Error).message);
      valid = false;
    }
  });

  return valid ? encode(list, ms, node, path, problems) : undefined;
}

function encode(
  steps: string[],
  delay: number,
  node: Node,
  path: string,
  problems: Problems,
) {
  try {
    return encodeMacro(steps, delay);
  } catch (e) {
    problems.add(node, path, (e as Error).message);
    return undefined;
  }
}

function parseRaw(node: Node, path: string, problems: Problems) {
  const value = text(node);
  const bytes =
    value !== undefined && HEX.test(value) ? fromHex(value) : undefined;
  if (!bytes || !isOneMacro(bytes)) {
    problems.add(
      node,
      path,
      "must be one macro's hex bytes: action count, 0 0, then 4 bytes per action",
    );
    return undefined;
  }

  return bytes;
}

/** Well formed: an area holding it splits back to it alone. */
function isOneMacro(bytes: Uint8Array) {
  try {
    return (
      splitMacros(joinMacros([bytes]))
        .map(hex)
        .join("|") === hex(bytes)
    );
  } catch {
    return false;
  }
}
