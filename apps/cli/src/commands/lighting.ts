import type { Command } from "@commander-js/extra-typings";
import { fromHex, hex, KEYS, MATRIX_BYTES } from "@yogo75/core";
import { intArg, KEY_DESCRIPTION, rgbArg } from "../args.ts";
import { withKeyboard } from "../hid.ts";
import { printTriplets, readJson, saveOnce } from "../io.ts";
import { at } from "./config.ts";

const LEDS_BACKUP = "leds-backup.json";
const NO_LED = 0xff;

export function registerLightingCommands(program: Command): void {
  program
    .command("color")
    .description("Set the backlight colour, and optionally its mode")
    .argument("<color>", "RRGGBB", rgbArg)
    .argument(
      "[mode]",
      "0-255: 0 = all off, 4 = steady, 253 = per-key colours, 254 = music",
      intArg(0, 255),
    )
    .action(async (rgb, mode) => {
      await withKeyboard(async (k) => {
        const cfg = await k.readConfig();
        cfg[at("ledOnOff")] = 0; // 0 = on, as the hub sets it
        cfg[at("colorful")] = 0; // single colour instead of rainbow
        cfg.set(rgb, at("colorR"));
        if (mode !== undefined) {
          cfg[at("ledMode")] = mode;
        }

        await k.writeConfig(cfg);

        console.log(
          `colour set to ${hex(rgb).replaceAll(" ", "")} (mode ${cfg[at("ledMode")]})`,
        );
      });
    });

  program
    .command("leds")
    .description("List the per-key colours (RGB per LED number)")
    .action(async () => {
      await withKeyboard(async (k) => printTriplets(await k.readCustomLeds()));
    });

  program
    .command("setled")
    .description(
      `Set one key's colour (shown in mode 253); saves ${LEDS_BACKUP} first`,
    )
    .argument("<key>", KEY_DESCRIPTION, intArg(0, KEYS - 1))
    .argument("<color>", "RRGGBB", rgbArg)
    .action(async (index, rgb) => {
      await withKeyboard(async (k) => {
        const led = (await k.readLedMatrix(KEYS))[index];
        if (led === NO_LED) {
          throw new Error(`key ${index} has no LED`);
        }

        const leds = await k.readCustomLeds();
        saveOnce(LEDS_BACKUP, leds, "colours");

        console.log(
          `key ${index} -> LED ${led}: ${hex(leds.subarray(led * 3, led * 3 + 3))} -> ${hex(rgb).replaceAll(" ", "")}`,
        );
        leds.set(rgb, led * 3);
        await k.writeCustomLeds(leds);
      });
    });

  program
    .command("leds-restore")
    .description(`Write the per-key colours back from ${LEDS_BACKUP}`)
    .action(async () => {
      const leds = fromHex(readJson(LEDS_BACKUP));
      if (leds.length !== MATRIX_BYTES) {
        throw new Error(`bad ${LEDS_BACKUP}`);
      }

      await withKeyboard(async (k) => {
        await k.writeCustomLeds(leds);
        console.log(`colours restored from ${LEDS_BACKUP}`);
      });
    });
}
