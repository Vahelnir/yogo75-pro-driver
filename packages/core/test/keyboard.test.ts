import assert from "node:assert/strict";
import { test } from "node:test";
import { withoutFullBytes } from "../src/flash.ts";
import { firmwareVersion, keyAt, Keyboard, keyIndex } from "../src/index.ts";
import { BACKUP, FakeKeyboard, LAYER_FIXTURE } from "./fake-transport.ts";

function setup(reportSize = 64) {
  const fake = new FakeKeyboard(reportSize);
  return { fake, kb: new Keyboard(fake) };
}

function flip(b: Uint8Array) {
  return b.map((x) => x ^ 0x5a);
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
      assert.deepEqual(await kb.readKeymap(l), LAYER_FIXTURE[l]);
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

test("the firmware version is read from the info", async () => {
  const { kb } = setup();
  assert.equal(firmwareVersion(await kb.readInfo()), "1.26");
});

test("config writes send the exact length of the last chunk", async () => {
  const { fake, kb } = setup(32);
  await kb.writeConfig(BACKUP.config);
  assert.deepEqual(
    packets(fake).filter(([cmd]) => cmd === 0x15),
    [
      [0x15, 0, 24],
      [0x15, 24, 24],
      [0x15, 48, 16],
    ],
  );
  assert.deepEqual(
    fake.written
      .filter((p) => p[1] === 0x15)
      .flatMap((p) => [...p.subarray(8, 8 + p[4])]),
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

test("colour writes reach the end of the buffer, so the keyboard saves them", async () => {
  for (const reportSize of [64, 32]) {
    const { fake, kb } = setup(reportSize);
    fake.data.leds.fill(7, 336);

    await kb.writeCustomLeds(BACKUP.leds);

    const [, offset, len] = packets(fake)
      .filter(([cmd]) => cmd === 0x23)
      .at(-1)!;
    assert.equal(offset + len, 384);
    assert.deepEqual(
      fake.data.leds.subarray(0, 336),
      withoutFullBytes(BACKUP.leds),
    );
    assert.deepEqual(fake.data.leds.subarray(336), new Uint8Array(48).fill(7));
  }
});

test("each writable resource reads back what was written", async () => {
  const { kb } = setup(32);

  await kb.writeConfig(flip(BACKUP.config));
  assert.deepEqual(await kb.readConfig(), flip(BACKUP.config));
  for (const l of [0, 1, 2, 3]) {
    await kb.writeKeymap(l, flip(LAYER_FIXTURE[l]));
    assert.deepEqual(await kb.readKeymap(l), flip(LAYER_FIXTURE[l]));
    assert.deepEqual(await kb.readKeymap(l, true), LAYER_FIXTURE[l]);
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
  test(`setKey writes only the key's 3 bytes on layer ${layer}`, async () => {
    const { fake, kb } = setup();
    const before = BACKUP[`keymap${layer}`];

    const old = await kb.setKey(layer, CAPS, FN);

    assert.deepEqual(old, keyAt(before, CAPS));
    const expected = before.slice();
    keyAt(expected, CAPS).set(FN);
    assert.deepEqual(fake.data[`keymap${layer}`].subarray(0, 336), expected);
    const writes = packets(fake).filter(([cmd]) => cmd === 0x1b + 2 * layer);
    assert.deepEqual(writes, [[0x1b + 2 * layer, CAPS * 3, 3]]);
  });
}

test("setKey writes only a knob action's 3 bytes", async () => {
  const { fake, kb } = setup();
  const press = keyIndex("KNOB_PRESS");

  const old = await kb.setKey(3, press, FN);

  assert.deepEqual(old, keyAt(LAYER_FIXTURE[3], press));
  const expected = LAYER_FIXTURE[3].slice();
  keyAt(expected, press).set(FN);
  assert.deepEqual(fake.data.keymap3.subarray(0, 345), expected);
  assert.deepEqual(fake.data.keymap3.subarray(345), new Uint8Array(39));
  const writes = packets(fake).filter(([cmd]) => cmd === 0x21);
  assert.deepEqual(writes, [[0x21, 342, 3]]);
});

for (const size of [64, 32]) {
  test(`a layer is written up to its knob, never past it (${size}-byte reports)`, async () => {
    const { fake, kb } = setup(size);
    fake.data.keymap1.fill(7, 345);

    await kb.writeKeymap(1, flip(LAYER_FIXTURE[1]));

    const writes = packets(fake).filter(([cmd]) => cmd === 0x1d);
    assert.deepEqual(writes.at(-1), [0x1d, 336, 9]);
    assert.ok(writes.every(([, offset, len]) => offset + len <= 345));
    assert.deepEqual(
      fake.data.keymap1.subarray(0, 345),
      flip(LAYER_FIXTURE[1]),
    );
    assert.deepEqual(
      fake.data.keymap1.subarray(345),
      new Uint8Array(39).fill(7),
    );
  });
}

test("a layer without its knob is written with the knob the keyboard holds", async () => {
  const { fake, kb } = setup();

  await kb.writeKeymap(2, flip(BACKUP.keymap2));

  const expected = LAYER_FIXTURE[2].slice();
  expected.set(flip(BACKUP.keymap2));
  assert.deepEqual(fake.data.keymap2.subarray(0, 345), expected);
  await assert.rejects(
    kb.writeKeymap(2, new Uint8Array(340)),
    /336 or 345 bytes/,
  );
});

test("keymap and colour packets must stay inside their buffer", async () => {
  const { fake, kb } = setup();
  for (const [cmd, offset, len] of [
    [0x1a, 382, 3],
    [0x21, 345, 1],
    [0x18, 340, 6],
    [0x16, 300, 56],
    [0x22, 380, 5],
    [0x23, 384, 1],
  ]) {
    await assert.rejects(kb.raw(cmd, offset, len), /within bytes/);
  }
  assert.equal(fake.written.length, 0);

  await kb.raw(0x1b, 342, 3, [1, 2, 3]);
  await kb.raw(0x23, 328, 56);
  await assert.rejects(kb.setKey(0, 115, FN), /within bytes/);
  await assert.rejects(kb.setKey(0, -1, FN), /within bytes/);
});

test("resetKey puts back the factory code", async () => {
  const { fake, kb } = setup();
  keyAt(fake.data.factory1, CAPS).set(FN);

  const { old, code } = await kb.resetKey(1, CAPS);

  assert.deepEqual(old, keyAt(BACKUP.keymap1, CAPS));
  assert.deepEqual(code, FN);
  assert.deepEqual(
    fake.data.keymap1.subarray(0, 345),
    fake.data.factory1.subarray(0, 345),
  );
});

test("resetKey puts back a knob action", async () => {
  const { fake, kb } = setup();
  const left = keyIndex("knob_left");
  keyAt(fake.data.keymap0, left).set(FN);

  const { old, code } = await kb.resetKey(0, left);

  assert.deepEqual(old, FN);
  assert.deepEqual(code, keyAt(LAYER_FIXTURE[0], left));
  assert.deepEqual(fake.data.keymap0.subarray(0, 345), LAYER_FIXTURE[0]);
});

test("after 5 s without a packet, the session is opened again before the next request", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  const { fake, kb } = setup(32);
  await kb.start();

  t.mock.timers.tick(10_000);
  fake.written = [];
  const map = await kb.readKeymap(0);

  assert.deepEqual(map, LAYER_FIXTURE[0]);
  assert.equal(fake.written[0][1], 0x10);
});

test("a request within 5 s of the last one sends no start packet", async (t) => {
  t.mock.timers.enable({ apis: ["Date"] });
  const { fake, kb } = setup(32);
  await kb.start();

  t.mock.timers.tick(4_000);
  fake.written = [];
  await kb.readConfig();

  assert.ok(fake.written.every((p) => p[1] !== 0x10));
});
