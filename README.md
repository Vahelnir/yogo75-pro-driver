# yogo75-driver

Reverse engineering of the **ATK Yogo 75 PRO** keyboard and of its official web configurator ([v3-hub.atk.store](https://v3-hub.atk.store/)), so the keyboard can be driven without it.

> **Disclaimer: this repository was produced entirely agentically.** The protocol analysis, the code and the documentation were written by an AI agent (Claude Code), with a human only plugging in the keyboard, reporting what it did and approving risky steps. Treat everything here as unaudited: read the code before you run it, and keep in mind that writing to the keyboard can leave it in a bad state.

## What this repository is for

1. **Protocol documentation** for anyone who wants to write a proper driver or tool. [`docs/protocol.md`](docs/protocol.md) (in French) describes the USB HID protocol: packet format, every command, the config block and the keymap, macro and image formats. Each fact is tagged *verified* (tested on a real keyboard), *code* (read in the configurator's JavaScript, untested) or *hypothesis*.
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
DEBUG=1 node yogo.ts            # print every packet sent and received
```

Every command is listed with an example in `docs/protocol.md`. Commands that write follow read → modify → write and save a local backup first (`*-backup.json`, git-ignored) with a matching restore command.

**Do not send** `0x31` (factory reset) or `0xA0`–`0xC0` (firmware flashing): they are documented but never used.

## To do

- **Battery**: status `0` = no cable, `1` = cable plugged in; the configurator expects `2` for charging, whose meaning is unknown (maybe fully charged).
- **Backlight**: the effect direction field (`customColorIndex`) had no visible effect. Most effects are only known by their name in the configurator.
- **Music sync** for the lighting (`0x2E` / `0x2F`, mode 254): undetermined. It is sent by ATK's desktop app, not the website, and probably works like the dot screen's live stream.
- **Unknown Fn functions** found in the factory Fn layer: `50 31`–`33`, `3c`, `3e` (low risk); `34`–`37` (probably wireless channel switching); `41` (Fn + Esc, possibly a factory reset: do not test without a full backup).
- **Unknown config fields**: `fkeyChange`, `wheelMode` values other than 0; why a read in the same session still returns the old values after a write.
- **Rest of the `0x32` table** (after the key → LED map) and keymap slots 46–47.
- **A real tool**: turn `yogo.ts` from a probe into a clean CLI (full backup/restore, profiles, keymap and macro editing from a file).

## The configurator copy

`web-dump/` holds a local copy of the configurator's JavaScript, read to find the protocol. It is ATK's proprietary code, so it is **not** committed; `docs/protocol.md` explains how to download it again. It is only read and grepped, never executed.
