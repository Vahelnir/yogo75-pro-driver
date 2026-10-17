import { fromHex, hex, macroBlob, type Macro } from "@yogo75/core";
import { defineCommand } from "citty";
import { UsageError } from "../args.ts";
import { withKeyboard } from "../hid.ts";
import { readJson, saveOnce } from "../io.ts";

const MACROS_BACKUP = "macros-backup.json";
const MAX_MACROS = 4;
const MACRO_DELAY = 20; // per action; unit assumed to be ms

/** Macro argument: HID codes in hex, then an optional "@delay", e.g. e10b0c@20 for "HI". */
function parseMacro(spec: string): Macro {
  const [codes, delay = String(MACRO_DELAY)] = spec.split("@");
  return { keys: [...fromHex(codes)], delay: Number(delay) };
}

const setmacro = defineCommand({
  meta: {
    description: `Write up to ${MAX_MACROS} macros (replacing all of them); saves ${MACROS_BACKUP} first`,
  },
  args: {
    macros: {
      type: "positional",
      required: true,
      description:
        'macro[,macro…]; macro = HID codes[@delay], e.g. e10b0c@20 for "HI"',
    },
  },
  async run({ args }) {
    const specs = args.macros.split(",");
    if (
      !specs.every((m) => /^([0-9a-f]{2})+(@\d+)?$/i.test(m)) ||
      specs.length > MAX_MACROS
    ) {
      throw new UsageError(
        `macros: 1 to ${MAX_MACROS} of HID codes[@delay], comma-separated`,
      );
    }

    await withKeyboard(async (k) => {
      saveOnce(MACROS_BACKUP, await k.readMacros(), "macros");

      const blob = macroBlob(specs.map(parseMacro));
      await k.writeMacros(blob);
      console.log(`${specs.length} macro(s) written: ${hex(blob)}`);
    });
  },
});

const macrosRestore = defineCommand({
  meta: { description: `Write the macros back from ${MACROS_BACKUP}` },
  async run() {
    const blob = fromHex(readJson(MACROS_BACKUP));

    await withKeyboard(async (k) => {
      await k.writeMacros(blob);
      console.log(`macros restored from ${MACROS_BACKUP}`);
    });
  },
});

export const macroCommands = { setmacro, "macros-restore": macrosRestore };
