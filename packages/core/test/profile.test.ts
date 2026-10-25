import assert from "node:assert/strict";
import { test } from "node:test";
import {
  baseByName,
  fromHex,
  hex,
  keyAt,
  Keyboard,
  keyIndex,
  profileFromYaml,
  profileToYaml,
  stateDiff,
  type KeyboardState,
} from "../src/index.ts";
import { BACKUP, FakeKeyboard, LAYER_FIXTURE } from "./fake-transport.ts";

const BASE = baseByName("factory-1.26")!;
const HEADER = "version: 1\nbase: factory-1.26\n";

/** The fixture keyboard's state, as `readState` gives it. */
const FIXTURE: KeyboardState = {
  config: BACKUP.config,
  keymaps: LAYER_FIXTURE,
  leds: BACKUP.leds,
  macros: BACKUP.macros,
};

function withKey(
  state: KeyboardState,
  layer: number,
  index: number,
  code: string,
) {
  const changed = structuredClone(state);
  keyAt(changed.keymaps[layer], index).set(fromHex(code));
  return changed;
}

function errorsOf(text: string): string {
  try {
    profileFromYaml(text);
  } catch (e) {
    return (e as Error).message;
  }
  assert.fail("no error");
}

test("a single key under layer 0 gives the base with that key changed", () => {
  const state = profileFromYaml(HEADER + "layers:\n  0:\n    A: ESC\n");

  assert.deepEqual(
    state.keymaps,
    withKey(BASE, 0, keyIndex("A"), "10 00 29").keymaps,
  );
});

test("the diff export holds only what differs from the base", () => {
  const state = withKey(
    withKey(BASE, 0, keyIndex("A"), "10 00 29"),
    2,
    keyIndex("KNOB_PRESS"),
    "10 00 00",
  );

  assert.equal(
    profileToYaml(state, "1.26"),
    "# Not included yet: macros, per-key colours and config. Loading this file leaves them as the keyboard has them.\n\n" +
      HEADER +
      "layers:\n  0:\n    A: ESC\n  2:\n    KNOB_PRESS: NO\n",
  );
});

test("diff and full exports parse to the same layers, the fixture's", () => {
  const diff = profileFromYaml(profileToYaml(FIXTURE, "1.26"));
  const full = profileFromYaml(profileToYaml(FIXTURE, "1.26", { full: true }));

  assert.deepEqual(diff.keymaps, LAYER_FIXTURE);
  assert.deepEqual(full.keymaps, LAYER_FIXTURE);
});

test("export is stable: exporting a parsed export gives the same text", () => {
  for (const full of [false, true]) {
    const text = profileToYaml(FIXTURE, "1.26", { full });
    assert.equal(profileToYaml(profileFromYaml(text), "1.26", { full }), text);
  }
});

test("an unknown firmware is diffed against the latest base", () => {
  assert.match(profileToYaml(BASE, "9.99"), /base: factory-1\.26\n/);
});

test("a code with no name round-trips through raw", () => {
  const state = withKey(withKey(BASE, 1, 0, "30 9f 02"), 1, 1, "00 00 00");
  const text = profileToYaml(state, "1.26");

  assert.match(text, /ESC: \{ raw: 30 9f 02 \}\n {4}F1: \{ raw: 00 00 00 \}/);
  assert.deepEqual(profileFromYaml(text).keymaps, state.keymaps);
});

test("NO is 10 00 00, row,col and numbers name positions", () => {
  const state = profileFromYaml(
    HEADER + "layers:\n  3:\n    3,1: NO\n    1: 2\n",
  );

  assert.equal(hex(keyAt(state.keymaps[3], 3 * 16 + 1)), "10 00 00");
  assert.equal(hex(keyAt(state.keymaps[3], keyIndex("1"))), "10 00 1f");
});

test("resources the format doesn't cover yet are left as the keyboard has them", () => {
  const current = structuredClone(FIXTURE);
  const state = profileFromYaml(HEADER, current);

  assert.deepEqual(state.config, current.config);
  assert.deepEqual(state.leds, current.leds);
  assert.deepEqual(state.macros, current.macros);
  assert.deepEqual(state.keymaps, BASE.keymaps);
});

test("every error is reported with its line and path", () => {
  const message = errorsOf(
    [
      "version: 2",
      "base: factory-0.1",
      "lightning: {}",
      "layers:",
      "  0:",
      "    A: FOO",
      "    3,1: ESC",
      "    CAPS: ESC",
      "    B: { raw: 30 9f }",
      "    C: { raw: 30 9f 02, x: 1 }",
      "    D:",
      "  4:",
      "    A: ESC",
      "  1:",
      "    FOO: ESC",
      "",
    ].join("\n"),
  );

  assert.deepEqual(message.split("\n"), [
    "line 1: version: unknown version 2: version 1 expected",
    "line 2: base: unknown base factory-0.1 (known bases: factory-1.26)",
    "line 3: lightning: unknown key",
    "line 6: layers.0.A: unknown key name: FOO",
    "line 7: layers.0.3,1: same key as layers.0.A",
    "line 9: layers.0.B.raw: must be 3 hex bytes",
    "line 10: layers.0.C.x: unknown key",
    "line 11: layers.0.D: missing binding",
    "line 12: layers.4: unknown layer: layers are 0-3",
    "line 15: layers.1.FOO: unknown key name: FOO",
  ]);
});

test("version and base are required", () => {
  assert.equal(
    errorsOf("layers: {}\n"),
    "line 1: version: missing\nline 1: base: missing (known bases: factory-1.26)",
  );
  assert.match(errorsOf(""), /^line 1: a profile is a map/);
  assert.match(
    errorsOf("version: 1\nversion: 1\n"),
    /^line 2: Map keys must be unique/,
  );
});

test("end to end, only the changed resources are written", async () => {
  const fake = new FakeKeyboard(64);
  const kb = new Keyboard(fake);
  const current = await kb.readState();
  const text = profileToYaml(
    withKey(current, 0, keyIndex("A"), "10 00 05"),
    "1.26",
  );

  const state = profileFromYaml(text, current);
  fake.written = [];
  assert.deepEqual(await kb.writeState(state, current), []);

  assert.deepEqual(stateDiff(state, current), ["keymap0"]);
  const writes = new Set(
    fake.written
      .map((p) => p[1])
      .filter((c) => [0x15, 0x1b, 0x1d, 0x1f, 0x21, 0x23, 0x2d].includes(c)),
  );
  assert.deepEqual([...writes], [0x1b]);
  assert.equal(hex(keyAt(fake.data.keymap0, keyIndex("A"))), "10 00 05");
});

test("end to end, an unchanged profile writes nothing", async () => {
  const fake = new FakeKeyboard(64);
  const kb = new Keyboard(fake);
  const current = await kb.readState();

  const state = profileFromYaml(profileToYaml(current, "1.26"), current);
  fake.written = [];
  assert.deepEqual(await kb.writeState(state, current), []);

  assert.ok(
    fake.written.every(
      (p) => ![0x15, 0x1b, 0x1d, 0x1f, 0x21, 0x23, 0x2d].includes(p[1]),
    ),
  );
});
