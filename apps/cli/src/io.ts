/** Terminal output. */
import { hex } from "@yogo75/core";

/** One 3-byte entry per line, prefixed with its index. */
export function printTriplets(b: Uint8Array) {
  for (let i = 0; i < b.length; i += 3) {
    console.log(String(i / 3).padStart(3), hex(b.subarray(i, i + 3)));
  }
}
