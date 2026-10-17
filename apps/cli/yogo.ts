/**
 * Probe for the ATK Yogo 75 PRO (EVISION_V2 protocol, reversed from v3-hub.atk.store).
 *
 * Packet (64 bytes over USB, 32 through the 2.4 GHz dongle; report id 0, interface usage page 0xFF60 / usage 0x61):
 *   [0]=0xAA magic  [1]=cmd  [2..3]=offset LE  [4]=len  [5..6]=request code LE  [8..]=data (56 bytes max, 24 wireless)
 * Reply echoes the request code at [5..6]; [2]==0xFF means error; data starts at [8].
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import HID from "node-hid";

const VID = 0x373b;
const PID_USB = 0x119b;
const PID_DONGLE = 0x11ff; // 4607
const CMD_START = 0x10;
const CMD_KB_INFO = 0x12;
const CMD_KB_FUNCTION = 0x14;
const CMD_WRITE_KB_FUNCTION = 0x15;
// get_current_key_matrix for layers 0..3 (layer 1 is the Fn layer in the hub).
const CMD_GET_KEYMAP = [0x1a, 0x1c, 0x1e, 0x20];
const CMD_GET_DEFAULT_KEYMAP = [0x16, 0x17, 0x18, 0x19];
const CMD_SET_KEYMAP = [0x1b, 0x1d, 0x1f, 0x21];
const KEYMAP_BACKUP = "keymap-backup.json";
const CMD_GET_CUSTOM_LEDS = 0x22; // RGB triplets indexed by LED number, 6 × 56 bytes
const CMD_SET_CUSTOM_LEDS = 0x23;
const CMD_GET_LED_MATRIX = 0x32; // first 96 bytes: key index -> LED number (0xff = no LED)
const LEDS_BACKUP = "leds-backup.json";
const CMD_SET_DOT_IMAGE = 0x3b; // set_dotscreen_matrix: 6×6 RGB888 image shown by dot screen mode 6
const CMD_POWER_INFO = 0x30; // battery: data[0] = level, data[1] = 1 while the cable is plugged in (even at 100%)
const CMD_GET_MACRO = 0x2c; // blob: "aa 55", total len LE, count LE, offsets table, then the macros
const CMD_SET_MACRO = 0x2d;
const MACROS_BACKUP = "macros-backup.json";
const MACROS_BYTES = 224; // 4 packets: header + 4 macros fit easily
const FULL_BACKUP = "full-backup.json";
const MACRO_DELAY = 20; // per action; unit assumed to be ms
const CMD_SYNC_DOT = 0x3c; // start_sync_dot: one live music-visualiser frame
const CMD_END_SYNC_DOT = 0x3d;
const MATRIX_BYTES = 336; // keymap and custom colours: 6 × 56 bytes over USB (14 × 24 wireless), 3 bytes per key

// USB cable first, else the dongle. The hub only changes the packet size and the timeout for wireless.
const DEVICE = [PID_USB, PID_DONGLE].map((pid) => HID.devices(VID, pid).find((d) => d.usagePage === 0xff60)).find((d) => d);
if (!DEVICE?.path) throw new Error("Yogo 75 PRO not found (USB or 2.4 GHz dongle, interface 0xFF60)");
const WIRELESS = DEVICE.productId === PID_DONGLE;
const REPORT_LEN = WIRELESS ? 32 : 64;
const DATA_LEN = REPORT_LEN - 8;

// Byte offsets in the get_keyboard_function blob (fieldMap in the hub's controller).
const FIELDS = [
  "profile", "ledOnOff", "ledMode", "ledBrightness", "ledSpeed", "colorful", "colorIndex",
  "colorR", "colorG", "colorB", "customColorIndex", "logoLedOnOff", "logoLedMode",
  "logoLedBrightness", "logoLedSpeed", "logoColorful", "logoColorIndex", "logoColorR",
  "logoColorG", "logoColorB", "sideLightOnOff", "sideLightMode", "sideLightBrightness",
  "sideLightSpeed", "sideLightColorful", "sideLightColorIndex", "sideLightColorR",
  "sideLightColorG", "sideLightColorB", "LedTFTOnOff", "LedTFTMode", "LedTFTBrightness",
  "LedTFTSpeed", "LedTFTColorful", "LedTFTColorIndex", "LedTFTColorR", "LedTFTColorG",
  "LedTFTColorB", "sixN", "macWin", "winLock", "wasd", "scanDelay", "layer", "fkeyChange",
  "wheelMode", "sleepL", "sleepM", "sleepH", "dsSleepL", "dsSleepM", "dsSleepH",
  "lcdPower", "lcdMode", "lcdGif", "lcdGifCount",
];

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex").replace(/(..)(?!$)/g, "$1 ");

class Yogo {
  dev: HID.HID;
  req = 0;

  constructor() {
    this.dev = new HID.HID(DEVICE!.path!);
  }

  transfer(cmd: number, length = 0, offset = 0, data: number[] = []): Uint8Array {
    this.req = (this.req % 0xffff) + 1;
    const pkt = new Uint8Array(REPORT_LEN);
    pkt.set([0xaa, cmd, offset & 0xff, offset >> 8, length, this.req & 0xff, this.req >> 8]);
    pkt.set(data, 8);
    if (process.env.DEBUG) console.error("tx", hex(pkt));
    this.dev.write([0x00, ...pkt]);
    for (let i = 0; i < 20; i++) { // skip unrelated input reports
      let r = Uint8Array.from(this.dev.readTimeout(WIRELESS ? 3000 : 500));
      if (!r.length) break;
      if (r[0] !== 0xaa && r[1] === 0xaa) r = r.subarray(1); // the hub drops a leading byte before the magic (dongle)
      if (process.env.DEBUG) console.error("rx", hex(r));
      if (r.length >= 7 && (r[5] | (r[6] << 8)) === this.req) {
        if (r[2] === 0xff) throw new Error(`cmd 0x${cmd.toString(16)} error: ${hex(r)}`);
        return r;
      }
    }
    throw new Error(`no reply to cmd 0x${cmd.toString(16)}`);
  }

  /** Full 64-byte config blob: the hub reads/writes it as 56 bytes at offset 0 + 8 bytes at offset 56 (USB). */
  readConfig(): Uint8Array {
    return this.readChunks(CMD_KB_FUNCTION, 64);
  }

  writeConfig(cfg: Uint8Array) {
    this.writeChunks(CMD_WRITE_KB_FUNCTION, cfg, false);
  }

  /** Reads `total` bytes of a resource in 56-byte chunks. */
  readChunks(cmd: number, total: number): Uint8Array {
    const out = new Uint8Array(total);
    for (let off = 0; off < total; off += DATA_LEN) {
      const len = Math.min(DATA_LEN, total - off);
      out.set(this.transfer(cmd, len, off).subarray(8, 8 + len), off);
    }
    return out;
  }

  /** Writes `data` in DATA_LEN chunks; `padded` sends len DATA_LEN on the last one too, as the hub does for some resources. */
  writeChunks(cmd: number, data: Uint8Array | number[], padded = true) {
    for (let off = 0; off < data.length; off += DATA_LEN) {
      const chunk = [...data.slice(off, off + DATA_LEN)];
      this.transfer(cmd, padded ? DATA_LEN : chunk.length, off, chunk);
    }
  }

  readKeymap(layer: number, factory = false): Uint8Array {
    return this.readChunks((factory ? CMD_GET_DEFAULT_KEYMAP : CMD_GET_KEYMAP)[layer], MATRIX_BYTES);
  }

  /** Rewrites a whole layer, as the hub does (it never writes a single key). */
  writeKeymap(layer: number, map: Uint8Array) {
    this.writeChunks(CMD_SET_KEYMAP[layer], map);
  }

  /** Rewrites the whole per-key colour matrix (used by ledMode 253), as the hub does. */
  writeCustomLeds(leds: Uint8Array) {
    this.writeChunks(CMD_SET_CUSTOM_LEDS, leds);
  }

  close() {
    this.dev.close();
  }
}

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
    const mods = keys.filter((c) => c >= 0xe0 && c <= 0xe7).map((c) => 1 << (c - 0xe0));
    const act = (code: number, type: number, down: boolean) => [d & 0xff, d >> 8, code, type | (down ? 0x80 : 0)];
    const actions = [
      ...mods.flatMap((m) => act(m, 2, true)),
      ...keys.filter((c) => c < 0xe0 || c > 0xe7).flatMap((c) => [...act(c, 1, true), ...act(c, 1, false)]),
      ...mods.flatMap((m) => act(m, 2, false)),
    ];
    offsets.push(8 + specs.length * 2 + body.length);
    body.push(actions.length / 4, 0, 0, 0, ...actions);
  }
  const total = 8 + specs.length * 2 + body.length;
  return [0xaa, 0x55, total & 0xff, total >> 8, specs.length, 0, 0, 0, ...offsets.flatMap((o) => [o & 0xff, o >> 8]), ...body];
}
// Self-check against the blob verified on the keyboard (macro "hi" typed correctly).
if (hex(Uint8Array.from(macroBlob(["0b0c"]))) !== "aa 55 1e 00 01 00 00 00 0a 00 04 00 00 00 14 00 0b 81 14 00 0b 01 14 00 0c 81 14 00 0c 01") {
  throw new Error("macroBlob regression");
}

