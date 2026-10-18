import { keyAt, Keyboard, keycode } from "@yogo75/core";
import { expect, test } from "vitest";
import {
  FakeKeyboard,
  LAYER_FIXTURE,
} from "../../../packages/core/test/fake-transport.ts";
import { connect } from "../src/session.ts";

test("connect reads the firmware version and the full state", async () => {
  const session = await connect(new FakeKeyboard(64));
  const expected = await new Keyboard(new FakeKeyboard(64)).readState();

  expect(session.firmware).toBe("1.26");
  expect(session.snapshot).toEqual(expected);
  expect(session.state).toEqual(expected);
  expect(session.state).not.toBe(session.snapshot);
  expect(session.state.keymaps).toEqual(LAYER_FIXTURE);
});

test("concurrent requests are sent one after the other, never interleaved", async () => {
  const fake = new FakeKeyboard(32);
  const session = await connect(fake);
  fake.written = [];

  await Promise.all([
    session.run((k) => k.readKeymap(0)),
    session.run((k) => k.readKeymap(1)),
  ]);

  const cmds = fake.written.map((p) => p[1]);
  expect(cmds).toEqual([...Array(15).fill(0x1a), ...Array(15).fill(0x1c)]);
});

test("a failed request does not block the next ones", async () => {
  const session = await connect(new FakeKeyboard(64));

  const failed = session.run(() => Promise.reject(new Error("boom")));
  const next = session.run((k) => k.readKeymap(0));

  await expect(failed).rejects.toThrow("boom");
  expect(await next).toHaveLength(345);
});

test("a dongle that does not answer is asleep: connect retries until it does", async () => {
  const fake = new FakeKeyboard(32);
  let sleeping = 2;
  fake.replies = (reply) =>
    reply[1] === 0x10 && sleeping-- > 0 ? [] : [reply];
  let asleep = 0;

  const session = await connect(fake, () => asleep++);

  expect(asleep).toBe(2);
  expect(session.firmware).toBe("1.26");
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
