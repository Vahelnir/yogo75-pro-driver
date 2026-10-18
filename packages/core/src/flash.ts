// The keyboard saves the config, each keymap layer and the per-key colours as records appended to a 4 KiB flash
// page. Its boot scan breaks on a full page (it loads the second-to-last record, then every save fails) and on a run
// of 32 0xFF bytes (the record reads as empty). See docs/protocol.md, keymap → persistence.

/** A resource's flash page; the offsets are where the config read (0x14) returns its save variables. */
export interface FlashPage {
  name: string;
  pointerOffset: number;
  /** 1 from a write until its save lands; stays 1 while the save keeps failing (stuck page). */
  armedOffset: number;
  recordBytes: number;
  records: number;
}

export const CONFIG_PAGE: FlashPage = {
  name: "config",
  pointerOffset: 0x62e,
  armedOffset: 0x64a,
  recordBytes: 64,
  records: 64,
};
export const KEYMAP_PAGES: FlashPage[] = [0, 1, 2, 3].map((layer) => ({
  name: `keymap${layer}`,
  pointerOffset: 0x630 + 2 * layer,
  armedOffset: 0x64e + 4 * layer,
  recordBytes: 384,
  records: 10,
}));
export const LEDS_PAGE: FlashPage = {
  name: "leds",
  pointerOffset: 0x638,
  armedOffset: 0x65e,
  recordBytes: 384,
  records: 10,
};

/** The write pointer counts bytes: records used × record size. A full page gets stuck at the next boot. */
export function isFull(page: FlashPage, pointer: number): boolean {
  return pointer >= page.records * page.recordBytes;
}

/** One record left, or none: after a boot, a stuck page looks exactly like a page with one record left. */
export function mayBeStuck(page: FlashPage, pointer: number): boolean {
  return pointer >= (page.records - 1) * page.recordBytes;
}

/** Colours as saved: white keys in a row would make the 32 × 0xFF run that reads as an empty record. */
export function withoutFullBytes(leds: Uint8Array): Uint8Array {
  return leds.map((b) => Math.min(b, 0xfe));
}
