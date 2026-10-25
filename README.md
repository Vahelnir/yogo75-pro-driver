# yogo75-driver

Reverse engineering of the **ATK Yogo 75 PRO**'s protocol and of its official web configurator ([v3-hub.atk.store](https://v3-hub.atk.store/)), so the keyboard can be driven without it. For now, only the Yogo 75 PRO is supported; other ATK keyboards are untested.

## Why

I started this repository out of frustration. The official configurator wouldn't let me rebind keys the way I wanted: Fn is locked in place, I couldn't turn Caps Lock into Fn, and some keys were missing from the palette or had unreadable names. ATK's VIA driver simply didn't work for me: as far as I remember, colours could barely be set, let alone the pixel screen.

> [!WARNING]
> **AI-made project.** The protocol analysis, the code and the documentation were written by an AI agent (Claude Code). I'm not necessarily a fan of AI-made projects, but I'm not sure anyone would have reverse-engineered ATK's configurator to fix my issues with the board. I reviewed and tested it, and I use it daily, but **don't trust the project blindly**: read the code before you run it, and keep in mind that writing to the keyboard can leave it in a bad state.

## What this repository is for

1. **Protocol documentation** for anyone who wants to write a proper driver or tool. [`docs/protocol.md`](docs/protocol.md) describes the USB HID protocol, independently of any tool: packet format, every command, the config block and the keymap, macro and image formats. Each fact is tagged _verified_ (tested on a real keyboard, firmware `01.26`), _code_ (read in the configurator's JavaScript, untested) or _hypothesis_.
   If you don't trust AI-written code, this is the part to take: it is plain prose you can check against the configurator and your own keyboard, and build your own tool from.
2. **Tools to configure the Yogo 75 PRO**: [`yogo75`](apps/cli), a command-line tool, and a web configurator ([`apps/configurator`](apps/configurator)), hosted at [vahelnir.github.io/yogo75-pro-driver](https://vahelnir.github.io/yogo75-pro-driver/).

No driver needs to be installed: the official configurator is a website that talks to the keyboard over WebHID, using 64-byte reports on a vendor HID interface (usage page `0xFF60`), or 32-byte reports through the 2.4 GHz dongle. `yogo75` sends the same reports with [`node-hid`](https://github.com/node-hid/node-hid).

## Usage

Requires Node 24 (it runs TypeScript directly) and pnpm. `yogo75` uses the USB cable when the keyboard's switch is on cable, otherwise the dongle. Bluetooth is not configurable (the official configurator doesn't support it either).

```sh
pnpm install
pnpm yogo75 --help                    # every command; `pnpm yogo75 <command> --help` for its arguments
pnpm yogo75 info                      # device info and current config
pnpm yogo75 color 00ff00 4            # steady green backlight
pnpm yogo75 key list --layer 1        # the Fn layer, as key names
pnpm yogo75 key set CAPS FN           # Fn on Caps Lock (QMK names; `key reset CAPS` undoes it)
pnpm yogo75 macro set 0 'LCTL(C)' 'DELAY(480)' 'LCTL(V)'  # QMK-style macro steps; `macro list` reads them back
pnpm yogo75 key set INS 'MACRO(0)'    # run macro 0 on Insert
pnpm yogo75 save gaming.json          # config, 4 layers, per-key colours, macros -> gaming.json (--force overwrites)
pnpm yogo75 load gaming.json          # write what differs back, then read back and compare
pnpm yogo75 save keymap.yaml          # readable profile: the layers, lighting and dot screen settings that differ from the factory (--full: all of them)
pnpm yogo75 check keymap.yaml         # validate a .yaml or .json file without the keyboard
pnpm yogo75 raw 0x32 0 56             # send one packet and print the reply data (here: the start of the LED matrix)
DEBUG=1 pnpm yogo75 info              # print every packet sent and received
```

`pnpm yogo75 --help` is the command reference. Commands that write follow read → modify → write, but back nothing up: run `save` first to keep the current state.

The web configurator ([`apps/configurator`](apps/configurator)) is hosted at [vahelnir.github.io/yogo75-pro-driver](https://vahelnir.github.io/yogo75-pro-driver/), deployed from `main`; `pnpm configurator` runs it on a local dev server. It needs a Chromium browser (WebHID) and connects over the cable or the dongle.

**Do not send** `0x31` (factory reset) or `0xA0`–`0xC0` (firmware flashing): they are documented but never used. `yogo75 raw` refuses them without `--force`.

## To do

Open questions and planned work are tracked in the [issues](https://github.com/Vahelnir/yogo75-pro-driver/issues).
