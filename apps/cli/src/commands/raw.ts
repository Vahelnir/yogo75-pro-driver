import { Argument, type Command } from "@commander-js/extra-typings";
import { hex, isDangerous } from "@yogo75/core";
import { hexArg, intArg } from "../args.ts";
import { withKeyboard } from "../hid.ts";

export function registerRawCommands(program: Command): void {
  program
    .command("raw")
    .description(
      "Send one packet (after the start packet) and print the reply's data bytes; a resource larger than one packet (56 bytes over USB, 24 wireless) takes one call per offset",
    )
    .argument("<cmd>", "Command byte, e.g. 0x32", intArg(0, 255))
    .argument("[offset]", "0-65535", intArg(0, 0xffff), 0)
    .argument("[len]", "0-255", intArg(0, 255), 0)
    .addArgument(
      new Argument("[data...]", "Hex bytes, in one or more words")
        .argParser((word, data: Uint8Array) =>
          Uint8Array.of(...data, ...hexArg()(word)),
        )
        .default(new Uint8Array(), "none"),
    )
    .option(
      "--force",
      "Allow 0x31 (factory reset) and 0xa0-0xc0 (firmware flashing)",
    )
    .action(async (cmd, offset, len, data, { force }, command) => {
      if (isDangerous(cmd) && !force) {
        command.error(
          `error: cmd 0x${cmd.toString(16)} is factory reset or firmware flashing; pass --force to send it`,
        );
      }

      await withKeyboard(async (k) => {
        console.log(hex(await k.raw(cmd, offset, len, data, force)));
      });
    });
}
