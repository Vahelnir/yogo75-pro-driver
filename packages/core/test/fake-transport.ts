import { readFileSync } from "node:fs";
import { readU16le } from "../src/bytes.ts";
import { fromHex, type Transport } from "../src/index.ts";

// Captured with `pnpm yogo75 backup` (now `save`) on a real Yogo 75 PRO.
export const BACKUP: Record<string, Uint8Array> = Object.fromEntries(
  Object.entries(
    JSON.parse(
      readFileSync(new URL("full-backup.json", import.meta.url), "utf8"),
    ) as Record<string, string>,
  ).map(([name, data]) => [name, fromHex(data)]),
);

const READS: Record<number, string> = {
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

/** Keyboard stand-in: answers reads from the backup, applies writes to it and records every packet sent. */
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
  };
  /** Turns each reply into the reports actually returned, to inject faults. */
  replies = (reply: Uint8Array): Uint8Array[] => [reply];
  #pending: Uint8Array[] = [];

  constructor(reportSize: number) {
    this.reportSize = reportSize;
  }

  async transfer(report?: Uint8Array) {
    if (report) {
      this.written.push(report);
      const [cmd, off, len] = [report[1], readU16le(report, 2), report[4]];

      const reply = new Uint8Array(this.reportSize);
      reply.set(report.subarray(0, 8));

      const written = this.data[WRITES[cmd]];
      const read = this.data[READS[cmd]];
      if (written) {
        const end = Math.min(len, written.length - off); // padded last chunk
        written.set(report.subarray(8, 8 + end), off);
      } else if (read) {
        // len 0 (power info) still answers with the data, as the keyboard does
        reply.set(read.subarray(off, off + (len || read.length)), 8);
      }

      this.#pending.push(...this.replies(reply));
    }

    return this.#pending.shift();
  }
}
