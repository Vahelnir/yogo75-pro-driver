#!/usr/bin/env node
/**
 * `yogo75` entry point: help, then dispatch through the command table (commands.ts).
 * Errors print as one line, with the command's usage when an argument is wrong.
 */
import { parseArgs, runCommand, showUsage, type CommandDef } from "citty";
import { UsageError } from "./args.ts";
import { main } from "./commands.ts";

const rawArgs = process.argv.slice(2);

// the leading words name the (sub)command: `key set …`
function subCommands(d: CommandDef<any>) {
  return (d.subCommands ?? {}) as Record<string, CommandDef<any>>;
}

let def: CommandDef<any> = main;
let depth = 0;
while (Object.hasOwn(subCommands(def), rawArgs[depth] ?? "")) {
  def = subCommands(def)[rawArgs[depth]];
  depth++;
}

// citty titles a subcommand's usage with its meta.name, else the script path
const sub = depth
  ? { ...def, meta: { ...def.meta, name: rawArgs.slice(0, depth).join(" ") } }
  : undefined;

try {
  if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
    await (sub ? showUsage(sub, main) : showUsage(main));
  } else {
    // citty ignores unknown options: reject them before anything is sent
    const known = Object.keys(sub?.args ?? {});
    const unknown = Object.keys(
      parseArgs(rawArgs.slice(depth), sub?.args ?? {}),
    ).filter((name) => name !== "_" && !known.includes(name));
    if (sub && unknown.length) {
      throw new UsageError(`unknown option --${unknown[0]}`);
    }

    await runCommand(main, { rawArgs });
  }
} catch (error) {
  const e = error as Error;
  // citty's own argument errors (missing argument, unknown command) are CLIErrors
  if (e instanceof UsageError || e.name === "CLIError") {
    await (sub ? showUsage(sub, main) : showUsage(main));
  }

  console.error(`error: ${e.message}`);
  process.exitCode = 1;
}
