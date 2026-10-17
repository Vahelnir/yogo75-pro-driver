import {
  COLS,
  keycode,
  keycodeName,
  keyIndex,
  keyNames,
  ROWS,
} from "@yogo75/core";
import { defineCommand } from "citty";
import { coreArg, intArg, LAST_LAYER } from "../args.ts";
import { withKeyboard } from "../hid.ts";

const layerOption = {
  type: "string",
  default: "0",
  description: `Layer 0-${LAST_LAYER} (1 = Fn)`,
} as const;

const positionArg = {
  type: "positional",
  required: true,
  description: `Key by its factory layer-0 name (CAPS) or as row,col (3,0); row 0-${ROWS - 1}, col 0-${COLS - 1}`,
} as const;

function printChange(
  layer: number,
  index: number,
  old: Uint8Array,
  code: Uint8Array,
) {
  console.log(
    `layer ${layer} key ${index}: ${keycodeName(old)} -> ${keycodeName(code)}`,
  );
}

const list = defineCommand({
  meta: { description: "Print a layer as key names, one line per row" },
  args: {
    layer: layerOption,
    factory: { type: "boolean", description: "Read the factory keymap" },
  },
  async run({ args }) {
    const layer = intArg("layer", args.layer, 0, LAST_LAYER);

    const names = await withKeyboard(async (k) =>
      keyNames(await k.readKeymap(layer, args.factory)),
    );

    const width = Math.max(...names.map((n) => n.length));
    for (let i = 0; i < names.length; i += COLS) {
      console.log(
        names
          .slice(i, i + COLS)
          .map((n) => n.padEnd(width))
          .join(" ")
          .trimEnd(),
      );
    }
  },
});

const set = defineCommand({
  meta: {
    description:
      "Bind one key, e.g. `key set CAPS FN`; prints the old and new binding",
  },
  args: {
    position: positionArg,
    action: {
      type: "positional",
      required: true,
      description:
        "QMK name (KC_ optional: ESC, LGUI(TAB), MO(2), MACRO(0)…), ATK function (FN, BT_1…) or 0x + 6 hex digits",
    },
    layer: layerOption,
  },
  async run({ args }) {
    const layer = intArg("layer", args.layer, 0, LAST_LAYER);
    const index = coreArg("position", () => keyIndex(args.position));
    const code = coreArg("action", () => keycode(args.action));

    const old = await withKeyboard((k) => k.setKey(layer, index, code));

    printChange(layer, index, old, code);
  },
});

const reset = defineCommand({
  meta: { description: "Put one key back to its factory binding" },
  args: { position: positionArg, layer: layerOption },
  async run({ args }) {
    const layer = intArg("layer", args.layer, 0, LAST_LAYER);
    const index = coreArg("position", () => keyIndex(args.position));

    const { old, code } = await withKeyboard((k) => k.resetKey(layer, index));

    printChange(layer, index, old, code);
  },
});

export const keyCommands = {
  key: defineCommand({
    meta: { description: "Read and bind keys by name" },
    subCommands: { list, set, reset },
  }),
};
