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
  describe,
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

/** Every translation key `describe` asks for, over every name the drawing and the palette can show. */
function describedKeys(): string[] {
  const keys = new Set<string>();
  const names = [
    ...entries.map((e) => e.name),
    ...TYPED_KEYS,
    ...NUMPAD_KEYS,
    "MACRO(1)",
    "MACRO(1,1)",
    "MACRO(1,2)",
    "MACRO(1,3)",
    "MACRO(1,4,5)",
  ];
  for (const name of names) {
    describe(name, (key) => {
      keys.add(key);
      return key;
    });
  }

  return [...keys];
}

test.each([...PALETTE.map((g) => g.label), ...describedKeys()])(
  "%s is translated in en and fr",
  (key) => {
    expect(message(en, key)).toBeTypeOf("string");
    expect(message(fr, key)).toBeTypeOf("string");
  },
);

/** `describe` with the English messages, parameters filled in. */
function english(name: string) {
  return describe(name, (key, params = {}) =>
    String(message(en, key)).replace(/\{(\w+)\}/g, (_, p) => String(params[p])),
  );
}

test("describe gives entries, macros and plain keys their label and description", () => {
  expect(english("PDF(2)")).toMatchObject({
    label: "Base layer 2 (saved)",
    short: "Base",
    badge: "2",
    description: expect.stringContaining("saved"),
  });
  expect(english("MACRO(3,4,10)")).toMatchObject({
    label: "Macro 3",
    badge: "3",
    description: "Runs 10 times.",
  });
  expect(english("MACRO(3)").description).toBe("Runs once.");
  expect(english("PMNS")).toMatchObject({ label: "Num −", short: "Num −" });
  expect(english("QUOT")).toMatchObject({
    label: `' "`,
    short: "'",
    shifted: '"',
    description: expect.stringContaining("depend on the OS layout"),
  });
  expect(english("1")).toMatchObject({ short: "1", shifted: "!" });
  expect(english("MPLY").icon).toBeDefined();
});

test("unknown codes and modified keys keep their raw name, without an icon", () => {
  for (const name of ["0x501900", "LCTL(C)", "A"]) {
    expect(english(name)).toEqual({ name, label: name });
  }
});

test("long-press, base layer, knob and side button functions have a description", () => {
  for (const name of [
    "MAC_TOGG",
    "WASD_TOGG",
    "LOWLAT_TOGG",
    "KNOB_LOCK",
    "BT_1",
    "RF_PAIR",
    "PDF(0)",
    "KNOB_VOLD",
    "KNOB_VOLU",
    "KNOB_MUTE",
    "DESKTOP",
    "LOCK",
  ]) {
    expect(english(name).description, name).toBeTruthy();
  }
});

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
