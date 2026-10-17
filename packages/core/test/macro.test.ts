import assert from "node:assert/strict";
import { test } from "node:test";
import { hex, macroBlob } from "../src/index.ts";

test("macro blob matches the one verified on the keyboard", () => {
  // "hi" typed correctly
  assert.equal(
    hex(macroBlob([{ keys: [0x0b, 0x0c], delay: 20 }])),
    "aa 55 1e 00 01 00 00 00 0a 00 04 00 00 00 14 00 0b 81 14 00 0b 01 14 00 0c 81 14 00 0c 01",
  );
});

test("modifiers are held around the other keys", () => {
  // Shift + h: Shift down, h down, h up, Shift up
  const blob = macroBlob([{ keys: [0xe1, 0x0b], delay: 5 }]);
  assert.equal(
    hex(blob.subarray(14)),
    "05 00 02 82 05 00 0b 81 05 00 0b 01 05 00 02 02",
  );
});
