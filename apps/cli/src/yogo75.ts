#!/usr/bin/env node
/** `yogo75` entry point: Commander reports bad arguments itself; any other error prints as one line. */
import { yogo75 } from "./commands.ts";

try {
  await yogo75().parseAsync();
} catch (error) {
  console.error(`error: ${(error as Error).message}`);
  process.exitCode = 1;
}
