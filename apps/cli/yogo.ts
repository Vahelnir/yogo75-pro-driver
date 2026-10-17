/**
 * Probe for the ATK Yogo 75 PRO: argument handling, local backup files and the node-hid transport.
 * The protocol itself lives in @yogo75/core.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  CONFIG_BYTES,
  FIELDS,
  hex,
  Keyboard,
  MACROS_BYTES,
  MATRIX_BYTES,
  type Transport,
} from "@yogo75/core";
import HID from "node-hid";

const VID = 0x373b;
const PID_USB = 0x119b;
const PID_DONGLE = 0x11ff; // 4607
const KEYMAP_BACKUP = "keymap-backup.json";
const LEDS_BACKUP = "leds-backup.json";
const MACROS_BACKUP = "macros-backup.json";
const FULL_BACKUP = "full-backup.json";
const MACRO_DELAY = 20; // per action; unit assumed to be ms

// USB cable first, else the dongle. The hub only changes the packet size and the timeout for wireless.
const DEVICE = [PID_USB, PID_DONGLE]
  .map((pid) => HID.devices(VID, pid).find((d) => d.usagePage === 0xff60))
  .find((d) => d);
if (!DEVICE?.path)
  throw new Error(
    "Yogo 75 PRO not found (USB or 2.4 GHz dongle, interface 0xFF60)",
  );
const WIRELESS = DEVICE.productId === PID_DONGLE;

const dev = await HID.HIDAsync.open(DEVICE.path);
const transport: Transport = {
  reportSize: WIRELESS ? 32 : 64,
  async transfer(report) {
    if (report) await dev.write([0x00, ...report]); // report id 0
    const r = await dev.read(WIRELESS ? 3000 : 500);
    return r?.length ? r : undefined;
  },
};
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Macro blob as the hub's setMacro builds it: "aa 55", total len LE, count LE, 0 0, an offset (LE) per macro,
 * then per macro: action count LE, 0 0, and 4-byte actions (delay LE, code, type | 0x80 when pressed).
 * Spec: HID codes tapped in turn; modifiers (e0-e7) are held around the rest, as type 2 with their bitmask.
 */
function macroBlob(specs: string[]): number[] {
  const body: number[] = [];
  const offsets: number[] = [];
  for (const spec of specs) {
    const [codes, delay = String(MACRO_DELAY)] = spec.split("@");
    const d = Number(delay);
    const keys = [...Buffer.from(codes, "hex")];
    const mods = keys
      .filter((c) => c >= 0xe0 && c <= 0xe7)
      .map((c) => 1 << (c - 0xe0));
    const act = (code: number, type: number, down: boolean) => [
      d & 0xff,
      d >> 8,
      code,
      type | (down ? 0x80 : 0),
    ];
    const actions = [
      ...mods.flatMap((m) => act(m, 2, true)),
      ...keys
        .filter((c) => c < 0xe0 || c > 0xe7)
        .flatMap((c) => [...act(c, 1, true), ...act(c, 1, false)]),
      ...mods.flatMap((m) => act(m, 2, false)),
    ];
    offsets.push(8 + specs.length * 2 + body.length);
    body.push(actions.length / 4, 0, 0, 0, ...actions);
  }
  const total = 8 + specs.length * 2 + body.length;
  return [
    0xaa,
    0x55,
    total & 0xff,
    total >> 8,
    specs.length,
    0,
    0,
    0,
    ...offsets.flatMap((o) => [o & 0xff, o >> 8]),
    ...body,
  ];
}
// Self-check against the blob verified on the keyboard (macro "hi" typed correctly).
if (
  hex(Uint8Array.from(macroBlob(["0b0c"]))) !==
  "aa 55 1e 00 01 00 00 00 0a 00 04 00 00 00 14 00 0b 81 14 00 0b 01 14 00 0c 81 14 00 0c 01"
) {
  throw new Error("macroBlob regression");
}

