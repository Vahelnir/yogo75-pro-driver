import assert from "node:assert/strict";
import { test } from "node:test";
import { Keyboard, NoReplyError, openKeyboard } from "../src/index.ts";
import { FakeKeyboard } from "./fake-transport.ts";

/** A keyboard that leaves the first `times` start packets unanswered, as one asleep behind the dongle. */
function sleeping(reportSize: number, times: number) {
  const fake = new FakeKeyboard(reportSize);
  fake.replies = (reply) => (reply[1] === 0x10 && times-- > 0 ? [] : [reply]);
  return fake;
}

test("a sleeping dongle: the start packet is sent again until it answers", async () => {
  const fake = sleeping(32, 2);
  let asleep = 0;

  const repaired = await openKeyboard(new Keyboard(fake), {
    onAsleep: () => asleep++,
  });

  assert.equal(asleep, 2);
  assert.deepEqual(repaired, []);
  assert.deepEqual(
    fake.written.slice(0, 3).map((p) => p[1]),
    [0x10, 0x10, 0x10],
  );
});

test("without onAsleep, a sleeping dongle fails at once", async () => {
  const fake = sleeping(32, 1);

  await assert.rejects(openKeyboard(new Keyboard(fake)), NoReplyError);
  assert.equal(fake.written.length, 1);
});

test("over the cable, no reply fails at once even with onAsleep", async () => {
  const fake = sleeping(64, 1);
  let asleep = 0;

  await assert.rejects(
    openKeyboard(new Keyboard(fake), { onAsleep: () => asleep++ }),
    NoReplyError,
  );
  assert.equal(asleep, 0);
});

test("returns the flash pages it repaired", async () => {
  const fake = new FakeKeyboard(64);
  fake.fillPage("config", 64);

  assert.deepEqual(await openKeyboard(new Keyboard(fake)), ["config"]);
});
