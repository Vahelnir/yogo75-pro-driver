/** Write command of each resource, to tell which ones a change sent. */
const WRITE_CMDS: Record<string, number> = {
  config: 0x15,
  keymap0: 0x1b,
  keymap1: 0x1d,
  keymap2: 0x1f,
  keymap3: 0x21,
  leds: 0x23,
  macros: 0x2d,
};

/** The resources that the `written` packets wrote, by their `stateDiff` name. */
export function resourcesSent(written: Uint8Array[]): string[] {
  return Object.entries(WRITE_CMDS)
    .filter(([, cmd]) => written.some((p) => p[1] === cmd))
    .map(([resource]) => resource);
}
