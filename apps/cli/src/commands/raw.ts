import { hex, isDangerous } from "@yogo75/core";
import { defineCommand } from "citty";
import { hexArg, intArg, UsageError } from "../args.ts";
import { withKeyboard } from "../hid.ts";

const raw = defineCommand({
  meta: {
    description:
      "Send one packet (after the start packet) and print the reply's data bytes; a resource larger than one packet (56 bytes over USB, 24 wireless) takes one call per offset",
  },
  args: {
    cmd: {
      type: "positional",
      required: true,
      description: "Command byte, e.g. 0x32",
    },
    offset: {
      type: "positional",
      required: false,
      description: "0-65535 (default 0)",
    },
    len: {
      type: "positional",
      required: false,
      description: "0-255 (default 0)",
    },
    data: {
      type: "positional",
      required: false,
      description: "Hex bytes, in one or more words",
    },
    force: {
      type: "boolean",
      description:
        "Allow 0x31 (factory reset) and 0xa0-0xc0 (firmware flashing)",
    },
  },
  async run({ args }) {
    const cmd = intArg("cmd", args.cmd, 0, 255);
    const offset = intArg("offset", args.offset ?? "0", 0, 0xffff);
    const len = intArg("len", args.len ?? "0", 0, 255);
    // cmd, offset and len are the first three positionals; every later word is data
    const data = hexArg("data", args._.slice(3).join(""));
    if (isDangerous(cmd) && !args.force) {
      throw new UsageError(
        `cmd 0x${cmd.toString(16)} is factory reset or firmware flashing; pass --force to send it`,
      );
    }

    await withKeyboard(async (k) => {
      console.log(hex(await k.raw(cmd, offset, len, data, args.force)));
    });
  },
});

export const rawCommands = { raw };
