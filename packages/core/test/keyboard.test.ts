import assert from "node:assert/strict";
import { test } from "node:test";
import { keyAt, Keyboard } from "../src/index.ts";
import { BACKUP, FakeKeyboard } from "./fake-transport.ts";

function setup(reportSize = 64) {
  const fake = new FakeKeyboard(reportSize);
  return { fake, kb: new Keyboard(fake) };
}

/** [cmd, offset, len] of each packet sent. */
function packets(fake: FakeKeyboard) {
  return fake.written.map((p) => [p[1], p[2] | (p[3] << 8), p[4]]);
}

test("packets carry magic, cmd and an increasing request code", async () => {
  const { fake, kb } = setup();
  await kb.start();
  await kb.start();
  assert.deepEqual(
    fake.written.map((p) => [...p.subarray(0, 8)]),
    [
      [0xaa, 0x10, 0, 0, 0, 1, 0, 0],
      [0xaa, 0x10, 0, 0, 0, 2, 0, 0],
    ],
  );
  assert.equal(fake.written[0].length, 64);
});

test("reports with another request code are skipped", async () => {
  const { fake, kb } = setup();
  fake.replies = (r) => {
    const other = r.slice();
    other[5]++;
    return [Uint8Array.of(1, 2, 3), other, r];
  };
  assert.deepEqual(await kb.readConfig(), BACKUP.config);
});

test("gives up after 20 reports", async () => {
  const { fake, kb } = setup();
  function unrelated(n: number) {
    return Array.from({ length: n }, () => Uint8Array.of(1));
  }

  fake.replies = (r) => [...unrelated(19), r];
  await kb.start();
  fake.replies = (r) => [...unrelated(20), r];
  await assert.rejects(kb.start(), /no reply to cmd 0x10/);
});

test("the error flag raises", async () => {
  const { fake, kb } = setup();
  fake.replies = (r) => [r.with(2, 0xff)];
  await assert.rejects(kb.start(), /^Error: cmd 0x10 error: aa 10 ff/);
});

test("the dongle's leading byte is stripped", async () => {
  const { fake, kb } = setup(32);
  fake.replies = (r) => [Uint8Array.of(0, ...r)];
  assert.deepEqual(await kb.readConfig(), BACKUP.config);
});

test("no reply raises", async () => {
  const { fake, kb } = setup(32);
  fake.replies = () => [];
  await assert.rejects(kb.start(), /^Error: no reply to cmd 0x10$/);
});

test("the logger sees every packet sent and received", async () => {
  const fake = new FakeKeyboard(64);
  const log: string[] = [];
  await new Keyboard(fake, (dir, p) => log.push(`${dir} ${p[1]}`)).start();
  assert.deepEqual(log, ["tx 16", "rx 16"]);
});

for (const size of [64, 32]) {
  test(`chunked reads reassemble each resource (${size}-byte reports)`, async () => {
    const { fake, kb } = setup(size);
    assert.deepEqual(await kb.readConfig(), BACKUP.config);
    for (const l of [0, 1, 2, 3]) {
      assert.deepEqual(await kb.readKeymap(l), BACKUP[`keymap${l}`]);
    }
    assert.deepEqual(await kb.readCustomLeds(), BACKUP.leds);
    assert.deepEqual(await kb.readMacros(), BACKUP.macros);
    assert.ok(fake.written.every((p) => p.length === size));
  });
}

test("chunks are report size - 8 bytes", async () => {
  const usb = setup(64);
  await usb.kb.readConfig();
  assert.deepEqual(packets(usb.fake), [
    [0x14, 0, 56],
    [0x14, 56, 8],
  ]);
  const dongle = setup(32);
  await dongle.kb.readInfo();
  assert.deepEqual(packets(dongle.fake), [
    [0x12, 0, 24],
    [0x12, 24, 15], // the hub reads 39 info bytes wireless
  ]);
});

test("config writes send the exact length of the last chunk", async () => {
  const { fake, kb } = setup(32);
  await kb.writeConfig(BACKUP.config);
  assert.deepEqual(packets(fake), [
    [0x15, 0, 24],
    [0x15, 24, 24],
    [0x15, 48, 16],
  ]);
  assert.deepEqual(
    fake.written.flatMap((p) => [...p.subarray(8, 8 + p[4])]),
    [...BACKUP.config],
  );
});

