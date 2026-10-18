import assert from "node:assert/strict";
import { test } from "node:test";
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

  const zeros = fake.written.filter(
    (p) => p[1] === 0x23 && p.subarray(8, 8 + p[4]).every((b) => b === 0),
  );
  assert.ok(zeros.length > 0);
  fake.reboot();
  assert.deepEqual([...(await kb.readCustomLeds()).subarray(0, 3)], [1, 2, 3]);
});

test("setKey on a stuck page saves the key with the whole layer", async () => {
  const { fake, kb } = setup();
  fake.fillPage("keymap1", 10);
  // the newest change, lost at the reboot; our writes never change the knob past the matrix
  fake.pages.keymap1.records[9] = fake.data.keymap1.slice();
  fake.pages.keymap1.records[9].set(flip(BACKUP.keymap1));
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
