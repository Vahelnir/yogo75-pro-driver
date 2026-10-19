import assert from "node:assert/strict";
import { test } from "node:test";
import { keyIndex, keyNames } from "../src/index.ts";
import { BACKUP } from "./fake-transport.ts";

test("positions resolve by factory name or row,col", () => {
  assert.equal(keyIndex("CAPS"), 48);
  assert.equal(keyIndex("kc_caps_lock"), 48);
  assert.equal(keyIndex("FN"), 90);
  assert.equal(keyIndex("DESKTOP"), 46);
  assert.equal(keyIndex("NUHS"), 60);
  assert.equal(keyIndex("3,0"), 48);
  assert.equal(keyIndex("2, 15"), 47);
  assert.equal(keyIndex("5,15"), 95);
});

test("ambiguous, unknown and out-of-range positions are rejected", () => {
  assert.throws(() => keyIndex("NO"), /ambiguous/);
  assert.throws(() => keyIndex("F13"), /no factory key/);
  assert.throws(() => keyIndex("NOPE"), /unknown key/);
  assert.throws(() => keyIndex("6,0"), /row/);
  assert.throws(() => keyIndex("0,16"), /col/);
});

test("a fixture layer lists as names", () => {
  const names = keyNames(BACKUP.keymap1);
  assert.equal(names.length, 96);
  assert.deepEqual(names.slice(16, 21), [
    "GRV",
    "BT_1",
    "BT_2",
    "BT_3",
    "RF_PAIR",
  ]);
  assert.deepEqual(names.slice(46, 49), ["DESKTOP", "LOCK", "LCTL"]);
  assert.deepEqual(names.slice(88, 91), ["NO", "RALT", "FN"]);
});
