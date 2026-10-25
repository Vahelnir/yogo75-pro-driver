import assert from "node:assert/strict";
import { test } from "node:test";
import {
  baseByName,
  baseForFirmware,
  BASES,
  CONFIG_BYTES,
  fromHex,
  hex,
  keyAt,
  KNOB_LEFT,
  KNOB_PRESS,
  KNOB_RIGHT,
  splitMacros,
  stateFromJson,
  stateToJson,
} from "../src/index.ts";

const BASE = baseByName("factory-1.26")!;
const LAYER_BYTES = 345;
const LEDS_BYTES = 336;

// The factory layer 0 the core held before the base, read with 0x16
const PREVIOUS_FACTORY_LAYER0 = fromHex(
  [
    "100029 10003a 10003b 10003c 10003d 10003e 10003f 100040 100041 100042 100043 100044 100045 100046 100049 10004c",
    "100035 10001e 10001f 100020 100021 100022 100023 100024 100025 100026 100027 10002d 10002e 10002a 10004a 10004d",
    "10002b 100014 10001a 100008 100015 100017 10001c 100018 10000c 100012 100013 10002f 100030 100031 30cb01 30cf00",
    "100039 100004 100016 100007 100009 10000a 10000b 10000d 10000e 10000f 100033 100034 100032 100028 10004b 10004e",
    "100200 100064 10001d 10001b 100006 100019 100005 100011 100010 100036 100037 100038 100000 102000 100052 100000",
    "100100 100800 100400 100000 100000 10002c 100000 100000 100000 104000 500200 100000 101000 100050 100051 10004f",
  ].join(""),
);

test("factory-1.26 is found by name and by firmware", () => {
  assert.equal(BASE.name, "factory-1.26");
  assert.equal(BASE.firmware, "1.26");
  assert.equal(baseForFirmware("1.26"), BASE);
  assert.equal(baseForFirmware("1.25"), undefined);
  assert.equal(baseByName("factory-0.00"), undefined);
  assert.ok(BASES.includes(BASE));
});

test("factory-1.26 holds every resource at its size, and saves as a state", () => {
  assert.equal(BASE.config.length, CONFIG_BYTES);
  assert.equal(BASE.keymaps.length, 4);
  for (const layer of BASE.keymaps) {
    assert.equal(layer.length, LAYER_BYTES);
  }
  assert.equal(BASE.leds.length, LEDS_BYTES);
  assert.deepEqual(splitMacros(BASE.macros), []);

  const saved = stateFromJson(stateToJson(BASE));
  assert.deepEqual(saved, {
    config: BASE.config,
    keymaps: BASE.keymaps,
    leds: BASE.leds,
    macros: BASE.macros,
  });
});

test("layer 0's matrix is the previous factory layer 0, slots 96-111 empty", () => {
  const layer0 = BASE.keymaps[0];
  assert.equal(
    hex(layer0.subarray(0, PREVIOUS_FACTORY_LAYER0.length)),
    hex(PREVIOUS_FACTORY_LAYER0),
  );
  for (let slot = 96; slot < 112; slot++) {
    assert.equal(hex(keyAt(layer0, slot)), "10 00 00");
  }
});

test("each layer's knob holds the documented codes", () => {
  const knobs = BASE.keymaps.map((layer) =>
    [KNOB_LEFT, KNOB_RIGHT, KNOB_PRESS].map((i) => hex(keyAt(layer, i))),
  );
  assert.deepEqual(knobs, [
    ["50 47 00", "50 48 00", "30 e2 00"],
    ["50 47 00", "50 48 00", "30 e2 00"],
    ["30 ea 00", "30 e9 00", "30 e2 00"],
    ["30 ea 00", "30 e9 00", "30 e2 00"],
  ]);
});

test("the colour area is white on WASD and the arrows only", () => {
  const white = [33, 47, 48, 49, 72, 81, 82, 83];
  for (let led = 0; led < LEDS_BYTES / 3; led++) {
    assert.equal(
      hex(keyAt(BASE.leds, led)),
      white.includes(led) ? "ff ff ff" : "00 00 00",
      `LED ${led}`,
    );
  }
});
