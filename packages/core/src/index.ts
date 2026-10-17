/**
 * ATK Yogo 75 PRO protocol (EVISION_V2, reversed from v3-hub.atk.store), browser-safe: the keyboard is reached
 * through an injected `Transport`.
 *
 * Packet (report size: 64 bytes over USB, 32 through the 2.4 GHz dongle; without the report-id byte):
 *   [0]=0xAA magic  [1]=cmd  [2..3]=offset LE  [4]=len  [5..6]=request code LE  [8..]=data (report size - 8 max)
 * Reply echoes the request code at [5..6]; [2]==0xFF means error; data starts at [8].
 */

/** HID link to the keyboard (node-hid, WebHID…). Timeouts are its business. */
export interface Transport {
  /** Bytes per report: 64 over USB, 32 through the dongle. */
  readonly reportSize: number;
  /** Sends `report` (if given), then resolves with the next input report, or undefined on timeout. */
  transfer(report?: Uint8Array): Promise<Uint8Array | undefined>;
}

const CMD_START = 0x10;
const CMD_KB_INFO = 0x12;
const CMD_KB_FUNCTION = 0x14;
const CMD_WRITE_KB_FUNCTION = 0x15;
// get_current_key_matrix for layers 0..3 (layer 1 is the Fn layer in the hub).
const CMD_GET_KEYMAP = [0x1a, 0x1c, 0x1e, 0x20];
const CMD_GET_DEFAULT_KEYMAP = [0x16, 0x17, 0x18, 0x19];
const CMD_SET_KEYMAP = [0x1b, 0x1d, 0x1f, 0x21];
const CMD_GET_CUSTOM_LEDS = 0x22; // RGB triplets indexed by LED number, 6 × 56 bytes
const CMD_SET_CUSTOM_LEDS = 0x23;
const CMD_GET_MACRO = 0x2c; // blob: "aa 55", total len LE, count LE, offsets table, then the macros
const CMD_SET_MACRO = 0x2d;
const CMD_POWER_INFO = 0x30; // battery: data[0] = level, data[1] = 1 while the cable is plugged in (even at 100%)
const CMD_GET_LED_MATRIX = 0x32; // first 96 bytes: key index -> LED number (0xff = no LED)
const CMD_SET_DOT_IMAGE = 0x3b; // set_dotscreen_matrix: 6×6 RGB888 image shown by dot screen mode 6
const CMD_SYNC_DOT = 0x3c; // start_sync_dot: one live music-visualiser frame
const CMD_END_SYNC_DOT = 0x3d;

export const CONFIG_BYTES = 64;
export const MATRIX_BYTES = 336; // keymap and custom colours: 6 × 56 bytes over USB (14 × 24 wireless), 3 bytes per key
export const MACROS_BYTES = 224; // 4 packets over USB: header + 4 macros fit easily

// Byte offsets in the get_keyboard_function blob (fieldMap in the hub's controller).
export const FIELDS = [
  "profile",
  "ledOnOff",
  "ledMode",
  "ledBrightness",
  "ledSpeed",
  "colorful",
  "colorIndex",
  "colorR",
  "colorG",
  "colorB",
  "customColorIndex",
  "logoLedOnOff",
  "logoLedMode",
  "logoLedBrightness",
  "logoLedSpeed",
  "logoColorful",
  "logoColorIndex",
  "logoColorR",
  "logoColorG",
  "logoColorB",
  "sideLightOnOff",
  "sideLightMode",
  "sideLightBrightness",
  "sideLightSpeed",
  "sideLightColorful",
  "sideLightColorIndex",
  "sideLightColorR",
  "sideLightColorG",
  "sideLightColorB",
  "LedTFTOnOff",
  "LedTFTMode",
  "LedTFTBrightness",
  "LedTFTSpeed",
  "LedTFTColorful",
  "LedTFTColorIndex",
  "LedTFTColorR",
  "LedTFTColorG",
  "LedTFTColorB",
  "sixN",
  "macWin",
  "winLock",
  "wasd",
  "scanDelay",
  "layer",
  "fkeyChange",
  "wheelMode",
  "sleepL",
  "sleepM",
  "sleepH",
  "dsSleepL",
  "dsSleepM",
  "dsSleepH",
  "lcdPower",
  "lcdMode",
  "lcdGif",
  "lcdGifCount",
];

/** "aa 55 01" style. */
export const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");

/** Inverse of `hex`; spaces are optional. */
export const fromHex = (s: string) =>
  Uint8Array.from(s.replaceAll(" ", "").match(/../g) ?? [], (h) =>
    parseInt(h, 16),
  );

export type PacketLogger = (direction: "tx" | "rx", packet: Uint8Array) => void;

/**
 * One method per resource. Every write rewrites the whole resource, as the hub does: read → modify → write
 * is the caller's job.
 */
export class Keyboard {
  #transport: Transport;
  #log?: PacketLogger;
  #req = 0;

  /** `log` sees every packet sent and received (DEBUG tracing). */
  constructor(transport: Transport, log?: PacketLogger) {
    this.#transport = transport;
    this.#log = log;
  }

