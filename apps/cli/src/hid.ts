import {
  hex,
  Keyboard,
  LINKS,
  NoReplyError,
  openKeyboard,
  PID_CABLE,
  PID_DONGLE,
  USAGE_PAGE,
  VENDOR_ID,
  type Transport,
} from "@yogo75/core";
import HID from "node-hid";

/** Opens the keyboard over node-hid: USB cable first, else the 2.4 GHz dongle. */
export async function openHid(): Promise<{
  transport: Transport;
  close: () => Promise<void>;
}> {
  const device = [PID_CABLE, PID_DONGLE]
    .map((pid) =>
      HID.devices(VENDOR_ID, pid).find((d) => d.usagePage === USAGE_PAGE),
    )
    .find((d) => d);
  if (!device?.path) {
    throw new Error(
      "Yogo 75 PRO not found (USB or 2.4 GHz dongle, interface 0xFF60)",
    );
  }

  const { reportSize, timeoutMs } = LINKS[device.productId];
  const dev = await HID.HIDAsync.open(device.path);
  const transport: Transport = {
    reportSize,
    async transfer(report) {
      if (report) {
        await dev.write([0x00, ...report]); // report id 0
      }

      const r = await dev.read(timeoutMs);
      return r?.length ? r : undefined;
    },
  };

  return { transport, close: () => dev.close() };
}

/** Opens the keyboard, starts it and repairs its flash pages, runs `use` and closes; DEBUG=1 traces every packet. */
export async function withKeyboard<T>(
  use: (k: Keyboard) => Promise<T>,
): Promise<T> {
  const { transport, close } = await openHid();
  const k = new Keyboard(
    transport,
    process.env.DEBUG ? (dir, p) => console.error(dir, hex(p)) : undefined,
  );

  try {
    let repaired: string[];
    try {
      repaired = await openKeyboard(k);
    } catch (e) {
      if (e instanceof NoReplyError && k.throughDongle) {
        throw new Error(
          "keyboard asleep (2.4 GHz): press a key, then run the command again",
        );
      }
      throw e;
    }
    for (const name of repaired) {
      console.error(
        `repaired the ${name} flash page, left full by another tool or the keyboard`,
      );
    }

    return await use(k);
  } finally {
    await close();
  }
}
