/** Argument parsers for Commander: each throws an `InvalidArgumentError`, so a bad argument stops before the keyboard is opened. */
import { InvalidArgumentError } from "@commander-js/extra-typings";
import { fromHex, KEYS } from "@yogo75/core";

export const LAYERS = [0, 1, 2, 3];
export const LAST_LAYER = LAYERS.length - 1;

export const KEY_DESCRIPTION = `Key index 0-${KEYS - 1}`;

/** Integer in [min, max]; `0x` for hex. */
export function intArg(min: number, max: number): (value: string) => number {
  return (value) => {
    const n = Number(value);
    if (!(value.trim() !== "" && Number.isInteger(n) && n >= min && n <= max)) {
      throw new InvalidArgumentError(
        `must be an integer from ${min} to ${max}`,
      );
    }

    return n;
  };
}

/** Wraps a core parser, reporting its error as a bad argument. */
export function coreArg<T>(parse: (value: string) => T): (value: string) => T {
  return (value) => {
    try {
      return parse(value);
    } catch (e) {
      throw new InvalidArgumentError((e as Error).message);
    }
  };
}

export function hexArg(length?: number): (value: string) => Uint8Array {
  return (value) => {
    if (!/^([0-9a-f]{2})*$/i.test(value)) {
      throw new InvalidArgumentError("must be hex bytes, e.g. 00ff7f");
    }

    const b = fromHex(value);
    if (length !== undefined && b.length !== length) {
      throw new InvalidArgumentError(
        `must be ${length} bytes (${length * 2} hex digits)`,
      );
    }

    return b;
  };
}

export function rgbArg(value: string): Uint8Array {
  if (!/^[0-9a-f]{6}$/i.test(value)) {
    throw new InvalidArgumentError("must be RRGGBB, e.g. 00ff7f");
  }

  return fromHex(value);
}

/** Save/load file: the format follows the extension, and only JSON exists for now. */
export function stateFileArg(value: string): string {
  if (!value.toLowerCase().endsWith(".json")) {
    throw new InvalidArgumentError(
      "must be a .json file (the only format supported)",
    );
  }

  return value;
}

/** Help footer of every command that writes to the keyboard. */
export const SAVE_FIRST =
  "\nNothing is backed up automatically: run `yogo75 save <file>` first to keep the current state.";
