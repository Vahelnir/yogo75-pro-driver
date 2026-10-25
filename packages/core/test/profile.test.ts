import assert from "node:assert/strict";
import { test } from "node:test";
import {
  baseNamed,
  EMPTY_MACRO,
  encodeMacro,
  fromHex,
  hex,
  joinMacros,
  keyAt,
  Keyboard,
  keyIndex,
  profileFromYaml,
  profileToYaml,
  splitMacros,
  type KeyboardState,
} from "../src/index.ts";
import { FakeKeyboard } from "./fake-transport.ts";

const BASE = baseNamed("factory-1.26")!;

async function fixtureState() {
  return new Keyboard(new FakeKeyboard(64)).readState();
}

function clone(state: KeyboardState): KeyboardState {
  return {
    config: state.config.slice(),
    keymaps: state.keymaps.map((map) => map.slice()),
    leds: state.leds.slice(),
    macros: state.macros.slice(),
  };
}

function errorOf(text: string) {
  try {
    profileFromYaml(text, BASE);
  } catch (e) {
    return (e as Error).message;
  }
  assert.fail("expected an error");
}

test("a single-key profile gives the factory keymap with that key changed", () => {
  const state = profileFromYaml(
    "version: 1\nbase: factory-1.26\nlayers:\n  0:\n    A: ESC\n",
    BASE,
  );

  const expected = BASE.keymaps[0].slice();
  keyAt(expected, keyIndex("A")).set(fromHex("100029"));
  assert.equal(hex(state.keymaps[0]), hex(expected));
  assert.deepEqual(
    state.keymaps.slice(1).map(hex),
    BASE.keymaps.slice(1).map(hex),
  );
});

test("an empty layers section changes nothing", () => {
  const state = profileFromYaml(
    "version: 1\nbase: factory-1.26\nlayers:\n",
    BASE,
  );
  assert.deepEqual(state.keymaps.map(hex), BASE.keymaps.map(hex));
});

test("colours and config come from the keyboard, macros from the profile", async () => {
  const current = clone(await fixtureState());
  current.macros = joinMacros([encodeMacro(["A"])]);
  const state = profileFromYaml("version: 1\nbase: factory-1.26\n", current);

  assert.equal(hex(state.config), hex(current.config));
  assert.equal(hex(state.leds), hex(current.leds));
  assert.equal(hex(state.macros), hex(BASE.macros));
  assert.deepEqual(state.keymaps.map(hex), BASE.keymaps.map(hex));
});

test("a keyboard without macros keeps its area as is", async () => {
  const current = await fixtureState();
  const text = profileToYaml(current, "1.26").text;

  assert.equal(hex(profileFromYaml(text, current).macros), hex(current.macros));
});

test("diff and full exports parse to the keyboard's layers", async () => {
  const current = await fixtureState();
  const diff = profileToYaml(current, "1.26").text;
  const full = profileToYaml(current, "1.26", { full: true }).text;

  assert.ok(full.length > diff.length);
  for (const text of [diff, full]) {
    assert.deepEqual(
      profileFromYaml(text, current).keymaps.map(hex),
      current.keymaps.map(hex),
    );
  }
});

test("export is stable", async () => {
  const current = await fixtureState();
  for (const full of [false, true]) {
    const text = profileToYaml(current, "1.26", { full }).text;
    const again = profileToYaml(profileFromYaml(text, current), "1.26", {
      full,
    }).text;
    assert.equal(again, text);
  }
});

test("the factory state exports as the header alone", () => {
  assert.equal(
    profileToYaml(BASE, "1.26").text,
    "# per-key colours and config are not included yet\n\nversion: 1\nbase: factory-1.26\n",
  );
});

test("unnamed codes round-trip through raw, NO is no key", () => {
  const state = clone(BASE);
  keyAt(state.keymaps[1], keyIndex("A")).set(fromHex("309f02"));
  keyAt(state.keymaps[1], keyIndex("B")).set(fromHex("000000"));
  keyAt(state.keymaps[1], keyIndex("C")).set(fromHex("100000"));

  const text = profileToYaml(state, "1.26").text;
  assert.match(text, /A: \{ raw: "30 9f 02" \}/);
  assert.match(text, /B: \{ raw: "00 00 00" \}/);
  assert.match(text, /C: NO/);
  assert.deepEqual(
    profileFromYaml(text, BASE).keymaps.map(hex),
    state.keymaps.map(hex),
  );
});

