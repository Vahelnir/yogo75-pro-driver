import { existsSync } from "node:fs";
import { fromHex, hex, MATRIX_BYTES } from "@yogo75/core";
import { defineCommand } from "citty";
import { hexArg, intArg, keyArg, KEYS, LAST_LAYER, LAYERS } from "../args.ts";
import { withKeyboard } from "../hid.ts";
import { printTriplets, readJson, writeJson } from "../io.ts";

const KEYMAP_BACKUP = "keymap-backup.json";

const layer = {
  type: "positional",
  required: true,
  description: `Layer 0-${LAST_LAYER}`,
} as const;

const keymap = defineCommand({
  meta: { description: "Dump a keymap layer (3 bytes per key)" },
  args: {
    layer: { ...layer, required: false, default: "0" },
    factory: { type: "boolean", description: "Read the factory keymap" },
  },
  async run({ args }) {
    const l = intArg("layer", args.layer, 0, LAST_LAYER);

    await withKeyboard(async (k) =>
      printTriplets(await k.readKeymap(l, args.factory)),
    );
  },
});

const keymapBackup = defineCommand({
  meta: { description: `Save layers 0-${LAST_LAYER} to ${KEYMAP_BACKUP}` },
  async run() {
    await withKeyboard(async (k) => {
      const backup: Record<number, string> = {};
      for (const l of LAYERS) {
        backup[l] = hex(await k.readKeymap(l));
      }

      writeJson(KEYMAP_BACKUP, backup);
      console.log(`layers 0-${LAST_LAYER} saved to ${KEYMAP_BACKUP}`);
    });
  },
});

const setkey = defineCommand({
  meta: {
    description: `Set one key's code; needs ${KEYMAP_BACKUP} (yogo75 keymap-backup)`,
  },
  args: {
    layer,
    key: keyArg,
    code: {
      type: "positional",
      required: true,
      description: "TTXXYY, as `keymap` prints it",
    },
  },
  async run({ args }) {
    const l = intArg("layer", args.layer, 0, LAST_LAYER);
    const index = intArg("key", args.key, 0, KEYS - 1);
    const code = hexArg("code", args.code, 3);
    if (!existsSync(KEYMAP_BACKUP)) {
      throw new Error("run `yogo75 keymap-backup` first");
    }

    if (!(l in readJson(KEYMAP_BACKUP))) {
      throw new Error(`layer ${l} is not in ${KEYMAP_BACKUP}`);
    }

    await withKeyboard(async (k) => {
      const map = await k.readKeymap(l);
      console.log(
        `layer ${l} key ${index}: ${hex(map.subarray(index * 3, index * 3 + 3))} -> ${args.code}`,
      );
      map.set(code, index * 3);
      await k.writeKeymap(l, map);
    });
  },
});

const keymapRestore = defineCommand({
  meta: { description: `Write the layers back from ${KEYMAP_BACKUP}` },
  async run() {
    const backup: Record<string, string> = readJson(KEYMAP_BACKUP);
    const maps = Object.entries(backup).map(([l, data]) => {
      const map = fromHex(data);
      if (map.length !== MATRIX_BYTES) {
        throw new Error(`bad backup for layer ${l}`);
      }

      return [Number(l), map] as const;
    });

    await withKeyboard(async (k) => {
      for (const [l, map] of maps) {
        await k.writeKeymap(l, map);
      }

      console.log(
        `layers ${Object.keys(backup).join(", ")} restored from ${KEYMAP_BACKUP}`,
      );
    });
  },
});

export const keymapCommands = {
  keymap,
  "keymap-backup": keymapBackup,
  setkey,
  "keymap-restore": keymapRestore,
};
