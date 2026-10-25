import { hex, readU16le } from "./bytes.ts";
import { toRgb565le } from "./color.ts";
import {
  checkBounds,
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
  CUSTOM_LEDS_BUFFER_BYTES,
  INFO_MACRO_SIZE,
  isDangerous,
  LAYER_BYTES,
  LED_MATRIX_BYTES,
  MACROS_BYTES,
  MATRIX_BYTES,
} from "./commands.ts";
import { CONFIG_BYTES } from "./config.ts";
import { LINKS, PID_DONGLE } from "./device.ts";
import {
  CONFIG_PAGE,
  isFull,
  KEYMAP_PAGES,
  LEDS_PAGE,
  mayBeStuck,
  withoutFullBytes,
  type FlashPage,
} from "./flash.ts";
import { CODE_BYTES, keyAt } from "./keymap.ts";
import {
  EMPTY_MACRO,
  joinMacros,
  macroAreaLength,
  splitMacros,
} from "./macro.ts";
import {
  answers,
  encodePacket,
  HEADER_BYTES,
  isError,
  withoutDongleByte,
} from "./packet.ts";
import { stateDiff, type KeyboardState } from "./state.ts";

/** HID link to the keyboard (node-hid, WebHID…). Timeouts are its business, with the values of `LINKS`. */
export interface Transport {
  /** Bytes per report: 64 over USB, 32 through the dongle. */
  readonly reportSize: number;
  /** Sends `report` (if given), then resolves with the next input report, or undefined on timeout. */
  transfer(report?: Uint8Array): Promise<Uint8Array | undefined>;
}

/** The keyboard sent no answer in time: a sleeping keyboard behind the dongle, until a key press wakes it. */
export class NoReplyError extends Error {}

export type PacketLogger = (direction: "tx" | "rx", packet: Uint8Array) => void;

/** Input reports read for one request before giving up: others (key presses…) can come first. */
const MAX_REPORTS = 20;
/** The keyboard acks a write before applying it: reads within ~5 ms return the old values. */
export const APPLY_DELAY_MS = 50;
/** A save lands about 60 ms after the last write while we poll; past this, its page is stuck. */
const SAVE_TIMEOUT_MS = 1000;
const SAVE_POLL_MS = 10;
/**
 * Through the dongle, the session closes after 5 to 7 s without a packet: writes are acked but ignored and reads
 * return zeros until the next start packet. The hub sends it again past 5 s.
 */
const SESSION_IDLE_MS = 5000;
/** The hub reads only this many info bytes through the dongle. */
const WIRELESS_INFO_BYTES = 39;

