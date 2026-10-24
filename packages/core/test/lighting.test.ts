import assert from "node:assert/strict";
import { test } from "node:test";
import { LIGHTING_MODES } from "../src/index.ts";

const WAVES = ["speed", "color", "rainbow"];

test("the mode table holds every mode of the protocol doc, with its effective settings", () => {
  assert.deepEqual(LIGHTING_MODES, [
    { mode: 0, settings: [] },
    { mode: 1, settings: ["brightness", "speed", "color", "rainbow"] },
    { mode: 2, settings: ["speed"] },
    { mode: 3, settings: ["brightness", "speed", "color", "rainbow"] },
    { mode: 4, settings: ["brightness", "color", "rainbow"] },
    { mode: 5, settings: WAVES },
    { mode: 6, settings: WAVES },
    { mode: 7, settings: ["brightness", "speed", "color", "rainbow"] },
    { mode: 8, settings: WAVES },
    { mode: 9, settings: WAVES },
    { mode: 10, settings: WAVES },
    { mode: 11, settings: WAVES },
    { mode: 12, settings: ["speed"] },
    { mode: 13, settings: WAVES },
    { mode: 14, settings: WAVES },
    { mode: 15, settings: WAVES },
    { mode: 16, settings: WAVES },
    { mode: 17, settings: WAVES },
    { mode: 18, settings: WAVES },
    { mode: 19, settings: WAVES },
    { mode: 20, settings: WAVES },
    { mode: 253, settings: ["brightness", "color"] },
    { mode: 254, settings: ["color"] },
  ]);
});
