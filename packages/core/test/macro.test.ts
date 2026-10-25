import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decodeMacro,
  EMPTY_MACRO,
  encodeMacro,
  fromHex,
  hex,
  isEmptyMacro,
  joinMacros,
  Keyboard,
  splitMacros,
} from "../src/index.ts";
import { BACKUP, FakeKeyboard, HUB_MACROS } from "./fake-transport.ts";

function macroHex(steps: string[], delay?: number) {
  return hex(encodeMacro(steps, delay));
}

test("area matches the one verified on the keyboard", () => {
  // "hi" typed correctly
  assert.equal(
    hex(joinMacros([encodeMacro(["H", "I"])])),
    "aa 55 1e 00 01 00 00 00 0a 00 04 00 00 00 14 00 0b 81 14 00 0b 01 14 00 0c 81 14 00 0c 01",
  );
});

test("an empty slot next to a tap matches the area verified on the keyboard", () => {
  assert.equal(
    hex(joinMacros([EMPTY_MACRO, encodeMacro(["X"])])),
    "aa 55 24 00 02 00 00 00 0c 00 18 00 02 00 00 00 00 00 00 82 00 00 00 02 02 00 00 00 14 00 1b 81 14 00 1b 01",
  );
});

test("modifiers wrap only their key, in mask order, released in reverse", () => {
  assert.equal(
    macroHex(["LSFT(H)"], 5),
    "04 00 00 00 05 00 02 82 05 00 0b 81 05 00 0b 01 05 00 02 02",
  );
  assert.equal(
    macroHex(["LCTL(LSFT(T))"], 0),
    "06 00 00 00 00 00 01 82 00 00 02 82 00 00 17 81 00 00 17 01 00 00 02 02 00 00 01 02",
  );
  assert.equal(macroHex(["lsft"], 0), "02 00 00 00 00 00 02 82 00 00 02 02");
});

test("DOWN, UP, and DELAY added to the next action's delay, waited before it", () => {
  assert.equal(
    macroHex(["DOWN(LSFT)", "DELAY(30)", "H", "UP(LSFT)"]),
    "04 00 00 00 14 00 02 82 32 00 0b 81 14 00 0b 01 14 00 02 02",
  );
  assert.equal(
    macroHex(["DELAY(80)", "A"], 0),
    "02 00 00 00 50 00 04 81 00 00 04 01",
  );
});

test("malformed macros are rejected", () => {
  for (const [steps, error] of [
    [[], /at least one key/],
    [["A", "DELAY(5)"], /needs a key after/],
    [["A", "DELAY(0)"], /needs a key after/],
    [["DELAY(65516)", "A"], /can't exceed 65535/],
    [["DOWN(A)"], /A left pressed: add UP\(A\)/],
    [["UP(A)"], /A released while not pressed/],
    [["DOWN(A)", "A", "UP(A)"], /A pressed twice/],
    [["VOLU"], /not a plain key/],
    [["MACRO(0)"], /not a plain key/],
    [["NOPE"], /unknown key/],
    [["NO"], /does nothing/],
  ] as const) {
    assert.throws(() => encodeMacro([...steps]), error, steps.join(" "));
  }

  assert.throws(() => encodeMacro(["A"], 65536), /delay must be/);
});

test("macros decode to the spec that encodes them", () => {
  for (const [steps, delay] of [
    [["H", "I"], 20],
    [["LCTL(C)", "DELAY(480)", "LCTL(V)"], 20],
    [["DELAY(2)", "DOWN(LSFT)", "DELAY(30)", "H", "I", "UP(LSFT)"], 7],
    [["LSFT", "LSFT(LCTL(T))"], 0],
  ] as const) {
    assert.deepEqual(decodeMacro(encodeMacro([...steps], delay)), {
      steps,
      delay,
    });
  }
});

test("a macro recorded by the hub decodes: separate presses, uneven delays", () => {
  // Shift down, h down, Shift up, h up, i tap: as the recorder writes it
  const recorded = fromHex(
    "06 00 00 00 57 00 02 82 29 00 0b 81 84 00 02 02 29 00 0b 01 30 00 0c 81 29 00 0c 01",
  );
  assert.deepEqual(decodeMacro(recorded), {
    steps: [
      "DELAY(46)",
      "DOWN(LSFT)",
      "DOWN(H)",
      "DELAY(91)",
      "UP(LSFT)",
      "UP(H)",
      "DELAY(7)",
      "I",
    ],
    delay: 41,
  });
});

test("the macros the hub wrote to the keyboard decode, or stay raw", () => {
  const [handMade, recorded] = splitMacros(HUB_MACROS);
  const spec = decodeMacro(recorded);

  assert.equal(decodeMacro(handMade), undefined);
  assert.ok(spec);
  assert.deepEqual(spec.steps.slice(0, 4), [
    "DELAY(136)",
    "DOWN(C)",
    "DELAY(20)",
    "UP(C)",
  ]);
  assert.equal(hex(encodeMacro(spec.steps, spec.delay)), hex(recorded));
});

test("macros the spec can't express decode to nothing", () => {
  for (const h of [
    "00 00 00 00", // 0 actions: runs on into the next macro
    "02 00 00 00 14 00 01 83 14 00 01 03", // type 3 (mouse?)
    "01 00 00 00 14 00 0b 81", // key left pressed
    "02 00 00 00 14 00 03 82 14 00 03 02", // two modifiers in one action
  ]) {
    assert.equal(decodeMacro(fromHex(h)), undefined, h);
  }

  assert.ok(isEmptyMacro(EMPTY_MACRO));
});

test("an area splits into its macros and joins back", () => {
  const macros = [encodeMacro(["A"]), EMPTY_MACRO, fromHex("00 00 00 00")];
  assert.deepEqual(splitMacros(joinMacros(macros)), macros);
  assert.deepEqual(splitMacros(BACKUP.macros), []); // no header: no macro yet
  assert.throws(() => splitMacros(fromHex("aa 55 20 00 01 00")), /malformed/);
  assert.throws(
    () => joinMacros([encodeMacro(Array(130).fill("A"))]),
    /over the 1024-byte area/,
  );
});

test("setting a macro keeps the others byte for byte and fills gaps", async () => {
  const fake = new FakeKeyboard(32);
  const kb = new Keyboard(fake);
  const raw = fromHex("02 00 00 00 14 00 01 83 14 00 01 03");
  await kb.writeMacros(joinMacros([raw]));

  await kb.setMacro(2, encodeMacro(["B"]));

  assert.deepEqual(splitMacros(await kb.readMacros()), [
    raw,
    EMPTY_MACRO,
    encodeMacro(["B"]),
  ]);
  await assert.rejects(kb.setMacro(4, EMPTY_MACRO), /0 to 3/);
});
