import { setTimeout as sleep } from "node:timers/promises";
import type { Command } from "@commander-js/extra-typings";
import { hexArg, intArg, rgbArg, SAVE_FIRST } from "../args.ts";
import { withKeyboard } from "../hid.ts";
import { at } from "./config.ts";

const DOT_IMAGE_BYTES = 108; // 6×6 pixels, RGB888, row by row
const LAST_MODE = 12;
// the hub's "all off" is -1, written by setUint8 as 0xff
const MODE_OFF = 0xff;
const FRAME_INTERVAL_MS = 50;

const IMAGE_DESCRIPTION = "36 RRGGBB pixels, row by row (216 hex digits)";

export function registerDotCommands(program: Command): void {
  program
    .command("dot")
    .description("Set the dot screen mode, and optionally its colour")
    .addHelpText("after", SAVE_FIRST)
    .argument(
      "<mode>",
      `0-${LAST_MODE} (6 = the uploaded image), or off`,
      (value) => (value === "off" ? MODE_OFF : intArg(0, LAST_MODE)(value)),
    )
    .argument("[color]", "RRGGBB", rgbArg)
    .action(async (mode, rgb) => {
      await withKeyboard(async (k) => {
        const cfg = await k.readConfig();
        cfg[at("LedTFTOnOff")] = 0; // as the hub's setDotLight
        cfg[at("LedTFTMode")] = mode;
        if (rgb) {
          cfg.set(rgb, at("LedTFTColorR"));
        }

        await k.writeConfig(cfg);

        console.log(
          `dot screen set to mode ${mode === MODE_OFF ? "off" : mode}`,
        );
      });
    });

  program
    .command("dotimage")
    .description(
      "Upload the dot screen image (mode 6); there is no read command, so the old one is lost",
    )
    .argument("<image>", IMAGE_DESCRIPTION, hexArg(DOT_IMAGE_BYTES))
    .action(async (img) => {
      await withKeyboard(async (k) => {
        await k.writeDotImage(img);
        console.log("dot screen image written (shown in mode 6: yogo75 dot 6)");
      });
    });

  program
    .command("dotlive")
    .description("Stream a live frame to the dot screen")
    .argument("<image>", IMAGE_DESCRIPTION, hexArg(DOT_IMAGE_BYTES))
    .argument(
      "[seconds]",
      "How long to repeat it (0: one frame, which only flashes)",
      intArg(0, 3600),
      0,
    )
    .action(async (img, seconds) => {
      await withKeyboard(async (k) => {
        // A single frame only flashes; the hub streams one per audio frame, so repeat for `seconds`.
        const until = Date.now() + seconds * 1000;
        do {
          await k.sendLiveFrame(img);
          await sleep(FRAME_INTERVAL_MS);
        } while (Date.now() < until);

        console.log("live frame sent (stop with: yogo75 dotlive-end)");
      });
    });

  program
    .command("dotlive-end")
    .description("Stop live frames (the dot screen goes back to mode 0)")
    .action(async () => {
      await withKeyboard(async (k) => {
        await k.endLiveFrames();
        console.log("live sync ended");
      });
    });
}