  get #dataLen() {
    return this.#transport.reportSize - 8;
  }

  async #transfer(
    cmd: number,
    length = 0,
    offset = 0,
    data: ArrayLike<number> = [],
  ): Promise<Uint8Array> {
    const req = (this.#req = (this.#req % 0xffff) + 1);
    const pkt = new Uint8Array(this.#transport.reportSize);
    pkt.set([
      0xaa,
      cmd,
      offset & 0xff,
      offset >> 8,
      length,
      req & 0xff,
      req >> 8,
    ]);
    pkt.set(data, 8);
    this.#log?.("tx", pkt);
    for (let i = 0; i < 20; i++) {
      // skip unrelated input reports
      let r = await this.#transport.transfer(i ? undefined : pkt);
      if (!r) break;
      if (r[0] !== 0xaa && r[1] === 0xaa) r = r.subarray(1); // the hub drops a leading byte before the magic (dongle)
      this.#log?.("rx", r);
      if (r.length >= 7 && (r[5] | (r[6] << 8)) === req) {
        if (r[2] === 0xff)
          throw new Error(`cmd 0x${cmd.toString(16)} error: ${hex(r)}`);
        return r;
      }
    }
    throw new Error(`no reply to cmd 0x${cmd.toString(16)}`);
  }

  /** Reads `total` bytes of a resource in report size - 8 byte chunks. */
  async #readChunks(cmd: number, total: number): Promise<Uint8Array> {
    const out = new Uint8Array(total);
    for (let off = 0; off < total; off += this.#dataLen) {
      const len = Math.min(this.#dataLen, total - off);
      out.set((await this.#transfer(cmd, len, off)).subarray(8, 8 + len), off);
    }
    return out;
  }

  /** Writes `data` in chunks; `padded` sends the full chunk length on the last one too, as the hub does for some resources. */
  async #writeChunks(cmd: number, data: Uint8Array, padded = true) {
    for (let off = 0; off < data.length; off += this.#dataLen) {
      const chunk = data.subarray(off, off + this.#dataLen);
      await this.#transfer(
        cmd,
        padded ? this.#dataLen : chunk.length,
        off,
        chunk,
      );
    }
  }

  /** The hub sends this before anything else. */
  async start() {
    await this.#transfer(CMD_START);
  }

  /** Raw keyboard info (vid, pid, firmware, matrix and dot screen sizes…). */
  readInfo() {
    // the hub reads 39 bytes wireless
    return this.#readChunks(
      CMD_KB_INFO,
      this.#transport.reportSize === 32 ? 39 : this.#dataLen,
    );
  }

  /** Full 64-byte config blob (field offsets in `FIELDS`): the hub reads/writes it as 56 + 8 bytes over USB. */
  readConfig() {
    return this.#readChunks(CMD_KB_FUNCTION, CONFIG_BYTES);
  }

  writeConfig(cfg: Uint8Array) {
    return this.#writeChunks(CMD_WRITE_KB_FUNCTION, cfg, false);
  }

  /** Layer 0..3, 3 bytes per key; `factory` reads the default keymap. */
  readKeymap(layer: number, factory = false) {
    return this.#readChunks(
      (factory ? CMD_GET_DEFAULT_KEYMAP : CMD_GET_KEYMAP)[layer],
      MATRIX_BYTES,
    );
  }

  /** Rewrites a whole layer, as the hub does (it never writes a single key). */
  writeKeymap(layer: number, map: Uint8Array) {
    return this.#writeChunks(CMD_SET_KEYMAP[layer], map);
  }

  /** Per-key colours (used by ledMode 253): RGB triplets indexed by LED number. */
  readCustomLeds() {
    return this.#readChunks(CMD_GET_CUSTOM_LEDS, MATRIX_BYTES);
  }

  writeCustomLeds(leds: Uint8Array) {
    return this.#writeChunks(CMD_SET_CUSTOM_LEDS, leds);
  }

  /** Key index -> LED number in the first 96 bytes (0xff = no LED). */
  readLedMatrix(length = 384) {
    return this.#readChunks(CMD_GET_LED_MATRIX, length);
  }

  readMacros(length = MACROS_BYTES) {
    return this.#readChunks(CMD_GET_MACRO, length);
  }

  /** Writes the macro blob as the hub does: last packet zero-padded. */
  writeMacros(blob: Uint8Array) {
    return this.#writeChunks(CMD_SET_MACRO, blob);
  }

  /** 6×6 RGB888 image, row by row, shown by dot screen mode 6. There is no read command. */
  writeDotImage(img: Uint8Array) {
    return this.#writeChunks(CMD_SET_DOT_IMAGE, img);
  }

  /** One music-visualiser frame: same layout as the dot image, sent as RGB565 LE. A single frame only flashes. */
  sendLiveFrame(img: Uint8Array) {
    const frame = new Uint8Array((img.length / 3) * 2);
    for (let i = 0; i < img.length; i += 3) {
      const v =
        ((img[i] >> 3) << 11) | ((img[i + 1] >> 2) << 5) | (img[i + 2] >> 3);
      frame.set([v & 0xff, v >> 8], (i / 3) * 2);
    }
    return this.#writeChunks(CMD_SYNC_DOT, frame, false);
  }

  async endLiveFrames() {
    await this.#transfer(CMD_END_SYNC_DOT);
  }

  /** `state` is 1 while the cable is plugged in, even at 100% (the hub's "charging" 2 never comes). */
  async readBattery() {
    const raw = (await this.#transfer(CMD_POWER_INFO)).subarray(8, 16);
    return { level: raw[0], state: raw[1], raw };
  }
}