test("keys export by factory name, else row,col, and the knob by name", () => {
  const state = clone(BASE);
  keyAt(state.keymaps[2], keyIndex("CAPS")).set(fromHex("100029"));
  keyAt(state.keymaps[2], keyIndex("4,12")).set(fromHex("100029"));
  keyAt(state.keymaps[2], keyIndex("KNOB_PRESS")).set(fromHex("100029"));

  assert.match(
    profileToYaml(state, "1.26").text,
    /layers:\n {2}2:\n {4}CAPS: ESC\n {4}"?4,12"?: ESC\n {4}KNOB_PRESS: ESC\n/,
  );
});

test("an unknown firmware exports against the latest base, with a warning", () => {
  const { text, warnings } = profileToYaml(BASE, "1.03");
  assert.match(text, /base: factory-1.26/);
  assert.deepEqual(warnings, ["no base for firmware 1.03: factory-1.26 used"]);
  assert.deepEqual(profileToYaml(BASE, "1.26").warnings, []);
});

test("errors carry their line and path, all at once", () => {
  const message = errorOf(
    [
      "version: 1",
      "base: factory-1.26",
      "layers:",
      "  1:",
      "    F1: FOO",
      "    A: { raw: zz }",
      "  4:",
      "    A: ESC",
      "lightning: {}",
    ].join("\n"),
  );

  assert.deepEqual(message.split("\n"), [
    "line 5: layers.1.F1: unknown key name: FOO",
    'line 6: layers.1.A: raw must be 3 hex bytes, e.g. "30 9f 02"',
    "line 7: layers.4: unknown key",
    "line 9: lightning: unknown key",
  ]);
});

test("version and base are required and checked", () => {
  assert.equal(
    errorOf("base: factory-1.26"),
    "line 1: version: missing, expected 1",
  );
  assert.equal(
    errorOf("version: 2\nbase: factory-1.26"),
    "line 1: version: unknown version 2, expected 1",
  );
  assert.equal(
    errorOf("version: 1"),
    "line 1: base: missing; known bases: factory-1.26",
  );
  assert.equal(
    errorOf("version: 1\nbase: factory-0.1"),
    "line 2: base: unknown base factory-0.1; known bases: factory-1.26",
  );
});

test("bad positions, the same slot twice and bad YAML are refused", () => {
  assert.equal(
    errorOf("version: 1\nbase: factory-1.26\nlayers:\n  0:\n    NOPE: ESC"),
    "line 5: layers.0.NOPE: unknown key name: NOPE",
  );
  assert.equal(
    errorOf(
      "version: 1\nbase: factory-1.26\nlayers:\n  0:\n    A: ESC\n    3,1: B",
    ),
    "line 6: layers.0.3,1: same key as A",
  );
  assert.equal(
    errorOf("version: 1\nbase: factory-1.26\nlayers:\n  0:\n    A:"),
    "line 5: layers.0.A: missing binding",
  );
  assert.equal(
    errorOf("version: 1\nbase: factory-1.26\nlayers: 3"),
    "line 3: layers: expected layers 0-3",
  );
  assert.equal(
    errorOf("version: 1\nbase: factory-1.26\nlayers:\n  0: ESC"),
    "line 4: layers.0: expected keys and their bindings",
  );
  assert.match(errorOf("version: 1\nversion: 1"), /^line 2: /);
  assert.match(errorOf("- 1"), /^line 1: not a profile/);
});

test("end to end over the fake keyboard: only changed layers are written", async () => {
  const fake = new FakeKeyboard(64);
  const k = new Keyboard(fake);
  const current = await k.readState();
  const text = profileToYaml(current, "1.26").text.replace(
    "layers:\n  0:\n",
    "layers:\n  0:\n    A: ESC\n",
  );
  const next = profileFromYaml(text, current);

  fake.written.length = 0;
  assert.deepEqual(await k.writeState(next, current), []);

  const writes = [0x15, 0x1b, 0x1d, 0x1f, 0x21, 0x23, 0x2d];
  const cmds = new Set(
    fake.written.map((p) => p[1]).filter((c) => writes.includes(c)),
  );
  assert.deepEqual([...cmds], [0x1b]);
  assert.equal(
    hex(keyAt(fake.data.keymap0, keyIndex("A"))),
    hex(fromHex("100029")),
  );
});

// Saved from the keyboard: #0 made in the hub's editor (presses only), #1 typed into its recorder.
const HUB_MACROS = fromHex(
  "aa 55 98 00 02 00 00 00 0c 00 3c 00 0b 00 00 00 01 00 06 81 0a 00 0f 81 64 00 04 81 e8 03 18 81 10 27 07 81 e8 fd 08 81 64 00 2c 81 64 00 06 81 64 00 12 81 64 00 07 81 64 00 08 81 16 00 00 00 88 00 06 81 14 00 06 01 61 00 0f 81 30 00 0f 01 4c 00 14 81 24 00 14 01 53 00 18 81 17 00 18 01 3a 00 07 81 17 00 08 81 30 00 07 01 8e 04 08 01 7a 00 2c 81 13 00 06 81 45 00 2c 01 34 00 06 01 68 00 12 81 15 00 07 81 37 00 12 01 0e 00 08 81 22 00 07 01 00 00 08 01",
);

