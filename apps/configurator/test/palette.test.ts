import {
  EMPTY_MACRO,
  encodeMacro,
  joinMacros,
  keycode,
  MACRO_AREA_BYTES,
} from "@yogo75/core";
import { expect, test } from "vitest";
import en from "../src/locales/en.json";
import fr from "../src/locales/fr.json";
import {
  macroNumbers,
  NUMPAD_KEYS,
  PALETTE,
  TYPED_KEYS,
} from "../src/palette.ts";

const entries = PALETTE.flatMap((group) => group.entries);

/** The message at a dotted key, or undefined. */
function message(messages: object, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      messages,
    );
}

test.each(entries.map((e) => e.name))(
  "%s is a name the core accepts",
  (name) => {
    expect(() => keycode(name)).not.toThrow();
  },
);

test.each([...PALETTE.map((g) => g.label), ...entries.map((e) => e.label)])(
  "%s is translated in en and fr",
  (key) => {
    expect(message(en, key)).toBeTypeOf("string");
    expect(message(fr, key)).toBeTypeOf("string");
  },
);

test("the issue's must-haves are in the palette", () => {
  const names = entries.map((e) => e.name);
  for (const name of ["FN", "MO(2)", "MO(3)", "PDF(0)", "MUTE"]) {
    expect(names).toContain(name);
  }

  expect(names).not.toContain("RESET_1");
  expect(names).not.toContain("RESET_2");
});

test("plain keys are all there, and no name is in two tabs", () => {
  for (const name of ["A", "1", "MINS", "ESC", "SPC", "LSFT", "F1"]) {
    expect(TYPED_KEYS).toContain(name);
  }

  expect(NUMPAD_KEYS).toEqual(expect.arrayContaining(["NUM", "P0", "PENT"]));
  expect(TYPED_KEYS).not.toContain("P0");

  const names = [...TYPED_KEYS, ...NUMPAD_KEYS, ...entries.map((e) => e.name)];
  expect(new Set(names).size).toBe(names.length);
});

test("macroNumbers numbers the macros that hold actions", () => {
  const macro = encodeMacro(["A"]);
  const area = joinMacros([EMPTY_MACRO, macro, EMPTY_MACRO, macro]);

  expect(macroNumbers(area)).toEqual([1, 3]);
  expect(macroNumbers(new Uint8Array(MACRO_AREA_BYTES))).toEqual([]);
});
