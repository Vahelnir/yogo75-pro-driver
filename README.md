# yogo75-driver

Reverse engineering of the **ATK Yogo 75 PRO** keyboard and of its official web configurator ([v3-hub.atk.store](https://v3-hub.atk.store/)), so the keyboard can be driven without it.

> **Disclaimer: this repository was produced entirely agentically.** The protocol analysis, the code and the documentation were written by an AI agent (Claude Code), with a human only plugging in the keyboard, reporting what it did and approving risky steps. Treat everything here as unaudited: read the code before you run it, and keep in mind that writing to the keyboard can leave it in a bad state.

## What this repository is for

1. **Protocol documentation** for anyone who wants to write a proper driver or tool. [`docs/protocol.md`](docs/protocol.md) (in French) describes the USB HID protocol, independently of any tool: packet format, every command, the config block and the keymap, macro and image formats. Each fact is tagged *verified* (tested on a real keyboard), *code* (read in the configurator's JavaScript, untested) or *hypothesis*.
2. **A fully AI-written reimplementation**: [`yogo.ts`](yogo.ts), a small command-line tool that talks to the keyboard directly.

No driver needs to be installed: the official configurator is a website that talks to the keyboard over WebHID, using 64-byte reports on a vendor HID interface (usage page `0xFF60`), or 32-byte reports through the 2.4 GHz dongle. `yogo.ts` sends the same reports with [`node-hid`](https://github.com/node-hid/node-hid).

## Status

Verified on the keyboard (wired USB and 2.4 GHz dongle, firmware `01.26`):

- handshake and device info;
- backlight: colour, mode, brightness, speed, multicolour, on/off, per-key colours;
- keymap: reading and writing all 4 layers, extra Fn keys, momentary access to layers 2 and 3, choice of the base layer;
- macros: format, modifiers, delays, the 5 repeat modes;
- 6×6 dot screen: built-in animations, brightness, speed, colour, stored image, live frames;
- options: Win lock, WASD/arrows swap, Mac mode, 6KRO/NKRO;
- battery level and charging state;
- sleep timer (2.4 GHz only).

`yogo.ts` uses the USB cable when the keyboard's switch is on cable, otherwise the dongle. Bluetooth is not configurable (the official configurator doesn't support it either).

## Usage

Requires Node 24 (it runs TypeScript directly) and pnpm.

```sh
pnpm install
node yogo.ts                    # device info and current config
node yogo.ts color 00ff00 4     # steady green backlight
node yogo.ts keymap 0           # dump layer 0
node yogo.ts backup             # config, 4 layers, per-key colours, macros -> full-backup.json
node yogo.ts restore            # write it all back, then read back and compare
DEBUG=1 node yogo.ts            # print every packet sent and received
```

Every command is listed with an example in [`docs/cli.md`](docs/cli.md) (in French). Commands that write follow read → modify → write and save a local backup first (`*-backup.json`, git-ignored) with a matching restore command.

**Do not send** `0x31` (factory reset) or `0xA0`–`0xC0` (firmware flashing): they are documented but never used.

## To do

Open questions and planned work are tracked in the [issues](https://github.com/Vahelnir/yogo75-pro-driver/issues).

## The configurator copy

`web-dump/` holds a local copy of the configurator's JavaScript, read to find the protocol. It is ATK's proprietary code, so it is **not** committed; `docs/protocol.md` explains how to download it again. It is only read and grepped, never executed.
