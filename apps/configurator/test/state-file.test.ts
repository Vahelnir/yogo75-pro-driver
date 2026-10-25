import { readFileSync } from "node:fs";
import {
  FIELDS,
  Keyboard,
  keycode,
  profileToYaml,
  stateFromJson,
  stateToJson,
} from "@yogo75/core";
import { expect, test } from "vitest";
import {
  FakeKeyboard,
  LAYER_FIXTURE,
} from "../../../packages/core/test/fake-transport.ts";
import { connect } from "../src/session.ts";
import { exportState, parseImport } from "../src/state-file.ts";
import { resourcesSent } from "./resources-sent.ts";

const LED_MODE = FIELDS.indexOf("ledMode");
const CAPS = 48;
/** A version 1 `yogo75 save` file: layers without their knob. */
const OLD_FILE = readFileSync(
  new URL("../../../packages/core/test/full-backup.json", import.meta.url),
  "utf8",
);

test("export gives the profile `yogo75 save` writes for the same keyboard, diffed or full", async () => {
  const session = await connect(new FakeKeyboard(32));
  const held = await new Keyboard(new FakeKeyboard(32)).readState();

  expect(exportState(session)).toBe(profileToYaml(held, "1.26"));
  expect(exportState(session, { full: true })).toBe(
    profileToYaml(held, "1.26", { full: true }),
  );
  expect(exportState(session, { full: true }).length).toBeGreaterThan(
    exportState(session).length,
  );
});

test("an exported profile imports back, a load reads back what it wrote, and then nothing changes", async () => {
  const session = await connect(new FakeKeyboard(32));
  await session.update((s) => (s.config[LED_MODE] = 253));
  const file = exportState(session);

  const other = await connect(new FakeKeyboard(32));
  const imported = parseImport(other, "yogo75.yaml", file);
  expect(imported.state.config[LED_MODE]).toBe(253);

  expect(await other.load(imported.state)).toEqual([]);
  expect(parseImport(other, "yogo75.yaml", file).changes).toEqual([]);
});

test("the changes of an import are the resources that differ from the keyboard", async () => {
  const session = await connect(new FakeKeyboard(32));
  await session.update((s) => (s.config[LED_MODE] = 253));
  await session.setKey(2, CAPS, keycode("ESC"));
  const other = await connect(new FakeKeyboard(32));

  expect(parseImport(other, "mine.yml", exportState(session)).changes).toEqual([
    "config",
    "keymap2",
  ]);
});

test("a JSON save still imports", async () => {
  const session = await connect(new FakeKeyboard(32));
  const wanted = structuredClone(session.snapshot);
  wanted.config[LED_MODE] = 253;

  const imported = parseImport(session, "yogo75.json", stateToJson(wanted));

  expect(imported).toEqual({ state: wanted, changes: ["config"] });
});

test("an older JSON file without the knob imports, and the knob stays as it is", async () => {
  const fake = new FakeKeyboard(32);
  const session = await connect(fake);
  fake.written = [];

  expect(
    await session.load(parseImport(session, "old.json", OLD_FILE).state),
  ).toEqual([]);

  expect(resourcesSent(fake.written)).toContain("macros");
  expect(session.state.keymaps).toEqual(LAYER_FIXTURE);
  expect(stateFromJson(OLD_FILE).config).toEqual(session.state.config);
});

for (const [problem, name, text, error] of [
  ["not JSON", "a.json", "{", /JSON/],
  ["an unknown JSON version", "a.json", JSON.stringify({ version: 9 }), /9/],
  [
    "a profile with a typo",
    "a.yaml",
    "version: 1\nbase: factory-1.26\nlightning:\n  on: true\n",
    /line 3: lightning: unknown key/,
  ],
  [
    "a profile with an unknown key name",
    "a.yaml",
    "version: 1\nbase: factory-1.26\nlayers:\n  1:\n    F1: FOO\n",
    /line 5: layers\.1\.F1: /,
  ],
] as const) {
  test(`an import of ${problem} throws its errors and writes nothing`, async () => {
    const fake = new FakeKeyboard(32);
    const session = await connect(fake);
    fake.written = [];

    expect(() => parseImport(session, name, text)).toThrow(error);

    expect(fake.written).toEqual([]);
  });
}
