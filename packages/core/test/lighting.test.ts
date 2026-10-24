import assert from "node:assert/strict";
import { test } from "node:test";
import { LIGHTING_MODES } from "../src/index.ts";

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
