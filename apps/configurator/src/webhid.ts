import {
  LINKS,
  PID_CABLE,
  PID_DONGLE,
  USAGE_PAGE,
  VENDOR_ID,
  type Transport,
} from "@yogo75/core";

const FILTERS: HIDDeviceFilter[] = [PID_CABLE, PID_DONGLE].map((productId) => ({
  vendorId: VENDOR_ID,
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
      d.vendorId === VENDOR_ID &&
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
  const { reportSize, timeoutMs } = LINKS[device.productId];
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
      }, timeoutMs);
      waiting = (r) => {
        clearTimeout(timer);
        waiting = undefined;
        resolve(r);
      };
    });
  }

  return {
    reportSize,
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