test("macro writes pad the last chunk to the full length", async () => {
  const { fake, kb } = setup(32);
  await kb.writeMacros(BACKUP.macros);
  assert.deepEqual(
    packets(fake),
    Array.from({ length: 10 }, (_, i) => [0x2d, i * 24, 24]),
  );
  assert.deepEqual([...fake.written[9].subarray(8 + 8)], Array(16).fill(0));
});

test("each writable resource reads back what was written", async () => {
  const { kb } = setup(32);
  function flip(b: Uint8Array) {
    return b.map((x) => x ^ 0x5a);
  }

  await kb.writeConfig(flip(BACKUP.config));
  assert.deepEqual(await kb.readConfig(), flip(BACKUP.config));
  for (const l of [0, 1, 2, 3]) {
    await kb.writeKeymap(l, flip(BACKUP[`keymap${l}`]));
    assert.deepEqual(await kb.readKeymap(l), flip(BACKUP[`keymap${l}`]));
    assert.deepEqual(await kb.readKeymap(l, true), BACKUP[`keymap${l}`]);
  }
  await kb.writeCustomLeds(flip(BACKUP.leds));
  assert.deepEqual(await kb.readCustomLeds(), flip(BACKUP.leds));
  await kb.writeMacros(flip(BACKUP.macros));
  assert.deepEqual(await kb.readMacros(), flip(BACKUP.macros));
});

test("battery level and cable state", async () => {
  const { kb } = setup();
  const power = await kb.readBattery();
  assert.equal(power.level, 87);
  assert.equal(power.state, 1);
  assert.deepEqual([...power.raw], [87, 1, 0, 0, 0, 0, 0, 0]);
});

test("the dot image is written padded, live frames as RGB565", async () => {
  const { fake, kb } = setup();
  await kb.writeDotImage(new Uint8Array(108));
  await kb.sendLiveFrame(new Uint8Array(108).fill(0xff, 0, 3).fill(0x08, 3, 6));
  await kb.endLiveFrames();
  assert.deepEqual(packets(fake), [
    [0x3b, 0, 56],
    [0x3b, 56, 56],
    [0x3c, 0, 56],
    [0x3c, 56, 16],
    [0x3d, 0, 0],
  ]);
  // ffffff -> 0xffff, 080808 -> 0x0841 (LE)
  assert.deepEqual(
    [...fake.written[2].subarray(8, 12)],
    [0xff, 0xff, 0x41, 0x08],
  );
});

test("raw sends one packet and returns the reply data", async () => {
  const { fake, kb } = setup();
  const data = await kb.raw(0x14, 56, 8);
  assert.deepEqual(packets(fake), [[0x14, 56, 8]]);
  assert.deepEqual(data.subarray(0, 8), BACKUP.config.subarray(56, 64));
  assert.equal(data.length, 56);
});

test("raw sends its data and refuses more than one packet holds", async () => {
  const { fake, kb } = setup(32);
  await kb.raw(0x23, 0, 3, [1, 2, 3]);
  assert.deepEqual([...fake.written[0].subarray(8, 11)], [1, 2, 3]);
  await assert.rejects(kb.raw(0x23, 0, 0, new Uint8Array(25)), /24 bytes/);
});

test("raw refuses factory reset and firmware flashing unless forced", async () => {
  const { fake, kb } = setup();
  for (const cmd of [0x31, 0xa0, 0xc0]) {
    await assert.rejects(kb.raw(cmd), /needs force/);
  }
  assert.equal(fake.written.length, 0);

  await kb.raw(0x31, 0, 0, [], true);
  assert.deepEqual(packets(fake), [[0x31, 0, 0]]);
});

const CAPS = 48; // row 3, col 0
const FN = Uint8Array.of(0x50, 0x02, 0x00);

for (const layer of [0, 1]) {
  test(`setKey rewrites layer ${layer} with only one slot changed`, async () => {
    const { fake, kb } = setup();
    const before = BACKUP[`keymap${layer}`];

    const old = await kb.setKey(layer, CAPS, FN);

    assert.deepEqual(old, keyAt(before, CAPS));
    const expected = before.slice();
    keyAt(expected, CAPS).set(FN);
    assert.deepEqual(fake.data[`keymap${layer}`], expected);
  });
}

test("resetKey puts back the factory code", async () => {
  const { fake, kb } = setup();
  keyAt(fake.data.factory1, CAPS).set(FN);

  const { old, code } = await kb.resetKey(1, CAPS);

  assert.deepEqual(old, keyAt(BACKUP.keymap1, CAPS));
  assert.deepEqual(code, FN);
  assert.deepEqual(fake.data.keymap1, fake.data.factory1);
});
