import {
  brightnessPercent,
  brightnessRaw,
  FIELDS,
  speedRaw,
  speedSlowToFast,
  type KeyboardState,
} from "@yogo75/core";

const LED_ON_OFF = FIELDS.indexOf("ledOnOff");
const LED_MODE = FIELDS.indexOf("ledMode");
const LED_BRIGHTNESS = FIELDS.indexOf("ledBrightness");
const LED_SPEED = FIELDS.indexOf("ledSpeed");

/** Whether the backlight is on (`ledOnOff` = 0), whatever its mode. */
export function isLit(config: Uint8Array): boolean {
  return config[LED_ON_OFF] === 0;
}

export function ledMode(config: Uint8Array): number {
  return config[LED_MODE];
}

/** The brightness, in %. */
export function brightness(config: Uint8Array): number {
  return brightnessPercent(config[LED_BRIGHTNESS]);
}

/** The speed, from 0 (slowest) to 6 (fastest). */
export function speed(config: Uint8Array): number {
  return speedSlowToFast(config[LED_SPEED]);
}

/** Recipe turning the backlight on or off through `ledOnOff`, keeping `ledMode` (the hub uses mode 0 instead). */
export function lightingOn(on: boolean): (next: KeyboardState) => void {
  return (next) => {
    next.config[LED_ON_OFF] = on ? 0 : 1;
  };
}

/** Recipe choosing the lighting mode. */
export function lightingMode(mode: number): (next: KeyboardState) => void {
  return (next) => {
    next.config[LED_MODE] = mode;
  };
}

/** Recipe setting the brightness, in %. */
export function lightingBrightness(
  percent: number,
): (next: KeyboardState) => void {
  return (next) => {
    next.config[LED_BRIGHTNESS] = brightnessRaw(percent);
  };
}

/** Recipe setting the speed, from 0 (slowest) to 6 (fastest). */
export function lightingSpeed(speed: number): (next: KeyboardState) => void {
  return (next) => {
    next.config[LED_SPEED] = speedRaw(speed);
  };
}
