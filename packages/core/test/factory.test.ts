import assert from "node:assert/strict";
import { test } from "node:test";
import { LAYER_BYTES } from "../src/commands.ts";
import {
  baseForFirmware,
  baseNamed,
  BASES,
  CONFIG_BYTES,
  fromHex,
  hex,
  keyAt,
  MATRIX_BYTES,
  splitMacros,
} from "../src/index.ts";
import { CODE_BYTES } from "../src/keymap.ts";

const base = baseNamed("factory-1.26")!;

// Read from the keyboard with get_default_key_matrix 1 (0x16), one row per line.
const FACTORY_LAYER0 = fromHex(
  [
    "100029 10003a 10003b 10003c 10003d 10003e 10003f 100040 100041 100042 100043 100044 100045 100046 100049 10004c",
    "100035 10001e 10001f 100020 100021 100022 100023 100024 100025 100026 100027 10002d 10002e 10002a 10004a 10004d",
    "10002b 100014 10001a 100008 100015 100017 10001c 100018 10000c 100012 100013 10002f 100030 100031 30cb01 30cf00",
    "100039 100004 100016 100007 100009 10000a 10000b 10000d 10000e 10000f 100033 100034 100032 100028 10004b 10004e",
    "100200 100064 10001d 10001b 100006 100019 100005 100011 100010 100036 100037 100038 100000 102000 100052 100000",
    "100100 100800 100400 100000 100000 10002c 100000 100000 100000 104000 500200 100000 101000 100050 100051 10004f",
  ].join(""),
);

test("bases are found by name and by firmware", () => {
  assert.equal(baseForFirmware("1.26"), base);
  assert.deepEqual(
    BASES.map((b) => b.name),
    ["factory-1.26"],
  );
  assert.equal(baseNamed("factory-9.99"), undefined);
  assert.equal(baseForFirmware("1.24"), undefined);
});

test("factory-1.26 holds every resource at its size", () => {
  assert.equal(base.config.length, CONFIG_BYTES);
  assert.deepEqual(
    base.keymaps.map((map) => map.length),
    [LAYER_BYTES, LAYER_BYTES, LAYER_BYTES, LAYER_BYTES],
  );
  assert.equal(base.leds.length, MATRIX_BYTES);
  assert.deepEqual(splitMacros(base.macros), []);
});

test("factory-1.26 layer 0 is the factory layer 0 read from the keyboard", () => {
  assert.equal(
    hex(base.keymaps[0].subarray(0, FACTORY_LAYER0.length)),
    hex(FACTORY_LAYER0),
  );
});

test("factory-1.26 knob: rotation functions on layers 0-1, volume on 2-3, mute on press", () => {
  assert.deepEqual(
    base.keymaps.map((map) => hex(map.subarray(MATRIX_BYTES))),
    [
      "50 47 00 50 48 00 30 e2 00",
      "50 47 00 50 48 00 30 e2 00",
      "30 ea 00 30 e9 00 30 e2 00",
      "30 ea 00 30 e9 00 30 e2 00",
    ],
  );
});

test("factory-1.26 colours: white on WASD and the arrows only", () => {
  const lit = [...Array(base.leds.length / CODE_BYTES).keys()].filter(
    (led) => hex(keyAt(base.leds, led)) !== "00 00 00",
  );
  assert.deepEqual(lit, [33, 47, 48, 49, 72, 81, 82, 83]);
  assert.ok(lit.every((led) => hex(keyAt(base.leds, led)) === "ff ff ff"));
});
