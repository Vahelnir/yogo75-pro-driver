/**
 * The `yogo75` program: each module in commands/ registers one topic's commands, whose
 * argument parsers (args.ts) validate everything before an action opens the keyboard.
 */
import { Command } from "@commander-js/extra-typings";
import { registerConfigCommands } from "./commands/config.ts";
import { registerDotCommands } from "./commands/dot.ts";
import { registerKeyCommands } from "./commands/key.ts";
import { registerLightingCommands } from "./commands/lighting.ts";
import { registerMacroCommands } from "./commands/macros.ts";
import { registerRawCommands } from "./commands/raw.ts";
import { registerStateCommands } from "./commands/state.ts";

/** Registers every command on `program`; settings made on it before (exitOverride…) reach every subcommand. */
export function yogo75(program: Command = new Command()): Command {
  program
    .name("yogo75")
    .description(
      "Drive the ATK Yogo 75 PRO over USB or its 2.4 GHz dongle. DEBUG=1 traces every packet.",
    )
    .showHelpAfterError();

  // in --help order
  registerConfigCommands(program);
  registerLightingCommands(program);
  registerDotCommands(program);
  registerKeyCommands(program);
  registerMacroCommands(program);
  registerStateCommands(program);
  registerRawCommands(program);

  return program;
}
