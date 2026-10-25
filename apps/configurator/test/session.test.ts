import {
  FIELDS,
  keyAt,
  Keyboard,
  keycode,
  type KeyboardState,
} from "@yogo75/core";
import { expect, test } from "vitest";
import { watch } from "vue";
import { withoutFullBytes } from "../../../packages/core/src/flash.ts";
import {
  FakeKeyboard,
  LAYER_FIXTURE,
} from "../../../packages/core/test/fake-transport.ts";
import { connect } from "../src/session.ts";
import { resourcesSent } from "./resources-sent.ts";

test("connect reads the firmware version and the full state", async () => {
  const session = await connect(new FakeKeyboard(64));
  const expected = await new Keyboard(new FakeKeyboard(64)).readState();

  expect(session.firmware).toBe("1.26");
  expect(session.snapshot).toEqual(expected);
  expect(session.state).toEqual(expected);
  expect(session.state).not.toBe(session.snapshot);
  expect(session.state.keymaps).toEqual(LAYER_FIXTURE);
});

const CAPS = 48;
const FN = keycode("FN");

test("a key change is written, then its layer read back into the state", async () => {
  const fake = new FakeKeyboard(32);
  const session = await connect(fake);
  fake.written = [];

  await session.setKey(1, CAPS, FN);

  const cmds = fake.written.map((p) => p[1]);
  expect(cmds.indexOf(0x1d)).toBeLessThan(cmds.lastIndexOf(0x1c));
  expect(cmds.at(-1)).toBe(0x1c);
  expect(keyAt(session.state.keymaps[1], CAPS)).toEqual(FN);
  expect(session.state.keymaps[1]).toEqual(fake.data.keymap1.subarray(0, 345));
});

test("fast successive changes are written in order", async () => {
  const fake = new FakeKeyboard(32);
  const session = await connect(fake);
  fake.written = [];

  await Promise.all([
    session.setKey(0, CAPS, FN),
    session.setKey(2, CAPS, FN),
    session.setKey(0, CAPS, keycode("A")),
  ]);

  const writes = fake.written
    .filter((p) => [0x1b, 0x1f].includes(p[1]))
    .map((p) => [p[1], p[8], p[9], p[10]]);
  expect(writes).toEqual([
    [0x1b, ...FN],
    [0x1f, ...FN],
    [0x1b, ...keycode("A")],
  ]);
  expect(keyAt(session.state.keymaps[0], CAPS)).toEqual(keycode("A"));
  expect(keyAt(session.state.keymaps[2], CAPS)).toEqual(FN);
});

for (const [fault, reply] of [
  [
    "an error reply",
    (r: Uint8Array) => [
      Uint8Array.of(...r.subarray(0, 2), 0xff, ...r.subarray(3)),
    ],
  ],
  ["no reply", () => []],
] as const) {
  test(`a write with ${fault} rejects, and the state is what the keyboard holds`, async () => {
    const fake = new FakeKeyboard(32);
    const session = await connect(fake);
    keyAt(fake.data.keymap0, 0).set(FN); // changed behind the session's back
    fake.replies = (r) => (r[1] === 0x1b ? reply(r) : [r]);

    await expect(session.setKey(0, CAPS, FN)).rejects.toThrow("cmd 0x1b");

    expect(session.state.keymaps[0]).toEqual(
      fake.data.keymap0.subarray(0, 345),
    );
  });
}

const LED_MODE = FIELDS.indexOf("ledMode");

for (const [name, change] of [
  ["config", (s) => (s.config[LED_MODE] = 253)],
  ["keymap2", (s) => keyAt(s.keymaps[2], CAPS).set(FN)],
  ["leds", (s) => s.leds.set([1, 2, 3])],
  ["macros", (s) => (s.macros[s.macros.length - 1] ^= 1)],
] as [string, (s: KeyboardState) => void][]) {
  test(`an update of the ${name} writes only it, then reads it back into the state`, async () => {
    const fake = new FakeKeyboard(32);
    const session = await connect(fake);
    const wanted = structuredClone(session.snapshot);
    change(wanted);
    if (name === "leds") {
      // the colours the backup holds as 0xFF are written, and read back, as 0xFE
      wanted.leds = withoutFullBytes(wanted.leds);
    }
    fake.written = [];

    await session.update(change);

    expect(resourcesSent(fake.written)).toEqual([name]);
    expect(session.state).toEqual(wanted);
    expect(session.state).toEqual(await new Keyboard(fake).readState());
  });
}

