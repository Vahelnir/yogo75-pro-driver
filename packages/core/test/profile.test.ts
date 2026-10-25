import assert from "node:assert/strict";
import { test } from "node:test";
import {
  baseNamed,
  fromHex,
  hex,
  keyAt,
  Keyboard,
  keyIndex,
  profileFromYaml,
  profileToYaml,
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

test("macros, colours and config come from the keyboard, not the base", async () => {
  const current = await fixtureState();
  const state = profileFromYaml("version: 1\nbase: factory-1.26\n", current);

  assert.equal(hex(state.config), hex(current.config));
  assert.equal(hex(state.leds), hex(current.leds));
  assert.equal(hex(state.macros), hex(current.macros));
  assert.deepEqual(state.keymaps.map(hex), BASE.keymaps.map(hex));
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
    "# macros, per-key colours and config are not included yet\n\nversion: 1\nbase: factory-1.26\n",
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
