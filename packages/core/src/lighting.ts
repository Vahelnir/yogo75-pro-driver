/** A lighting setting, by the config fields it drives: ledBrightness, ledSpeed, colorR/G/B, colorful. */
export type LightingSetting = "brightness" | "speed" | "color" | "rainbow";

export interface LightingMode {
  /** Its `ledMode` value. */
  mode: number;
  /** The settings with a visible effect in this mode, checked on the keyboard (protocol doc, "Lighting modes"). */
  settings: LightingSetting[];
}

const ALL: LightingSetting[] = ["brightness", "speed", "color", "rainbow"];
// most effects ignore ledBrightness, though the hub offers it
const WAVES: LightingSetting[] = ["speed", "color", "rainbow"];

/** Every `ledMode` the firmware accepts, in order. */
export const LIGHTING_MODES: LightingMode[] = [
  { mode: 0, settings: [] },
  // the hub doesn't offer the rainbow, but colorful = 1 gives it
  { mode: 1, settings: ALL },
  { mode: 2, settings: ["speed"] },
  { mode: 3, settings: ALL },
  { mode: 4, settings: ["brightness", "color", "rainbow"] },
  { mode: 5, settings: WAVES },
  { mode: 6, settings: WAVES },
  { mode: 7, settings: ALL },
  ...[8, 9, 10, 11].map((mode) => ({ mode, settings: WAVES })),
  // always multicolour: colour and rainbow change the config only
  { mode: 12, settings: ["speed"] },
  ...[13, 14, 15, 16, 17, 18, 19, 20].map((mode) => ({
    mode,
    settings: WAVES,
  })),
  // per-key colours; settings as the hub offers them
  { mode: 253, settings: ["brightness", "color"] },
  // music sync, undetermined; settings as the hub offers them
  { mode: 254, settings: ["color"] },
];
