import { keycode } from "@yogo75/core";
import { expect, test } from "vitest";
import { KEY_NAMES } from "../src/keycodes.ts";

test.each(Object.entries(KEY_NAMES))(
  "%s → %s is a name the core accepts",
  (_, name) => {
    expect(() => keycode(name)).not.toThrow();
  },
);

test("letters, digits and modifiers map to their QMK names", () => {
  expect(KEY_NAMES.KeyQ).toBe("Q");
  expect(KEY_NAMES.Digit0).toBe("0");
  expect(KEY_NAMES.ShiftRight).toBe("RSFT");
  expect(KEY_NAMES.F24).toBe("F24");
  expect(KEY_NAMES.Numpad7).toBe("P7");
});
