# yogo75-driver

Reverse engineering of the **ATK Yogo 75 PRO** keyboard and of its official web configurator ([v3-hub.atk.store](https://v3-hub.atk.store/)), so the keyboard can be driven without it.

> **Disclaimer: this repository was produced entirely agentically.** The protocol analysis, the code and the documentation were written by an AI agent (Claude Code), with a human only plugging in the keyboard, reporting what it did and approving risky steps. Treat everything here as unaudited: read the code before you run it, and keep in mind that writing to the keyboard can leave it in a bad state.

## What this repository is for

1. **Protocol documentation** for anyone who wants to write a proper driver or tool. [`docs/protocol.md`](docs/protocol.md) (in French) describes the USB HID protocol: packet format, every command, the config block and the keymap, macro and image formats. Each fact is tagged *verified* (tested on a real keyboard), *code* (read in the configurator's JavaScript, untested) or *hypothesis*.
2. **A fully AI-written reimplementation**: [`yogo.ts`](yogo.ts), a small command-line tool that talks to the keyboard directly.

No driver needs to be installed: the official configurator is a website that talks to the keyboard over WebHID, using 64-byte reports on a vendor HID interface (usage page `0xFF60`). `yogo.ts` sends the same reports with [`node-hid`](https://github.com/node-hid/node-hid).

## Status

Verified on the keyboard (wired USB, firmware `01.26`):

- handshake and device info;
- backlight: colour, mode, brightness, speed, multicolour, on/off, per-key colours;
- keymap: reading and writing all 4 layers, extra Fn keys, momentary access to layers 2 and 3, choice of the base layer;
- macros: format, modifiers, delays, the 5 repeat modes;
- 6×6 dot screen: built-in animations, brightness, speed, colour, stored image, live frames;
- options: Win lock, WASD/arrows swap, Mac mode, 6KRO/NKRO.

## Usage

Requires Node 24 (it runs TypeScript directly) and pnpm.

```sh
pnpm install
node yogo.ts                    # device info and current config
node yogo.ts color 00ff00 4     # steady green backlight
node yogo.ts keymap 0           # dump layer 0
DEBUG=1 node yogo.ts            # print every packet sent and received
```

Every command is listed with an example in `docs/protocol.md`. Commands that write follow read → modify → write and save a local backup first (`*-backup.json`, git-ignored) with a matching restore command.

**Do not send** `0x31` (factory reset) or `0xA0`–`0xC0` (firmware flashing): they are documented but never used.

## To do

- **Battery**: `power_info` (`0x30`) reads 91 % with status 1 over USB; what status 1 means is unknown.
- **Backlight**: the effect direction field (`customColorIndex`) had no visible effect; most of the 21 effects were never looked at.
- **Music sync** for the lighting (`0x2E` / `0x2F`).
- **Unknown Fn functions** found in the factory Fn layer: `50 31`–`33`, `3c`, `3e` (low risk); `34`–`37` (probably wireless channel switching); `41` (Fn + Esc, possibly a factory reset: do not test without a full backup).
- **Unknown config fields**: `fkeyChange`, `wheelMode` values other than 0; why a read in the same session still returns the old values after a write.
- **Rest of the `0x32` table** (after the key → LED map) and keymap slots 46–47.
- **Wireless** (Bluetooth / 2.4 GHz): packets are split differently and the sleep timer probably only applies there.
- **A real tool**: turn `yogo.ts` from a probe into a clean CLI (full backup/restore, profiles, keymap and macro editing from a file).

## The configurator copy

`web-dump/` holds a local copy of the configurator's JavaScript, read to find the protocol. It is ATK's proprietary code, so it is **not** committed; `docs/protocol.md` explains how to download it again. It is only read and grepped, never executed.
