import { readFileSync } from "node:fs";
import { FIELDS, stateFromJson } from "@yogo75/core";
import { expect, test } from "vitest";
import {
  FakeKeyboard,
  LAYER_FIXTURE,
} from "../../../packages/core/test/fake-transport.ts";
import { connect } from "../src/session.ts";
import { exportState, importState } from "../src/state-file.ts";
import { resourcesSent } from "./resources-sent.ts";

const LED_MODE = FIELDS.indexOf("ledMode");
/** A version 1 `yogo75 save` file: layers without their knob. */
const OLD_FILE = readFileSync(
  new URL("../../../packages/core/test/full-backup.json", import.meta.url),
  "utf8",
);

test("an exported file imports back as the same state", async () => {
  const session = await connect(new FakeKeyboard(32));
  await session.update((s) => (s.config[LED_MODE] = 253));
  const file = exportState(session);

  expect(stateFromJson(file)).toEqual(session.state);
  const other = await connect(new FakeKeyboard(32));
  // [] also covers the colours the file holds as 0xFF, read back as 0xFE
  expect(await importState(other, file)).toEqual([]);
  expect(other.state.config[LED_MODE]).toBe(253);
});

test("an older file without the knob imports, and the knob stays as it is", async () => {
  const fake = new FakeKeyboard(32);
  const session = await connect(fake);
  fake.written = [];

  expect(await importState(session, OLD_FILE)).toEqual([]);

  expect(resourcesSent(fake.written)).toContain("macros");
  expect(session.state.keymaps).toEqual(LAYER_FIXTURE);
});

for (const [problem, text] of [
  ["not JSON", "{"],
  ["a missing resource", JSON.stringify({ version: 2 })],
  ["an unknown version", JSON.stringify({ version: 9 })],
]) {
  test(`an import of ${problem} rejects and writes nothing`, async () => {
    const fake = new FakeKeyboard(32);
    const session = await connect(fake);
    fake.written = [];

    await expect(importState(session, text)).rejects.toThrow();

    expect(fake.written).toEqual([]);
  });
}
