/**
 * The command table: each entry's args and description drive both dispatch and `--help`.
 * Every `run` validates its arguments before opening the keyboard.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  CONFIG_BYTES,
  FIELDS,
  fromHex,
  hex,
  isDangerous,
  Keyboard,
  macroBlob,
  MACROS_BYTES,
  MATRIX_BYTES,
  type Macro,
} from "@yogo75/core";
import { defineCommand, type CommandDef } from "citty";
import { openKeyboard } from "./hid.ts";

const KEYMAP_BACKUP = "keymap-backup.json";
const LEDS_BACKUP = "leds-backup.json";
const MACROS_BACKUP = "macros-backup.json";
const FULL_BACKUP = "full-backup.json";
const MACRO_DELAY = 20; // per action; unit assumed to be ms
const DOT_IMAGE_BYTES = 108; // 6×6 pixels, RGB888, row by row
const KEYS = 96;
const LAYERS = [0, 1, 2, 3];
const LAST_LAYER = LAYERS.length - 1;

/** A bad argument: reported with the command's usage, before the keyboard is opened. */
export class UsageError extends Error {}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const at = (field: string) => FIELDS.indexOf(field);

/** Integer in [min, max]; `0x` for hex. */
function int(name: string, value: string, min: number, max: number): number {
  const n = Number(value);
  if (!(value.trim() !== "" && Number.isInteger(n) && n >= min && n <= max)) {
    throw new UsageError(`${name} must be an integer from ${min} to ${max}`);
  }

  return n;
}

function bytes(name: string, value: string, length?: number): Uint8Array {
  if (!/^([0-9a-f]{2})*$/i.test(value)) {
    throw new UsageError(`${name} must be hex bytes, e.g. 00ff7f`);
  }

  const b = fromHex(value);
  if (length !== undefined && b.length !== length) {
    throw new UsageError(
      `${name} must be ${length} bytes (${length * 2} hex digits)`,
    );
  }

  return b;
}

function color(name: string, value: string): Uint8Array {
  if (!/^[0-9a-f]{6}$/i.test(value)) {
    throw new UsageError(`${name} must be RRGGBB, e.g. 00ff7f`);
  }

  return fromHex(value);
}

/** Macro argument: HID codes in hex, then an optional "@delay", e.g. e10b0c@20 for "HI". */
function parseMacro(spec: string): Macro {
  const [codes, delay = String(MACRO_DELAY)] = spec.split("@");
  return { keys: [...fromHex(codes)], delay: Number(delay) };
}

/** Opens the keyboard, sends the start packet, runs `use` and closes; DEBUG=1 traces every packet. */
async function withKeyboard<T>(use: (k: Keyboard) => Promise<T>): Promise<T> {
  const { transport, close } = await openKeyboard();
  const k = new Keyboard(
    transport,
    process.env.DEBUG ? (dir, p) => console.error(dir, hex(p)) : undefined,
  );

  try {
    await k.start();
    return await use(k);
  } finally {
    await close();
  }
}

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

const FULL_SIZES: Record<string, number> = {
  config: CONFIG_BYTES,
  keymap0: MATRIX_BYTES,
  keymap1: MATRIX_BYTES,
  keymap2: MATRIX_BYTES,
  keymap3: MATRIX_BYTES,
  leds: MATRIX_BYTES,
  macros: MACROS_BYTES,
};

/** One RGB triplet per line, prefixed with its index. */
function printTriplets(b: Uint8Array) {
  for (let i = 0; i < b.length; i += 3) {
    console.log(String(i / 3).padStart(3), hex(b.subarray(i, i + 3)));
  }
}

const info = defineCommand({
  meta: { description: "Show keyboard info and every config field" },
  async run() {
    await withKeyboard(async (k) => {
      const info = await k.readInfo();
      const h = (n: number) => n.toString(16).padStart(2, "0");
      console.log("info raw:", hex(info));
      console.log(
        `  vid=${h(info[3])}${h(info[2])} pid=${h(info[5])}${h(info[4])} fw=${h(info[7])}${h(info[6])} ` +
          `proto=${info[8]} matrix=${info[12]} macros=${info[13]} lightModes=${info[15]} ` +
          `maxBright=${info[16]} dotScreen=${info[31]} ${info[34]}x${info[33]}`,
      );

      const fn = await k.readConfig();
      console.log("config raw:", hex(fn));
      FIELDS.forEach((name, i) => console.log(`  ${name.padEnd(20)} ${fn[i]}`));
    });
  },
});

