import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import {
  CONFIG_BYTES,
  fromHex,
  hex,
  Keyboard,
  MACROS_BYTES,
  MATRIX_BYTES,
} from "@yogo75/core";
import { defineCommand } from "citty";
import { LAYERS } from "../args.ts";
import { withKeyboard } from "../hid.ts";
import { readJson, writeJson } from "../io.ts";

const FULL_BACKUP = "full-backup.json";
// The keyboard acks a write before applying it: reads within ~5 ms return the old values.
const APPLY_DELAY_MS = 50;

const FULL_SIZES: Record<string, number> = {
  config: CONFIG_BYTES,
  ...Object.fromEntries(LAYERS.map((l) => [`keymap${l}`, MATRIX_BYTES])),
  leds: MATRIX_BYTES,
  macros: MACROS_BYTES,
};

/** Everything `backup` saves, as hex strings (the dot screen image has no read command). */
async function readAll(k: Keyboard): Promise<Record<string, string>> {
  const all: Record<string, string> = { config: hex(await k.readConfig()) };

  // one request at a time: the keyboard answers in order
  for (const l of LAYERS) {
    all[`keymap${l}`] = hex(await k.readKeymap(l));
  }

  all.leds = hex(await k.readCustomLeds());
  all.macros = hex(await k.readMacros());

  return all;
}

const file = {
  type: "positional",
  required: false,
  default: FULL_BACKUP,
  description: "Backup file",
} as const;

const backup = defineCommand({
  meta: { description: "Save config, layers 0-3, per-key colours and macros" },
  args: { file },
  async run({ args }) {
    if (existsSync(args.file)) {
      throw new Error(
        `${args.file} already exists; remove it or pick another name`,
      );
    }

    await withKeyboard(async (k) => {
      writeJson(args.file, await readAll(k));
      console.log(
        `config, layers 0-3, per-key colours and macros saved to ${args.file}`,
      );
    });
  },
});

const restore = defineCommand({
  meta: { description: "Write a backup back, then read it back and compare" },
  args: { file },
  async run({ args }) {
    const backup: Record<string, string> = readJson(args.file);
    const data = Object.fromEntries(
      Object.entries(FULL_SIZES).map(([name, size]) => {
        const b = fromHex(backup[name] ?? "");
        if (b.length !== size) {
          throw new Error(
            `bad ${name} in ${args.file}: ${b.length} bytes, expected ${size}`,
          );
        }

        return [name, b];
      }),
    );

    await withKeyboard(async (k) => {
      await k.writeConfig(data.config);
      for (const l of LAYERS) {
        await k.writeKeymap(l, data[`keymap${l}`]);
      }

      await k.writeCustomLeds(data.leds);
      await k.writeMacros(data.macros);

      await sleep(APPLY_DELAY_MS);

      const now = await readAll(k);
      const bad = Object.keys(FULL_SIZES).filter(
        (name) => now[name] !== hex(data[name]),
      );
      if (bad.length) {
        throw new Error(
          `read-back differs from ${args.file} for: ${bad.join(", ")}`,
        );
      }

      console.log(
        `everything restored from ${args.file} and read back identical`,
      );
    });
  },
});

export const backupCommands = { backup, restore };
