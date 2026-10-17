import type { Transport } from "@yogo75/core";
import HID from "node-hid";

const VID = 0x373b;
const PID_USB = 0x119b;
const PID_DONGLE = 0x11ff; // 4607
const USAGE_PAGE = 0xff60; // the vendor interface the hub talks to

/**
 * Opens the keyboard over node-hid: USB cable first, else the 2.4 GHz dongle.
 * The hub only changes the report size and the timeout for wireless.
 */
export async function openKeyboard(): Promise<{
  transport: Transport;
  close: () => Promise<void>;
}> {
  const device = [PID_USB, PID_DONGLE]
    .map((pid) => HID.devices(VID, pid).find((d) => d.usagePage === USAGE_PAGE))
    .find((d) => d);
  if (!device?.path) {
    throw new Error(
      "Yogo 75 PRO not found (USB or 2.4 GHz dongle, interface 0xFF60)",
    );
  }

  const wireless = device.productId === PID_DONGLE;
  const dev = await HID.HIDAsync.open(device.path);
  const transport: Transport = {
    reportSize: wireless ? 32 : 64,
    async transfer(report) {
      if (report) {
        await dev.write([0x00, ...report]); // report id 0
      }

      const r = await dev.read(wireless ? 3000 : 500);
      return r?.length ? r : undefined;
    },
  };

  return { transport, close: () => dev.close() };
}
