import { readFileSync } from "node:fs";
import { readU16le, u16le } from "../src/bytes.ts";
import {
  CUSTOM_LEDS_BUFFER_BYTES,
  KEYMAP_BUFFER_BYTES,
  MATRIX_BYTES,
} from "../src/commands.ts";
import {
  CONFIG_PAGE,
  KEYMAP_PAGES,
  LEDS_PAGE,
  type FlashPage,
} from "../src/flash.ts";
import { fromHex, MACRO_AREA_BYTES, type Transport } from "../src/index.ts";

// Captured with `pnpm yogo75 backup` (now `save`) on a real Yogo 75 PRO.
export const BACKUP: Record<string, Uint8Array> = Object.fromEntries(
  Object.entries(
    JSON.parse(
      readFileSync(new URL("full-backup.json", import.meta.url), "utf8"),
    ) as Record<string, string>,
  ).map(([name, data]) => [name, fromHex(data)]),
);

/** Each layer's knob (rotate left, rotate right, press), read at byte 336 of the same keyboard's layers. */
export const KNOB_FIXTURE = [
  "504700 504800 30e200",
  "504700 504800 30e200",
  "30ea00 30e900 30e200",
  "30ea00 30e900 30e200",
].map(fromHex);

const READS: Record<number, string> = {
  0x12: "info",
  0x14: "config",
  0x1a: "keymap0",
  0x1c: "keymap1",
  0x1e: "keymap2",
  0x20: "keymap3",
  0x16: "factory0",
  0x17: "factory1",
  0x18: "factory2",
  0x19: "factory3",
  0x22: "leds",
  0x2c: "macros",
  0x30: "power",
};
const WRITES: Record<number, string> = {
  0x15: "config",
  0x1b: "keymap0",
  0x1d: "keymap1",
  0x1f: "keymap2",
  0x21: "keymap3",
  0x23: "leds",
  0x2d: "macros",
};

/** RAM the config read reaches past the 64-byte config block, up to the save variables. */
const CONFIG_READ_REACH = 0x700;

/** A flash page as the firmware keeps it: appended records (undefined = erased) and the next one's index. */
export interface FakePage {
  page: FlashPage;
  records: (Uint8Array | undefined)[];
  next: number;
}

/** The boot scan's test: a run of 32 0xFF before a run of 32 other bytes. */
function readsAsFree(record: Uint8Array | undefined) {
  let ff = 0;
  let other = 0;
  for (const b of record ?? []) {
    ff = b === 0xff ? ff + 1 : 0;
    other = b === 0xff ? 0 : other + 1;
    if (ff >= 32) {
      return true;
    }
    if (other >= 32) {
      return false;
    }
  }
  return record === undefined;
}

/**
 * Keyboard stand-in: answers reads from the backup, applies writes to it and records every packet sent.
 * Writes to the config, a layer or the colours arm a save, which lands at the next packet, as on the keyboard
 * while the host polls; `reboot` reloads them from their flash pages, with the firmware's flaws.
 */
export class FakeKeyboard implements Transport {
  reportSize: number;
  written: Uint8Array[] = [];
  data: Record<string, Uint8Array> = {
    ...Object.fromEntries(
      Object.entries(BACKUP).map(([name, b]) => [name, b.slice()]),
    ),
    ...Object.fromEntries(
      [0, 1, 2, 3].map((l) => [`factory${l}`, BACKUP[`keymap${l}`].slice()]),
    ),
    power: Uint8Array.of(87, 1),
    // get_keyboard_info as read on the keyboard, up to macroSize (4)
    info: fromHex("aa bb 3b 37 9b 11 26 01 03 01 00 02 80 04"),
  };
  /** One record each to start with: what the backup holds. */
  pages: Record<string, FakePage> = Object.fromEntries(
    [CONFIG_PAGE, ...KEYMAP_PAGES, LEDS_PAGE].map((page) => [
      page.name,
      { page, records: [BACKUP[page.name].slice()], next: 1 },
    ]),
  );
  #armed = new Set<string>();
  /** Saves also land between the packets of one write, as through the dongle. */
  savesDuringWrites = false;
  /** Turns each reply into the reports actually returned, to inject faults. */
  replies = (reply: Uint8Array): Uint8Array[] => [reply];
  #pending: Uint8Array[] = [];

