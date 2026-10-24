import { FIELDS, Keyboard, type KeyboardState } from "@yogo75/core";
import { expect, test } from "vitest";
import { FakeKeyboard } from "../../../packages/core/test/fake-transport.ts";
import {
  brightness,
  color,
  isRainbow,
  lightingBrightness,
  lightingColor,
  lightingMode,
  lightingOn,
  lightingRainbow,
  lightingSpeed,
  speed,
} from "../src/lighting.ts";
import { connect } from "../src/session.ts";
import { resourcesSent } from "./resources-sent.ts";

const LED_ON_OFF = FIELDS.indexOf("ledOnOff");
const LED_MODE = FIELDS.indexOf("ledMode");
const LED_BRIGHTNESS = FIELDS.indexOf("ledBrightness");
const LED_SPEED = FIELDS.indexOf("ledSpeed");
const COLORFUL = FIELDS.indexOf("colorful");
const COLOR_R = FIELDS.indexOf("colorR");

for (const [name, recipe, field, value] of [
  ["turning off", lightingOn(false), LED_ON_OFF, 1],
  ["choosing a mode", lightingMode(17), LED_MODE, 17],
  [
    "setting the brightness to 50 %",
    lightingBrightness(50),
    LED_BRIGHTNESS,
    45,
  ],
  ["setting the fastest speed", lightingSpeed(6), LED_SPEED, 0],
  ["choosing the rainbow", lightingRainbow(true), COLORFUL, 1],
  ["picking a colour", lightingColor("#12A4fe"), COLOR_R, [0x12, 0xa4, 0xfe]],
] as [string, (s: KeyboardState) => void, number, number | number[]][]) {
  test(`${name} writes only its config field, then reads the config back`, async () => {
    const fake = new FakeKeyboard(32);
    const session = await connect(fake);
    const wanted = structuredClone(session.snapshot.config);
    wanted.set([value].flat(), field);
    fake.written = [];

    await session.update(recipe);

    expect(resourcesSent(fake.written)).toEqual(["config"]);
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

test("back to a single colour from the rainbow keeps the colour", async () => {
  const session = await connect(new FakeKeyboard(32));
  await session.update(lightingColor("#ff8000"));
  await session.update(lightingRainbow(true));

  await session.update(lightingRainbow(false));

  expect(isRainbow(session.state.config)).toBe(false);
  expect(color(session.state.config)).toBe("#ff8000");
});

test("brightness and speed stay on their scale when another tool wrote a raw value out of range", () => {
  const config = new Uint8Array(64);
  config[LED_BRIGHTNESS] = 255;
  config[LED_SPEED] = 200;

  expect(brightness(config)).toBe(100);
  expect(speed(config)).toBe(0);
});

test("the colour reads as the hex the picker shows, and the rainbow from colorful", () => {
  const config = new Uint8Array(64);
  config.set([0x0a, 0xff, 0x00], COLOR_R);
  config[COLORFUL] = 1;

  expect(color(config)).toBe("#0aff00");
  expect(isRainbow(config)).toBe(true);
});