/** Everything `backup` saves, as hex strings (the dot screen image has no read command). */
async function readAll(k: Keyboard): Promise<Record<string, string>> {
  const all: Record<string, string> = { config: hex(await k.readConfig()) };
  // one request at a time: the keyboard answers in order
  for (const l of [0, 1, 2, 3]) all[`keymap${l}`] = hex(await k.readKeymap(l));
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

const [cmd, arg, modeArg, codeArg] = process.argv.slice(2);
const k = new Keyboard(
  transport,
  process.env.DEBUG ? (dir, p) => console.error(dir, hex(p)) : undefined,
);
try {
  await k.start();
  if (cmd === "color") {
    if (!/^[0-9a-f]{6}$/i.test(arg ?? ""))
      throw new Error("usage: pnpm yogo75 color RRGGBB [mode]");
    const cfg = await k.readConfig();
    const at = (f: string) => FIELDS.indexOf(f);
    cfg[at("ledOnOff")] = 0; // 0 = on, as the hub sets it
    cfg[at("colorful")] = 0; // single colour instead of rainbow
    cfg.set(Buffer.from(arg, "hex"), at("colorR"));
    // Modes from the hub: 0 = all off, 4 = steady, 253 = per-key custom, 254 = music.
    if (modeArg !== undefined) cfg[at("ledMode")] = Number(modeArg);
    await k.writeConfig(cfg);
    console.log(`colour set to ${arg} (mode ${cfg[at("ledMode")]})`);
  } else if (cmd === "dot") {
    const mode = Number(arg);
    if (
      !(mode >= -1 && mode <= 12) ||
      (modeArg !== undefined && !/^[0-9a-f]{6}$/i.test(modeArg))
    ) {
      throw new Error("usage: pnpm yogo75 dot <mode -1..12> [RRGGBB]");
    }
    const cfg = await k.readConfig();
    const at = (f: string) => FIELDS.indexOf(f);
    cfg[at("LedTFTOnOff")] = 0; // as the hub's setDotLight
    cfg[at("LedTFTMode")] = mode & 0xff; // the hub's "all off" is -1, written by setUint8 as 0xff
    if (modeArg !== undefined)
      cfg.set(Buffer.from(modeArg, "hex"), at("LedTFTColorR"));
    await k.writeConfig(cfg);
    console.log(`dot screen set to mode ${mode}`);
  } else if (cmd === "set") {
    const pos = FIELDS.indexOf(arg);
    const value = Number(modeArg);
    if (pos < 0 || !(Number.isInteger(value) && value >= 0 && value <= 255)) {
      throw new Error(
        `usage: pnpm yogo75 set <field> <0-255>; fields: ${FIELDS.join(" ")}`,
      );
    }
    const cfg = await k.readConfig();
    console.log(`${arg}: ${cfg[pos]} -> ${value}`);
    cfg[pos] = value; // raw byte: speeds are inverted (hub writes 6 - speed)
    await k.writeConfig(cfg);
  } else if (cmd === "dotimage") {
    // 6×6 RGB888, row by row; there is no read command, so this overwrites the stored image for good.
    const img = Buffer.from((arg ?? "").replaceAll(" ", ""), "hex");
    if (img.length !== 108)
      throw new Error(
        "usage: pnpm yogo75 dotimage <36 RRGGBB pixels, row by row>",
      );
    await k.writeDotImage(img);
    console.log(
      "dot screen image written (shown in mode 6: pnpm yogo75 dot 6)",
    );
  } else if (cmd === "dotlive") {
    // Music-visualiser frame (start_sync_dot): same 6×6 layout as dotimage, but RGB565 LE, 72 bytes.
    const img = Buffer.from((arg ?? "").replaceAll(" ", ""), "hex");
    if (img.length !== 108)
      throw new Error(
        "usage: pnpm yogo75 dotlive <36 RRGGBB pixels, row by row> [seconds]",
      );
    // A single frame only flashes; the hub streams one per audio frame, so repeat for `seconds`.
    const until = Date.now() + Number(modeArg ?? 0) * 1000;
    do {
      await k.sendLiveFrame(img);
      await sleep(50);
    } while (Date.now() < until);
    console.log("live frame sent (stop with: pnpm yogo75 dotlive-end)");
  } else if (cmd === "dotlive-end") {
    await k.endLiveFrames();
    console.log("live sync ended");
  } else if (cmd === "keymap") {
    const layer = Number(arg ?? 0);
    if (!(layer >= 0 && layer <= 3))
      throw new Error("usage: pnpm yogo75 keymap [0-3] [factory]");
    const map = await k.readKeymap(layer, modeArg === "factory");
    for (let i = 0; i < map.length; i += 3)
      console.log(String(i / 3).padStart(3), hex(map.subarray(i, i + 3)));
  } else if (cmd === "power") {
    const { level, state, raw } = await k.readBattery();
    // Hub: power = min(data[0], 100), charging when data[1] == 2, which this keyboard never sends.
    console.log(
      `raw: ${hex(raw)}  battery ${level}%  ${state ? `cable plugged in (state ${state})` : "on battery"}`,
    );
  } else if (cmd === "macros") {
    console.log(hex(await k.readMacros(Number(arg ?? 4) * 56)));
  } else if (cmd === "setmacro") {
    const specs = (arg ?? "").split(",");
    if (
      !specs.every((m) => /^([0-9a-f]{2})+(@\d+)?$/i.test(m)) ||
      specs.length > 4
    ) {
      throw new Error(
        'usage: pnpm yogo75 setmacro <macro>[,<macro>...] ; macro = HID codes[@delay], e.g. e10b0c@20 for "HI"',
      );
    }
    if (!existsSync(MACROS_BACKUP)) {
      writeFileSync(
        MACROS_BACKUP,
        JSON.stringify(hex(await k.readMacros())) + "\n",
      );
      console.log(`current macros saved to ${MACROS_BACKUP}`);
    }
    const blob = macroBlob(specs);
    await k.writeMacros(Uint8Array.from(blob));
    console.log(
      `${specs.length} macro(s) written: ${hex(Uint8Array.from(blob))}`,
    );
  } else if (cmd === "macros-restore") {
    await k.writeMacros(
      Buffer.from(
        JSON.parse(readFileSync(MACROS_BACKUP, "utf8")).replaceAll(" ", ""),
        "hex",
      ),
    );
    console.log(`macros restored from ${MACROS_BACKUP}`);
  } else if (cmd === "ledmap") {
    const map = await k.readLedMatrix();
    console.log(hex(map));
  } else if (cmd === "leds") {
    const leds = await k.readCustomLeds();
    for (let i = 0; i < leds.length; i += 3)
      console.log(String(i / 3).padStart(3), hex(leds.subarray(i, i + 3)));
  } else if (cmd === "setled") {
    const index = Number(arg);
    if (!(index >= 0 && index < 96) || !/^[0-9a-f]{6}$/i.test(modeArg ?? "")) {
      throw new Error("usage: pnpm yogo75 setled <key index 0-95> RRGGBB");
    }
    const led = (await k.readLedMatrix(96))[index];
    if (led === 0xff) throw new Error(`key ${index} has no LED`);
    const leds = await k.readCustomLeds();
    if (!existsSync(LEDS_BACKUP)) {
      writeFileSync(LEDS_BACKUP, JSON.stringify(hex(leds)) + "\n");
      console.log(`current colours saved to ${LEDS_BACKUP}`);
    }
    console.log(
      `key ${index} -> LED ${led}: ${hex(leds.subarray(led * 3, led * 3 + 3))} -> ${modeArg}`,
    );
    leds.set(Buffer.from(modeArg, "hex"), led * 3);
    await k.writeCustomLeds(leds);
  } else if (cmd === "leds-restore") {
    const leds = Buffer.from(
      JSON.parse(readFileSync(LEDS_BACKUP, "utf8")).replaceAll(" ", ""),
      "hex",
    );
    if (leds.length !== MATRIX_BYTES) throw new Error(`bad ${LEDS_BACKUP}`);
    await k.writeCustomLeds(leds);
    console.log(`colours restored from ${LEDS_BACKUP}`);
  } else if (cmd === "keymap-backup") {
    const backup: Record<number, string> = {};
    for (const l of [0, 1, 2, 3]) backup[l] = hex(await k.readKeymap(l));
    writeFileSync(KEYMAP_BACKUP, JSON.stringify(backup, null, 2) + "\n");
    console.log(`layers 0-3 saved to ${KEYMAP_BACKUP}`);
  } else if (cmd === "setkey") {
    const [layer, index] = [Number(arg), Number(modeArg)];
    if (
      !(layer >= 0 && layer <= 3) ||
      !(index >= 0 && index < 96) ||
      !/^[0-9a-f]{6}$/i.test(codeArg ?? "")
    ) {
      throw new Error(
        "usage: pnpm yogo75 setkey <layer 0-3> <index 0-95> <TTXXYY>",
      );
    }
    if (!existsSync(KEYMAP_BACKUP))
      throw new Error(`run \`pnpm yogo75 keymap-backup\` first`);
    if (!(layer in JSON.parse(readFileSync(KEYMAP_BACKUP, "utf8"))))
      throw new Error(`layer ${layer} is not in ${KEYMAP_BACKUP}`);
    const map = await k.readKeymap(layer);
    console.log(
      `layer ${layer} key ${index}: ${hex(map.subarray(index * 3, index * 3 + 3))} -> ${codeArg}`,
    );
    map.set(Buffer.from(codeArg, "hex"), index * 3);
    await k.writeKeymap(layer, map);
  } else if (cmd === "keymap-restore") {
    const backup: Record<string, string> = JSON.parse(
      readFileSync(KEYMAP_BACKUP, "utf8"),
    );
    for (const [layer, data] of Object.entries(backup)) {
      const map = Buffer.from(data.replaceAll(" ", ""), "hex");
      if (map.length !== MATRIX_BYTES)
        throw new Error(`bad backup for layer ${layer}`);
      await k.writeKeymap(Number(layer), map);
    }
    console.log(
      `layers ${Object.keys(backup).join(", ")} restored from ${KEYMAP_BACKUP}`,
    );
  } else if (cmd === "backup") {
    const file = arg ?? FULL_BACKUP;
    if (existsSync(file))
      throw new Error(`${file} already exists; remove it or pick another name`);
    writeFileSync(file, JSON.stringify(await readAll(k), null, 2) + "\n");
    console.log(
      `config, layers 0-3, per-key colours and macros saved to ${file}`,
    );
  } else if (cmd === "restore") {
    const file = arg ?? FULL_BACKUP;
    const backup: Record<string, string> = JSON.parse(
      readFileSync(file, "utf8"),
    );
    const data = Object.fromEntries(
      Object.entries(FULL_SIZES).map(([name, size]) => {
        const b = Buffer.from((backup[name] ?? "").replaceAll(" ", ""), "hex");
        if (b.length !== size)
          throw new Error(
            `bad ${name} in ${file}: ${b.length} bytes, expected ${size}`,
          );
        return [name, b];
      }),
    );
    await k.writeConfig(data.config);
    for (const l of [0, 1, 2, 3]) await k.writeKeymap(l, data[`keymap${l}`]);
    await k.writeCustomLeds(data.leds);
    await k.writeMacros(data.macros);
    // The keyboard acks a write before applying it: reads within ~5 ms return the old values.
    await sleep(50);
    const now = await readAll(k);
    const bad = Object.keys(FULL_SIZES).filter(
      (name) => now[name] !== hex(data[name]),
    );
    if (bad.length)
      throw new Error(`read-back differs from ${file} for: ${bad.join(", ")}`);
    console.log(`everything restored from ${file} and read back identical`);
  } else {
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
  }
} finally {
  await dev.close();
}
