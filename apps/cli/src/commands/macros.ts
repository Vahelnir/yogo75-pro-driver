import {
  InvalidArgumentError,
  type Command,
} from "@commander-js/extra-typings";
import { fromHex, hex, macroBlob, type Macro } from "@yogo75/core";
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

function macrosArg(value: string): Macro[] {
  const specs = value.split(",");
  if (
    !specs.every((m) => /^([0-9a-f]{2})+(@\d+)?$/i.test(m)) ||
    specs.length > MAX_MACROS
  ) {
    throw new InvalidArgumentError(
      `1 to ${MAX_MACROS} of HID codes[@delay], comma-separated`,
    );
  }

  return specs.map(parseMacro);
}

export function registerMacroCommands(program: Command): void {
  program
    .command("setmacro")
    .description(
      `Write up to ${MAX_MACROS} macros (replacing all of them); saves ${MACROS_BACKUP} first`,
    )
    .argument(
      "<macros>",
      'macro[,macro…]; macro = HID codes[@delay], e.g. e10b0c@20 for "HI"',
      macrosArg,
    )
    .action(async (macros) => {
      await withKeyboard(async (k) => {
        saveOnce(MACROS_BACKUP, await k.readMacros(), "macros");

        const blob = macroBlob(macros);
        await k.writeMacros(blob);
        console.log(`${macros.length} macro(s) written: ${hex(blob)}`);
      });
    });

  program
    .command("macros-restore")
    .description(`Write the macros back from ${MACROS_BACKUP}`)
    .action(async () => {
      const blob = fromHex(readJson(MACROS_BACKUP));

      await withKeyboard(async (k) => {
        await k.writeMacros(blob);
        console.log(`macros restored from ${MACROS_BACKUP}`);
      });
    });
}
