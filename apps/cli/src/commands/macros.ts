import {
  InvalidArgumentError,
  type Command,
} from "@commander-js/extra-typings";
import {
  decodeMacro,
  DEFAULT_DELAY,
  EMPTY_MACRO,
  encodeMacro,
  hex,
  isEmptyMacro,
  MAX_DELAY,
  MAX_MACRO,
  splitMacros,
} from "@yogo75/core";
import { intArg, SAVE_FIRST } from "../args.ts";
import { withKeyboard } from "../hid.ts";

const SLOT_DESCRIPTION =
  "Macro number, from 0 (0-3 on the Yogo 75 PRO: the keyboard announces how many)";

const STEPS_HELP = `
Steps, QMK style (quote anything with parentheses):
  H                  tap a key
  'LCTL(C)'          tap C with Ctrl held
  'DOWN(LSFT)'       press only; every DOWN needs its UP
  'UP(LSFT)'         release only
  'DELAY(500)'       wait 500 ms more before the next key

Example: yogo75 macro set 0 'LCTL(C)' 'DELAY(480)' 'LCTL(V)'
Bind it to a key with: yogo75 key set <position> 'MACRO(0)'`;

/** Quotes what zsh or bash would otherwise interpret. */
function shellWord(word: string) {
  return /^[\w.-]+$/.test(word) ? word : `'${word}'`;
}

/** One macro as the `macro set` command that rebuilds it, or a comment when it can't be expressed. */
function macroLine(index: number, macro: Uint8Array) {
  if (isEmptyMacro(macro)) {
    return `# macro ${index}: empty`;
  }

  const spec = decodeMacro(macro);
  if (!spec) {
    return `# macro ${index} (raw, kept as is): ${hex(macro)}`;
  }

  return [
    `macro set ${index} --delay ${spec.delay}`,
    ...spec.steps.map(shellWord),
  ].join(" ");
}

/** The steps only make sense together (a DOWN needs its UP), so they are checked here, still before the keyboard is opened. */
function encodeSteps(steps: string[], delay: number) {
  try {
    return encodeMacro(steps, delay);
  } catch (e) {
    throw new InvalidArgumentError((e as Error).message);
  }
}

export function registerMacroCommands(program: Command): void {
  const macro = program
    .command("macro")
    .description("Read and write macros by key name");

  macro
    .command("list")
    .description("Print each stored macro as the command that rebuilds it")
    .action(async () => {
      const macros = splitMacros(await withKeyboard((k) => k.readMacros()));

      if (!macros.length) {
        console.log("no macros");
      }

      macros.forEach((m, i) => console.log(macroLine(i, m)));
    });

  macro
    .command("set")
    .description("Write one macro, leaving the others as they are")
    .addHelpText("after", STEPS_HELP + "\n" + SAVE_FIRST)
    .argument("<n>", SLOT_DESCRIPTION, intArg(0, MAX_MACRO))
    .argument("<steps...>", "Keys, DOWN(), UP() and DELAY() steps")
    .option(
      "--delay <ms>",
      "Delay before every action",
      intArg(0, MAX_DELAY),
      DEFAULT_DELAY,
    )
    .action(async (index, steps, { delay }) => {
      const bytes = encodeSteps(steps, delay);

      await withKeyboard((k) => k.setMacro(index, bytes));

      console.log(macroLine(index, bytes));
    });

  macro
    .command("clear")
    .description("Empty one macro; the others keep their numbers")
    .addHelpText("after", SAVE_FIRST)
    .argument("<n>", SLOT_DESCRIPTION, intArg(0, MAX_MACRO))
    .action(async (index) => {
      await withKeyboard((k) => k.setMacro(index, EMPTY_MACRO));

      console.log(macroLine(index, EMPTY_MACRO));
    });
}
