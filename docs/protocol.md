# ATK Yogo 75 PRO protocol and how the configurator works

Reference from the reverse engineering of the ATK web configurator (`https://v3-hub.atk.store/`).

## In short

The official configurator is a website. It talks to the keyboard through the browser's **WebHID** API, exchanging small 64-byte messages over a USB interface reserved for configuration. There is no driver to install: the "driver" is this protocol. Since the site's code is JavaScript, we could download it and read it to recover the message format.

Every exchange follows the same pattern: we send a command ("read the config", "write the keymap"…), and the keyboard answers with the requested data or an acknowledgement. All the lighting and option settings fit in one 64-byte block, which we read, modify, then write back.

This document describes the protocol itself, independently of any tool.

### Example: changing the backlight colour

Setting the backlight to steady green (mode 4, `00ff00`), packet by packet over USB (first bytes only; `tx` = sent, `rx` = received):

```
tx aa 10 00 00 00 01 00 …                      open the session (cmd 0x10), request #1
rx aa 10 00 00 00 01 00 55 …                   OK
tx aa 14 00 00 38 02 00 …                      read the config: 56 (0x38) bytes at offset 0
rx aa 14 00 00 38 02 00 55  00 00 00 5a 03 …   the data starts at byte 8
tx aa 14 38 00 08 03 00 …                      read the remaining 8 bytes (offset 56)
rx …
tx aa 15 00 00 38 04 00 00  00 00 04 5a 03 00 00 00 ff 00 …   write the block back: mode 4, R=00 G=ff B=00
rx aa 15 … 55 …                                OK
tx aa 15 38 00 08 05 00 …                      write back the remaining 8 bytes
rx aa 15 … 55 …                                OK
```

### Glossary

- **HID** (Human Interface Device): the USB standard for keyboards and mice. A single device exposes several HID **interfaces**, each identified by a _usage page_ and a _usage_ (for example `0x01`/6 for the standard keyboard).
- **Report**: an HID message. Here, reports are 64 bytes over USB and 32 through the 2.4 GHz dongle.
- **VID / PID**: USB vendor and product identifiers.
- **LE** (_little-endian_): a 2-byte number is written low byte first. `38 00` = 0x0038 = 56.
- **Keymap / layer**: the mapping from physical key → code sent. The keyboard has 4 layers (normal, Fn…).
- **Bootloader / IAP**: the special mode used to flash the firmware.

## Information status

Each fact carries a status:

- **verified**: tested on the real keyboard, with the observed result;
- **code**: read in the configurator's JS, not tested yet;
- **hypothesis**: inferred, to be confirmed.

This document is updated **as discoveries are made**, whether they come from reading the configurator's code or from a test on the keyboard. We don't wait for the end of a task: we add the fact with its status and correct the one that was wrong.

The keyboard's manuals.plus page is an automatic transcription of the paper guide, full of errors (Fn + F1 = lighting, Scroll Lock and Pause keys that don't exist, Fn + 1/2/3 = cable / BT / 2.4 GHz): not a source.

## Hardware

