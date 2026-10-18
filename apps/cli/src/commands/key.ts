import type { Command } from "@commander-js/extra-typings";
import {
  COLS,
  keycode,
  keycodeName,
  keyIndex,
  keyNames,
  knobNames,
  ROWS,
} from "@yogo75/core";
import { coreArg, intArg, LAST_LAYER, SAVE_FIRST } from "../args.ts";
import { withKeyboard } from "../hid.ts";

const LAYER_FLAGS = "--layer <layer>";
const LAYER_DESCRIPTION = `Layer 0-${LAST_LAYER} (1 = Fn)`;

const POSITION_DESCRIPTION = `Key by its factory layer-0 name (CAPS) or as row,col (3,0); row 0-${ROWS - 1}, col 0-${COLS - 1}; the knob as KNOB_LEFT, KNOB_RIGHT or KNOB_PRESS`;

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

export function registerKeyCommands(program: Command): void {
  const key = program.command("key").description("Read and bind keys by name");

  key
    .command("list")
    .description(
      "Print a layer as key names, one line per row, then the knob's actions",
    )
    .option(LAYER_FLAGS, LAYER_DESCRIPTION, intArg(0, LAST_LAYER), 0)
    .option("--factory", "Read the factory keymap")
    .action(async ({ layer, factory }) => {
      const map = await withKeyboard((k) => k.readKeymap(layer, factory));
      const names = keyNames(map);

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

      const { left, right, press } = knobNames(map);
      console.log(`knob: left ${left}, right ${right}, press ${press}`);
    });

  key
    .command("set")
    .description(
      "Bind one key, e.g. `key set CAPS FN`; prints the old and new binding",
    )
    .addHelpText("after", SAVE_FIRST)
    .argument("<position>", POSITION_DESCRIPTION, coreArg(keyIndex))
    .argument(
      "<action>",
      "QMK name (KC_ optional: ESC, LGUI(TAB), MO(2), MACRO(0)…), ATK function (FN, BT_1…) or 0x + 6 hex digits",
      coreArg(keycode),
    )
    .option(LAYER_FLAGS, LAYER_DESCRIPTION, intArg(0, LAST_LAYER), 0)
    .action(async (index, code, { layer }) => {
      const old = await withKeyboard((k) => k.setKey(layer, index, code));

      printChange(layer, index, old, code);
    });

  key
    .command("reset")
    .description("Put one key back to its factory binding")
    .addHelpText("after", SAVE_FIRST)
    .argument("<position>", POSITION_DESCRIPTION, coreArg(keyIndex))
    .option(LAYER_FLAGS, LAYER_DESCRIPTION, intArg(0, LAST_LAYER), 0)
    .action(async (index, { layer }) => {
      const { old, code } = await withKeyboard((k) => k.resetKey(layer, index));

      printChange(layer, index, old, code);
    });
}