/** Writes the macro blob as the hub does: len byte always DATA_LEN (last packet zero-padded). */
function writeMacros(k: Yogo, blob: number[]) {
  k.writeChunks(CMD_SET_MACRO, blob);
}

/** Everything `backup` saves, as hex strings (the dot screen image has no read command). */
function readAll(k: Yogo): Record<string, string> {
  return {
    config: hex(k.readConfig()),
    ...Object.fromEntries([0, 1, 2, 3].map((l) => [`keymap${l}`, hex(k.readKeymap(l))])),
    leds: hex(k.readChunks(CMD_GET_CUSTOM_LEDS, MATRIX_BYTES)),
    macros: hex(k.readChunks(CMD_GET_MACRO, MACROS_BYTES)),
  };
}
const FULL_SIZES: Record<string, number> = { config: 64, keymap0: MATRIX_BYTES, keymap1: MATRIX_BYTES, keymap2: MATRIX_BYTES, keymap3: MATRIX_BYTES, leds: MATRIX_BYTES, macros: MACROS_BYTES };

const [cmd, arg, modeArg, codeArg] = process.argv.slice(2);
const k = new Yogo();
try {
  k.transfer(CMD_START);
  if (cmd === "color") {
    if (!/^[0-9a-f]{6}$/i.test(arg ?? "")) throw new Error("usage: pnpm yogo75 color RRGGBB [mode]");
    const cfg = k.readConfig();
    const at = (f: string) => FIELDS.indexOf(f);
    cfg[at("ledOnOff")] = 0; // 0 = on, as the hub sets it
    cfg[at("colorful")] = 0; // single colour instead of rainbow
    cfg.set(Buffer.from(arg, "hex"), at("colorR"));
    // Modes from the hub: 0 = all off, 4 = steady, 253 = per-key custom, 254 = music.
    if (modeArg !== undefined) cfg[at("ledMode")] = Number(modeArg);
    k.writeConfig(cfg);
    console.log(`colour set to ${arg} (mode ${cfg[at("ledMode")]})`);
  } else if (cmd === "dot") {
    const mode = Number(arg);
    if (!(mode >= -1 && mode <= 12) || (modeArg !== undefined && !/^[0-9a-f]{6}$/i.test(modeArg))) {
      throw new Error("usage: pnpm yogo75 dot <mode -1..12> [RRGGBB]");
    }
    const cfg = k.readConfig();
    const at = (f: string) => FIELDS.indexOf(f);
    cfg[at("LedTFTOnOff")] = 0; // as the hub's setDotLight
    cfg[at("LedTFTMode")] = mode & 0xff; // the hub's "all off" is -1, written by setUint8 as 0xff
    if (modeArg !== undefined) cfg.set(Buffer.from(modeArg, "hex"), at("LedTFTColorR"));
    k.writeConfig(cfg);
    console.log(`dot screen set to mode ${mode}`);
  } else if (cmd === "set") {
    const pos = FIELDS.indexOf(arg);
    const value = Number(modeArg);
    if (pos < 0 || !(Number.isInteger(value) && value >= 0 && value <= 255)) {
      throw new Error(`usage: pnpm yogo75 set <field> <0-255>; fields: ${FIELDS.join(" ")}`);
    }
    const cfg = k.readConfig();
    console.log(`${arg}: ${cfg[pos]} -> ${value}`);
    cfg[pos] = value; // raw byte: speeds are inverted (hub writes 6 - speed)
    k.writeConfig(cfg);
  } else if (cmd === "dotimage") {
    // 6×6 RGB888, row by row; there is no read command, so this overwrites the stored image for good.
    const img = Buffer.from((arg ?? "").replaceAll(" ", ""), "hex");
    if (img.length !== 108) throw new Error("usage: pnpm yogo75 dotimage <36 RRGGBB pixels, row by row>");
    // The hub sends every packet with len DATA_LEN (the last one zero-padded).
    k.writeChunks(CMD_SET_DOT_IMAGE, img);
    console.log("dot screen image written (shown in mode 6: pnpm yogo75 dot 6)");
  } else if (cmd === "dotlive") {
    // Music-visualiser frame (start_sync_dot): same 6×6 layout as dotimage, but RGB565 LE, 72 bytes.
    const img = Buffer.from((arg ?? "").replaceAll(" ", ""), "hex");
    if (img.length !== 108) throw new Error("usage: pnpm yogo75 dotlive <36 RRGGBB pixels, row by row> [seconds]");
    const frame: number[] = [];
    for (let i = 0; i < img.length; i += 3) {
      const v = ((img[i] >> 3) << 11) | ((img[i + 1] >> 2) << 5) | (img[i + 2] >> 3);
      frame.push(v & 0xff, v >> 8);
    }
    // A single frame only flashes; the hub streams one per audio frame, so repeat for `seconds`.
    const until = Date.now() + Number(modeArg ?? 0) * 1000;
    do {
      k.writeChunks(CMD_SYNC_DOT, frame, false);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    } while (Date.now() < until);
    console.log("live frame sent (stop with: pnpm yogo75 dotlive-end)");
  } else if (cmd === "dotlive-end") {
    k.transfer(CMD_END_SYNC_DOT);
    console.log("live sync ended");
  } else if (cmd === "keymap") {
    const layer = Number(arg ?? 0);
    if (!(layer >= 0 && layer <= 3)) throw new Error("usage: pnpm yogo75 keymap [0-3] [factory]");
    const map = k.readKeymap(layer, modeArg === "factory");
    for (let i = 0; i < map.length; i += 3) console.log(String(i / 3).padStart(3), hex(map.subarray(i, i + 3)));
  } else if (cmd === "power") {
    const r = k.transfer(CMD_POWER_INFO);
    // Hub: power = min(data[0], 100), charging when data[1] == 2, which this keyboard never sends.
    console.log(`raw: ${hex(r.subarray(8, 16))}  battery ${r[8]}%  ${r[9] ? `cable plugged in (state ${r[9]})` : "on battery"}`);
  } else if (cmd === "macros") {
    console.log(hex(k.readChunks(CMD_GET_MACRO, Number(arg ?? 4) * 56)));
  } else if (cmd === "setmacro") {
    const specs = (arg ?? "").split(",");
    if (!specs.every((m) => /^([0-9a-f]{2})+(@\d+)?$/i.test(m)) || specs.length > 4) {
      throw new Error("usage: pnpm yogo75 setmacro <macro>[,<macro>...] ; macro = HID codes[@delay], e.g. e10b0c@20 for \"HI\"");
    }
    if (!existsSync(MACROS_BACKUP)) {
      writeFileSync(MACROS_BACKUP, JSON.stringify(hex(k.readChunks(CMD_GET_MACRO, MACROS_BYTES))) + "\n");
      console.log(`current macros saved to ${MACROS_BACKUP}`);
    }
    const blob = macroBlob(specs);
    writeMacros(k, blob);
    console.log(`${specs.length} macro(s) written: ${hex(Uint8Array.from(blob))}`);
  } else if (cmd === "macros-restore") {
    writeMacros(k, [...Buffer.from(JSON.parse(readFileSync(MACROS_BACKUP, "utf8")).replaceAll(" ", ""), "hex")]);
    console.log(`macros restored from ${MACROS_BACKUP}`);
  } else if (cmd === "ledmap") {
    const map = k.readChunks(CMD_GET_LED_MATRIX, 384);
    console.log(hex(map));
  } else if (cmd === "leds") {
    const leds = k.readChunks(CMD_GET_CUSTOM_LEDS, MATRIX_BYTES);
    for (let i = 0; i < leds.length; i += 3) console.log(String(i / 3).padStart(3), hex(leds.subarray(i, i + 3)));
  } else if (cmd === "setled") {
    const index = Number(arg);
    if (!(index >= 0 && index < 96) || !/^[0-9a-f]{6}$/i.test(modeArg ?? "")) {
      throw new Error("usage: pnpm yogo75 setled <key index 0-95> RRGGBB");
    }
    const led = k.readChunks(CMD_GET_LED_MATRIX, 96)[index];
    if (led === 0xff) throw new Error(`key ${index} has no LED`);
    const leds = k.readChunks(CMD_GET_CUSTOM_LEDS, MATRIX_BYTES);
    if (!existsSync(LEDS_BACKUP)) {
      writeFileSync(LEDS_BACKUP, JSON.stringify(hex(leds)) + "\n");
      console.log(`current colours saved to ${LEDS_BACKUP}`);
    }
    console.log(`key ${index} -> LED ${led}: ${hex(leds.subarray(led * 3, led * 3 + 3))} -> ${modeArg}`);
    leds.set(Buffer.from(modeArg, "hex"), led * 3);
    k.writeCustomLeds(leds);
  } else if (cmd === "leds-restore") {
    const leds = Buffer.from(JSON.parse(readFileSync(LEDS_BACKUP, "utf8")).replaceAll(" ", ""), "hex");
    if (leds.length !== MATRIX_BYTES) throw new Error(`bad ${LEDS_BACKUP}`);
    k.writeCustomLeds(leds);
    console.log(`colours restored from ${LEDS_BACKUP}`);
  } else if (cmd === "keymap-backup") {
    const backup = Object.fromEntries([0, 1, 2, 3].map((l) => [l, hex(k.readKeymap(l))]));
    writeFileSync(KEYMAP_BACKUP, JSON.stringify(backup, null, 2) + "\n");
    console.log(`layers 0-3 saved to ${KEYMAP_BACKUP}`);
  } else if (cmd === "setkey") {
    const [layer, index] = [Number(arg), Number(modeArg)];
    if (!(layer >= 0 && layer <= 3) || !(index >= 0 && index < 96) || !/^[0-9a-f]{6}$/i.test(codeArg ?? "")) {
      throw new Error("usage: pnpm yogo75 setkey <layer 0-3> <index 0-95> <TTXXYY>");
    }
    if (!existsSync(KEYMAP_BACKUP)) throw new Error(`run \`pnpm yogo75 keymap-backup\` first`);
    if (!(layer in JSON.parse(readFileSync(KEYMAP_BACKUP, "utf8")))) throw new Error(`layer ${layer} is not in ${KEYMAP_BACKUP}`);
    const map = k.readKeymap(layer);
    console.log(`layer ${layer} key ${index}: ${hex(map.subarray(index * 3, index * 3 + 3))} -> ${codeArg}`);
    map.set(Buffer.from(codeArg, "hex"), index * 3);
    k.writeKeymap(layer, map);
  } else if (cmd === "keymap-restore") {
    const backup: Record<string, string> = JSON.parse(readFileSync(KEYMAP_BACKUP, "utf8"));
    for (const [layer, data] of Object.entries(backup)) {
      const map = Buffer.from(data.replaceAll(" ", ""), "hex");
      if (map.length !== MATRIX_BYTES) throw new Error(`bad backup for layer ${layer}`);
      k.writeKeymap(Number(layer), map);
    }
    console.log(`layers ${Object.keys(backup).join(", ")} restored from ${KEYMAP_BACKUP}`);
  } else if (cmd === "backup") {
    const file = arg ?? FULL_BACKUP;
    if (existsSync(file)) throw new Error(`${file} already exists; remove it or pick another name`);
    writeFileSync(file, JSON.stringify(readAll(k), null, 2) + "\n");
    console.log(`config, layers 0-3, per-key colours and macros saved to ${file}`);
  } else if (cmd === "restore") {
    const file = arg ?? FULL_BACKUP;
    const backup: Record<string, string> = JSON.parse(readFileSync(file, "utf8"));
    const data = Object.fromEntries(Object.entries(FULL_SIZES).map(([name, size]) => {
      const b = Buffer.from((backup[name] ?? "").replaceAll(" ", ""), "hex");
      if (b.length !== size) throw new Error(`bad ${name} in ${file}: ${b.length} bytes, expected ${size}`);
      return [name, b];
    }));
    k.writeConfig(data.config);
    for (const l of [0, 1, 2, 3]) k.writeKeymap(l, data[`keymap${l}`]);
    k.writeCustomLeds(data.leds);
    writeMacros(k, [...data.macros]);
    // The keyboard acks a write before applying it: reads within ~5 ms return the old values.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    const now = readAll(k);
    const bad = Object.keys(FULL_SIZES).filter((name) => now[name] !== hex(data[name]));
    if (bad.length) throw new Error(`read-back differs from ${file} for: ${bad.join(", ")}`);
    console.log(`everything restored from ${file} and read back identical`);
  } else {
    const info = k.readChunks(CMD_KB_INFO, WIRELESS ? 39 : DATA_LEN); // the hub reads 39 bytes wireless
    const h = (n: number) => n.toString(16).padStart(2, "0");
    console.log("info raw:", hex(info));
    console.log(
      `  vid=${h(info[3])}${h(info[2])} pid=${h(info[5])}${h(info[4])} fw=${h(info[7])}${h(info[6])} ` +
        `proto=${info[8]} matrix=${info[12]} macros=${info[13]} lightModes=${info[15]} ` +
        `maxBright=${info[16]} dotScreen=${info[31]} ${info[34]}x${info[33]}`,
    );
    const fn = k.readConfig();
    console.log("config raw:", hex(fn));
    FIELDS.forEach((name, i) => console.log(`  ${name.padEnd(20)} ${fn[i]}`));
  }
} finally {
  k.close();
}
