import { hex } from "./bytes.ts";
import { toRgb565le } from "./color.ts";
import {
  CMD_END_SYNC_DOT,
  CMD_GET_CUSTOM_LEDS,
  CMD_GET_DEFAULT_KEYMAP,
  CMD_GET_KEYMAP,
  CMD_GET_LED_MATRIX,
  CMD_GET_MACRO,
  CMD_KB_FUNCTION,
  CMD_KB_INFO,
  CMD_POWER_INFO,
  CMD_SET_CUSTOM_LEDS,
  CMD_SET_DOT_IMAGE,
  CMD_SET_KEYMAP,
  CMD_SET_MACRO,
  CMD_START,
  CMD_SYNC_DOT,
  CMD_WRITE_KB_FUNCTION,
  isDangerous,
  LED_MATRIX_BYTES,
  MACROS_BYTES,
  MATRIX_BYTES,
} from "./commands.ts";
import { CONFIG_BYTES } from "./config.ts";
import { keyAt } from "./keymap.ts";
import {
  answers,
  encodePacket,
  HEADER_BYTES,
  isError,
  withoutDongleByte,
} from "./packet.ts";

/** HID link to the keyboard (node-hid, WebHID…). Timeouts are its business. */
export interface Transport {
  /** Bytes per report: 64 over USB, 32 through the dongle. */
  readonly reportSize: number;
  /** Sends `report` (if given), then resolves with the next input report, or undefined on timeout. */
  transfer(report?: Uint8Array): Promise<Uint8Array | undefined>;
}

export type PacketLogger = (direction: "tx" | "rx", packet: Uint8Array) => void;

/** Input reports read for one request before giving up: others (key presses…) can come first. */
const MAX_REPORTS = 20;
/** The hub reads only this many info bytes through the dongle. */
const WIRELESS_INFO_BYTES = 39;

function cmdName(cmd: number) {
  return `cmd 0x${cmd.toString(16)}`;
}

/**
 * One method per resource. Every write rewrites the whole resource, as the hub does: read → modify → write
 * is the caller's job, except for `setKey` and `resetKey`.
 */
export class Keyboard {
  #transport: Transport;
  #log?: PacketLogger;
  #request = 0;

  constructor(transport: Transport, log?: PacketLogger) {
    this.#transport = transport;
    this.#log = log;
  }

