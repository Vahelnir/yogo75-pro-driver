/**
 * Factory states, the bases a profile builds on: the firmware's boot-default tables, which the factory reset
 * (`0x31`) rewrites too (docs/protocol.md, "Persistence").
 */
import { fromHex } from "./bytes.ts";
import { joinMacros } from "./macro.ts";
import type { KeyboardState } from "./state.ts";

/** A factory state, under its name, for the firmware version it matches. */
export interface Base extends KeyboardState {
  name: string;
  firmware: string;
}

// Firmware 1.26's tables, one row of 16 slots per line: layers from 0x0204a836 + n × 0x180, 3 bytes per key.
const MATRIX = [
  "100029 10003a 10003b 10003c 10003d 10003e 10003f 100040 100041 100042 100043 100044 100045 100046 100049 10004c",
  "100035 10001e 10001f 100020 100021 100022 100023 100024 100025 100026 100027 10002d 10002e 10002a 10004a 10004d",
  "10002b 100014 10001a 100008 100015 100017 10001c 100018 10000c 100012 100013 10002f 100030 100031 30cb01 30cf00",
  "100039 100004 100016 100007 100009 10000a 10000b 10000d 10000e 10000f 100033 100034 100032 100028 10004b 10004e",
  "100200 100064 10001d 10001b 100006 100019 100005 100011 100010 100036 100037 100038 100000 102000 100052 100000",
  "100100 100800 100400 100000 100000 10002c 100000 100000 100000 104000 500200 100000 101000 100050 100051 10004f",
];
const FN_MATRIX = [
  "504100 307000 306f00 10082b 302102 10080b 10003f 30b600 30cd00 30b500 30e200 30ea00 30e900 100046 500900 10004c",
  "100035 503400 503500 503600 503700 100022 100023 100024 100025 100026 100027 503200 503100 503300 10004a 10004d",
  "10002b 500b00 500d00 501000 500e00 100017 10001c 100018 10000c 100012 100013 10002f 100030 100031 30cb01 30cf00",
  "100039 500a00 500c00 501100 500f00 10000a 503e00 10000d 10000e 10000f 100033 100034 100032 100028 10004b 10004e",
  "100200 100064 10001d 10001b 100006 100019 100005 100011 100010 100036 100037 100038 100000 503900 502f00 100000",
  "100100 503c00 100400 100000 100000 10002c 100000 100000 100000 104000 500200 100000 101000 502d00 503000 502b00",
];
// slots 96–111, past the matrix
const UNUSED_ROW = Array(16).fill("100000").join(" ");
// rotate left, rotate right, press
const KNOB_FUNCTIONS = "504700 504800 30e200";
const KNOB_VOLUME = "30ea00 30e900 30e200";

function layer(matrix: string[], knob: string) {
  return fromHex([...matrix, UNUSED_ROW, knob].join(""));
}

// Per-key colour profile 0, from 0x0204af36, cut to the 112 LEDs the state holds (84–127 are never read), one
// row of 16 LEDs per line: white on WASD (33, 47–49) and the arrows (72, 81–83).
const LEDS = [
  "000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000",
  "000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000",
  "000000 ffffff 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 ffffff",
  "ffffff ffffff 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000",
  "000000 000000 000000 000000 000000 000000 000000 000000 ffffff 000000 000000 000000 000000 000000 000000 000000",
  "000000 ffffff ffffff ffffff 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000",
  "000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000 000000",
];

export const FACTORY_1_26: Base = {
  name: "factory-1.26",
  firmware: "1.26",
  // from 0x0204b6ba
  config: fromHex(
    "00 00 04 5a 03 00 00 c8 64 5a 00 00 01 22 03 01 00 ff 00 00 00 01 5a 03 01 00 ff 00 00 00 00 1e" +
      "02 00 00 ff 00 00 01 00 00 00 02 00 00 00 b4 00 00 08 07 00 00 00 00 00 00 00 00 01 00 00 00 00",
  ),
  keymaps: [
    layer(MATRIX, KNOB_FUNCTIONS),
    layer(FN_MATRIX, KNOB_FUNCTIONS),
    layer(MATRIX, KNOB_VOLUME),
    layer(MATRIX, KNOB_VOLUME),
  ],
  leds: fromHex(LEDS.join("")),
  // the macro page has no factory table
  macros: joinMacros([]),
};

/** Oldest first. */
export const BASES: Base[] = [FACTORY_1_26];

export function baseNamed(name: string): Base | undefined {
  return BASES.find((base) => base.name === name);
}

export function baseForFirmware(firmware: string): Base | undefined {
  return BASES.find((base) => base.firmware === firmware);
}
