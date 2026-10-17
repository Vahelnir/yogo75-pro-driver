// Command bytes (packet [1]), named after the hub's functions.
export const CMD_START = 0x10;
export const CMD_KB_INFO = 0x12;
export const CMD_KB_FUNCTION = 0x14;
export const CMD_WRITE_KB_FUNCTION = 0x15;
// get_current_key_matrix for layers 0..3 (layer 1 is the Fn layer in the hub).
export const CMD_GET_KEYMAP = [0x1a, 0x1c, 0x1e, 0x20];
export const CMD_GET_DEFAULT_KEYMAP = [0x16, 0x17, 0x18, 0x19];
export const CMD_SET_KEYMAP = [0x1b, 0x1d, 0x1f, 0x21];
export const CMD_GET_CUSTOM_LEDS = 0x22; // RGB triplets indexed by LED number, 6 × 56 bytes
export const CMD_SET_CUSTOM_LEDS = 0x23;
export const CMD_GET_MACRO = 0x2c; // area built by `joinMacros`
export const CMD_SET_MACRO = 0x2d;
export const CMD_POWER_INFO = 0x30; // battery: data[0] = level, data[1] = 1 while the cable is plugged in (even at 100%)
export const CMD_GET_LED_MATRIX = 0x32; // first 96 bytes: key index -> LED number (0xff = no LED)
export const CMD_SET_DOT_IMAGE = 0x3b; // set_dotscreen_matrix: 6×6 RGB888 image shown by dot screen mode 6
export const CMD_SYNC_DOT = 0x3c; // start_sync_dot: one live music-visualiser frame
export const CMD_END_SYNC_DOT = 0x3d;

/** Keymap and custom colours: 3 bytes per key, 6 × 56 bytes over USB (14 × 24 wireless). */
export const MATRIX_BYTES = 336;
/** Macro area read when it has no header yet (no macro written): what backups held before the header was read. */
export const MACROS_BYTES = 224;
/** LED matrix read by the hub; only the first 96 bytes (one per key) are used. */
export const LED_MATRIX_BYTES = 384;

const CMD_FACTORY_RESET = 0x31;
const CMD_FLASH_FIRST = 0xa0;
const CMD_FLASH_LAST = 0xc0;

/** Factory reset and firmware flashing: documented, never used, and only sent on purpose. */
export function isDangerous(cmd: number): boolean {
  return (
    cmd === CMD_FACTORY_RESET ||
    (cmd >= CMD_FLASH_FIRST && cmd <= CMD_FLASH_LAST)
  );
}
