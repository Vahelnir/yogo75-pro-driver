/**
 * The command table: each entry's args and description drive both dispatch and `--help`.
 * Every `run` validates its arguments before opening the keyboard. One module per topic in commands/.
 */
import { defineCommand, type CommandDef } from "citty";
import { backupCommands } from "./commands/backup.ts";
import { configCommands } from "./commands/config.ts";
import { dotCommands } from "./commands/dot.ts";
import { keyCommands } from "./commands/key.ts";
import { lightingCommands } from "./commands/lighting.ts";
import { macroCommands } from "./commands/macros.ts";
import { rawCommands } from "./commands/raw.ts";

// in --help order
export const commands: Record<string, CommandDef<any>> = {
  ...configCommands,
  ...lightingCommands,
  ...dotCommands,
  ...keyCommands,
  ...macroCommands,
  ...backupCommands,
  ...rawCommands,
};

export const main = defineCommand({
  meta: {
    name: "yogo75",
    description:
      "Drive the ATK Yogo 75 PRO over USB or its 2.4 GHz dongle. DEBUG=1 traces every packet.",
  },
  subCommands: commands,
});
