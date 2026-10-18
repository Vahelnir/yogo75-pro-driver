import assert from "node:assert/strict";
import { test } from "node:test";
import { readU16le } from "../src/bytes.ts";
import { CONFIG_PAGE } from "../src/flash.ts";
import { keyAt, Keyboard } from "../src/index.ts";
import { BACKUP, FakeKeyboard } from "./fake-transport.ts";

function setup(reportSize = 64) {
  const fake = new FakeKeyboard(reportSize);
  return { fake, kb: new Keyboard(fake) };
}

function flip(b: Uint8Array) {
  return b.map((x) => x ^ 0x5a);
}

for (const size of [64, 32]) {
  test(`writes survive a reboot (${size}-byte reports)`, async () => {
    const { fake, kb } = setup(size);

    await kb.writeConfig(flip(BACKUP.config));
    await kb.writeKeymap(2, flip(BACKUP.keymap2));
    await kb.writeCustomLeds(Uint8Array.of(1, 2, 3));
    fake.reboot();

    assert.deepEqual(await kb.readConfig(), flip(BACKUP.config));
    assert.deepEqual(await kb.readKeymap(2), flip(BACKUP.keymap2));
    assert.deepEqual(
      [...(await kb.readCustomLeds()).subarray(0, 3)],
      [1, 2, 3],
    );
  });
}

/** Writes of zeros, by their first chunk (the backup's config ends in zeros). */
function zeroBlocks(fake: FakeKeyboard, cmd: number) {
  return fake.written.filter(
    (p) =>
      p[1] === cmd &&
      readU16le(p, 2) === 0 &&
      p.subarray(8, 8 + p[4]).every((b) => b === 0),
  );
}

for (const size of [64, 32]) {
  test(`a config write is saved, though its save arms only at the next tick (${size}-byte reports)`, async () => {
    const { fake, kb } = setup(size);

    await kb.writeConfig(flip(BACKUP.config));

    assert.deepEqual(zeroBlocks(fake, 0x15), []);
    fake.reboot();
    assert.deepEqual(await kb.readConfig(), flip(BACKUP.config));
  });
}

test("when the zeros don't save either, the data is written back before the error", async () => {
  const { fake, kb } = setup();
  fake.fillPage("config", 63); // may be stuck
  const transfer = fake.transfer.bind(fake);
  // the config's save stays pending forever
  fake.transfer = async (r) => {
    const reply = await transfer(r);
    if (r?.[1] === 0x14 && readU16le(r, 2) === CONFIG_PAGE.armedOffset) {
      reply![8] = 1;
    }
    return reply;
  };

  await assert.rejects(
    kb.writeConfig(flip(BACKUP.config)),
    /the keyboard does not save its config/,
  );

  assert.ok(zeroBlocks(fake, 0x15).length > 0);
  const last = fake.written.filter((p) => p[1] === 0x15).slice(-2); // 56 + 8 bytes
  assert.deepEqual(
    last.flatMap((p) => [...p.subarray(8, 8 + p[4])]),
    [...flip(BACKUP.config)],
  );
});

test("a write that fills its page is written again, which erases the page", async () => {
  const { fake, kb } = setup();
  fake.fillPage("keymap0", 9);

  await kb.writeKeymap(0, flip(BACKUP.keymap0));

  assert.equal(fake.pages.keymap0.next, 1);
  fake.reboot();
  assert.deepEqual(await kb.readKeymap(0), flip(BACKUP.keymap0));
});

test("a stuck page is saved as zeros first, then the data erases it", async () => {
  const { fake, kb } = setup();
  fake.fillPage("leds", 10);
  fake.reboot(); // full page: from now on the firmware writes over its last record

  await kb.writeCustomLeds(Uint8Array.of(1, 2, 3));

  assert.ok(zeroBlocks(fake, 0x23).length > 0);
  fake.reboot();
  assert.deepEqual([...(await kb.readCustomLeds()).subarray(0, 3)], [1, 2, 3]);
});

test("setKey on a stuck page saves the key with the whole layer", async () => {
  const { fake, kb } = setup();
  fake.fillPage("keymap1", 10);
  fake.pages.keymap1.records[9] = flip(BACKUP.keymap1); // the newest change, lost at the reboot
  fake.reboot();
  const code = Uint8Array.of(0x10, 0x00, 0x1b);

  await kb.setKey(1, 48, code);

  fake.reboot();
  const expected = BACKUP.keymap1.slice();
  keyAt(expected, 48).set(code);
  assert.deepEqual(await kb.readKeymap(1), expected);
});

test("white keys are written as 0xFE, so the record never reads as empty", async () => {
  const { fake, kb } = setup();
  const white = new Uint8Array(33).fill(0xff); // LEDs 0-10

  await kb.writeCustomLeds(white);
  fake.reboot();

  assert.deepEqual(
    (await kb.readCustomLeds()).subarray(0, 33),
    new Uint8Array(33).fill(0xfe),
  );
});

test("repairFlashPages rewrites only the pages left full or maybe stuck", async () => {
  const { fake, kb } = setup();
  fake.fillPage("config", 63); // one record left
  fake.fillPage("keymap2", 10);
  fake.reboot(); // keymap2 is now stuck

  assert.deepEqual(await kb.repairFlashPages(), ["config", "keymap2"]);

  assert.deepEqual(zeroBlocks(fake, 0x15), []);

  const writes = new Set(
    fake.written.map((p) => p[1]).filter((c) => c % 2 === 1 && c !== 0x15),
  );
  assert.deepEqual([...writes], [0x1f]); // keymap2, besides the config
  await kb.writeKeymap(2, flip(BACKUP.keymap2));
  fake.reboot();
  assert.deepEqual(await kb.readKeymap(2), flip(BACKUP.keymap2));
  assert.deepEqual(await kb.repairFlashPages(), []);
});

test("a write the keyboard never saves raises", async () => {
  const { fake, kb } = setup();
  const transfer = fake.transfer.bind(fake);
  // config writes turn into start packets: acked, never applied, never saved
  fake.transfer = (r) => transfer(r?.[1] === 0x15 ? r.with(1, 0x10) : r);

  await assert.rejects(
    kb.writeConfig(BACKUP.config),
    /the keyboard does not save its config/,
  );
});

test("saves landing during a write never leave the page full", async () => {
  for (let used = 1; used <= 9; used++) {
    const { fake, kb } = setup(32);
    fake.savesDuringWrites = true;
    fake.fillPage("keymap1", used);

    await kb.writeKeymap(1, flip(BACKUP.keymap1));

    assert.ok(fake.pages.keymap1.next < 10, `from ${used} records`);
    fake.reboot();
    assert.deepEqual(await kb.readKeymap(1), flip(BACKUP.keymap1));
  }
});
