import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BASES,
  keyNames,
  KEYS,
  KNOB,
  LAYOUT,
  type KeyRect,
} from "../src/index.ts";

const ABSENT_ISO = [60, 65];

function overlap(a: KeyRect, b: KeyRect): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

test("every factory key has a position, the absent ISO slots none", () => {
  const keys = keyNames(BASES[0].keymaps[0])
    .map((name, index) => ({ name, index }))
    .filter(({ name, index }) => name !== "NO" && !ABSENT_ISO.includes(index))
    .map(({ index }) => index);

  assert.deepEqual(
    [...LAYOUT.keys()].sort((a, b) => a - b),
    keys,
  );
  // the 84 keys of the grid and the two side buttons
  assert.equal(LAYOUT.size, 86);
  assert.ok([...LAYOUT.keys()].every((index) => index < KEYS));
});

test("no two keys overlap, nor the knob", () => {
  const rects = [...LAYOUT.values(), KNOB];
  for (const [i, a] of rects.entries()) {
    for (const b of rects.slice(i + 1)) {
      assert.ok(
        !overlap(a, b),
        `${JSON.stringify(a)} overlaps ${JSON.stringify(b)}`,
      );
    }
  }
});
