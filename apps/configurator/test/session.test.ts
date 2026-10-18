import { Keyboard } from "@yogo75/core";
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