test("an update that changes nothing sends nothing", async () => {
  const fake = new FakeKeyboard(64);
  const session = await connect(fake);
  fake.written = [];

  await session.update(() => {});

  expect(fake.written).toEqual([]);
});

test("a failed update rejects, and every resource it changed is what the keyboard holds", async () => {
  const fake = new FakeKeyboard(32);
  const session = await connect(fake);
  fake.data.leds[0] ^= 1; // changed behind the session's back
  fake.replies = (r) => (r[1] === 0x23 ? [] : [r]);

  await expect(
    session.update((s) => {
      s.config[LED_MODE] = 253;
      s.leds.set([1, 2, 3]);
    }),
  ).rejects.toThrow("cmd 0x23");

  const held = await new Keyboard(fake).readState();
  expect(session.state.config[LED_MODE]).toBe(253);
  expect(session.state.config).toEqual(held.config);
  expect(session.state.leds).toEqual(held.leds);
});

test("a failed update does not block the next writes", async () => {
  const session = await connect(new FakeKeyboard(64));

  const failed = session.update(() => {
    throw new Error("boom");
  });
  const next = session.setKey(0, CAPS, FN);

  await expect(failed).rejects.toThrow("boom");
  await next;
  expect(keyAt(session.state.keymaps[0], CAPS)).toEqual(FN);
});

test("an update and a key change are sent one after the other, never interleaved", async () => {
  const fake = new FakeKeyboard(32);
  const session = await connect(fake);
  fake.written = [];

  await Promise.all([
    session.update((s) => (s.config[LED_MODE] = 253)),
    session.setKey(0, CAPS, FN),
  ]);

  const cmds = fake.written.map((p) => p[1]);
  expect(cmds.lastIndexOf(0x15)).toBeLessThan(cmds.indexOf(0x1b));
});

test("the state is reactive: a watcher sees each read-back", async () => {
  const session = await connect(new FakeKeyboard(64));
  const seen: string[] = [];
  watch(
    () => session.state.config,
    () => seen.push("config"),
    { flush: "sync" },
  );
  watch(
    () => session.state.keymaps[1],
    () => seen.push("keymap1"),
    {
      flush: "sync",
    },
  );

  await session.update((s) => (s.config[LED_MODE] = 253));
  await session.setKey(1, CAPS, FN);

  expect(seen).toEqual(["config", "keymap1"]);
});

test("restore writes every resource of the snapshot, then reads them back into the state", async () => {
  const fake = new FakeKeyboard(32);
  const session = await connect(fake);
  await session.update((s) => (s.config[LED_MODE] = 253));
  await session.setKey(2, CAPS, FN);
  keyAt(fake.data.keymap0, 0).set(FN); // changed behind the session's back, e.g. by an Fn key
  fake.written = [];

  const mismatches = await session.load(session.snapshot);

  expect(mismatches).toEqual([]);
  expect(resourcesSent(fake.written)).toEqual([
    "config",
    "keymap0",
    "keymap1",
    "keymap2",
    "keymap3",
    "leds",
    "macros",
  ]);
  const held = await new Keyboard(fake).readState();
  expect(session.state).toEqual(held);
  expect(held.config).toEqual(session.snapshot.config);
  expect(held.keymaps).toEqual(session.snapshot.keymaps);
});

test("a load reports the resources the keyboard did not apply", async () => {
  const fake = new FakeKeyboard(32);
  const session = await connect(fake);
  const wanted = structuredClone(session.snapshot);
  wanted.config[LED_MODE] = 253;
  wanted.macros[wanted.macros.length - 1] ^= 1;
  // the macro writes turn into start packets: acked, never applied
  const transfer = fake.transfer.bind(fake);
  fake.transfer = (r) => transfer(r?.[1] === 0x2d ? r.with(1, 0x10) : r);

  expect(await session.load(wanted)).toEqual(["macros"]);
  expect(session.state.config[LED_MODE]).toBe(253);
});

test("a failed load rejects, and the state is what the keyboard holds", async () => {
  const fake = new FakeKeyboard(32);
  const session = await connect(fake);
  const wanted = structuredClone(session.snapshot);
  wanted.config[LED_MODE] = 253;
  wanted.leds.set([1, 2, 3]);
  fake.replies = (r) => (r[1] === 0x23 ? [] : [r]);

  await expect(session.load(wanted)).rejects.toThrow("cmd 0x23");

  expect(session.state).toEqual(await new Keyboard(fake).readState());
  expect(session.state.config[LED_MODE]).toBe(253);
});
