import {
  firmwareVersion,
  Keyboard,
  NoReplyError,
  type KeyboardState,
  type Transport,
} from "@yogo75/core";

/** A connected keyboard: every request goes through `run`, one at a time, as the core requires. */
export interface Session {
  firmware: string;
  /** The state read at connection, which restore writes back. */
  snapshot: KeyboardState;
  /** What the keyboard holds now, as last read back. */
  state: KeyboardState;
  run<T>(task: (k: Keyboard) => Promise<T>): Promise<T>;
  /**
   * Writes one key (or knob action) through the queue, then reads its layer back into `state`, even when the
   * write fails, so that `state` shows what the keyboard really holds.
   */
  setKey(layer: number, index: number, code: Uint8Array): Promise<void>;
}

/**
 * Starts the keyboard, repairs its flash pages and reads its state, as the CLI does on open. A sleeping dongle
 * doesn't answer: `onAsleep` is called and the start packet is sent again until a key press wakes it.
 */
export async function connect(
  transport: Transport,
  onAsleep?: () => void,
): Promise<Session> {
  const keyboard = new Keyboard(transport);
  let queue: Promise<unknown> = Promise.resolve();

  function run<T>(task: (k: Keyboard) => Promise<T>): Promise<T> {
    const result = queue.then(() => task(keyboard));
    queue = result.catch(() => {});
    return result;
  }

  for (;;) {
    try {
      await keyboard.start();
      break;
    } catch (e) {
      if (!(e instanceof NoReplyError)) {
        throw e;
      }
      onAsleep?.();
    }
  }

  await keyboard.repairFlashPages();
  const info = await keyboard.readInfo();
  const snapshot = await keyboard.readState();

  const state = structuredClone(snapshot);

  function setKey(layer: number, index: number, code: Uint8Array) {
    return run(async (k) => {
      try {
        await k.setKey(layer, index, code);
      } finally {
        state.keymaps[layer] = await k.readKeymap(layer);
      }
    });
  }

  return {
    firmware: firmwareVersion(info),
    snapshot,
    state,
    run,
    setKey,
  };
}