const set = defineCommand({
  meta: { description: "Set one config field (raw byte) by name" },
  args: {
    field: {
      type: "positional",
      required: true,
      description: `One of: ${FIELDS.join(", ")}`,
    },
    value: {
      type: "positional",
      required: true,
      description:
        "0-255, written as is (speeds are inverted: the hub writes 6 - speed)",
    },
  },
  async run({ args }) {
    const pos = at(args.field);
    if (pos < 0) {
      throw new UsageError(`unknown field ${args.field}`);
    }

    const value = int("value", args.value, 0, 255);

    await withKeyboard(async (k) => {
      const cfg = await k.readConfig();
      console.log(`${args.field}: ${cfg[pos]} -> ${value}`);
      cfg[pos] = value;
      await k.writeConfig(cfg);
    });
  },
});

const power = defineCommand({
  meta: {
    description: "Show the battery level and whether the cable is plugged in",
  },
  async run() {
    await withKeyboard(async (k) => {
      const { level, state, raw } = await k.readBattery();
      // Hub: power = min(data[0], 100), charging when data[1] == 2, which this keyboard never sends.
      console.log(
        `raw: ${hex(raw)}  battery ${level}%  ${state ? `cable plugged in (state ${state})` : "on battery"}`,
      );
    });
  },
});

