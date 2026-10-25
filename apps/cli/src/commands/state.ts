import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Command } from "@commander-js/extra-typings";
import {
  baseForFirmware,
  BASES,
  firmwareVersion,
  profileFromYaml,
  profileToYaml,
  stateDiff,
  stateFromJson,
  stateToJson,
  type KeyboardState,
} from "@yogo75/core";
import { SAVE_FIRST, stateFileArg } from "../args.ts";
import { withKeyboard } from "../hid.ts";

function isYaml(file: string) {
  return /\.ya?ml$/i.test(file);
}

/** The state a file gives; a YAML profile takes what it doesn't set from `current` (the base's when absent). */
function parseStateFile(file: string, current?: KeyboardState) {
  const text = readFileSync(file, "utf8");
  try {
    return isYaml(file) ? profileFromYaml(text, current) : stateFromJson(text);
  } catch (e) {
    const message = (e as Error).message;
    throw new Error(
      message.includes("\n") ? `${file}:\n${message}` : `${file}: ${message}`,
    );
  }
}

export function registerStateCommands(program: Command): void {
  program
    .command("save")
    .description(
      "Save config, layers 0-3 with their knob, per-key colours and macros to a file (YAML: layers, per-key colours, lighting and dot screen only, for now)",
    )
    .argument("<file>", "JSON, or YAML profile, file to write", stateFileArg)
    .option("--force", "Overwrite the file if it exists")
    .option(
      "--full",
      "YAML: write every value, not only what differs from the base",
    )
    .action(async (file, { force, full }) => {
      if (existsSync(file) && !force) {
        throw new Error(`${file} already exists; pass --force to overwrite it`);
      }

      if (full && !isYaml(file)) {
        throw new Error("--full is for YAML profiles only");
      }

      await withKeyboard(async (k) => {
        const state = await k.readState();
        let text = stateToJson(state);
        if (isYaml(file)) {
          const firmware = firmwareVersion(await k.readInfo());
          if (!baseForFirmware(firmware)) {
            console.error(
              `no base for firmware ${firmware}: diffed against ${BASES.at(-1)!.name}, the latest`,
            );
          }
          text = profileToYaml(state, firmware, { full });
        }

        // wx: never overwrite a file created since the check
        writeFileSync(file, text, { flag: force ? "w" : "wx" });
        console.log(
          isYaml(file)
            ? `layers 0-3 with their knob, per-key colours, lighting and dot screen saved to ${file} (macros and keyboard settings not included yet)`
            : `config, layers 0-3 with their knob, per-key colours and macros saved to ${file}`,
        );
      });
    });

  program
    .command("load")
    .description(
      "Write what differs in a saved file to the keyboard, then read back and compare",
    )
    .argument("<file>", "JSON file or YAML profile", stateFileArg)
    .addHelpText("after", SAVE_FIRST)
    .action(async (file) => {
      // checked before opening the keyboard: an invalid file writes nothing
      parseStateFile(file);

      await withKeyboard(async (k) => {
        const current = await k.readState();
        const state = parseStateFile(file, current);
        const changed = stateDiff(state, current);
        if (!changed.length) {
          console.log(`nothing to write: the keyboard already matches ${file}`);
          return;
        }

        const bad = await k.writeState(state, current);
        if (bad.length) {
          throw new Error(
            `read-back differs from ${file} for: ${bad.join(", ")}`,
          );
        }

        console.log(
          `wrote ${changed.join(", ")} from ${file}, read back identical`,
        );
      });
    });

  program
    .command("check")
    .description("Check a saved file without the keyboard")
    .argument("<file>", "JSON file or YAML profile", stateFileArg)
    .action((file) => {
      parseStateFile(file);
      console.log(`${file} is valid`);
    });
}
