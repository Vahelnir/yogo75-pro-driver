import { connect, type Session } from "./session.ts";
import { hidTransport, isDongle } from "./webhid.ts";

/** The connected keyboard, shared by every page; undefined on the home page. */
export const session = shallowRef<Session>();
export const device = shallowRef<HIDDevice>();
export const asleep = ref(false);

/**
 * Opens `hid` and connects to it; on failure, the device is closed again and the error rethrown. The device is
 * known from the start, so that unplugging it while connecting is seen as a disconnect.
 */
export async function connectTo(hid: HIDDevice): Promise<void> {
  device.value = hid;
  try {
    if (!hid.opened) {
      await hid.open();
    }

    session.value = await connect(hidTransport(hid), () => {
      asleep.value = true;
    });
  } catch (e) {
    forget();
    await hid.close();
    throw e;
  } finally {
    asleep.value = false;
  }
}

export function forget(): void {
  session.value = undefined;
  device.value = undefined;
}

export function connectionType(): "dongle" | "cable" {
  return device.value && isDongle(device.value) ? "dongle" : "cable";
}
