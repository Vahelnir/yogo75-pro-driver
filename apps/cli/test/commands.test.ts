import assert from "node:assert/strict";
import { test } from "node:test";
import { Command, CommanderError } from "@commander-js/extra-typings";
import { yogo75 } from "../src/commands.ts";

// Every case must fail validation: a valid one would open the real keyboard, so no dangerous command here
// (the core tests its refusal of those).
test("invalid arguments are rejected before the keyboard is opened", async () => {
  for (const args of [
    ["color", "zz0000"],
    ["color", "ff0000", "256"],
    ["set", "nope", "1"],
    ["set", "ledMode", "1.5"],
    ["dot", "13"],
    ["setled", "96", "ff0000"],
    ["key", "set", "CAPS", "FN", "--layer", "4"],
    ["key", "set", "NO", "FN"],
    ["key", "set", "6,0", "FN"],
    ["key", "set", "CAPS", "NOPE"],
    ["key", "reset", "F13"],
    ["key", "list", "--nope"],
    ["key", "nope"],
    ["nope"],
    ["leds", "extra"],
    ["dotimage", "ff"],
    ["setmacro", "e10b0c"],
    ["macro", "set", "256", "A"],
    ["macro", "set", "0"],
    ["macro", "set", "0", "VOLU"],
    ["macro", "set", "0", "DOWN(A)"],
    ["macro", "set", "0", "A", "--delay", "65536"],
    ["macro", "clear", "x"],
    ["raw", "0x14", "0", "8", "zz"],
    ["save", "setup.yaml"],
    ["save"],
    ["load", "setup.yml"],
  ]) {
    // inherited by every subcommand registered after: throw instead of exiting, and stay quiet
    const program = new Command()
      .exitOverride()
      .configureOutput({ writeErr: () => {} });

    await assert.rejects(
      yogo75(program).parseAsync(args, { from: "user" }),
      CommanderError,
      args.join(" "),
    );
  }
});
