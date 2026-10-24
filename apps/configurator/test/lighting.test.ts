import { FIELDS, Keyboard, type KeyboardState } from "@yogo75/core";
import { expect, test } from "vitest";
import { FakeKeyboard } from "../../../packages/core/test/fake-transport.ts";
import { lightingMode, lightingOn } from "../src/lighting.ts";
import { connect } from "../src/session.ts";

const LED_ON_OFF = FIELDS.indexOf("ledOnOff");
const LED_MODE = FIELDS.indexOf("ledMode");
const CONFIG_WRITE = 0x15;
const OTHER_WRITES = [0x1b, 0x1d, 0x1f, 0x21, 0x23, 0x2d];

for (const [name, recipe, field, value] of [
  ["turning off", lightingOn(false), LED_ON_OFF, 1],
  ["choosing a mode", lightingMode(17), LED_MODE, 17],
] as [string, (s: KeyboardState) => void, number, number][]) {
  test(`${name} writes only its config field, then reads the config back`, async () => {
    const fake = new FakeKeyboard(32);
    const session = await connect(fake);
    const wanted = structuredClone(session.snapshot.config);
    wanted[field] = value;
    fake.written = [];

    await session.update(recipe);

    const cmds = fake.written.map((p) => p[1]);
    expect(cmds).toContain(CONFIG_WRITE);
    expect(cmds.filter((cmd) => OTHER_WRITES.includes(cmd))).toEqual([]);
    expect(session.state.config).toEqual(wanted);
    expect(session.state).toEqual(await new Keyboard(fake).readState());
  });
}

test("off then on keeps the mode", async () => {
  const session = await connect(new FakeKeyboard(32));
  await session.update(lightingMode(7));

  await session.update(lightingOn(false));
  expect(session.state.config[LED_ON_OFF]).toBe(1);
  expect(session.state.config[LED_MODE]).toBe(7);

  await session.update(lightingOn(true));
  expect(session.state.config[LED_ON_OFF]).toBe(0);
  expect(session.state.config[LED_MODE]).toBe(7);
});
