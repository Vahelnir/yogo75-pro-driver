import { Argument, type Command } from "@commander-js/extra-typings";
import { FIELDS, hex } from "@yogo75/core";
import { intArg } from "../args.ts";
import { withKeyboard } from "../hid.ts";

/** Offset of a config field. */
export function at(field: string): number {
  return FIELDS.indexOf(field);
}

export function registerConfigCommands(program: Command): void {
  program
    .command("info")
    .description("Show keyboard info and every config field")
    .action(async () => {
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
    });

  program
    .command("set")
    .description("Set one config field (raw byte) by name")
    .addArgument(new Argument("<field>", "Config field").choices(FIELDS))
    .argument(
      "<value>",
      "0-255, written as is (speeds are inverted: the hub writes 6 - speed)",
      intArg(0, 255),
    )
    .action(async (field, value) => {
      const pos = at(field);

      await withKeyboard(async (k) => {
        const cfg = await k.readConfig();
        console.log(`${field}: ${cfg[pos]} -> ${value}`);
        cfg[pos] = value;
        await k.writeConfig(cfg);
      });
    });

  program
    .command("power")
    .description("Show the battery level and whether the cable is plugged in")
    .action(async () => {
      await withKeyboard(async (k) => {
        const { level, state, raw } = await k.readBattery();
        // Hub: power = min(data[0], 100), charging when data[1] == 2, which this keyboard never sends.
        console.log(
          `raw: ${hex(raw)}  battery ${level}%  ${state ? `cable plugged in (state ${state})` : "on battery"}`,
        );
      });
    });
}
