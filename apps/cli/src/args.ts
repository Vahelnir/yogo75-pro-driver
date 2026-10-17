/** Argument parsers: each throws a `UsageError` naming the argument, before the keyboard is opened. */
import { fromHex, KEYS } from "@yogo75/core";

export const LAYERS = [0, 1, 2, 3];
export const LAST_LAYER = LAYERS.length - 1;

/** A bad argument: reported with the command's usage, before the keyboard is opened. */
export class UsageError extends Error {}

export const keyArg = {
  type: "positional",
  required: true,
  description: `Key index 0-${KEYS - 1}`,
} as const;

/** Integer in [min, max]; `0x` for hex. */
export function intArg(
  name: string,
  value: string,
  min: number,
  max: number,
): number {
  const n = Number(value);
  if (!(value.trim() !== "" && Number.isInteger(n) && n >= min && n <= max)) {
    throw new UsageError(`${name} must be an integer from ${min} to ${max}`);
  }

  return n;
}

/** Runs a core parser, reporting its error as a bad `name` argument. */
export function coreArg<T>(name: string, parse: () => T): T {
  try {
    return parse();
  } catch (e) {
    throw new UsageError(`${name}: ${(e as Error).message}`);
  }
}

export function hexArg(
  name: string,
  value: string,
  length?: number,
): Uint8Array {
  if (!/^([0-9a-f]{2})*$/i.test(value)) {
    throw new UsageError(`${name} must be hex bytes, e.g. 00ff7f`);
  }

  const b = fromHex(value);
  if (length !== undefined && b.length !== length) {
    throw new UsageError(
      `${name} must be ${length} bytes (${length * 2} hex digits)`,
    );
  }

  return b;
}

export function rgbArg(name: string, value: string): Uint8Array {
  if (!/^[0-9a-f]{6}$/i.test(value)) {
    throw new UsageError(`${name} must be RRGGBB, e.g. 00ff7f`);
  }

  return fromHex(value);
}
