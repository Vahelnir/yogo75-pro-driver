/**
 * The readable YAML profile (spec #87): a base plus what differs from it, one section per top-level key.
 * The only place that knows the YAML text, so every app writes the same file.
 */
import {
  Document,
  isMap,
  isScalar,
  LineCounter,
  parseDocument,
  visit,
  type Node,
} from "yaml";
import { baseByName, baseForFirmware, BASES, type Base } from "../base.ts";
import { FIELDS } from "../config.ts";
import type { KeyboardState } from "../state.ts";
import { keyboard, lighting, screen } from "./config.ts";
import { layers } from "./layers.ts";
import { leds } from "./leds.ts";
import { macros, sameMacros } from "./macros.ts";
import { entries, Problems, text, type Section } from "./section.ts";

const VERSION = 1;
/** In export order. */
const SECTIONS: Section[] = [layers, macros, leds, lighting, screen, keyboard];
const MAC = FIELDS.indexOf("macWin");

/** Diffed against the base matching `firmware` (as `firmwareVersion` gives it), else the latest; everything with `full`. */
export function profileToYaml(
  state: KeyboardState,
  firmware: string,
  { full = false } = {},
): string {
  const base = baseForFirmware(firmware) ?? BASES.at(-1)!;
  const profile: Record<string, unknown> = {
    version: VERSION,
    base: base.name,
  };
  for (const section of SECTIONS) {
    const value = section.toYaml(state, base, full);
    if (value !== undefined) {
      profile[section.key] = value;
    }
  }

  const doc = new Document(profile);
  // `{ raw: 30 9f 02 }` on one line
  visit(doc, {
    Map(_, map) {
      const [only] = map.items;
      if (
        map.items.length === 1 &&
        isScalar(only.key) &&
        only.key.value === "raw"
      ) {
        map.flow = true;
      }
    },
  });

  return doc.toString({ lineWidth: 0 }); // never fold a long raw
}

/**
 * The state a profile gives: its base, with what it sets, and Mac mode as `current` has it unless the profile sets it
 * (the base's when `current` is absent, to check a file offline). Throws one error listing every problem, each with its line.
 */
export function profileFromYaml(
  source: string,
  current?: KeyboardState,
): KeyboardState {
  const lines = new LineCounter();
  const doc = parseDocument(source, {
    lineCounter: lines,
    prettyErrors: false,
  });
  const problems = new Problems(lines);
  for (const error of doc.errors) {
    problems.add(error.pos[0], "", error.message);
  }

  const state = doc.errors.length
    ? undefined
    : merge(doc.contents ?? undefined, current, problems);
  problems.throwIfAny();

  return state!;
}

function merge(
  top: Node | undefined,
  current: KeyboardState | undefined,
  problems: Problems,
): KeyboardState | undefined {
  if (!isMap(top)) {
    problems.add(top, "", "a profile is a map with at least version and base");
    return undefined;
  }

  const found = new Map(entries(top, "", problems).map((e) => [e.key, e]));
  for (const entry of found.values()) {
    if (
      !["version", "base", ...SECTIONS.map((s) => s.key)].includes(entry.key)
    ) {
      problems.add(entry.keyNode, entry.path, "unknown key");
    }
  }

  const version = found.get("version");
  if (!version) {
    problems.add(top, "version", "missing");
  } else if (text(version.value) !== String(VERSION)) {
    problems.add(
      version.value ?? version.keyNode,
      "version",
      `unknown version ${text(version.value)}: version ${VERSION} expected`,
    );
  }

  const base = found.get("base");
  const known = `known bases: ${BASES.map((b) => b.name).join(", ")}`;
  const name = text(base?.value);
  const chosen: Base | undefined =
    name === undefined ? undefined : baseByName(name);
  if (!base) {
    problems.add(top, "base", `missing (${known})`);
  } else if (!chosen) {
    problems.add(
      base.value ?? base.keyNode,
      "base",
      `unknown base ${name ?? ""} (${known})`,
    );
  }

  // without a valid base, the sections are still checked, against the latest
  const merged = chosen ?? BASES.at(-1)!;
  const state = structuredClone({
    config: merged.config,
    keymaps: merged.keymaps,
    leds: merged.leds,
    macros: merged.macros,
  });
  if (current) {
    state.config[MAC] = current.config[MAC];
  }

  for (const section of SECTIONS) {
    section.fromYaml(found.get(section.key)?.value, merged, state, problems);
  }

  // the same macros keep the keyboard's bytes, so they aren't rewritten: an area never written (no header) stays so
  if (current && sameMacros(state.macros, current.macros)) {
    state.macros = current.macros.slice();
  }

  return state;
}
