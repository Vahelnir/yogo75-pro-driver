import { NoReplyError, type Keyboard } from "./keyboard.ts";

export interface OpenOptions {
  /**
   * Called each time a sleeping keyboard behind the dongle doesn't answer the start packet, which is then sent
   * again until a key press wakes it. Without it, the `NoReplyError` is thrown at once.
   */
  onAsleep?: () => void;
}

/**
 * Starts the session and repairs the flash pages another tool or the keyboard left full; returns their names.
 * Over the cable the keyboard never sleeps: no reply is an error even with `onAsleep`.
 */
export async function openKeyboard(
  keyboard: Keyboard,
  { onAsleep }: OpenOptions = {},
): Promise<string[]> {
  for (;;) {
    try {
      await keyboard.start();
      break;
    } catch (e) {
      if (!(e instanceof NoReplyError && onAsleep && keyboard.throughDongle)) {
        throw e;
      }
      onAsleep();
    }
  }

  return keyboard.repairFlashPages();
}