/** A resource saved in a flash page, with how to read it and write it back. */
type SavedResource = [
  FlashPage,
  () => Promise<Uint8Array>,
  (data: Uint8Array) => Promise<void>,
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cmdName(cmd: number) {
  return `cmd 0x${cmd.toString(16)}`;
}

/**
 * One method per resource. Every write rewrites the whole resource, as the hub does: read → modify → write
 * is the caller's job. `setKey` and `resetKey` write a single key.
 */
export class Keyboard {
  #transport: Transport;
  #log?: PacketLogger;
  #request = 0;
  /** When the last packet was sent; undefined until the caller starts the session. */
  #lastPacket?: number;

  constructor(transport: Transport, log?: PacketLogger) {
    this.#transport = transport;
    this.#log = log;
  }

  /** Whether the link is the 2.4 GHz dongle, whose reports are smaller. */
  get throughDongle(): boolean {
    return this.#transport.reportSize === LINKS[PID_DONGLE].reportSize;
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
    checkBounds(cmd, offset, length);
    const idle = Date.now() - (this.#lastPacket ?? Date.now());
    if (cmd !== CMD_START && idle > SESSION_IDLE_MS) {
      await this.start();
    }
    this.#lastPacket = Date.now();

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

    throw new NoReplyError(`no reply to ${cmdName(cmd)}`);
  }

  async #readChunks(
    cmd: number,
    total: number,
    start = 0,
  ): Promise<Uint8Array> {
    const out = new Uint8Array(total);
    for (let off = 0; off < total; off += this.#chunkBytes) {
      const len = Math.min(this.#chunkBytes, total - off);
      const reply = await this.#transfer(cmd, len, start + off);
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

  /** A page's write pointer, read past the config block (the save variables sit right after it in RAM). */
  async #pagePointer(page: FlashPage): Promise<number> {
    const reply = await this.#transfer(CMD_KB_FUNCTION, 2, page.pointerOffset);
    return readU16le(reply, HEADER_BYTES);
  }

  /**
   * The page's pointer once a save has landed and none is pending, or undefined if none lands in time (stuck page).
   * A slow link (the dongle) lets several saves land during one write, so the pointer is read only at the end.
   * Nothing pending and the pointer unchanged means "not yet": the config arms its save only at the next tick.
   */
  async #savedPointer(page: FlashPage, before: number) {
    const deadline = Date.now() + SAVE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const reply = await this.#transfer(CMD_KB_FUNCTION, 1, page.armedOffset);
      if (!reply[HEADER_BYTES]) {
        const pointer = await this.#pagePointer(page);
        if (pointer !== before) {
          return pointer;
        }
      }

      await sleep(SAVE_POLL_MS);
    }
    return undefined;
  }

  /**
   * Writes `data` and waits for it to reach flash, never leaving its page full: a full page is written again, which
   * erases it. A stuck page's save fails; zeros always fit over its last record, after which the data erases it.
   * The zeros go live, so they are only tried on a page that may be stuck, and replaced by the data if they fail.
   */
  async #save(
    page: FlashPage,
    write: (data: Uint8Array) => Promise<void>,
    data: Uint8Array,
  ) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await this.#pagePointer(page);
      await write(data);

      let after = await this.#savedPointer(page, before);
      if (after === undefined) {
        if (!mayBeStuck(page, before)) {
          throw new Error(`the keyboard does not save its ${page.name}`);
        }

        await write(new Uint8Array(data.length));
        after = await this.#savedPointer(page, before);
        if (after === undefined) {
          await write(data);
          throw new Error(`the keyboard does not save its ${page.name}`);
        }
        continue; // the zeros were saved: write the data again
      }

      if (!isFull(page, after)) {
        return;
      }
    }
    throw new Error(`the keyboard's ${page.name} flash page stays full`);
  }

  /**
   * Rewrites, unchanged, each resource whose flash page someone else (the hub, Fn keys) left full or maybe stuck,
   * so its next saves survive a reboot. Resolves with their names.
   */
  async repairFlashPages(): Promise<string[]> {
    const resources: SavedResource[] = [
      [CONFIG_PAGE, () => this.readConfig(), (d) => this.writeConfig(d)],
      ...KEYMAP_PAGES.map((page, layer): SavedResource => [
        page,
        () => this.readKeymap(layer),
        (d) => this.writeKeymap(layer, d),
      ]),
      [LEDS_PAGE, () => this.readCustomLeds(), (d) => this.writeCustomLeds(d)],
    ];

    const repaired = [];
    for (const [page, read, write] of resources) {
      if (mayBeStuck(page, await this.#pagePointer(page))) {
        await write(await read());
        repaired.push(page.name);
      }
    }
    return repaired;
  }

  /** The hub sends this before anything else. */
  async start() {
    await this.#transfer(CMD_START);
  }

  /** Raw keyboard info (vid, pid, firmware, matrix and dot screen sizes…). */
  readInfo() {
    return this.#readChunks(
      CMD_KB_INFO,
      this.throughDongle ? WIRELESS_INFO_BYTES : this.#chunkBytes,
    );
  }

  /** Full 64-byte config blob (field offsets in `FIELDS`): the hub reads/writes it as 56 + 8 bytes over USB. */
  readConfig() {
    return this.#readChunks(CMD_KB_FUNCTION, CONFIG_BYTES);
  }

  /** Writes the config and waits for it to reach flash (as do the keymap and colour writes). */
  writeConfig(cfg: Uint8Array) {
    return this.#save(
      CONFIG_PAGE,
      (d) => this.#writeChunks(CMD_WRITE_KB_FUNCTION, d, false),
      cfg,
    );
  }

  /** Layer 0..3, 3 bytes per key, then the knob (`KNOB_LEFT`…); `factory` reads the default keymap. */
  readKeymap(layer: number, factory = false) {
    const cmds = factory ? CMD_GET_DEFAULT_KEYMAP : CMD_GET_KEYMAP;
    return this.#readChunks(cmds[layer], LAYER_BYTES);
  }

  /**
   * Rewrites a whole layer, as the hub does (it never writes a single key). A layer without its knob (an older
   * file's) is written with the knob the keyboard holds, so the save, and its zeros on a stuck page, cover it.
   */
  async writeKeymap(layer: number, map: Uint8Array) {
    if (map.length !== MATRIX_BYTES && map.length !== LAYER_BYTES) {
      throw new Error(`a layer is ${MATRIX_BYTES} or ${LAYER_BYTES} bytes`);
    }

    let whole = map;
    if (map.length === MATRIX_BYTES) {
      whole = (await this.readKeymap(layer)).slice();
      whole.set(map);
    }

    await this.#save(
      KEYMAP_PAGES[layer],
      (d) => this.#writeChunks(CMD_SET_KEYMAP[layer], d, false),
      whole,
    );
  }

  /**
   * Changes one key's code, writing only its 3 bytes (the hub rewrites the layer). Resolves with the old code.
   * On a page that may be stuck, rewrites the whole layer: only a whole layer of zeros unsticks it.
   */
  async setKey(
    layer: number,
    index: number,
    code: Uint8Array,
  ): Promise<Uint8Array> {
    if (code.length !== CODE_BYTES) {
      throw new Error(`a key code is ${CODE_BYTES} bytes`);
    }

    const page = KEYMAP_PAGES[layer];
    if (mayBeStuck(page, await this.#pagePointer(page))) {
      const map = await this.readKeymap(layer);
      const old = keyAt(map, index).slice();
      keyAt(map, index).set(code);
      await this.writeKeymap(layer, map);
      return old;
    }

    const offset = index * CODE_BYTES;
    const reply = await this.#transfer(
      CMD_GET_KEYMAP[layer],
      CODE_BYTES,
      offset,
    );
    const old = reply.slice(HEADER_BYTES, HEADER_BYTES + CODE_BYTES);

    await this.#save(
      page,
      async (d) => {
        await this.#transfer(CMD_SET_KEYMAP[layer], CODE_BYTES, offset, d);
      },
      code,
    );

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

  /**
   * Writes the colours, then the rest of the buffer back unchanged: the keyboard only saves them to flash when a
   * packet reaches the buffer's end (byte 384). The last chunk is not padded, which would write past the buffer.
   * 0xFF is written as 0xFE, which looks the same: see `withoutFullBytes`.
   */
  async writeCustomLeds(leds: Uint8Array) {
    const buffer = await this.#readChunks(
      CMD_GET_CUSTOM_LEDS,
      CUSTOM_LEDS_BUFFER_BYTES,
    );
    buffer.set(withoutFullBytes(leds));

    await this.#save(
      LEDS_PAGE,
      (d) => this.#writeChunks(CMD_SET_CUSTOM_LEDS, d, false),
      buffer,
    );
  }

  /** Key index -> LED number in the first 96 bytes (0xff = no LED). */
  readLedMatrix(length = LED_MATRIX_BYTES) {
    return this.#readChunks(CMD_GET_LED_MATRIX, length);
  }

  /** The macro area, as long as its header says; with no header (no macro written yet), its first 224 bytes. */
  async readMacros(): Promise<Uint8Array> {
    const head = await this.#readChunks(CMD_GET_MACRO, this.#chunkBytes);
    const length = macroAreaLength(head) ?? MACROS_BYTES;

    return length <= head.length
      ? head.subarray(0, length)
      : this.#readChunks(CMD_GET_MACRO, length);
  }

  /** Writes a `joinMacros` area as the hub does: last packet zero-padded. */
  writeMacros(area: Uint8Array) {
    return this.#writeChunks(CMD_SET_MACRO, area);
  }

  /**
   * Replaces one macro (`encodeMacro` bytes): reads the area, fills any gap with empty macros, rewrites it.
   * Throws on a number beyond the macro count the keyboard announces.
   */
  async setMacro(index: number, macro: Uint8Array) {
    const slots = (await this.readInfo())[INFO_MACRO_SIZE];
    if (!(Number.isInteger(index) && index >= 0 && index < slots)) {
      throw new Error(`macro number must be 0 to ${slots - 1}`);
    }

    const macros = splitMacros(await this.readMacros());
    while (macros.length < index) {
      macros.push(EMPTY_MACRO);
    }

    macros[index] = macro;
    await this.writeMacros(joinMacros(macros));
  }

  /** Reads every resource, one request at a time (the keyboard answers in order). */
  async readState(): Promise<KeyboardState> {
    const config = await this.readConfig();
    const keymaps = [];
    for (const layer of CMD_GET_KEYMAP.keys()) {
      keymaps.push(await this.readKeymap(layer));
    }

    return {
      config,
      keymaps,
      leds: await this.readCustomLeds(),
      macros: await this.readMacros(),
    };
  }

  /**
   * Rewrites every resource, or with `current` (the state read before) only those that differ from it, in
   * `readState`'s order, then reads them back: resolves with those that differ.
   * Colours read back 0xFE where the state has 0xFF (see `writeCustomLeds`); a layer without its knob is compared
   * without it.
   */
  async writeState(
    state: KeyboardState,
    current?: KeyboardState,
  ): Promise<string[]> {
    const changed = current && stateDiff(state, current);
    function writes(name: string) {
      return !changed || changed.includes(name);
    }

    if (writes("config")) {
      await this.writeConfig(state.config);
    }
    for (const [layer, map] of state.keymaps.entries()) {
      if (writes(`keymap${layer}`)) {
        await this.writeKeymap(layer, map);
      }
    }

    if (writes("leds")) {
      await this.writeCustomLeds(state.leds);
    }
    if (writes("macros")) {
      await this.writeMacros(state.macros);
    }

    await new Promise((resolve) => setTimeout(resolve, APPLY_DELAY_MS));
    const read = await this.readState();
    return stateDiff(
      {
        ...read,
        keymaps: read.keymaps.map((map, l) =>
          map.subarray(0, state.keymaps[l].length),
        ),
      },
      {
        ...state,
        leds: writes("leds") ? withoutFullBytes(state.leds) : state.leds,
      },
    );
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

  /** `state` is 1 while the cable is plugged in, even at 100%; 2 once the charger reports the charge complete. */
  async readBattery() {
    const reply = await this.#transfer(CMD_POWER_INFO);
    const raw = reply.subarray(HEADER_BYTES, HEADER_BYTES + 8);
    return { level: raw[0], state: raw[1], raw };
  }
}
