/** Local backup files (in the working directory) and terminal output. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { hex } from "@yogo75/core";

export function readJson(file: string): any {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function writeJson(file: string, value: unknown) {
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

/** Saves `bytes` to `file` unless it exists, so the first state before any write is kept. */
export function saveOnce(file: string, bytes: Uint8Array, what: string) {
  if (existsSync(file)) {
    return;
  }

  writeJson(file, hex(bytes));
  console.log(`current ${what} saved to ${file}`);
}

/** One 3-byte entry per line, prefixed with its index. */
export function printTriplets(b: Uint8Array) {
  for (let i = 0; i < b.length; i += 3) {
    console.log(String(i / 3).padStart(3), hex(b.subarray(i, i + 3)));
  }
}
