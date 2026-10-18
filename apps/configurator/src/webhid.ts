import type { Transport } from "@yogo75/core";

const VID = 0x373b;
export const PID_CABLE = 0x119b;
export const PID_DONGLE = 0x11ff;
/** The vendor interface the hub's WebHID base talks to. */
const USAGE_PAGE = 0xff60;
/** The hub's 500 ms timeout, which its applyWirelessTransport() raises to 3 s for the dongle. */
const CABLE_TIMEOUT_MS = 500;
const DONGLE_TIMEOUT_MS = 3000;
const CABLE_REPORT_BYTES = 64;
const DONGLE_REPORT_BYTES = 32;
const FILTERS: HIDDeviceFilter[] = [PID_CABLE, PID_DONGLE].map((productId) => ({
  vendorId: VID,
  productId,
  usagePage: USAGE_PAGE,
}));

export function isDongle(device: HIDDevice): boolean {
  return device.productId === PID_DONGLE;
}

/** Opens the browser's device picker, filtered to the keyboard's configuration interface. */
export async function requestKeyboard(): Promise<HIDDevice | undefined> {
  const [device] = await navigator.hid.requestDevice({ filters: FILTERS });
  return device;
}

/** The plugged keyboards the user already authorised, to connect without the picker. */
export async function authorisedKeyboards(): Promise<HIDDevice[]> {
  const devices = await navigator.hid.getDevices();
  return devices.filter(
    (d) =>
      d.vendorId === VID &&
      [PID_CABLE, PID_DONGLE].includes(d.productId) &&
      d.collections.some((c) => c.usagePage === USAGE_PAGE),
  );
}

/**
 * The core's pull-based `Transport` over an opened device's `inputreport` events, with the report size and timeout
 * of the link (cable or dongle). Aborting `signal` stops listening to the device.
 */
export function hidTransport(
  device: HIDDevice,
  signal?: AbortSignal,
): Transport {
  const dongle = isDongle(device);
  const timeout = dongle ? DONGLE_TIMEOUT_MS : CABLE_TIMEOUT_MS;
  let queued: Uint8Array[] = [];
  let waiting: ((report: Uint8Array) => void) | undefined;

  device.addEventListener(
    "inputreport",
    (e) => {
      const { buffer, byteOffset, byteLength } = e.data;
      const report = new Uint8Array(buffer, byteOffset, byteLength);

      if (waiting) {
        waiting(report);
      } else {
        queued.push(report);
      }
    },
    { signal },
  );

  function next() {
    const report = queued.shift();
    if (report) {
      return Promise.resolve(report);
    }

    return new Promise<Uint8Array | undefined>((resolve) => {
      const timer = setTimeout(() => {
        waiting = undefined;
        resolve(undefined);
      }, timeout);
      waiting = (r) => {
        clearTimeout(timer);
        waiting = undefined;
        resolve(r);
      };
    });
  }

  return {
    reportSize: dongle ? DONGLE_REPORT_BYTES : CABLE_REPORT_BYTES,
    async transfer(report) {
      if (report) {
        // reports received before a request answer nothing it sent
        queued = [];
        // the core builds its packets on plain ArrayBuffers, never shared ones
        await device.sendReport(0, report as Uint8Array<ArrayBuffer>);
      }

      return next();
    },
  };
}