  get #chunkBytes() {
    return this.#transport.reportSize - HEADER_BYTES;
  }

  async #transfer(
    cmd: number,
    length = 0,
    offset = 0,
    data: ArrayLike<number> = [],
  ): Promise<Uint8Array> {
    this.#request = (this.#request % 0xffff) + 1; // 1..65535, wraps
    const request = this.#request;
    const pkt = encodePacket(this.#transport.reportSize, {
      cmd,
      offset,
      length,
      request,
      data,
    });
    this.#log?.("tx", pkt);

    for (let i = 0; i < MAX_REPORTS; i++) {
      const report = await this.#transport.transfer(i ? undefined : pkt);
      if (!report) {
        break;
      }

      const reply = withoutDongleByte(report);
      this.#log?.("rx", reply);
      if (!answers(reply, request)) {
        continue;
      }
      if (isError(reply)) {
        throw new Error(`${cmdName(cmd)} error: ${hex(reply)}`);
      }
      return reply;
    }

    throw new Error(`no reply to ${cmdName(cmd)}`);
  }

  async #readChunks(cmd: number, total: number): Promise<Uint8Array> {
    const out = new Uint8Array(total);
    for (let off = 0; off < total; off += this.#chunkBytes) {
      const len = Math.min(this.#chunkBytes, total - off);
      const reply = await this.#transfer(cmd, len, off);
      out.set(reply.subarray(HEADER_BYTES, HEADER_BYTES + len), off);
    }
    return out;
  }

  /** Writes `data` one chunk per packet; `padded` announces a full chunk on the last one too, as the hub does for some resources. */
  async #writeChunks(cmd: number, data: Uint8Array, padded = true) {
    for (let off = 0; off < data.length; off += this.#chunkBytes) {
      const chunk = data.subarray(off, off + this.#chunkBytes);
      const len = padded ? this.#chunkBytes : chunk.length;
      await this.#transfer(cmd, len, off, chunk);
    }
  }

  /** The hub sends this before anything else. */
  async start() {
    await this.#transfer(CMD_START);
  }

  /** Raw keyboard info (vid, pid, firmware, matrix and dot screen sizes…). */
  readInfo() {
    const wireless = this.#transport.reportSize === 32;
    return this.#readChunks(
      CMD_KB_INFO,
      wireless ? WIRELESS_INFO_BYTES : this.#chunkBytes,
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
    const cmds = factory ? CMD_GET_DEFAULT_KEYMAP : CMD_GET_KEYMAP;
    return this.#readChunks(cmds[layer], MATRIX_BYTES);
  }

  /** Rewrites a whole layer, as the hub does (it never writes a single key). */
  writeKeymap(layer: number, map: Uint8Array) {
    return this.#writeChunks(CMD_SET_KEYMAP[layer], map);
  }

  /** Changes one key's code: reads the layer, sets the slot, rewrites the layer. Resolves with the old code. */
  async setKey(
    layer: number,
    index: number,
    code: Uint8Array,
  ): Promise<Uint8Array> {
    const map = await this.readKeymap(layer);
    const slot = keyAt(map, index);
    const old = slot.slice();

    slot.set(code);
    await this.writeKeymap(layer, map);

    return old;
  }

  /** Puts one key back to its factory code, as `setKey` does. Resolves with the old and new codes. */
  async resetKey(
    layer: number,
    index: number,
  ): Promise<{ old: Uint8Array; code: Uint8Array }> {
    const code = keyAt(await this.readKeymap(layer, true), index);

    const old = await this.setKey(layer, index, code);

    return { old, code };
  }

  /** Per-key colours (used by ledMode 253): RGB triplets indexed by LED number. */
  readCustomLeds() {
    return this.#readChunks(CMD_GET_CUSTOM_LEDS, MATRIX_BYTES);
  }

  writeCustomLeds(leds: Uint8Array) {
    return this.#writeChunks(CMD_SET_CUSTOM_LEDS, leds);
  }

  /** Key index -> LED number in the first 96 bytes (0xff = no LED). */
  readLedMatrix(length = LED_MATRIX_BYTES) {
    return this.#readChunks(CMD_GET_LED_MATRIX, length);
  }

  readMacros(length = MACROS_BYTES) {
    return this.#readChunks(CMD_GET_MACRO, length);
  }

  /** Writes a `macroBlob` as the hub does: last packet zero-padded. */
  writeMacros(blob: Uint8Array) {
    return this.#writeChunks(CMD_SET_MACRO, blob);
  }

  /** 6×6 RGB888 image, row by row, shown by dot screen mode 6. There is no read command. */
  writeDotImage(img: Uint8Array) {
    return this.#writeChunks(CMD_SET_DOT_IMAGE, img);
  }

  /** One music-visualiser frame, given like the dot image and sent as RGB565. A single frame only flashes. */
  sendLiveFrame(img: Uint8Array) {
    return this.#writeChunks(CMD_SYNC_DOT, toRgb565le(img), false);
  }

  /** Stops the live frames; the keyboard then sets the dot screen mode to 0. */
  async endLiveFrames() {
    await this.#transfer(CMD_END_SYNC_DOT);
  }

  /**
   * Sends one packet as given and returns the reply's data bytes, for exploring the protocol.
   * Refuses factory reset and firmware flashing unless `force`.
   */
  async raw(
    cmd: number,
    offset = 0,
    length = 0,
    data: ArrayLike<number> = [],
    force = false,
  ): Promise<Uint8Array> {
    if (isDangerous(cmd) && !force) {
      throw new Error(
        `${cmdName(cmd)} is factory reset or firmware flashing; it needs force`,
      );
    }

    if (data.length > this.#chunkBytes) {
      throw new Error(`one packet holds at most ${this.#chunkBytes} bytes`);
    }

    const reply = await this.#transfer(cmd, length, offset, data);
    return reply.subarray(HEADER_BYTES);
  }

  /** `state` is 1 while the cable is plugged in, even at 100% (the hub's "charging" 2 never comes). */
  async readBattery() {
    const reply = await this.#transfer(CMD_POWER_INFO);
    const raw = reply.subarray(HEADER_BYTES, HEADER_BYTES + 8);
    return { level: raw[0], state: raw[1], raw };
  }
}
