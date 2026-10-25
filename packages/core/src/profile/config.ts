/**
 * The config sections (`lighting`, `screen`): readable keys over config bytes, in the configurator's units.
 * A byte with no readable form is written as a number under the same key, so every byte round-trips.
 */
import { isScalar, type Node } from "yaml";
import { fromHex, hex } from "../bytes.ts";
import { FIELDS } from "../config.ts";
import {
  brightnessPercent,
  brightnessRaw,
  speedRaw,
  speedSlowToFast,
} from "../lighting.ts";
import { entries, text, type Section } from "./section.ts";

const MAX_BYTE = 255;

/** One key: the config bytes it owns, read as a YAML value, parsed back (throws a message on a bad value). */
interface Field {
  key: string;
  offset: number;
  size: number;
  read(bytes: Uint8Array): unknown;
  parse(node: Node): number[];
}

/** A number written as an integer, in min–max. */
function integer(node: Node, min: number, max: number): number {
  const value = text(node);
  if (value === undefined || !/^-?\d+$/.test(value)) {
    throw new Error(`must be ${min} to ${max}`);
  }

  const number = Number(value);
  if (number < min || number > max) {
    throw new Error(`must be ${min} to ${max}`);
  }
  return number;
}

function byte(key: string, offset: number): Field {
  return {
    key,
    offset,
    size: 1,
    read: ([value]) => value,
    parse: (node) => [integer(node, 0, MAX_BYTE)],
  };
}

/** `true` / `false` for the two values `whenTrue` and `whenFalse`; any other byte is a number. */
function flag(
  key: string,
  offset: number,
  whenTrue: number,
  whenFalse: number,
): Field {
  return {
    key,
    offset,
    size: 1,
    read: ([value]) =>
      value === whenTrue ? true : value === whenFalse ? false : value,
    parse(node) {
      if (isScalar(node) && typeof node.value === "boolean") {
        return [node.value ? whenTrue : whenFalse];
      }

      try {
        return [integer(node, 0, MAX_BYTE)];
      } catch {
        throw new Error(`must be true, false or 0 to ${MAX_BYTE}`);
      }
    },
  };
}

/** A name for a byte in `names`, any byte as a number. */
function named(key: string, offset: number, names: string[]): Field {
  return {
    key,
    offset,
    size: 1,
    read: ([value]) => names[value] || value,
    parse(node) {
      const value = text(node);
      if (value !== undefined && names.includes(value)) {
        return [names.indexOf(value)];
      }

      if (value === undefined || !/^-?\d+$/.test(value)) {
        throw new Error(`unknown mode name: ${value ?? ""}`);
      }
      return [integer(node, 0, MAX_BYTE)];
    },
  };
}

// past the firmware's 90 (100 %), the % scale goes on, up to 283 % for 255: still exact both ways
function brightness(key: string, offset: number): Field {
  return {
    key,
    offset,
    size: 1,
    read: ([value]) => brightnessPercent(value),
    parse: (node) => [
      brightnessRaw(integer(node, 0, brightnessPercent(MAX_BYTE))),
    ],
  };
}

// slow to fast as the hub shows both lights (`abs(6 - raw)`); a raw value past 6 (slower) goes on below 0
function speed(key: string, offset: number): Field {
  return {
    key,
    offset,
    size: 1,
    read: ([value]) => speedSlowToFast(value),
    parse: (node) => [speedRaw(integer(node, speedSlowToFast(MAX_BYTE), 6))],
  };
}

function color(key: string, offset: number): Field {
  return {
    key,
    offset,
    size: 3,
    read: (bytes) => `#${hex(bytes).replaceAll(" ", "")}`,
    parse(node) {
      const value = text(node);
      if (value === undefined || !/^#[0-9a-f]{6}$/i.test(value)) {
        throw new Error('must be "#rrggbb"');
      }
      return [...fromHex(value.slice(1))];
    },
  };
}

function configSection(key: string, fields: Field[]): Section {
  return {
    key,

    toYaml(state, base, full) {
      const values = new Map<string, unknown>();
      for (const field of fields) {
        const bytes = own(state.config, field);
        if (full || hex(bytes) !== hex(own(base.config, field))) {
          values.set(field.key, field.read(bytes));
        }
      }

      return values.size ? values : undefined;
    },

    fromYaml(node, base, state, problems) {
      for (const field of fields) {
        state.config.set(own(base.config, field), field.offset);
      }

      for (const entry of entries(node, key, problems)) {
        const field = fields.find((f) => f.key === entry.key);
        if (!field) {
          problems.add(entry.keyNode, entry.path, "unknown key");
        } else if (entry.value === undefined) {
          problems.add(entry.keyNode, entry.path, "missing value");
        } else {
          try {
            state.config.set(field.parse(entry.value), field.offset);
          } catch (e) {
            problems.add(entry.value, entry.path, (e as Error).message);
          }
        }
      }
    },
  };
}

function own(config: Uint8Array, field: Field): Uint8Array {
  return config.subarray(field.offset, field.offset + field.size);
}

/** `ledMode` names: kebab-case of the hub's English labels, by value. */
const MODES: string[] = [
  "off",
  "rainbow-flow-1",
  "color-breathing",
  "monochrome-breath",
  "rainbow",
  "single-light-up",
  "colorful-vortex-1",
  "rainbow-flow-2",
  "rainbow-flow-4",
  "spectral-fluctuation-1",
  "spectral-fluctuation-2",
  "spectral-fluctuation-3",
  "neon",
  "cloud-burst",
  "colorful-vortex-2",
  "colorful-ribbon-fluttering-1",
  "spectral-diffusion-1",
  "rainbow-intersection",
  "spectral-diffusion-2",
  "rainbow-flow-3",
  "dynamic-rainbow",
];
MODES[253] = "custom";
MODES[254] = "music";

function at(name: string): number {
  return FIELDS.indexOf(name);
}

/** The dot screen's multicolour: not in the hub's field list; byte 33 (`LedTFTColorful`) is never read. */
const SCREEN_RAINBOW = 59;

export const lighting = configSection("lighting", [
  flag("on", at("ledOnOff"), 0, 1),
  named("mode", at("ledMode"), MODES),
  brightness("brightness", at("ledBrightness")),
  speed("speed", at("ledSpeed")),
  color("color", at("colorR")),
  flag("rainbow", at("colorful"), 1, 0),
  byte("paletteIndex", at("colorIndex")),
  byte("keyColorProfile", at("customColorIndex")),
]);

export const screen = configSection("screen", [
  flag("on", at("LedTFTOnOff"), 0, 1),
  byte("mode", at("LedTFTMode")),
  brightness("brightness", at("LedTFTBrightness")),
  speed("speed", at("LedTFTSpeed")),
  color("color", at("LedTFTColorR")),
  flag("rainbow", SCREEN_RAINBOW, 1, 0),
  byte("paletteIndex", at("LedTFTColorIndex")),
]);
