import { FIELDS, hex } from "@yogo75/core";
import { defineCommand } from "citty";
import { intArg, UsageError } from "../args.ts";
import { withKeyboard } from "../hid.ts";

/** Offset of a config field. */
export function at(field: string): number {
  return FIELDS.indexOf(field);
}

const info = defineCommand({
  meta: { description: "Show keyboard info and every config field" },
  async run() {
    await withKeyboard(async (k) => {
      const info = await k.readInfo();
      function h(n: number) {
        return n.toString(16).padStart(2, "0");
      }

      console.log("info raw:", hex(info));
      console.log(
        `  vid=${h(info[3])}${h(info[2])} pid=${h(info[5])}${h(info[4])} fw=${h(info[7])}${h(info[6])} ` +
          `proto=${info[8]} matrix=${info[12]} macros=${info[13]} lightModes=${info[15]} ` +
          `maxBright=${info[16]} dotScreen=${info[31]} ${info[34]}x${info[33]}`,
      );

      const cfg = await k.readConfig();
      console.log("config raw:", hex(cfg));
      FIELDS.forEach((name, i) =>
        console.log(`  ${name.padEnd(20)} ${cfg[i]}`),
      );
    });
  },
});

const set = defineCommand({
  meta: { description: "Set one config field (raw byte) by name" },
  args: {
    field: {
      type: "positional",
      required: true,
      description: `One of: ${FIELDS.join(", ")}`,
    },
    value: {
      type: "positional",
      required: true,
      description:
        "0-255, written as is (speeds are inverted: the hub writes 6 - speed)",
    },
  },
  async run({ args }) {
    const pos = at(args.field);
    if (pos < 0) {
      throw new UsageError(`unknown field ${args.field}`);
    }

    const value = intArg("value", args.value, 0, 255);

    await withKeyboard(async (k) => {
      const cfg = await k.readConfig();
      console.log(`${args.field}: ${cfg[pos]} -> ${value}`);
      cfg[pos] = value;
      await k.writeConfig(cfg);
    });
  },
});

const power = defineCommand({
  meta: {
    description: "Show the battery level and whether the cable is plugged in",
  },
  async run() {
    await withKeyboard(async (k) => {
      const { level, state, raw } = await k.readBattery();
      // Hub: power = min(data[0], 100), charging when data[1] == 2, which this keyboard never sends.
      console.log(
        `raw: ${hex(raw)}  battery ${level}%  ${state ? `cable plugged in (state ${state})` : "on battery"}`,
      );
    });
  },
});

export const configCommands = { info, set, power };
