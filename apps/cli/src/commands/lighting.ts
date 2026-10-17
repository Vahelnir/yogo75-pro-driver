import { fromHex, hex, MATRIX_BYTES } from "@yogo75/core";
import { defineCommand } from "citty";
import { intArg, keyArg, KEYS, rgbArg } from "../args.ts";
import { withKeyboard } from "../hid.ts";
import { printTriplets, readJson, saveOnce } from "../io.ts";
import { at } from "./config.ts";

const LEDS_BACKUP = "leds-backup.json";
const NO_LED = 0xff;

const color = defineCommand({
  meta: { description: "Set the backlight colour, and optionally its mode" },
  args: {
    color: { type: "positional", required: true, description: "RRGGBB" },
    mode: {
      type: "positional",
      required: false,
      description:
        "0-255: 0 = all off, 4 = steady, 253 = per-key colours, 254 = music",
    },
  },
  async run({ args }) {
    const rgb = rgbArg("color", args.color);
    const mode =
      args.mode === undefined ? undefined : intArg("mode", args.mode, 0, 255);

    await withKeyboard(async (k) => {
      const cfg = await k.readConfig();
      cfg[at("ledOnOff")] = 0; // 0 = on, as the hub sets it
      cfg[at("colorful")] = 0; // single colour instead of rainbow
      cfg.set(rgb, at("colorR"));
      if (mode !== undefined) {
        cfg[at("ledMode")] = mode;
      }

      await k.writeConfig(cfg);

      console.log(`colour set to ${args.color} (mode ${cfg[at("ledMode")]})`);
    });
  },
});

const leds = defineCommand({
  meta: { description: "List the per-key colours (RGB per LED number)" },
  async run() {
    await withKeyboard(async (k) => printTriplets(await k.readCustomLeds()));
  },
});

const setled = defineCommand({
  meta: {
    description: `Set one key's colour (shown in mode 253); saves ${LEDS_BACKUP} first`,
  },
  args: {
    key: keyArg,
    color: { type: "positional", required: true, description: "RRGGBB" },
  },
  async run({ args }) {
    const index = intArg("key", args.key, 0, KEYS - 1);
    const rgb = rgbArg("color", args.color);

    await withKeyboard(async (k) => {
      const led = (await k.readLedMatrix(KEYS))[index];
      if (led === NO_LED) {
        throw new Error(`key ${index} has no LED`);
      }

      const leds = await k.readCustomLeds();
      saveOnce(LEDS_BACKUP, leds, "colours");

      console.log(
        `key ${index} -> LED ${led}: ${hex(leds.subarray(led * 3, led * 3 + 3))} -> ${args.color}`,
      );
      leds.set(rgb, led * 3);
      await k.writeCustomLeds(leds);
    });
  },
});

const ledsRestore = defineCommand({
  meta: { description: `Write the per-key colours back from ${LEDS_BACKUP}` },
  async run() {
    const leds = fromHex(readJson(LEDS_BACKUP));
    if (leds.length !== MATRIX_BYTES) {
      throw new Error(`bad ${LEDS_BACKUP}`);
    }

    await withKeyboard(async (k) => {
      await k.writeCustomLeds(leds);
      console.log(`colours restored from ${LEDS_BACKUP}`);
    });
  },
});

export const lightingCommands = {
  color,
  leds,
  setled,
  "leds-restore": ledsRestore,
};