| Field                | Value                                                                                                                                                                                                                                                               | Status                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| USB name             | `ATK Yogo75 PRO`, manufacturer `RDMCTMZT`                                                                                                                                                                                                                           | verified                       |
| Wired VID / PID      | `0x373B` / `0x119B` (4507)                                                                                                                                                                                                                                          | verified                       |
| 2.4 GHz PID (dongle) | `0x11FF` (4607), USB name `ATK YOGO 75 PRO Dongle`. PID of the model, not of the unit: hard-coded in the configurator's device table (`YOGO 75 PRO 2.4G`)                                                                                                           | verified                       |
| Bootloader PID (IAP) | same PID, usage page `0xFF00`, usage 1                                                                                                                                                                                                                              | code                           |
| Firmware             | `01.26`, protocol v3                                                                                                                                                                                                                                                | verified (`get_keyboard_info`) |
| Chip                 | INGChips ING91680C (keyboard and dongle): every firmware image starts with `INGCHIPS` `ING91680C_TB`, then `HS_KB_W` (keyboard) or `HS_DG_W` (dongle)                                                                                                               | verified (firmware files)      |
| Firmware files       | public, no auth: `GET https://api-hub-cloud.atk.pro/firmware/14139/{pid}/device/list` lists every version with its `.bin` URL (what the configurator's upgrade dialog calls). PID 4507: 1.03, 1.06, 1.24, 1.26; 4607 (dongle): 1.00 and 1.06, same file             | verified                       |
| Connection mode      | physical switch on the keyboard: Bluetooth, cable, 2.4 GHz. Bluetooth is not configurable: the configurator doesn't offer it (according to the user, untested). On 2.4 GHz, the USB cable only charges: macOS sees no HID device from the keyboard, only the dongle | verified                       |
| Non-PRO variant      | Yogo 75: PID 4508 wired, 4608 on 2.4 GHz                                                                                                                                                                                                                            | code                           |

HID interfaces exposed over USB (verified with `hidutil list` / `node-hid`):

| Usage page / usage                 | Role                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `0x01` / 6, 2, 1, 128 ; `0x0C` / 1 | keyboard, mouse, system control, multimedia (standard)                                  |
| **`0xFF60` / `0x61`**              | **configuration channel** (same interface as VIA/QMK raw HID, but a different protocol) |
| `0xFF00` / 1                       | vendor channel, used for the bootloader / firmware                                      |

## The web configurator

It is a Vue app bundled by rolldown, which talks to the keyboard over **WebHID**. There is no native binary to disassemble.

- Copy downloaded on 2026-10-17 into `web-dump/static/`. This folder **is not committed** (ATK's proprietary code): everyone downloads it again. File names contain a hash and change with each deployment of the site. To get the copy: fetch `index.html`, then recursively follow the referenced `./xxx-HASH.js` files (`curl` in a loop is enough).
- `web-dump/evision_v2.js` is obtained by cutting `demoMode.store-*.js` between `var Ui=class` and `O(Ui,"solutionProvider"`, then adding a line break before each `async methodName(`.
- This code is **untrusted**: we read it and grep it, we never execute it.
- The JS is minified. Variable names (`Ui`, `an`, `oo`…) are only valid for this build; string literals (`"fieldMap"`, `get_keyboard_function`, `productId:4507`) stay stable and serve as entry points for searching.

Key files of the 2026-10-17 build:

| File                      | Content                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `demoMode.store-*.js`     | Device registry (`productId:4507` → `solutionProvider: EVISION_V2`), keyboard controller (class `Ui`), transport (`fW`), packet classes (`an`), command table (`oo`), bootloader commands (`Ec`) |
| `web-dump/evision_v2.js`  | Extract of the `Ui` controller, one method per line. It is the entry point for reading a function's behaviour                                                                                    |
| `keyboard-info.util-*.js` | List of lighting modes (`Ns`), of dot screen modes (`Os`)                                                                                                                                        |
| `base-hid-device-*.js`    | WebHID base: request queues, mutex, 3 attempts, 500 ms timeout                                                                                                                                   |

The Yogo 75 PRO appears **twice** in the registry: once as plain `EVISION_V2`, and once with `isVia:true, skipViaDetection:true` (controller `VC` wrapping `Ui`). Both go through the same `Ui` controller.

To find a method: `grep -o 'async NAME(.\{0,1500\}' web-dump/evision_v2.js`.

## Transport

Status: verified.

- 64-byte output reports, report ID 0, on the `0xFF60` interface. With `node-hid`, we write `[0x00, ...64 bytes]`.
- Each request carries a 16-bit **request code** that the keyboard sends back in its reply. This code is what matches a reply to its request. Other input reports may arrive in between: we ignore them.
- **2.4 GHz wireless**:
  - **verified**: dongle `ATK YOGO 75 PRO Dongle`, PID `0x11FF` (4607). It exposes the same interfaces as the keyboard over USB. Descriptor of `0xFF60`/`0x61`: no report ID, 32-byte input and output reports. Replies start directly with `AA` (no stray byte). `0x10`, `get_keyboard_info` (39 bytes as 24 + 15) and the config block (24 + 24 + 16 bytes) return the same values as wired. `get_keyboard_info` gives the wired PID `0x119B`, not the dongle's. Writing the block in 3 `0x15` packets (24, 24, 16 bytes, without the configurator's bug) is accepted and read back identically, and the backlight does turn blue;
  - **verified**: the rest also works through the dongle, in 24-byte packets.
    - **Reads**: the 4 keymap layers, the per-key colours and the macros are identical to the values read wired (336 bytes in 14 packets, macros in 224 bytes), and the battery can be read.
    - **Writes**: remapping a key (Insert → X), per-key colour (Esc in red, mode 253), macro "HI" on Insert (2 packets; Shift is not held), dot screen mode (12), still image (`0x3B`, 108 bytes in 5 `len 24` packets) and live visualizer (`0x3C`, 72 bytes in 3 `len 24` packets, stable checkerboard for 90 s, then `0x3D`).
    - Each write was checked by eye on the keyboard, then restored and read back.
  - details read in the code:
  - dongle `VID 0x373B` / **PID 4607**, same interface `0xFF60` / usage `0x61`, `connectType: 0` (2 when wired);
  - the controller switches to `BUFFER_LEN = 32` (32-byte reports), `DATA_LEN = 24` (24 data bytes per packet), `matrixMaxSize = 16` (16 × 24 = 384 bytes for the keymap and the colours), then calls `applyWirelessTransport()`. Entry point: `isWireless&&(an.DATA_LEN=24` in `demoMode.store-*.js`;
  - `applyWirelessTransport()` only raises the timeout to 3 s (500 ms wired). The framing is the same as over USB: `AA cmd offset len request`, data at byte 8, on 32 bytes. The report ID and the size come from the HID descriptor of the `0xFF60`/`0x61` interface (output report, otherwise input); on timeout, the configurator retries up to 3 times, alternating 32 and 64 bytes. In replies, if byte 0 is not `0xAA` but byte 1 is, it strips the first byte;
  - config block: read in 3 `0x14` packets (`len 24` @0, `len 24` @24, `len 27` @48); written in 3 `0x15` packets (fields 0–23 @0, 24–47 @24, `len 16` @48). **Configurator bug**: its third loop fills the second buffer, so it writes zeros back to positions 48–63. Do not reproduce it;
  - `get_keyboard_info`: 39 bytes in 2 packets (`len 24` then `len 15`).

## Packet format

```
byte   0     1     2..3          4      5..6               7       8..63
      0xAA  cmd   offset (LE)   len    request code (LE)  -       data (56 max)
```

| Byte  | Request                               | Reply                                                                                                                                                                                                                | Status                         |
| ----- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 0     | `0xAA` (constant `rA`)                | `0xAA`                                                                                                                                                                                                               | verified                       |
| 1     | command                               | command echoed                                                                                                                                                                                                       | verified                       |
| 2..3  | offset in the resource, little-endian | echoed; **`[2] == 0xFF` = error**                                                                                                                                                                                    | verified (echo) / code (error) |
| 4     | data length (≤ 56)                    | echoed                                                                                                                                                                                                               | verified                       |
| 5..6  | request code                          | echoed                                                                                                                                                                                                               | verified                       |
| 7     | 0                                     | status: `0x55` accepted, `0x0F` rejected (byte 0 not `0xAA`, `len` > 56, or no start packet `0x10` yet). `0x55` only means the packet was dispatched: a command can still ignore its data (e.g. `0x2D` out of range) | code (firmware 1.26)           |
| 8..63 | data to write                         | data read                                                                                                                                                                                                            | verified                       |

Resources larger than 56 bytes are read or written in several packets, advancing the offset by 56 each time.

## Commands

The configurator's `oo` table.

| Cmd                            | Name                                       | Usage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Status                                            |
| ------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `0x10`                         | start                                      | opens the session; the configurator sends it again if more than 5 s have passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | verified                                          |
| `0x11`                         | end                                        | closes the session (the configurator almost never calls it). Accepted; afterwards, reading the config block returns zeros until the next `0x10`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | verified                                          |
| `0x12`                         | get_keyboard_info                          | device capabilities, see [info](#get_keyboard_info-0x12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | verified                                          |
| `0x14`                         | get_keyboard_function                      | reads the config block                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | verified                                          |
| `0x15`                         | write_keyboard_function                    | writes the config block                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | verified                                          |
| `0x16`–`0x19`                  | get_default_key_matrix 1–4                 | factory keymap, layers 0–3, see [keymap](#keymap)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | verified (read)                                   |
| `0x1A`, `0x1C`, `0x1E`, `0x20` | get_current_key_matrix 1–4                 | current keymap, layers 0–3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | verified (read)                                   |
| `0x1B`, `0x1D`, `0x1F`, `0x21` | set_current_key_matrix 1–4                 | writes the keymap, layers 0–3, see [writing](#writing)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | verified (`0x1B`, `0x1D`) / code (`0x1F`, `0x21`) |
| `0x22`…`0x2A` (even)           | get_custom_led_matrix 1–5                  | per-key colours (mode 253), see [per-key colours](#per-key-colours); the configurator only uses `0x22`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | verified (`0x22`)                                 |
| `0x23`…`0x2B` (odd)            | write_custom_led_matrix 1–5                | writes the per-key colours; the configurator only uses `0x23`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | verified (`0x23`)                                 |
| `0x2C` / `0x2D`                | get_macro / write_macro                    | macros, see [macros](#macros)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | verified                                          |
| `0x2E` / `0x2F`                | open/close_sync_led = start/end_sync_music | syncing the lighting with music (mode 254), sent by the ATK desktop application; presumably works like `0x3C` / `0x3D`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | undetermined                                      |
| `0x30`                         | power_info                                 | packet without length; `[0]` = battery level in %, `[1]` = charging state: `0` no cable, `1` cable plugged in (read over USB: `5b 01` = 91 %; through the dongle: `52 00` without cable, then `52 01` with the charging cable). The state stays at `1` once the battery is full, cable still plugged in (`64 01` read twice, about an hour apart): `1` means "cable plugged in", not "charging". The configurator only counts the value `2` as "charging" (and caps the level at 100): so it never shows charging on this keyboard. `2` has never been observed. In the firmware (code, 1.26), `2` = cable plugged in, the charger's status pin reads 0 and the level is ≥ 100 (the level is then forced to 100). Otherwise, with the cable, it is `1`: at 100 % the charger never gave that signal | verified                                          |
| `0x31`                         | **reset_device**                           | **resets the keyboard to factory config**. Do not send without explicit approval                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | code                                              |
| `0x32`                         | get_led_matrix                             | key → LED mapping (384 bytes)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | verified                                          |
| `0x3B`                         | set_dotscreen_matrix                       | dot screen image (mode 6), see [image](#dot-screen-image)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | verified                                          |
| `0x3C` / `0x3D`                | start/end_sync_dot                         | live music visualizer (RGB565) / stop, which resets the dot screen mode to 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | verified                                          |

Bootloader (table `Ec`): `0xA0` START, `0xA1` FLASH_WRITE, `0xA2` FLASH_READ, `0xA3` REBOOT, `0xA4` SWITCH_APP, `0xB0` ACK, `0xC0` SWITCH_BOOT. The error codes are in `Y_` (`0xE0`–`0xF6`). **These commands flash the firmware and can make the keyboard unusable: we never send them without the user's explicit approval.**

## get_keyboard_info (0x12)

Read: `len = 56`, `offset = 0`. Index into the data area (byte 8 onwards). The values given are those read on the test keyboard.

| Index | Field                                                                    | Value read         |
| ----- | ------------------------------------------------------------------------ | ------------------ |
| 0–1   | validL/validH                                                            | `aa bb`            |
| 2–3   | vid (LE)                                                                 | `0x373B`           |
| 4–5   | pid (LE)                                                                 | `0x119B`           |
| 6–7   | version (LE, in hex)                                                     | `01.26`            |
| 8     | protocolVersion                                                          | 3                  |
| 9     | profile                                                                  | 1                  |
| 10    | keyboardId                                                               | 0                  |
| 11    | keyboardType                                                             | 2                  |
| 12    | matrixSize                                                               | 128                |
| 13    | macroSize                                                                | 4                  |
| 14    | hasKeyLight                                                              | 1                  |
| 15    | keyLightModeCount                                                        | 21                 |
| 16    | keyLightMaxBrightness                                                    | 90                 |
| 17    | keyLightMaxSpeed                                                         | 4                  |
| 18    | customLightCount                                                         | 1                  |
| 19–24 | logo: has, modeCount, count, maxBrightness, maxSpeed, supportMusic       | 0, 4, 33, 90, 4, 0 |
| 25–30 | side strip: has, modeCount, count, maxBrightness, maxSpeed, supportMusic | 0, 4, 12, 90, 4, 0 |
| 31–36 | dot screen: has, modeCount, rows, cols, maxBrightness, maxSpeed          | 1, 12, 6, 6, 90, 4 |
| 37    | hasEncoder                                                               | 1                  |
| 38    | hasLcd                                                                   | 0                  |

## Config block (0x14 / 0x15)

A 64-byte block, exchanged in **two packets** (verified):

1. `len = 56, offset = 0`: bytes 0–55;
2. `len = 8, offset = 56`: bytes 56–63.

**Writing**: we write the whole block, with no commit command (verified). Always do read → modify → write back so as not to overwrite the other settings. The configurator writes zeros in the second packet; you must write back what you just read there.

**Pitfall** (verified): the keyboard acknowledges the write before applying it. A read-back started less than ~5 ms after the last packet still returns the old value; from 10 ms on, it returns the new one (`sleepL` 179 ↔ 180 over USB: stale 4/4 at 0 ms, 3/4 at 5 ms, correct 12/12 between 10 and 30 ms). The session has nothing to do with it: `0x10`, `0x11` + `0x10` or reopening the HID device only work through the time they take (a reopen followed by `0x10` still gave the old value over USB). Through the dongle, which is slower, only one read-back out of 24 attempts was stale (all delays combined). After `0x11`, reading the block returns zeros until the next `0x10`.

`fieldMap` table: position in the block.

| Pos   | Field                                                               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Status                                               |
| ----- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 0     | profile                                                             | onboard profile                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | code                                                 |
| 1     | ledOnOff                                                            | 0 = backlight on, 1 = backlight off (the dot screen stays on). The configurator always writes 0 and turns off with mode 0 instead                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | verified                                             |
| 2     | ledMode                                                             | see [modes](#lighting-modes-ledmode)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | verified (0, 4)                                      |
| 3     | ledBrightness                                                       | 0–90 (max according to `get_keyboard_info`); 10 clearly darker than 90                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | verified                                             |
| 4     | ledSpeed                                                            | **inverted**: the configurator writes `abs(speed - 6)`. In breathing (mode 3): raw 0 ≈ 1 s per cycle, raw 6 ≈ 8 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | verified                                             |
| 5     | colorful                                                            | 1 = multicolour (in mode 4: frozen rainbow), 0 = single colour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | verified                                             |
| 6     | colorIndex                                                          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | code                                                 |
| 7–9   | colorR, colorG, colorB                                              | backlight colour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | verified                                             |
| 10    | customColorIndex                                                    | effect "direction" in the configurator ("left to right" / "right to left" choice); 0 and 1 change nothing on effects 1, 7 and 8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | verified (no visible effect)                         |
| 11–19 | logo: onOff, mode, brightness, speed, colorful, colorIndex, R, G, B | this keyboard has no logo (`hasLogoLight = 0`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | code                                                 |
| 20–28 | side strip: same fields                                             | `hasSideLight = 0`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | code                                                 |
| 29–37 | dot screen ("LedTFT"): same fields                                  | see [dot screen](#dot-screen-built-in-modes)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | verified (mode, brightness, speed) / code (the rest) |
| 38    | sixN                                                                | 1 = no limit on simultaneous keys (NKRO), 0 = 6 keys max (6KRO)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | verified                                             |
| 39    | macWin                                                              | 1 = Mac mode: Alt and Win swapped, F1–F12 give the Mac functions (brightness, sound…) without Fn; 0 = Windows. The physical Win/Mac switch writes this same byte (0 ↔ 1, only byte changed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | verified                                             |
| 40    | winLock                                                             | Windows key lock: 1 = locked (Win + Space no longer opens Spotlight on macOS)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | verified                                             |
| 41    | wasd                                                                | 1 = WASD and arrows swapped, both ways                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | verified                                             |
| 42    | scanDelay                                                           | 0 = low latency mode, 2 = normal (the configurator only writes these two values). Holding Fn + H (`50 3e 00`) for 3 s toggles it between 0 and 2: H blinks red for 0, green for 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | code                                                 |
| 43    | layer                                                               | **base layer**: the one that becomes active again when Fn is released. The firmware applies it neither on write nor at startup, but on the **next Fn release**; it then stays active (Fn + key still uses the Fn layer). E.g.: `layer` = 1 then Fn released → the whole keyboard switches to layer 1. To go back: `layer` = 0 then press-release Fn                                                                                                                                                                                                                                                                                                                                                                               | verified                                             |
| 44    | fkeyChange                                                          | 1 = Tab lit white, nothing else: firmware 1.26 reads it only for this indicator (code), and F1 / F12 don't change, with or without Fn, in Windows mode as in Mac mode (verified). Function `50 3f 00` toggles it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | verified (no visible effect)                         |
| 45    | wheelMode                                                           | 0 = rotating the knob sets the volume; 1 or 2 = rotating no longer does anything visible (no volume, no scrolling, no lighting, no dot screen), pressing stays play/pause. Putting volume ± in slots 46–47 changes nothing. The firmware treats it as a knob lock: any non-zero value disables functions `47` / `48` / `49` (code). Holding function `50 40 00` for 3 s toggles it, and the four arrows blink (code)                                                                                                                                                                                                                                                                                                              | verified (partial effect)                            |
| 46–48 | sleepL/M/H                                                          | sleep delay on 24 bits, LE, in seconds (configurator choices: 60, 180, 300, 600, 1800, "never" = 65535; value read: 180). Over USB, no sleep observed with 60. On 2.4 GHz with 60, the keyboard turns off after 60 s without activity (timed). A key wakes it almost instantly. During sleep, the dongle no longer answers commands (`0x10` with no reply in 3 s), and a command does not wake the keyboard                                                                                                                                                                                                                                                                                                                       | verified (wireless)                                  |
| 49–51 | dsSleepL/M/H                                                        | **not** the dot screen: a delay in seconds (24 bits, LE, × 1000 ms) of the wireless connection's state machine (code, firmware 1.26). It arms a second timer after another one runs out, and when that second timer expires it calls a power routine of the radio stack; "deep sleep" is a guess at the name (hypothesis). The configurator never reads or writes them: they only appear in `fieldMap` and the default values. No dot screen sleep label in its translations (only brightness, colour, effect, editor). Value read: 0. On 2.4 GHz, with `dsSleepL` = 20 then 1 (`sleepL` = 180), the dot screen stays on after 60 s then 2 min without activity: no effect observed, whether the unit is the second or the minute | verified (no visible effect)                         |
| 52–57 | lcdPower, lcdMode, lcdGif, lcdGifCount, lcdLanguage, lcdUsb         | this keyboard has no LCD screen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | code                                                 |

## Lighting modes (`ledMode`)

List `Ns` in `keyboard-info.util-*.js`. Names: the configurator's English labels. Settings: what the interface offers for the effect (B = brightness, S = speed, C = colour, M = multicolour `colorful`); the firmware may accept more. All modes 0–20 have been verified on the keyboard: we note whether it reacts to typing and which settings have a visible effect ("effective", tested with Fn + W / S for C and M, Fn + E / D for S). Mode 2 ignores Fn + W / S (the config doesn't change).

| Value | Name                                                                                                                                                                                                                    | Settings                                                                                  | Status       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------ |
| 0     | all off                                                                                                                                                                                                                 |                                                                                           | verified     |
| 1     | Rainbow Flow 1: wave scrolling from left to right, rainbow with `colorful = 1`, in the chosen colour (looks like moving breathing) with `colorful = 0`                                                                  | B, S, C (M not offered, but needed for the rainbow)                                       | verified     |
| 2     | Color Breathing; reacts to typing: no                                                                                                                                                                                   | B; effective: S                                                                           | verified     |
| 3     | Monochrome Breath: breathing of the chosen colour                                                                                                                                                                       | B, S, C, M                                                                                | verified     |
| 4     | Rainbow ("normal" icon): **steady**, one colour with `colorful = 0`, frozen rainbow with `colorful = 1`                                                                                                                 | B, C, M                                                                                   | verified     |
| 5     | Single Light Up; reacts to typing: yes                                                                                                                                                                                  | B, S, C, M; effective: S, C, M                                                            | verified     |
| 6     | Colorful Vortex 1; reacts to typing: yes                                                                                                                                                                                | B, S, C, M; effective: S, C, M                                                            | verified     |
| 7     | Rainbow Flow 2: rainbow turning around the centre of the keyboard, anticlockwise                                                                                                                                        | B, S, C, M                                                                                | verified     |
| 8     | Rainbow Flow 4; reacts to typing: no                                                                                                                                                                                    | B, S, C, M; effective: S, C, M                                                            | verified     |
| 9–11  | Spectral Fluctuation 1–3; reacts to typing: no                                                                                                                                                                          | B, S, C, M; effective: S, C, M                                                            | verified     |
| 12    | Neon; reacts to typing: no                                                                                                                                                                                              | B, S; effective: S (always multicolour; C and M change the config with no visible effect) | verified     |
| 13    | Cloud Burst; reacts to typing: no                                                                                                                                                                                       | B, S, C, M; effective: S, C, M                                                            | verified     |
| 14    | Colorful Vortex 2; reacts to typing: yes                                                                                                                                                                                | B, S, C, M; effective: S, C, M                                                            | verified     |
| 15    | Colorful Ribbon Fluttering 1; reacts to typing: yes                                                                                                                                                                     | B, S, C, M; effective: S, C, M                                                            | verified     |
| 16    | Spectral Diffusion 1; reacts to typing: yes                                                                                                                                                                             | B, S, C, M; effective: S, C, M                                                            | verified     |
| 17    | Rainbow Intersection; reacts to typing: no                                                                                                                                                                              | B, S, C, M; effective: S, C, M                                                            | verified     |
| 18    | Spectral Diffusion 2; reacts to typing: yes                                                                                                                                                                             | B, S, C, M; effective: S, C, M                                                            | verified     |
| 19    | Rainbow Flow 3; reacts to typing: no                                                                                                                                                                                    | B, S, C, M; effective: S, C, M                                                            | verified     |
| 20    | Dynamic Rainbow; reacts to typing: yes                                                                                                                                                                                  | B, S, C, M; effective: S, C, M                                                            | verified     |
| 253   | custom: per-key colour, see [per-key colours](#per-key-colours)                                                                                                                                                         | B, C                                                                                      | verified     |
| 254   | Music Rhythm: lighting synced to music, foreground and background colours. `0x2E` / `0x2F` stream sent by the ATK desktop application, not by the site; we assume it works like the dot screen stream. **Undetermined** | C                                                                                         | undetermined |

### Effect tables (code, firmware 1.26)

The effects read constant tables of the firmware. They sit right after the colour picker palette, past the end of what `0x32` returns, so they can only be read from the firmware image.

**Hue wheel** (`0x0204bb1e`, 256 RGB triplets, 768 bytes). Fully saturated: one channel is always 255. Red (0) → yellow (81) → green (112) → cyan (143) → blue (174) → magenta (224) → back to red; the steps are uneven (red → yellow takes 81 entries, the others 31 to 50). An 8-bit counter indexes it, so it wraps on its own. Modes 1, 2, 3, 4, 7, 8, 9, 10, 12, 16, 17 and 19 read it directly (in multicolour, or always for 2 and 12), then scale the colour by `brightness`/256.

**Level wave** (`0x0204ca7e`, 128 bytes). A triangle: 0, 4, 8 … 252, 255, 255, 252 … 4, 0. Used in single-colour mode (`colorful` = 0) by modes 1, 3, 7, 8, 9, 10 and 19: the chosen colour `colorR/G/B` is multiplied by the level/256, then by `brightness`/256. That is the breathing and the moving waves of the single-colour effects.

**Rings around R and P** (`0x0204b9e6`, 6 rows × 28 bytes, LED numbers, `ff` = none). Mode 19 (Rainbow Flow 3) is the only user. Each row is a ring of LEDs at the same distance from two centres, the R and P keys; 28 is room for the largest ring (25 LEDs). The 6 rings, keys named as on QWERTY:

| Ring | Keys                                                                                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | R, P                                                                                                                                    |
| 1    | 4, 5, E, T, D, F, 0, `-`, O, `[`, L, `;`                                                                                                |
| 2    | F4, F5, 3, 6, W, Y, S, G, X, C, V, F10, F11, 9, `=`, I, `]`, K, `'`, `,`, `.`, `/`                                                      |
| 3    | F3, F6, 2, 7, Q, U, A, H, Z, B, Left Alt, F9, F12, Print Screen, 8, Backspace, `\`, J, Enter, M, Right Shift, Right Alt, Fn, Right Ctrl |
| 4    | F2, F7, F8, 1, 7, 8, Tab, I, Caps Lock, H, J, Left Shift, N, Win, Space, Insert, Home, End, Page Up, Up, ←                              |
| 5    | Esc, F1, F7, `²`, Left Ctrl, B, Delete, Page Down, ↓, →                                                                                 |

The 84 LEDs are all covered; 8 keys between the two centres (F7, 7, 8, U, I, H, J, B) are listed in two rings (U twice in ring 3), and the later ring wins. Every 4 ticks of the speed timer (`ledSpeed` + 1 timer periods per tick), the effect advances a step counter and paints each ring in one colour:

- `colorful` = 1: hue wheel entry `counter + 26 × ring` (8-bit, wraps), scaled by `brightness`;
- `colorful` = 0: `colorR/G/B` × level wave entry `counter + 6 × ring` (counter 0–127; a ring index past 126 restarts at 0 rather than wrapping).

The colour at ring `r` reaches ring `r − 1` 26 steps later (6 in single colour), so the rings move **inwards**, towards R and P (verified, in both `colorful` values; nothing visible where the rings overlap). In single colour, each ring lights up in visible steps and fades out smoothly (verified).

## Dot screen: built-in modes

Set through the config block, positions 29–37 (the configurator's `setDotLight` / `getDotLight`). The configurator forces `LedTFTOnOff = 0` and `LedTFTColorful = 0`, and inverts the speed as for the backlight: `LedTFTSpeed = abs(6 - speed)` (code). Verified: `LedTFTBrightness` 5 / 30 / 90 clearly changes the brightness; raw `LedTFTSpeed` 6 clearly slows the animation compared with 2 (so low raw value = fast). Colour verified: in mode 0 ("star"), `00ff00` makes the stars green instead of the original red (`ff0000`). Original values read: mode 8, brightness 30, raw speed 2, colour `ff0000`.

Writing `LedTFTMode` does change the animation (verified: 8 → 12, the screen left the fireworks; that it is precisely "YOGO" was not visually confirmed). List `Os` in `keyboard-info.util-*.js` (code, except 8 and 12):

| Value                           | Name                                                |
| ------------------------------- | --------------------------------------------------- |
| −1, written `0xFF` (`setUint8`) | all off (verified)                                  |
| 0                               | star                                                |
| 1                               | ghost                                               |
| 2                               | scan                                                |
| 3                               | radiantRadiance                                     |
| 4                               | raindrops                                           |
| 5                               | terminal                                            |
| 6                               | custom: shows the image stored by `0x3B` (verified) |
| 7                               | typing                                              |
| 8                               | nightFireworks (no colour setting)                  |
| 9                               | heartbeatMusicNumber                                |
| 10                              | todayMood                                           |
| 11                              | dataShuttle                                         |
| 12                              | YOGO                                                |

## Dot screen: image

Two separate mechanisms in the configurator (code):

**Still image, `0x3B`** (`setDotScreenAnimation`, packet class `aW`; verified for the format, the pixel order and the display in mode 6). An image = 6 × 6 pixels in **RGB888**, row by row, left to right (`frames[0][row][column] = [R, G, B]`: the predefined images are described line by line), i.e. 108 bytes. Sent in two packets: offset 0 then offset 56, with the length byte **always 56** (the second packet only carries 52 useful bytes, the rest zero). Only the first image of an animation is sent. The configurator then switches the screen to **mode 6** (`custom`): so this mode shows the stored image. **No read command**: the image in place cannot be backed up before overwriting it.

ATK's Electron app (not the site) animates the screen by sending `0x3B` in a loop, in 24-byte packets (offsets 0, 24, …; function `r8e`): so the same command also serves for live display (code).

**Music visualizer, `0x3C` / `0x3D`** (`startSyncDotScreen`, `endSyncDotScreen`, classes `X_` / `nW`). A 6 × 6 image in **RGB565, LE**, 72 bytes, in two packets (`len 56` at offset 0, `len 16` at offset 56), sent with each audio frame. There is no separate start command: `0x3C` carries the pixels directly. Verified: a single frame shows for a fraction of a second (correct pixel order, correct colours), then the screen stays black; `0x3C` does not change the config. So frames must be sent continuously: the same frame sent every ~50 ms for 60 s stayed displayed without interruption (verified). When the stream stops, the screen stays black and does not go back to the mode's animation on its own: it needs `0x3D` then writing the mode again (verified).

`0x3D` stops the stream and **resets `LedTFTMode` to 0** (verified: 8 → 0, the screen restarts on the "star" animation). Hence the configurator's behaviour, which writes the config block again right after (`setDotLight`).

## Keymap

### Reading

Status: verified. For each layer, 6 packets of 56 bytes (`len = 56`, offset 0, 56, 112… 280), i.e. 336 bytes = 112 slots of 3 bytes. Only the first 96 are used (6 rows × 16 columns); the last 16 are zero.

### Writing

Status: verified for layer 0 (`0x1B`) and the Fn layer (`0x1D`). Same split as reading: 6 packets `len = 56`, offset 0 to 280, data at byte 8. The configurator **always writes the whole layer**, even to change a single key. So we do read → modify → write back. The keyboard answers `0x55` to each packet and reading back in a new session shows the new value.

Partial writes (verified, cable and dongle): the handler copies `len` bytes at any `offset`, with no alignment rule and no reset of the layer (code, firmware 1.26). Writing 3 bytes at `index × 3` changes that key only: the other 111 slots, the other layers, the config, the colours and the macros read back unchanged, the key types its new code, and the change survives a power cycle. **There is no bound check** (only `len ≤ 56`): an offset past the layer writes into the next layer's buffer (384 bytes apart), and past layer 3 into other RAM, the macro buffer among them. Reads are unbounded too. A tool must enforce `offset + len ≤ 336` itself.

### Persistence

Status: code (firmware 1.26), verified for the keymap and the per-key colours. A power cycle (switch to cable mode with no cable plugged, then back) loses RAM: only what was saved survives. Every write is live in RAM at once; there is no save or discard command, so an undo can only rewrite older data. Each accepted write arms a save and restarts its countdown: about 100 ticks later (probably 10 ms each, so about 1 s; hypothesis), the firmware writes to flash, postponed while it reports busy. A whole layer written in 6 packets thus ends up as one save.

- Keymap (`0x0206c000`, layers 0–3), per-key colours (`0x02070000`) and the config block (`0x0206b000`, 64-byte records) are append-only logs in 4 KB pages: each save appends a record, and the page is erased only when full (one erase every 10 keymap saves).
- Macros erase and rewrite their page (`0x02075000`) on every save.
- At boot, the firmware scans each page in record steps and loads the last record before the first free one; a record counts as free when 32 bytes of `0xFF` in a row come before 32 non-`0xFF` bytes (code). Hypotheses, not tested: a record holding 32 `0xFF` in a row (about 11 white keys on consecutive LEDs) would read as free, so the previous record would load after a reboot; with all 10 records used, the 9th would load instead of the 10th.

### Layers

| Layer | Role                                                                                                                                                                                         | Status   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 0     | default base layer (`layer` = 0 in the config block)                                                                                                                                         | verified |
| 1     | Fn layer (the configurator reads it with `0x1C`)                                                                                                                                             | verified |
| 2, 3  | identical to factory layer 0; the configurator doesn't use them. Reachable with a key `50 03 00` / `50 04 00` (while it is held) or as the base layer via `layer`. Mac mode doesn't use them | verified |

The four layers are generic (code, firmware 1.26): four RAM buffers of 384 bytes handled by the same lookup, with no dedicated purpose (no profile, no second Fn; Mac mode only rewrites a few F-row codes on the fly). Why the hub shows only two is unknown (hypothesis: a product profile on the hub side).

Layer resolution (code, firmware 1.26):

- `50 01`–`50 04` are momentary layers 0–3. Each press counts as held; on release, the highest layer still held wins (3 > 2 > 1 > 0), else the base layer (`layer`, config byte 43).
- The layer is latched per key on press: the release is read from the same layer, even if the active layer changed in between.
- `50 05`–`50 08` set the base layer to 0–3 permanently (saved like a config change) and clear the held layers.

### Key position

`index = row × 16 + column` (verified: the remaps made by the user land at the expected indices). The physical layout is **QWERTY ANSI** (verified, confirmed by the user): the ISO slots 60 (`#`) and 65 (`<`) have a code in the keymap but no key and no LED; 84 LEDs, i.e. a 75 % ANSI. Factory layout of layer 0 (verified by reading the codes; the names are those of a QWERTY keyboard, see the glossary):

| Row | Index | Keys                                                                                                                                                                                                                                                                                                                                                         |
| --- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0   | 0–15  | Esc, F1…F12, Print Screen, Insert, Delete                                                                                                                                                                                                                                                                                                                    |
| 1   | 16–31 | `²`, 1…0, `-`, `=`, Backspace, Home, End                                                                                                                                                                                                                                                                                                                     |
| 2   | 32–47 | Tab, Q…P, `[`, `]`, `\`, then 46–47: the two buttons on the right of the keyboard, under the knob: "show desktop" and "lock session" (paper guide: buttons 3 and 4, customizable), factory `30 cb 01` and `30 cf 00`; on this keyboard `10 00 56` (top button) and `10 00 46` (bottom button), confirmed by the user. It is not the knob rotation (verified) |
| 3   | 48–63 | Caps Lock, A…L, `;`, `'`, (60: ISO `#`, absent), Enter, Page Up, Page Down                                                                                                                                                                                                                                                                                   |
| 4   | 64–79 | Left Shift, (65: ISO `<`, absent), Z…M, `,`, `.`, `/`, (empty), Right Shift, Up arrow, (empty)                                                                                                                                                                                                                                                               |
| 5   | 80–95 | Left Ctrl, Win, Alt, (empty ×2), Space, (empty ×3), Right Alt, Fn, (empty), Right Ctrl, ←, ↓, →                                                                                                                                                                                                                                                              |

### Key encoding (3 bytes)

| Type (byte 0)                           | Bytes 1–2                                                                                                                                      | Example                                                      | Status                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| `0x10`: keyboard key                    | byte 1 = modifiers, byte 2 = HID code                                                                                                          | `10 00 04` = A; `10 01 00` = Left Ctrl; `10 08 2b` = Win+Tab | verified                                           |
| `0x30`: multimedia key (HID _consumer_) | 16-bit consumer code, LE                                                                                                                       | `30 cd 00` = play/pause; `30 e9 00` = volume +               | verified (standard codes recognized)               |
| `0x50`: keyboard function               | byte 1 = function number                                                                                                                       | `50 02 00` = Fn key                                          | code                                               |
| `0x40`: system and mouse                | `40 01 00` power off, `40 02 00` sleep, `40 04 00` wake; `40 00 xx` = mouse click: `01` left, `02` right, `04` middle, `08` back, `10` forward | `40 00 01` / `40 00 02` = left / right click                 | verified (left and right clicks) / code (the rest) |
| `00 00 00`                              | no action                                                                                                                                      |                                                              | code                                               |
| `10 00 00`                              | no key: what the factory keymap holds in its empty slots (the ISO-free and unused matrix positions)                                            |                                                              | verified (read with `0x16` / `0x17`)               |

Modifiers (byte 1 of type `0x10`): `01` L Ctrl, `02` L Shift, `04` L Alt, `08` L Win, `10` R Ctrl, `20` R Shift, `40` R Alt, `80` R Win.

Known `0x50` functions (labels from `keyboard-info.util-*.js` and `keymap-*.js`):

| Code                   | Function                                                                                                                                     | Code        | Function                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------- |
| `02`                   | Fn (layer 1, while the key is held); several keys can carry this code (verified: Caps Lock → `50 02 00` acts as Fn, the original Fn key too) | `2b`        | dot screen: next effect                                                |
| `03`                   | layer 2 while the key is held (verified; absent from the configurator)                                                                       | `04`        | layer 3 while the key is held (verified; absent from the configurator) |
| `01`                   | layer 0 while the key is held (code)                                                                                                         | `05`–`08`   | set the base layer to 0–3, saved (code), see [layers](#layers)         |
| `09`                   | lighting on/off                                                                                                                              | `2d`        | dot screen: next colour                                                |
| `0a` / `0b`            | lighting mode + / − (verified for `0b`: 0 → 20, it wraps)                                                                                    | `2f` / `30` | dot screen: brightness + / −                                           |
| `0c` / `0d`            | next / previous colour in the palette (verified)                                                                                             | `39`        | show battery level                                                     |
| `0e` / `0f`            | brightness + / − (verified: 15 per press, 90 ↔ 75)                                                                                           | `47` / `48` | rotate left / right (knob)                                             |
| `10` / `11`            | effect speed + / − (verified: raw `ledSpeed` −1 / +1 per press, 0 = fastest)                                                                 |             |                                                                        |
| `12`                   | colour picker (verified), see [per-key colours](#per-key-colours)                                                                            |             |                                                                        |
| `19`, `1b`, `1d`, `1e` | side strip: effect, colour, brightness + / −                                                                                                 |             |                                                                        |

Configurator special keys ("Touche supplémentaire" / extra key tab, arrays `Xi`, `Io`, `Et`, `Go`/`Vo`, `ji`, `Hi` of `keyboard-info.util-*.js`; code, icons confirmed by screenshot):

| Category  | Codes                                                                                                                                                                                                                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Media     | volume − `30 ea 00`, + `30 e9 00`, mute `30 e2 00`, play/pause `30 cd 00`, stop `30 b7 00` (hidden), previous `30 b6 00`, next `30 b5 00`                                                                                                                                                                                         |
| Windows   | mail `30 8a 01`, calculator `30 92 01`, media player `30 83 01`, my computer `30 94 01`, search `30 21 02`, browser: home `30 23 02`, back `30 24 02`, forward `30 25 02`, refresh `30 27 02`, favourites `30 2a 02`, stop `30 26 02` (hidden); zoom + / − = Ctrl+`=` / Ctrl+`-`; screen brightness − / + `30 70 00` / `30 6f 00` |
| macOS     | Mission Control = Ctrl+Space, Launchpad = Ctrl+↓, Siri = Ctrl+Num Lock, Spotlight = Win+Space                                                                                                                                                                                                                                     |
| Office    | Ctrl shortcuts: Z undo, S save, A select all, C copy, X cut, V paste, O open, N new, F find; Ctrl+Shift+C capture and translate                                                                                                                                                                                                   |
| Extension | desktop = Win+D (`10 08 07`, alias `30 cb 01`); Mac desktop = F4 (`10 00 3d`); lock = Win+L (`10 08 0f`, alias `30 cf 00`)                                                                                                                                                                                                        |
| Mouse     | see type `0x40`                                                                                                                                                                                                                                                                                                                   |

**Translation by position** (code, firmware 1.26): before sending a key, the firmware replaces some codes, but only at their factory position (key index). Bound elsewhere, the same code is sent as is.

| Index          | Code on the key       | Windows (`macWin` = 0) | Mac (`macWin` = 1)                                                                                                                                                                           |
| -------------- | --------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 46             | `30 cb 01`            | Win+D (`10 08 07`)     | F11 (`10 00 44`)                                                                                                                                                                             |
| 47             | `30 cf 00`            | Win+L (`10 08 0f`)     | Ctrl+Cmd+Q (`10 09 14`)                                                                                                                                                                      |
| 1–12 (F1–F12)  | `10 00 3a`…`10 00 45` | unchanged              | F1 / F2 screen brightness − / + (`30 70 00` / `30 6f 00`), F3 `30 9f 02`, F4 Cmd+F (`10 08 09`), F5 `30 cf 00`, F6 system code `9b` (Do Not Disturb), F7–F12 media like the factory Fn layer |
| 1–12, Fn layer | the factory Fn codes  | unchanged              | back to F1–F12 (Win+Tab on F3 → F3, Win+H on F5 → F5, …)                                                                                                                                     |

So slots 46–47 are the desktop and lock keys of the configurator's "Extension" category, and the firmware adapts them to the OS. F6 is skipped while an internal flag is set.

So the configurator draws F4 of layer 0 with the "desktop" icon: it really is F4 that is sent (verified by reading). It shows "NO" for any `0x50` function it doesn't know (Fn + Esc, 1…4, `-`, `=`, Backspace, H, Win), and only shows the key, without the modifier (Win+Tab is shown as "TAB", Win+H as "H").

`34`, `35`, `36` (Fn + 1, 2, 3 of the factory Fn layer): Bluetooth devices 1, 2, 3 (verified in Bluetooth mode). A short press switches to the device already paired on that channel; a press of a few seconds starts pairing. `37` (Fn + 4): no effect observed, absent from the paper guide. Wired, it is not the Win/Mac toggle (verified: `macWin` unchanged and F1 without Fn doesn't set the brightness). On 2.4 GHz, a short press does nothing visible and doesn't put the keyboard to sleep (it still answers through the dongle). Holding it for 3 s on 2.4 GHz calls a radio routine (code), probably dongle pairing (hypothesis).

`33` and `41` (Fn + Backspace, Fn + Esc): the two halves of the factory reset. Holding both for 3 s resets the keyboard (code). The paper guide says "Fn + Esc + Backspace, hold 5 s: back to factory settings". **Do not test** without the user's approval: it would erase the config.

**Long-press functions** (code, firmware 1.26): some functions act only once held for 3 s (300 ticks of 10 ms; each press restarts the count). Each one toggles a config field and flashes its keys as an indicator:

| Function         | Held 3 s                                                       |
| ---------------- | -------------------------------------------------------------- |
| `33` + `41`      | factory reset                                                  |
| `34`, `35`, `36` | Bluetooth pairing on channel 1, 2, 3 (Bluetooth mode)          |
| `37`             | radio routine on 2.4 GHz, probably dongle pairing (hypothesis) |
| `3a`, `3b`       | toggles `macWin`                                               |
| `3d`             | toggles `wasd`                                                 |
| `3e`             | toggles `scanDelay` 0 ↔ 2 (verified)                           |
| `40`             | toggles `wheelMode` 0 ↔ 1                                      |

`3a`, `3b`, `3d`, `3f` and `40` are in no factory layer: you only get them by binding them to a key. `3f` acts on a short press: on release, it toggles `fkeyChange` (code).

Tested on the keyboard by putting the factory codes back in the Fn layer (verified):

- `3c` (Fn + Win): Win key lock, toggle. The Win LED lights up red and the `winLock` byte of the config block goes to 1, then back to 0.
- `31` (Fn + `=`) / `32` (Fn + `-`): dot screen speed + / −. `LedTFTSpeed` (raw value, 0 = fastest) goes down to 0 with `31` and up one step per press with `32` (0 → 3 read back). The range is 0–4: Caps Lock and Win blink three times when `31` reaches 0 (pressed at 1 or 0) or `32` reaches 4 (code, firmware 1.26). It is the firmware's generic signal, also used by the WASD toggle.
- `3e` (Fn + H): low latency toggle. A short press does nothing. Held for 3 s or more, it switches `scanDelay` between 2 and 0, and H blinks red (0, low latency) or green (2, normal) (verified, held 5 s).

### Factory Fn layer

Read with `0x17` (verified for the codes; the functions come from the tables above):

- F1 / F2: screen brightness − / + (`30 70 00`, `30 6f 00`); F3: Win+Tab; F4: search (`30 21 02`); F5: Win+H; F7 / F8 / F9: previous / play-pause / next; F10: mute; F11 / F12: volume − / +.
- Insert: lighting on/off. Q / A: mode − / +; W / S: hue − / +; E / D: speed + / −; R / F: brightness + / −. The paper guide states the opposite (Q / W / E = **+**, A / S / D = **−**); the keyboard proves the configurator right for Q: from mode 0, Fn + Q goes to mode 20 (verified). W / S, E / D, R / F verified in the configurator's direction (reading the config block after each press). W / S palette (verified): 0 = custom colour, 1 = red `ff 00 00`, 2 = yellow, 3 = blue, 4 = pink `ff 25 9b`, 5 = rainbow (`colorful` = 1; `colorR/G/B` read back as `00 81 ff`, not displayed), and the palette wraps: W from 0 gives the rainbow. The keys rewrite `colorIndex`, `colorful` and `colorR/G/B`. The guide doesn't mention R / F.
- Paper guide, other points consistent with the keymap: F3 "multitasking window" (Win+Tab), F5 "dictation" (Win+H), F6 = F6 on Windows and "Focus mode" on Mac. Knob: rotation = volume, click = mute.
- Right Shift: battery. ← / →: dot screen colour / effect; ↑ / ↓: dot screen brightness.

## Macros

Read `0x2C`, write `0x2D` (`getMacro`, `setMacro`, classes `tW` / `vI`). `get_keyboard_info` announces 4 macros.

**Configurator limits** (code): for the Yogo 75 PRO, none. Its macro composable (`nw`) sets `maxMacroCount` and `maxActionsCount` to infinity for this API family (`Mi` / `Ui`), and `setMacro` imposes no size on the block: it simply splits it into packets. Only `macroSize` = 4 from `get_keyboard_info` gives a number.

**Size of the area: 1024 bytes** (code, firmware 1.26). The macros live in a 1024-byte RAM buffer, saved to flash at `0x02075000`:

- **Write** (`0x2D`): copies the data only if `offset + len ≤ 1024`. Otherwise it drops the whole packet silently, even its bytes below 1024, and still replies `0x55` (verified: 4 bytes at 1020 are written, 8 bytes at 1020 leave 1020–1023 unchanged). Each accepted write arms a save: about 100 ticks later, the firmware erases the flash page and writes the 1024 bytes back.
- **Read** (`0x2C`): no bound. It copies from the buffer at any offset, so it goes on into the RAM after it (verified: reading 4480 bytes gives no error, and byte 1024 changes on every read, rising by about 74–75 each time, like a counter).
- **Boot**: the firmware reads the first 16 bytes from flash and loads all 1024 only if they start with `aa 55`. Otherwise the buffer stays empty.

The firmware sets no limit on the number of macros: a key's macro number indexes the offset table directly.

**The configurator doesn't read the macros back from the keyboard**: it keeps the list on its side (local storage / account) and only writes it. Its `getMacro` only reads one packet at offset 0 and does nothing with it. With no macro, the area reads as 16 `ff` bytes then zeros (verified, 8 packets with `0x2C`).

**What the configurator writes** (code, `Ui.setMacro` and the macro composable):

- Macros come from its recorder: every press and every release is a separate action with a delay in ms (capped at 65535; minimum delay 0 for this keyboard). The recorder stores the time until the next event on the action **before** it, as if the delay came after the action. The keyboard waits it before the action (see below), so a recorded macro plays each gap one action late (verified): a pause recorded between two taps lands on the first key's release, which then stays pressed that long (auto-repeat), and the next key follows with no pause. The first recorded action carries the gap to the second one, and the last action has delay 0. Modifiers are their own actions (type 2, mask as code), one per modifier.
- Its editor can also build a macro by hand. A macro made that way reads back as presses only, with no release (verified). Such a macro leaves keys stuck: the keyboard doesn't release a press by itself, and the last key pressed auto-repeats until the keyboard is unplugged (verified).
- Deleting a macro removes it from the list, so the following macros move down one number. For this keyboard, keys bound to those macros are **not** renumbered (its renumbering routine skips this API family): a key bound to macro 2 then runs the former macro 3.
- An empty list is never written (`setMacro` returns early): deleting the last macro leaves it on the keyboard.

### Block format (verified)

The configurator writes the whole list at once, in 56-byte packets (offset 0, 56…), with the length byte always 56.

| Bytes | Content                                                                      |
| ----- | ---------------------------------------------------------------------------- |
| 0–1   | `aa 55`                                                                      |
| 2–3   | total length of the block, LE                                                |
| 4–5   | number of macros, LE                                                         |
| 6–7   | 0                                                                            |
| 8…    | table: for each macro, its offset from the start of the block (LE 16 bits)   |
| then  | each macro: number of actions (LE 16 bits), `00 00`, then 4 bytes per action |

An action: `delay (LE 16 bits)`, `code`, `type | press << 7`. **Bit 7 = 1 for a press, 0 for a release** (verified the hard way: the configurator computes `keyStatus ? 0 : 1` with `KeyDown = 0`, `KeyUp = 1`). With the bit inverted, the macro "hi" typed `h` then left `i` pressed, and the physical I key no longer responded until the keyboard was unplugged and replugged (stuck state in RAM). Settings survive unplugging: config, keymap and dot screen intact (verified).

| Type | Action                              | Code                                                                           |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------ |
| 1    | keyboard key                        | HID code                                                                       |
| 2    | modifier                            | mask, as in the keymap (`01` L Ctrl… `80` R Win); verified with L Shift (`02`) |
| 3    | mouse buttons (code, firmware 1.26) | button mask; bit 7 = press / release                                           |
| 4    | mouse X (code)                      | distance; bit 7 set = −code (left), clear = +code (right)                      |
| 5    | mouse Y (code)                      | distance; bit 7 set = −code (up), clear = +code (down)                         |
| 6    | horizontal wheel (code)             | distance; bit 7 set = −code, clear = +code                                     |
| 7    | wheel (code)                        | distance; bit 7 set = +code, clear = −code                                     |

Types 3–7 all clear the whole mouse report (buttons included) before applying the action, so a move releases a held button (code). The configurator's interface offers three other types (4, 5, 6) and writes them as 3, 5, 7. The direction labels follow the HID convention and are untested.

Example (verified): two macros, #0 empty (the no-op below), #1 tapping X with 20 ms delays. 36 bytes:

```
offset  bytes         field
──────  ────────────  ─────────────────────────────────────────────
                      header
  0     aa 55         magic
  2     24 00         total length = 36
  4     02 00         2 macros
  6     00 00
                      offset table, one entry per macro
  8     0c 00         macro #0 at 12 ──┐
 10     18 00         macro #1 at 24 ──┼──┐
                                       │  │
 12     02 00 00 00   #0: 2 actions ◄──┘  │
 16     00 00 00 82     delay 0, mask 00, type 2 | press
 20     00 00 00 02     delay 0, mask 00, type 2 (release)
                                          │
 24     02 00 00 00   #1: 2 actions ◄─────┘
 28     14 00 1b 81     delay 20, X (1b), type 1 | press
 32     14 00 1b 01     delay 20, X (1b), type 1 (release)
 36                   end = total length
```

Macros sit back to back: each one's offset is the previous one's offset + 4 + 4 × its action count. Changing one macro's length moves every macro after it, so the whole block is rebuilt and rewritten.

A macro with 0 actions does not stop there. In the same block with #0 reduced to `00 00 00 00` (offsets 12 and 16, total 28), a key bound to macro #0 types `x`:

```
 12     00 00 00 00   #0: 0 actions ◄── key bound to MACRO(0) starts here
 16     02 00 00 00   #1: 2 actions      ┆ runs on
 20     14 00 1b 81     press X          ┆
 24     14 00 1b 01     release X        ▼ types "x"
```

Only the result (`x` typed) is verified. The cause is in the firmware's player (code, firmware 1.26): after each action, it ends the run only if `count != 0` and `--count == 0`. A count of 0 never reaches the end, so the player keeps reading 4-byte actions: it runs into the next macros, then the zeros (type 0, ignored), then past offset 1024 into RAM, until something else stops the playback. Never write a 0-action macro: it can play whatever the RAM holds as keys.

**The player** (code): to start macro `n`, it takes offset `table[n]`, reads the count there and starts at offset + 4. An action runs when its delay is below 2 or when the player's tick counter has reached the delay. Then the counter goes back to 0.

**Empty macro** (verified): a macro made of one modifier press and release with mask `00` (`00 00 00 82`, `00 00 00 02`) does nothing, leaves no modifier held, and the next macro still works: it is the way to empty a slot without renumbering the others.

The delay is in **milliseconds** and the keyboard waits it **before** running the action (verified). A long delay on a key's release keeps that key pressed for that long, so it auto-repeats: the wait comes between the press and the release. The first action's delay is a wait before the macro starts. Reading back with `0x2C` returns exactly the block written (verified).

### Binding a key to a macro (verified)

In the keymap, with this keyboard's controller (`Ui`):

- `60 <macro number> <mode>` for modes 0 to 3;
- `61 <macro number> <number of runs>` for mode 4 (verified: `61 01 03` runs macro 1 three times per press).

| Mode | Behaviour (configurator labels)                          |
| ---- | -------------------------------------------------------- |
| 0    | a single run                                             |
| 1    | loop until release, finishing the round                  |
| 2    | hold to repeat, press again to finish the round and stop |
| 3    | hold to repeat, release to stop                          |
| 4    | run N times (N from 1 to 249 in the interface)           |

## Per-key colours

Used when `ledMode = 253` ("custom").

**Key → LED table** (`0x32`, 384 bytes, read in 56-byte packets; verified). The first 96 bytes give, for each key index, its LED number; `ff` = no LED. 84 LEDs, numbered 0 to 83. Keys without an LED: 46–47 (codes hidden by the configurator; not the knob rotation, verified), 60 and 65 (absent ISO keys) and the empty slots. `0x32` returns a constant area of the firmware (address `0x0204b816`), which holds several tables back to back (code, firmware 1.26):

| Bytes   | Content                                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 0–95    | key → LED, above                                                                                                             |
| 96–127  | `ff`                                                                                                                         |
| 128–163 | the 36 dot screen pixels → LED 84–119 (`54`…`77`). Live frames (`0x3C`) go through it: the dot screen pixels are LEDs 84–119 |
| 164–175 | hardware pin numbers, used at startup                                                                                        |
| 176–383 | the colour picker's palette (function `50 12 00`), cut off: one RGB triplet per physical position, see below                 |

**Colour picker** (function `50 12 00`; firmware 1.26). While it is open, every key lights in its palette colour; the next key pressed becomes the backlight colour (`colorful` = 0, `colorR/G/B` = its triplet, read back as is from the config block) and the picker closes. Space (LED 77) cycles through the hue wheel and picks the rainbow (`colorful` = 1, `colorR/G/B` unchanged). The function is ignored in modes 0, 2, 12, 253 and 254 (verified: no palette, the next key types normally, the config block and the per-key colours are unchanged), and no key carries it in the keymap read from this keyboard (4 layers). The palette holds one RGB triplet (values 0–90) per physical position, at `3 × (column × 6 + row)`, on the 16 × 6 grid of the position → LED table at `0x0204babe`: 96 triplets, 288 bytes, so `0x32` stops in the middle of the 70th.

**Colour matrix** (`0x22` read / `0x23` write; 6 packets of 56 bytes, offset 0 to 280). One RGB triplet per LED number: the colour of key `i` is at byte `3 × led[i]`. As for the keymap, the configurator always writes the whole matrix. Like the keymap, the write handler accepts any offset with no bound check (code). It arms the save to flash only when a packet ends at or past byte 384 (code, firmware 1.26; verified). A write of the 336 bytes, over the cable (6 × 56) or the dongle (14 × 24), is applied but **never saved**: it is lost at the next power cycle, while a config change made in the same session survives. The hub's wired write has the same flaw; its wireless write (16 × 24 = 384 bytes) does not. Fix (verified over the dongle): end the write with a packet that reaches byte 384, e.g. bytes 360–383 written back with their current values (zeros on this keyboard); the colours then survive a power cycle. The RAM buffer and each flash record are 384 bytes; the only other save of the colours is leaving the on-keyboard colour editing in mode 253 (code; probably the colour picker key, not checked). The config save does not include them.

Verified: with W, A, S, D and the four arrows white and all other LEDs off, cross-referencing keymap ↔ LED table lands exactly on these keys.

## Full backup

Everything the protocol can read back fits in four resources (verified over USB and through the dongle):

| Resource           | Read / write                                                    | Size                                                                |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| config block       | `0x14` / `0x15`                                                 | 64 bytes                                                            |
| keymap, layers 0–3 | `0x1A`, `0x1C`, `0x1E`, `0x20` / `0x1B`, `0x1D`, `0x1F`, `0x21` | 336 bytes per layer                                                 |
| per-key colours    | `0x22` / `0x23`                                                 | 336 bytes                                                           |
| macro area         | `0x2C` / `0x2D`                                                 | total length from its header (bytes 2–3); with no header, 224 bytes |

Writing these four resources back as is, then reading them in a new session, gives back exactly the saved state: changing `sleepL`, then writing everything back, restores the original value. The dot screen's still image (`0x3B`) has no read command: it cannot be backed up.
