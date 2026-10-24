import assert from "node:assert/strict";
import { test } from "node:test";
import {
  brightnessPercent,
  brightnessRaw,
  LIGHTING_MODES,
  speedRaw,
  speedSlowToFast,
} from "../src/index.ts";

const ALL = ["brightness", "speed", "color", "rainbow"];

test("the mode table holds every mode of the protocol doc, with its effective settings", () => {
  assert.deepEqual(LIGHTING_MODES, [
    { mode: 0, settings: [] },
    { mode: 1, settings: ALL },
    { mode: 2, settings: ["brightness", "speed"] },
    { mode: 3, settings: ALL },
    { mode: 4, settings: ["brightness", "color", "rainbow"] },
    { mode: 5, settings: ALL },
    { mode: 6, settings: ALL },
    { mode: 7, settings: ALL },
    { mode: 8, settings: ALL },
    { mode: 9, settings: ALL },
    { mode: 10, settings: ALL },
    { mode: 11, settings: ALL },
    { mode: 12, settings: ["brightness", "speed"] },
    { mode: 13, settings: ALL },
    { mode: 14, settings: ALL },
    { mode: 15, settings: ALL },
    { mode: 16, settings: ALL },
    { mode: 17, settings: ALL },
    { mode: 18, settings: ALL },
    { mode: 19, settings: ALL },
    { mode: 20, settings: ALL },
    { mode: 253, settings: ["brightness", "color"] },
    { mode: 254, settings: ["color"] },
  ]);
});

test("brightness converts between raw 0–90 and 0–100 %, both ways", () => {
  assert.equal(brightnessPercent(0), 0);
  assert.equal(brightnessPercent(90), 100);
  assert.equal(brightnessPercent(1), 1);
  assert.equal(brightnessPercent(44), 49);
  assert.equal(brightnessRaw(0), 0);
  assert.equal(brightnessRaw(100), 90);
  assert.equal(brightnessRaw(1), 1);
  assert.equal(brightnessRaw(55), 50);
});

test("every raw brightness survives a round trip through percent", () => {
  for (let raw = 0; raw <= 90; raw++) {
    assert.equal(brightnessRaw(brightnessPercent(raw)), raw);
  }
});

test("speed converts between the firmware's raw value (0 = fast) and a slow → fast scale (0 = slowest)", () => {
  assert.equal(speedSlowToFast(0), 6);
  assert.equal(speedSlowToFast(6), 0);
  assert.equal(speedSlowToFast(2), 4);
  assert.equal(speedRaw(0), 6);
  assert.equal(speedRaw(6), 0);
  assert.equal(speedRaw(4), 2);
});
