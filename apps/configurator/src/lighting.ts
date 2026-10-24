import {
  brightnessPercent,
  brightnessRaw,
  FIELDS,
  fromHex,
  hex,
  MAX_SPEED,
  speedRaw,
  speedSlowToFast,
  type KeyboardState,
} from "@yogo75/core";

const LED_ON_OFF = FIELDS.indexOf("ledOnOff");
const LED_MODE = FIELDS.indexOf("ledMode");
const LED_BRIGHTNESS = FIELDS.indexOf("ledBrightness");
const LED_SPEED = FIELDS.indexOf("ledSpeed");
const COLORFUL = FIELDS.indexOf("colorful");
const COLOR_R = FIELDS.indexOf("colorR");
const COLOR_G = FIELDS.indexOf("colorG");
const COLOR_B = FIELDS.indexOf("colorB");

/** Whether the backlight is on (`ledOnOff` = 0), whatever its mode. */
export function isLit(config: Uint8Array): boolean {
  return config[LED_ON_OFF] === 0;
}

export function ledMode(config: Uint8Array): number {
  return config[LED_MODE];
}

// a raw value out of the documented range (set by another tool) shows at the nearest end of the scale
function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), max);
}

/** The brightness, in %. */
export function brightness(config: Uint8Array): number {
  return clamp(brightnessPercent(config[LED_BRIGHTNESS]), 100);
}

/** The speed, from 0 (slowest) to 6 (fastest). */
export function speed(config: Uint8Array): number {
  return clamp(speedSlowToFast(config[LED_SPEED]), MAX_SPEED);
}

/** The backlight colour, as `#rrggbb`. */
export function color(config: Uint8Array): string {
  const rgb = [config[COLOR_R], config[COLOR_G], config[COLOR_B]];
  return `#${hex(Uint8Array.from(rgb)).replaceAll(" ", "")}`;
}

/** Whether the effect is multicolour (`colorful` = 1) rather than in the single colour. */
export function isRainbow(config: Uint8Array): boolean {
  return config[COLORFUL] === 1;
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

/** Recipe setting the backlight colour, from `#rrggbb`. */
export function lightingColor(color: string): (next: KeyboardState) => void {
  return (next) => {
    const [r, g, b] = fromHex(color.slice(1));
    next.config[COLOR_R] = r;
    next.config[COLOR_G] = g;
    next.config[COLOR_B] = b;
  };
}

/** Recipe choosing between the rainbow and the single colour. */
export function lightingRainbow(
  rainbow: boolean,
): (next: KeyboardState) => void {
  return (next) => {
    next.config[COLORFUL] = rainbow ? 1 : 0;
  };
}
