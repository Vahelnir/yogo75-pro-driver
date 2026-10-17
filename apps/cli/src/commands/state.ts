import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Command } from "@commander-js/extra-typings";
import { stateFromJson, stateToJson } from "@yogo75/core";
import { SAVE_FIRST, stateFileArg } from "../args.ts";
import { withKeyboard } from "../hid.ts";

export function registerStateCommands(program: Command): void {
  program
    .command("save")
    .description(
      "Save config, layers 0-3, per-key colours and macros to a file",
    )
    .argument("<file>", "JSON file to write", stateFileArg)
    .option("--force", "Overwrite the file if it exists")
    .action(async (file, { force }) => {
      if (existsSync(file) && !force) {
        throw new Error(`${file} already exists; pass --force to overwrite it`);
      }

      await withKeyboard(async (k) => {
        // wx: never overwrite a file created since the check
        writeFileSync(file, stateToJson(await k.readState()), {
          flag: force ? "w" : "wx",
        });
        console.log(
          `config, layers 0-3, per-key colours and macros saved to ${file}`,
        );
      });
    });

  program
    .command("load")
    .description(
      "Write a saved file back to the keyboard, then read back and compare",
    )
    .argument("<file>", "JSON file written by save", stateFileArg)
    .addHelpText("after", SAVE_FIRST)
    .action(async (file) => {
      const text = readFileSync(file, "utf8");
      let state;
      try {
        state = stateFromJson(text);
      } catch (e) {
        throw new Error(`${file}: ${(e as Error).message}`);
      }

      await withKeyboard(async (k) => {
        const bad = await k.writeState(state);
        if (bad.length) {
          throw new Error(
            `read-back differs from ${file} for: ${bad.join(", ")}`,
          );
        }

        console.log(`everything loaded from ${file} and read back identical`);
      });
    });
}
