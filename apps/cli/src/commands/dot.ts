import { setTimeout as sleep } from "node:timers/promises";
import { defineCommand } from "citty";
import { hexArg, intArg, rgbArg } from "../args.ts";
import { withKeyboard } from "../hid.ts";
import { at } from "./config.ts";

const DOT_IMAGE_BYTES = 108; // 6×6 pixels, RGB888, row by row
const LAST_MODE = 12;
// the hub's "all off" is -1, written by setUint8 as 0xff
const MODE_OFF = 0xff;
const FRAME_INTERVAL_MS = 50;

const image = {
  type: "positional",
  required: true,
  description: "36 RRGGBB pixels, row by row (216 hex digits)",
} as const;

const dot = defineCommand({
  meta: { description: "Set the dot screen mode, and optionally its colour" },
  args: {
    mode: {
      type: "positional",
      required: true,
      description: `0-${LAST_MODE} (6 = the uploaded image), or off`,
    },
    color: { type: "positional", required: false, description: "RRGGBB" },
  },
  async run({ args }) {
    const mode =
      args.mode === "off" ? MODE_OFF : intArg("mode", args.mode, 0, LAST_MODE);
    const rgb =
      args.color === undefined ? undefined : rgbArg("color", args.color);

    await withKeyboard(async (k) => {
      const cfg = await k.readConfig();
      cfg[at("LedTFTOnOff")] = 0; // as the hub's setDotLight
      cfg[at("LedTFTMode")] = mode;
      if (rgb) {
        cfg.set(rgb, at("LedTFTColorR"));
      }

      await k.writeConfig(cfg);

      console.log(`dot screen set to mode ${args.mode}`);
    });
  },
});

const dotimage = defineCommand({
  meta: {
    description:
      "Upload the dot screen image (mode 6); there is no read command, so the old one is lost",
  },
  args: { image },
  async run({ args }) {
    const img = hexArg("image", args.image, DOT_IMAGE_BYTES);

    await withKeyboard(async (k) => {
      await k.writeDotImage(img);
      console.log("dot screen image written (shown in mode 6: yogo75 dot 6)");
    });
  },
});

const dotlive = defineCommand({
  meta: { description: "Stream a live frame to the dot screen" },
  args: {
    image,
    seconds: {
      type: "positional",
      required: false,
      description:
        "How long to repeat it (default 0: one frame, which only flashes)",
    },
  },
  async run({ args }) {
    const img = hexArg("image", args.image, DOT_IMAGE_BYTES);
    const seconds =
      args.seconds === undefined ? 0 : intArg("seconds", args.seconds, 0, 3600);

    await withKeyboard(async (k) => {
      // A single frame only flashes; the hub streams one per audio frame, so repeat for `seconds`.
      const until = Date.now() + seconds * 1000;
      do {
        await k.sendLiveFrame(img);
        await sleep(FRAME_INTERVAL_MS);
      } while (Date.now() < until);

      console.log("live frame sent (stop with: yogo75 dotlive-end)");
    });
  },
});

const dotliveEnd = defineCommand({
  meta: {
    description: "Stop live frames (the dot screen goes back to mode 0)",
  },
  async run() {
    await withKeyboard(async (k) => {
      await k.endLiveFrames();
      console.log("live sync ended");
    });
  },
});

export const dotCommands = {
  dot,
  dotimage,
  dotlive,
  "dotlive-end": dotliveEnd,
};
