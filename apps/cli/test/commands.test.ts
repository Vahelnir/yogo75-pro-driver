import assert from "node:assert/strict";
import { test } from "node:test";
import { runCommand } from "citty";
import { main, UsageError } from "../src/commands.ts";

// Every case must fail validation: a valid one would open the real keyboard, so no dangerous command here
// (the core tests its refusal of those).
test("invalid arguments are rejected before the keyboard is opened", async () => {
  for (const rawArgs of [
    ["color", "zz0000"],
    ["color", "ff0000", "256"],
    ["set", "nope", "1"],
    ["set", "ledMode", "1.5"],
    ["dot", "13"],
    ["setled", "96", "ff0000"],
    ["setkey", "4", "0", "000400"],
    ["dotimage", "ff"],
    ["raw", "0x14", "0", "8", "zz"],
  ]) {
    await assert.rejects(
      runCommand(main, { rawArgs }),
      UsageError,
      rawArgs.join(" "),
    );
  }
});
