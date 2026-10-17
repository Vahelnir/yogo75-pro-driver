import { u16le } from "./bytes.ts";

/**
 * RGB565: one 16-bit value, red in the top 5 bits, green in the middle 6, blue in the low 5.
 * Each channel keeps only its most significant bits (8 → 5 or 6).
 */
export function rgb565(r: number, g: number, b: number): number {
  const red = r >> 3;
  const green = g >> 2;
  const blue = b >> 3;
  return (red << 11) | (green << 5) | blue;
}

/** RGB888 pixels (3 bytes each) to RGB565 little-endian (2 bytes each). */
export function toRgb565le(rgb: Uint8Array): Uint8Array {
  const out = new Uint8Array((rgb.length / 3) * 2);
  for (let px = 0; px < rgb.length / 3; px++) {
    const [r, g, b] = rgb.subarray(px * 3, px * 3 + 3);
    out.set(u16le(rgb565(r, g, b)), px * 2);
  }
  return out;
}
