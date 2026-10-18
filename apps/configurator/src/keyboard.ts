import { connect, type Session } from "./session.ts";
import { hidTransport } from "./webhid.ts";

/** The connected keyboard, shared by every page; undefined on the home page. */
export const session = shallowRef<Session>();
export const device = shallowRef<HIDDevice>();
export const asleep = ref(false);
/** Stops the transport listening to the device once the session ends. */
let link: AbortController | undefined;

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

    link = new AbortController();
    session.value = await connect(hidTransport(hid, link.signal), () => {
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

/** Ends the session, e.g. when the device was unplugged. */
export function forget(): void {
  link?.abort();
  link = undefined;
  session.value = undefined;
  device.value = undefined;
}

/** Ends the session and releases the device, which stays authorised. */
export async function disconnect(): Promise<void> {
  const hid = device.value;
  forget();
  await hid?.close();
}
