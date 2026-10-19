import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fromHex,
  hex,
  keyAt,
  keycode,
  keycodeName,
  keyNames,
} from "../src/index.ts";
import { BACKUP } from "./fake-transport.ts";

function code(name: string) {
  return hex(keycode(name));
}

function name(h: string) {
  return keycodeName(fromHex(h));
}

test("names map to codes, whatever the case, prefix or alias", () => {
  for (const n of ["ESC", "esc", "kc_esc", "KC_ESCAPE", "Escape"]) {
    assert.equal(code(n), "10 00 29", n);
  }

  assert.equal(code("CAPS_LOCK"), "10 00 39");
  assert.equal(code("LEFT_SHIFT"), "10 02 00");
  assert.equal(code("FN"), "50 02 00");
  assert.equal(code("MO(1)"), "50 02 00");
  assert.equal(code("mo(3)"), "50 04 00");
  assert.equal(code("MACRO(2)"), "60 02 00");
  assert.equal(code("MACRO(2,3)"), "60 02 03");
  assert.equal(code("MACRO(2,4,10)"), "61 02 0a");
  assert.equal(code("LGUI(TAB)"), "10 08 2b");
  assert.equal(code("lctl(lsft(kc_c))"), "10 03 06");
  assert.equal(code("VOLU"), "30 e9 00");
  assert.equal(code("BTN2"), "40 00 02");
  assert.equal(code("MO(0)"), "50 01 00");
  assert.equal(code("PDF(3)"), "50 08 00");
  assert.equal(code("COLOR_PICKER"), "50 12 00");
  assert.equal(code("NK_TOGG"), "50 3a 00");
  assert.equal(code("MAC_TOGG"), "50 3b 00");
  assert.equal(code("KNOB_LOCK"), "50 40 00");
});

test("unknown names are rejected", () => {
  for (const n of [
    "NOPE",
    "SIDE_NEXT",
    "MO(4)",
    "MACRO(2,4)",
    "MACRO(2,4,0)",
    "MACRO(2,4,250)",
    "MACRO(2,3,5)",
    "LGUI(VOLU)",
    "0x5000",
  ]) {
    assert.throws(() => keycode(n), /unknown key/, n);
  }
});

test("codes print as their first name", () => {
  assert.equal(name("10 00 29"), "ESC");
  assert.equal(name("10 02 00"), "LSFT");
  assert.equal(name("50 02 00"), "FN");
  assert.equal(name("50 04 00"), "MO(3)");
  assert.equal(name("60 01 00"), "MACRO(1)");
  assert.equal(name("60 01 02"), "MACRO(1,2)");
  assert.equal(name("61 01 f9"), "MACRO(1,4,249)");
  assert.equal(name("10 08 2b"), "LGUI(TAB)");
  assert.equal(name("10 03 00"), "LSFT(LCTL)");
});

test("unknown codes round-trip as hex", () => {
  for (const h of ["50 19 00", "61 01 00", "00 00 00", "10 00 ff"]) {
    const n = name(h);
    assert.match(n, /^0x[0-9a-f]{6}$/);
    assert.equal(code(n), h);
  }
});

test("every name printed for the fixture parses back to its code", () => {
  for (const l of [0, 1, 2, 3]) {
    const map = BACKUP[`keymap${l}`];
    keyNames(map).forEach((n, i) =>
      assert.equal(code(n), hex(keyAt(map, i)), n),
    );
  }
});
