/** Factory states a profile builds on (docs/protocol.md, "Factory tables"). */
import { fromHex } from "./bytes.ts";
import { joinMacros } from "./macro.ts";
import type { KeyboardState } from "./state.ts";

/** A keyboard state as a firmware's factory tables hold it. */
export interface Base extends KeyboardState {
  name: string;
  /** As `firmwareVersion` gives it. */
  firmware: string;
}

// Firmware 1.26's tables, one matrix row per line: layers from 0x0204a836 + n × 0x180 (code), equal to the 0x16 reads
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
/** Slots 96–111, past the matrix: no key. */
const EMPTY_SLOTS = "100000".repeat(16);
const KNOB_FUNCTIONS = "504700 504800 30e200";
const KNOB_CONSUMER_VOLUME = "30ea00 30e900 30e200";

/** From 0x0204b6ba (code). */
const CONFIG_1_26 =
  "00 00 04 5a 03 00 00 c8 64 5a 00 00 01 22 03 01 00 ff 00 00 00 01 5a 03 01 00 ff 00 00 00 00 1e 02 00 00 ff 00 00 01 00 00 00 02 00 00 00 b4 00 00 08 07 00 00 00 00 00 00 00 00 01 00 00 00 00";

/** From 0x0204af36 (code): white on WASD and the arrows, the 112 LEDs in use. */
const WHITE_LEDS = [33, 47, 48, 49, 72, 81, 82, 83];
const LEDS_IN_USE = 112;

function layer(matrix: string[], knob: string): Uint8Array {
  return fromHex(matrix.join("") + EMPTY_SLOTS + knob);
}

function leds(white: number[]): Uint8Array {
  const area = new Uint8Array(LEDS_IN_USE * 3);
  for (const led of white) {
    area.fill(0xff, led * 3, led * 3 + 3);
  }

  return area;
}

/** Factory state of firmware 1.26; the macro page has no factory content, so its area is empty. */
const FACTORY_1_26: Base = {
  name: "factory-1.26",
  firmware: "1.26",
  config: fromHex(CONFIG_1_26),
  keymaps: [
    layer(MATRIX, KNOB_FUNCTIONS),
    layer(FN_MATRIX, KNOB_FUNCTIONS),
    layer(MATRIX, KNOB_CONSUMER_VOLUME),
    layer(MATRIX, KNOB_CONSUMER_VOLUME),
  ],
  leds: leds(WHITE_LEDS),
  macros: joinMacros([]),
};

/** Known bases, oldest first. */
export const BASES: readonly Base[] = [FACTORY_1_26];

export function baseByName(name: string): Base | undefined {
  return BASES.find((b) => b.name === name);
}

export function baseForFirmware(firmware: string): Base | undefined {
  return BASES.find((b) => b.firmware === firmware);
}
