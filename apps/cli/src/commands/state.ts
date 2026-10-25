import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Command } from "@commander-js/extra-typings";
import {
  BASES,
  firmwareVersion,
  profileFromYaml,
  profileToYaml,
  stateFromJson,
  stateToJson,
} from "@yogo75/core";
import { isYaml, SAVE_FIRST, stateFileArg } from "../args.ts";
import { withKeyboard } from "../hid.ts";

const NOT_IN_YAML =
  "macros, per-key colours and config are not in YAML profiles yet";

/** Throws `parse`'s error prefixed with the file name. */
function parseFile<T>(file: string, parse: (text: string) => T): T {
  const text = readFileSync(file, "utf8");

  try {
    return parse(text);
  } catch (e) {
    throw new Error(`${file}: ${(e as Error).message}`);
  }
}

export function registerStateCommands(program: Command): void {
  program
    .command("save")
    .description(
      "Save config, layers 0-3 with their knob, per-key colours and macros to a file (layers only in YAML)",
    )
    .argument("<file>", "JSON or YAML file to write", stateFileArg)
    .option("--force", "Overwrite the file if it exists")
    .option(
      "--full",
      "YAML: write every key, not only those that differ from the factory",
    )
    .action(async (file, { force, full }) => {
      if (full && !isYaml(file)) {
        throw new Error("--full is for YAML files only");
      }

      if (existsSync(file) && !force) {
        throw new Error(`${file} already exists; pass --force to overwrite it`);
      }

      await withKeyboard(async (k) => {
        const state = await k.readState();
        let text = stateToJson(state);
        if (isYaml(file)) {
          const profile = profileToYaml(
            state,
            firmwareVersion(await k.readInfo()),
            { full },
          );
          profile.warnings.forEach((w) => console.warn(`warning: ${w}`));
          text = profile.text;
        }

        // wx: never overwrite a file created since the check
        writeFileSync(file, text, { flag: force ? "w" : "wx" });
        console.log(
          isYaml(file)
            ? `layers 0-3 with their knob saved to ${file}; ${NOT_IN_YAML}`
            : `config, layers 0-3 with their knob, per-key colours and macros saved to ${file}`,
        );
      });
    });

  program
    .command("load")
    .description(
      "Write a saved file back to the keyboard (only what changes), then read back and compare",
    )
    .argument("<file>", "JSON or YAML file written by save", stateFileArg)
    .addHelpText("after", SAVE_FIRST)
    .action(async (file) => {
      const json = isYaml(file) ? undefined : parseFile(file, stateFromJson);

      await withKeyboard(async (k) => {
        const current = await k.readState();
        const state =
          json ?? parseFile(file, (text) => profileFromYaml(text, current));
        const bad = await k.writeState(state, current);
        if (bad.length) {
          throw new Error(
            `read-back differs from ${file} for: ${bad.join(", ")}`,
          );
        }

        console.log(
          isYaml(file)
            ? `layers loaded from ${file} and read back identical; ${NOT_IN_YAML}, left as they were`
            : `${file} loaded and read back identical`,
        );
      });
    });

  program
    .command("check")
    .description("Validate a JSON or YAML file, without the keyboard")
    .argument("<file>", "JSON or YAML file", stateFileArg)
    .action((file) => {
      // the base stands in for the keyboard: the state is only validated
      parseFile(file, (text) =>
        isYaml(file)
          ? profileFromYaml(text, BASES.at(-1)!)
          : stateFromJson(text),
      );
      console.log(`${file} is valid`);
    });
}
