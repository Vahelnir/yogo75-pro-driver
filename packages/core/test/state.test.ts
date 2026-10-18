import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { withoutFullBytes } from "../src/flash.ts";
import {
  encodeMacro,
  hex,
  joinMacros,
  keyAt,
  Keyboard,
  KNOB_PRESS,
  stateFromJson,
  stateToJson,
} from "../src/index.ts";
import { BACKUP, FakeKeyboard, LAYER_FIXTURE } from "./fake-transport.ts";

const FIXTURE = readFileSync(
  new URL("full-backup.json", import.meta.url),
  "utf8",
);

function withFixture(change: (backup: Record<string, unknown>) => void) {
  const backup = JSON.parse(FIXTURE);
  change(backup);
  return JSON.stringify(backup);
}

test("read → serialise → parse → write gives back exactly the bytes read", async () => {
  const source = new FakeKeyboard(64);
  const text = stateToJson(await new Keyboard(source).readState());

  const target = new FakeKeyboard(64);
  for (const name of Object.keys(BACKUP)) {
    target.data[name].fill(0);
  }
  const differs = await new Keyboard(target).writeState(stateFromJson(text));

  assert.deepEqual(differs, []);

  for (const name of Object.keys(BACKUP)) {
    const written = target.data[name].subarray(0, BACKUP[name].length);
    const expected =
      name === "leds" ? withoutFullBytes(BACKUP.leds) : BACKUP[name];
    assert.deepEqual(written, expected, name);
  }
  for (const l of [0, 1, 2, 3]) {
    assert.deepEqual(
      target.data[`keymap${l}`].subarray(0, 345),
      LAYER_FIXTURE[l],
    );
  }
  assert.equal(JSON.parse(text).version, 2);
});

test("writes config, layers 0-3, colours, then macros", async () => {
  const fake = new FakeKeyboard(64);
  await new Keyboard(fake).writeState(stateFromJson(FIXTURE));

  const writes = [0x15, 0x1b, 0x1d, 0x1f, 0x21, 0x23, 0x2d];
  const cmds = fake.written.map((p) => p[1]).filter((c) => writes.includes(c));
  assert.deepEqual(
    cmds.filter((c, i) => c !== cmds[i - 1]),
    writes,
  );
});

test("resources the keyboard did not apply are reported", async () => {
  const fake = new FakeKeyboard(64);
  const transfer = fake.transfer.bind(fake);
  // the macro writes turn into start packets: acked, never applied
  fake.transfer = (r) => transfer(r?.[1] === 0x2d ? r.with(1, 0x10) : r);
  const state = stateFromJson(FIXTURE);
  state.macros = state.macros.map((b) => b ^ 0xff);
  state.config = state.config.map((b) => b ^ 0xff);

  assert.deepEqual(await new Keyboard(fake).writeState(state), ["macros"]);
});

test("a macro area longer than 224 bytes is saved and loaded whole", async () => {
  const source = new FakeKeyboard(64);
  const area = joinMacros([encodeMacro(Array(40).fill("A"))]);
  await new Keyboard(source).writeMacros(area);
  const text = stateToJson(await new Keyboard(source).readState());

  const state = stateFromJson(text);
  assert.deepEqual(state.macros, area);
  assert.deepEqual(
    await new Keyboard(new FakeKeyboard(64)).writeState(state),
    [],
  );
});

test("an old file's 224 bytes load cut to the area's header length", async () => {
  const area = joinMacros([encodeMacro(["A"])]);
  const old = new Uint8Array(224);
  old.set(area);

  const state = stateFromJson(withFixture((b) => (b.macros = hex(old))));

  assert.deepEqual(state.macros, area);
  assert.deepEqual(
    await new Keyboard(new FakeKeyboard(64)).writeState(state),
    [],
  );
});

test("an older file, without the knob, leaves the knob as the keyboard holds it", async () => {
  for (const file of [FIXTURE, withFixture((b) => (b.version = 1))]) {
    const fake = new FakeKeyboard(64);
    keyAt(fake.data.keymap0, KNOB_PRESS).set([0x10, 0x00, 0x04]);
    const knob = fake.data.keymap0.slice(336, 345);

    const differs = await new Keyboard(fake).writeState(stateFromJson(file));

    assert.deepEqual(differs, []);
    assert.deepEqual(fake.data.keymap0.subarray(0, 336), BACKUP.keymap0);
    assert.deepEqual(fake.data.keymap0.subarray(336, 345), knob);
  }
});

test("a state without the knob is not saved: its file would claim a knob", () => {
  assert.throws(
    () => stateToJson(stateFromJson(FIXTURE)),
    /keymap0: 336 bytes, expected 345/,
  );
});

test("a backup without version loads as version 1", () => {
  const state = stateFromJson(FIXTURE);
  assert.deepEqual(state.config, BACKUP.config);
  assert.deepEqual(state.keymaps[3], BACKUP.keymap3);
  assert.deepEqual(state.leds, BACKUP.leds);
  assert.deepEqual(state.macros, BACKUP.macros);
});

test("invalid files are rejected", () => {
  for (const [text, error] of [
    ["not json", /not JSON/],
    ["[]", /not a saved keyboard state/],
    [withFixture((b) => (b.version = 3)), /unknown version 3/],
    [withFixture((b) => (b.version = 2)), /keymap0: 336 bytes, expected 345/],
    [withFixture((b) => delete b.keymap2), /keymap2: missing/],
    [withFixture((b) => (b.leds = "00 11")), /leds: 2 bytes, expected 336/],
    [withFixture((b) => (b.config = "zz".repeat(64))), /config: not hex/],
    [withFixture((b) => (b.macros = 7)), /macros: missing/],
    [withFixture((b) => (b.macros = "")), /macros: 0 bytes/],
    [withFixture((b) => (b.macros = "aa 55 20 00 01 00")), /macros: malformed/],
    // announces 300 bytes: an old file cut at 224
    [
      withFixture((b) => (b.macros = "aa 55 2c 01" + " 00".repeat(220))),
      /macros: malformed/,
    ],
  ] as const) {
    assert.throws(() => stateFromJson(text), error, text.slice(0, 40));
  }
});