  constructor(reportSize: number) {
    this.reportSize = reportSize;
    // the keyboard's macro area is larger than the backup's 224 bytes
    const macros = new Uint8Array(MACRO_AREA_BYTES);
    macros.set(this.data.macros);
    this.data.macros = macros;
    // the colour buffer is 384 bytes, of which the backup holds the 336 in use
    const leds = new Uint8Array(CUSTOM_LEDS_BUFFER_BYTES);
    leds.set(this.data.leds);
    this.data.leds = leds;
    // so is a layer's, with the knob past the backup's 336 bytes
    KNOB_FIXTURE.forEach((knob, l) => {
      const layer = new Uint8Array(KEYMAP_BUFFER_BYTES);
      layer.set(this.data[`keymap${l}`]);
      layer.set(knob, MATRIX_BYTES);
      this.data[`keymap${l}`] = layer;
    });
  }

  /** Fills a page with copies of the current data, up to `used` records (10 or 64 = full). */
  fillPage(name: string, used: number) {
    const fake = this.pages[name];
    fake.records = Array.from({ length: used }, () => this.data[name].slice());
    fake.next = used;
  }

  /** Power cycle: RAM is lost, each page's scan sets its write position and loads the record before it. */
  reboot() {
    this.#armed.clear();
    for (const fake of Object.values(this.pages)) {
      const { records } = fake.page;
      const free = [...Array(records).keys()].find((i) =>
        readsAsFree(fake.records[i]),
      );
      // the firmware's off-by-one: on a full page it stops on the last record and loads the one before
      fake.next = free ?? records - 1;
      const loaded = fake.records[fake.next - 1];
      if (loaded) {
        this.data[fake.page.name].set(loaded);
      }
    }
  }

  /** The firmware's save: append, erase a full page first, and refuse a record that doesn't fit bit-wise. */
  #save(name: string) {
    const fake = this.pages[name];
    if (fake.next === fake.page.records) {
      fake.records = [];
      fake.next = 0;
    }

    const record = this.data[name].slice();
    const old = fake.records[fake.next];
    if (old && !record.every((b, i) => (old[i] & b) === b)) {
      return; // stays armed: retried at the next tick
    }

    fake.records[fake.next] = record;
    fake.next++;
    this.#armed.delete(name);
  }

  async transfer(report?: Uint8Array) {
    if (report) {
      this.written.push(report);
      const [cmd, off, len] = [report[1], readU16le(report, 2), report[4]];

      const reply = new Uint8Array(this.reportSize);
      reply.set(report.subarray(0, 8));

      const name = WRITES[cmd];
      for (const armed of [...this.#armed]) {
        if (armed !== name || this.savesDuringWrites) {
          this.#save(armed);
        }
      }

      const written = this.data[name];
      const read = this.data[READS[cmd]];
      if (written) {
        const end = Math.min(len, written.length - off); // padded last chunk
        written.set(report.subarray(8, 8 + end), off);
        // the colours arm a save only when a packet reaches their buffer's end
        if (
          this.pages[name] &&
          (name !== "leds" || off + len >= CUSTOM_LEDS_BUFFER_BYTES)
        ) {
          this.#armed.add(name);
        }
      } else if (cmd === 0x14) {
        reply.set(this.#configReach().subarray(off, off + len), 8);
      } else if (read) {
        // len 0 (power info) still answers with the data, as the keyboard does
        reply.set(read.subarray(off, off + (len || read.length)), 8);
      }

      this.#pending.push(...this.replies(reply));
    }

    return this.#pending.shift();
  }

  #configReach() {
    const ram = new Uint8Array(CONFIG_READ_REACH);
    ram.set(this.data.config);
    for (const { page, next } of Object.values(this.pages)) {
      ram.set(u16le(next * page.recordBytes), page.pointerOffset);
      ram[page.armedOffset] = this.#armed.has(page.name) ? 1 : 0;
    }
    return ram;
  }
}
