import { FIELDS, type KeyboardState } from "@yogo75/core";

const LED_ON_OFF = FIELDS.indexOf("ledOnOff");
const LED_MODE = FIELDS.indexOf("ledMode");

/** Whether the backlight is on (`ledOnOff` = 0), whatever its mode. */
export function isLit(config: Uint8Array): boolean {
  return config[LED_ON_OFF] === 0;
}

export function ledMode(config: Uint8Array): number {
  return config[LED_MODE];
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