const colorCmd = defineCommand({
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
    const rgb = color("color", args.color);
    const mode =
      args.mode === undefined ? undefined : int("mode", args.mode, 0, 255);

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
    key: { type: "positional", required: true, description: "Key index 0-95" },
    color: { type: "positional", required: true, description: "RRGGBB" },
  },
  async run({ args }) {
    const index = int("key", args.key, 0, KEYS - 1);
    const rgb = color("color", args.color);

    await withKeyboard(async (k) => {
      const led = (await k.readLedMatrix(KEYS))[index];
      if (led === 0xff) {
        throw new Error(`key ${index} has no LED`);
      }

      const leds = await k.readCustomLeds();
      if (!existsSync(LEDS_BACKUP)) {
        writeFileSync(LEDS_BACKUP, JSON.stringify(hex(leds)) + "\n");
        console.log(`current colours saved to ${LEDS_BACKUP}`);
      }

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

const dot = defineCommand({
  meta: { description: "Set the dot screen mode, and optionally its colour" },
  args: {
    mode: {
      type: "positional",
      required: true,
      description: "0-12 (6 = the uploaded image), or off",
    },
    color: { type: "positional", required: false, description: "RRGGBB" },
  },
  async run({ args }) {
    // the hub's "all off" is -1, written by setUint8 as 0xff
    const mode = args.mode === "off" ? 0xff : int("mode", args.mode, 0, 12);
    const rgb =
      args.color === undefined ? undefined : color("color", args.color);

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

const image = {
  type: "positional",
  required: true,
  description: "36 RRGGBB pixels, row by row (216 hex digits)",
} as const;

const dotimage = defineCommand({
  meta: {
    description:
      "Upload the dot screen image (mode 6); there is no read command, so the old one is lost",
  },
  args: { image },
  async run({ args }) {
    const img = bytes("image", args.image, DOT_IMAGE_BYTES);

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
    const img = bytes("image", args.image, DOT_IMAGE_BYTES);
    const seconds =
      args.seconds === undefined ? 0 : int("seconds", args.seconds, 0, 3600);

    await withKeyboard(async (k) => {
      // A single frame only flashes; the hub streams one per audio frame, so repeat for `seconds`.
      const until = Date.now() + seconds * 1000;
      do {
        await k.sendLiveFrame(img);
        await sleep(50);
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

const layer = {
  type: "positional",
  required: true,
  description: "Layer 0-3",
} as const;

const keymap = defineCommand({
  meta: { description: "Dump a keymap layer (3 bytes per key)" },
  args: {
    layer: { ...layer, required: false, default: "0" },
    factory: { type: "boolean", description: "Read the factory keymap" },
  },
  async run({ args }) {
    const l = int("layer", args.layer, 0, LAST_LAYER);

    await withKeyboard(async (k) =>
      printTriplets(await k.readKeymap(l, args.factory)),
    );
  },
});

const keymapBackup = defineCommand({
  meta: { description: `Save layers 0-3 to ${KEYMAP_BACKUP}` },
  async run() {
    await withKeyboard(async (k) => {
      const backup: Record<number, string> = {};
      for (const l of LAYERS) {
        backup[l] = hex(await k.readKeymap(l));
      }

      writeFileSync(KEYMAP_BACKUP, JSON.stringify(backup, null, 2) + "\n");
      console.log(`layers 0-3 saved to ${KEYMAP_BACKUP}`);
    });
  },
});

const setkey = defineCommand({
  meta: {
    description: `Set one key's code; needs ${KEYMAP_BACKUP} (yogo75 keymap-backup)`,
  },
  args: {
    layer,
    key: { type: "positional", required: true, description: "Key index 0-95" },
    code: {
      type: "positional",
      required: true,
      description: "TTXXYY, as `keymap` prints it",
    },
  },
  async run({ args }) {
    const l = int("layer", args.layer, 0, LAST_LAYER);
    const index = int("key", args.key, 0, KEYS - 1);
    const code = bytes("code", args.code, 3);
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

const setmacro = defineCommand({
  meta: {
    description: `Write up to 4 macros (replacing all of them); saves ${MACROS_BACKUP} first`,
  },
  args: {
    macros: {
      type: "positional",
      required: true,
      description:
        'macro[,macro…]; macro = HID codes[@delay], e.g. e10b0c@20 for "HI"',
    },
  },
  async run({ args }) {
    const specs = args.macros.split(",");
    if (
      !specs.every((m) => /^([0-9a-f]{2})+(@\d+)?$/i.test(m)) ||
      specs.length > 4
    ) {
      throw new UsageError(
        "macros: 1 to 4 of HID codes[@delay], comma-separated",
      );
    }

    await withKeyboard(async (k) => {
      if (!existsSync(MACROS_BACKUP)) {
        writeFileSync(
          MACROS_BACKUP,
          JSON.stringify(hex(await k.readMacros())) + "\n",
        );
        console.log(`current macros saved to ${MACROS_BACKUP}`);
      }

      const blob = macroBlob(specs.map(parseMacro));
      await k.writeMacros(blob);
      console.log(`${specs.length} macro(s) written: ${hex(blob)}`);
    });
  },
});

const macrosRestore = defineCommand({
  meta: { description: `Write the macros back from ${MACROS_BACKUP}` },
  async run() {
    const blob = fromHex(readJson(MACROS_BACKUP));

    await withKeyboard(async (k) => {
      await k.writeMacros(blob);
      console.log(`macros restored from ${MACROS_BACKUP}`);
    });
  },
});

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
      writeFileSync(
        args.file,
        JSON.stringify(await readAll(k), null, 2) + "\n",
      );
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

      // The keyboard acks a write before applying it: reads within ~5 ms return the old values.
      await sleep(50);

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

const raw = defineCommand({
  meta: {
    description:
      "Send one packet (after the start packet) and print the reply's data bytes; a resource larger than one packet (56 bytes over USB, 24 wireless) takes one call per offset",
  },
  args: {
    cmd: {
      type: "positional",
      required: true,
      description: "Command byte, e.g. 0x32",
    },
    offset: {
      type: "positional",
      required: false,
      description: "0-65535 (default 0)",
    },
    len: {
      type: "positional",
      required: false,
      description: "0-255 (default 0)",
    },
    data: {
      type: "positional",
      required: false,
      description: "Hex bytes, in one or more words",
    },
    force: {
      type: "boolean",
      description:
        "Allow 0x31 (factory reset) and 0xa0-0xc0 (firmware flashing)",
    },
  },
  async run({ args }) {
    const cmd = int("cmd", args.cmd, 0, 255);
    const offset = int("offset", args.offset ?? "0", 0, 0xffff);
    const len = int("len", args.len ?? "0", 0, 255);
    const data = bytes("data", args._.slice(3).join(""));
    if (isDangerous(cmd) && !args.force) {
      throw new UsageError(
        `cmd 0x${cmd.toString(16)} is factory reset or firmware flashing; pass --force to send it`,
      );
    }

    await withKeyboard(async (k) => {
      console.log(hex(await k.raw(cmd, offset, len, data, args.force)));
    });
  },
});

export const commands: Record<string, CommandDef<any>> = {
  info,
  set,
  power,
  color: colorCmd,
  leds,
  setled,
  "leds-restore": ledsRestore,
  dot,
  dotimage,
  dotlive,
  "dotlive-end": dotliveEnd,
  keymap,
  "keymap-backup": keymapBackup,
  setkey,
  "keymap-restore": keymapRestore,
  setmacro,
  "macros-restore": macrosRestore,
  backup,
  restore,
  raw,
};

export const main = defineCommand({
  meta: {
    name: "yogo75",
    description:
      "Drive the ATK Yogo 75 PRO over USB or its 2.4 GHz dongle. DEBUG=1 traces every packet.",
  },
  subCommands: commands,
});
