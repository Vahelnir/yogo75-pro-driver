/** "aa 55 01" style. */
export function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");
}

/** Inverse of `hex`; spaces are optional. */
export function fromHex(s: string): Uint8Array {
  const pairs = s.replaceAll(" ", "").match(/../g) ?? [];
  return Uint8Array.from(pairs, (h) => parseInt(h, 16));
}

/** 16-bit value as its two little-endian bytes: low byte first. */
export function u16le(n: number): number[] {
  return [n & 0xff, n >> 8];
}

export function readU16le(b: Uint8Array, at: number): number {
  return b[at] | (b[at + 1] << 8);
}

/** 24-bit value as its three little-endian bytes: low byte first. */
export function u24le(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, n >> 16];
}

export function readU24le(b: Uint8Array, at: number): number {
  return b[at] | (b[at + 1] << 8) | (b[at + 2] << 16);
}