function withMacros(macros: Uint8Array): KeyboardState {
  return { ...clone(BASE), macros };
}

function macrosOf(text: string) {
  return splitMacros(
    profileFromYaml(`version: 1\nbase: factory-1.26\nmacros:\n${text}`, BASE)
      .macros,
  );
}

test("the three macro forms load", () => {
  assert.deepEqual(
    macrosOf(
      [
        '  0: "LCTL(C) DELAY(480) LCTL(V)"',
        "  1:",
        "    delay: 5",
        "    steps:",
        "      - H",
        "      - I",
        '  3: { raw: "02 00 00 00 14 00 01 83 14 00 01 03" }',
      ].join("\n"),
    ),
    [
      encodeMacro(["LCTL(C)", "DELAY(480)", "LCTL(V)"]),
      encodeMacro(["H", "I"], 5),
      EMPTY_MACRO,
      fromHex("02 00 00 00 14 00 01 83 14 00 01 03"),
    ],
  );
});

test("export picks one line, the list or raw", () => {
  const long = Array(31).fill("A");
  const state = withMacros(
    joinMacros([
      encodeMacro(["LSFT(H)", "I"]),
      encodeMacro(["H", "I"], 5),
      encodeMacro(long),
      fromHex("02 00 00 00 14 00 01 83 14 00 01 03"),
    ]),
  );

  const text = profileToYaml(state, "1.26").text;
  assert.ok(
    text.endsWith(
      [
        "macros:",
        "  0: LSFT(H) I",
        "  1:",
        "    delay: 5",
        "    steps:",
        "      - H",
        "      - I",
        "  2:",
        "    delay: 20",
        "    steps:",
        ...long.map((step) => `      - ${step}`),
        '  3: { raw: "02 00 00 00 14 00 01 83 14 00 01 03" }',
        "",
      ].join("\n"),
    ),
    text,
  );
  assert.equal(hex(profileFromYaml(text, BASE).macros), hex(state.macros));
});

test("the hub's macros round-trip, the hand-made one as raw", () => {
  const state = withMacros(HUB_MACROS);
  for (const full of [false, true]) {
    const text = profileToYaml(state, "1.26", { full }).text;
    assert.match(text, /\n {2}0: \{ raw: "0b 00 00 00 01 00 06 81/);
    assert.equal(hex(profileFromYaml(text, BASE).macros), hex(HUB_MACROS));
    assert.equal(
      profileToYaml(profileFromYaml(text, BASE), "1.26", { full }).text,
      text,
    );
  }
});

test("gaps fill with empty macros, and a trailing empty one is kept", () => {
  const state = withMacros(
    joinMacros([EMPTY_MACRO, encodeMacro(["A"]), EMPTY_MACRO]),
  );
  const text = profileToYaml(state, "1.26").text;
  assert.doesNotMatch(text, /\n {2}0:/);
  assert.equal(hex(profileFromYaml(text, BASE).macros), hex(state.macros));
});

test("macro errors carry their line and path", () => {
  assert.deepEqual(
    errorOf(
      [
        "version: 1",
        "base: factory-1.26",
        "macros:",
        "  0: A FOO",
        "  1:",
        "    steps:",
        "      - H",
        "      - NOPE",
        "  2: DOWN(A)",
        '  3: { raw: "01 00 00 00" }',
        "  x: A",
        "  4: { delay: 5 }",
        '  "1": A',
        "  5: { delay: 99999, steps: [A] }",
      ].join("\n"),
    ).split("\n"),
    [
      "line 4: macros.0: unknown key name: FOO",
      "line 8: macros.1.steps.1: unknown key name: NOPE",
      "line 9: macros.2: A left pressed: add UP(A)",
      "line 10: macros.3.raw: not a macro's bytes",
      "line 11: macros.x: unknown key",
      "line 12: macros.4: expected a string of steps, { delay, steps } or { raw }",
      "line 13: macros.1: same macro as 1",
      "line 14: macros.5.delay: must be 0 to 65535 ms",
    ],
  );
});

test("macros that outgrow the area are refused", () => {
  const steps = Array(130).fill("A").join(" ");
  assert.equal(
    errorOf(`version: 1\nbase: factory-1.26\nmacros:\n  0: ${steps}`),
    "line 3: macros: macros would take 1054 bytes, over the 1024-byte area",
  );
});
