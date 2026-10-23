/** USB ids of the keyboard's configuration interface, and the report size and timeout of each link. */

export const VENDOR_ID = 0x373b;
export const PID_CABLE = 0x119b;
export const PID_DONGLE = 0x11ff;
/** The vendor interface the hub talks to. */
export const USAGE_PAGE = 0xff60;

export interface Link {
  reportSize: number;
  /** How long the transport waits for a reply before giving up. */
  timeoutMs: number;
}

/** The hub's 500 ms timeout, which its applyWirelessTransport() raises to 3 s for the dongle. */
export const LINKS: Record<number, Link> = {
  [PID_CABLE]: { reportSize: 64, timeoutMs: 500 },
  [PID_DONGLE]: { reportSize: 32, timeoutMs: 3000 },
};
