/**
 * Probe for the ATK Yogo 75 PRO (EVISION_V2 protocol, reversed from v3-hub.atk.store).
 *
 * Packet (64 bytes, report id 0, interface usage page 0xFF60 / usage 0x61):
 *   [0]=0xAA magic  [1]=cmd  [2..3]=offset LE  [4]=len  [5..6]=request code LE  [8..]=data
 * Reply echoes the request code at [5..6]; [2]==0xFF means error; data starts at [8].
 */
import HID from "node-hid";

const VID = 0x373b;
const PID = 0x119b;
const CMD_START = 0x10;
const CMD_KB_INFO = 0x12;
const CMD_KB_FUNCTION = 0x14;
const CMD_WRITE_KB_FUNCTION = 0x15;
const DATA_LEN = 56;

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
    const path = HID.devices(VID, PID).find((d) => d.usagePage === 0xff60)?.path;
    if (!path) throw new Error("Yogo 75 PRO not found (USB, interface 0xFF60)");
    this.dev = new HID.HID(path);
  }

  transfer(cmd: number, length = 0, offset = 0, data: number[] = []): Uint8Array {
    this.req = (this.req % 0xffff) + 1;
    const pkt = new Uint8Array(64);
    pkt.set([0xaa, cmd, offset & 0xff, offset >> 8, length, this.req & 0xff, this.req >> 8]);
    pkt.set(data, 8);
    if (process.env.DEBUG) console.error("tx", hex(pkt));
    this.dev.write([0x00, ...pkt]);
    for (let i = 0; i < 20; i++) { // skip unrelated input reports
      const r = Uint8Array.from(this.dev.readTimeout(500));
      if (!r.length) break;
      if (process.env.DEBUG) console.error("rx", hex(r));
      if (r.length >= 7 && (r[5] | (r[6] << 8)) === this.req) {
        if (r[2] === 0xff) throw new Error(`cmd 0x${cmd.toString(16)} error: ${hex(r)}`);
        return r;
      }
    }
    throw new Error(`no reply to cmd 0x${cmd.toString(16)}`);
  }

  /** Full 64-byte config blob: the hub reads/writes it as 56 bytes at offset 0 + 8 bytes at offset 56. */
  readConfig(): Uint8Array {
    const cfg = new Uint8Array(64);
    cfg.set(this.transfer(CMD_KB_FUNCTION, DATA_LEN, 0).subarray(8, 8 + DATA_LEN));
    cfg.set(this.transfer(CMD_KB_FUNCTION, 8, DATA_LEN).subarray(8, 16), DATA_LEN);
    return cfg;
  }

  writeConfig(cfg: Uint8Array) {
    this.transfer(CMD_WRITE_KB_FUNCTION, DATA_LEN, 0, [...cfg.subarray(0, DATA_LEN)]);
    this.transfer(CMD_WRITE_KB_FUNCTION, 8, DATA_LEN, [...cfg.subarray(DATA_LEN)]);
  }

  close() {
    this.dev.close();
  }
}

const [cmd, arg, modeArg] = process.argv.slice(2);
const k = new Yogo();
try {
  k.transfer(CMD_START);
  if (cmd === "color") {
    if (!/^[0-9a-f]{6}$/i.test(arg ?? "")) throw new Error("usage: node yogo.ts color RRGGBB [mode]");
    const cfg = k.readConfig();
    const at = (f: string) => FIELDS.indexOf(f);
    cfg[at("ledOnOff")] = 0; // 0 = on, as the hub sets it
    cfg[at("colorful")] = 0; // single colour instead of rainbow
    cfg.set(Buffer.from(arg, "hex"), at("colorR"));
    // Modes from the hub: 0 = all off, 4 = steady, 253 = per-key custom, 254 = music.
    if (modeArg !== undefined) cfg[at("ledMode")] = Number(modeArg);
    k.writeConfig(cfg);
    // Reading back in the same session still returns the old values; re-run `node yogo.ts` to check.
    console.log(`colour set to ${arg} (mode ${cfg[at("ledMode")]})`);
  } else {
    const info = k.transfer(CMD_KB_INFO, DATA_LEN).subarray(8);
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
