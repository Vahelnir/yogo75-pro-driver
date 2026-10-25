import {
  APPLY_DELAY_MS,
  firmwareVersion,
  Keyboard,
  loadMismatches,
  openKeyboard,
  stateDiff,
  type KeyboardState,
  type Transport,
} from "@yogo75/core";
import { reactive, toRaw } from "vue";

/**
 * A connected keyboard: every request goes through its queue, one at a time, as the core requires. Pages write
 * only through `update`, `setKey` and `load`, which read what they wrote back into `state`.
 */
export interface Session {
  firmware: string;
  /** The state read at connection, which restore writes back. */
  snapshot: KeyboardState;
  /**
   * What the keyboard holds now, as last read back. Reactive: the session replaces a whole resource after each
   * read-back, so components reading it update. Read-only for pages.
   */
  state: KeyboardState;
  /**
   * Hands `recipe` a copy of `state` to change, writes the resources that differ, whole, then reads them back
   * into `state`, even when a write fails.
   */
  update(recipe: (next: KeyboardState) => void): Promise<void>;
  /**
   * Writes one key (or knob action) through the queue, then reads its layer back into `state`, even when the
   * write fails, so that `state` shows what the keyboard really holds.
   */
  setKey(layer: number, index: number, code: Uint8Array): Promise<void>;
  /**
   * Writes every resource of `wanted`, as `yogo75 load` does, then reads them all back into `state`, even when a
   * write fails. Resolves with the resources the keyboard doesn't hold as wanted.
   */
  load(wanted: KeyboardState): Promise<string[]>;
}

/** How a resource is written from a state and read back into `state`, by its `stateDiff` name. */
type Resource = [
  write: (next: KeyboardState) => Promise<unknown>,
  read: () => Promise<void>,
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  function run<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  }

  await openKeyboard(keyboard, { onAsleep });
  const info = await keyboard.readInfo();
  const snapshot = await keyboard.readState();

  // reactive() leaves the Uint8Arrays as they are: only replacing one is seen
  const state = reactive(structuredClone(snapshot)) as KeyboardState;

  const resources: Record<string, Resource> = {
    config: [
      (next) => keyboard.writeConfig(next.config),
      async () => {
        state.config = await keyboard.readConfig();
      },
    ],
    ...Object.fromEntries(
      snapshot.keymaps.map((_, layer): [string, Resource] => [
        `keymap${layer}`,
        [
          (next) => keyboard.writeKeymap(layer, next.keymaps[layer]),
          async () => {
            state.keymaps[layer] = await keyboard.readKeymap(layer);
          },
        ],
      ]),
    ),
    leds: [
      (next) => keyboard.writeCustomLeds(next.leds),
      async () => {
        state.leds = await keyboard.readCustomLeds();
      },
    ],
    macros: [
      (next) => keyboard.writeMacros(next.macros),
      async () => {
        state.macros = await keyboard.readMacros();
      },
    ],
  };

  // shortcut: update rewrites whole resources, only keys have a lighter write (setKey); revisit if another
  // resource gets a partial write
  function update(recipe: (next: KeyboardState) => void) {
    return run(async () => {
      const next = structuredClone(toRaw(state));
      recipe(next);
      const changed = stateDiff(next, toRaw(state));

      try {
        for (const name of changed) {
          await resources[name][0](next);
        }
      } finally {
        // the macros' write doesn't wait for a save, and the keyboard acks before applying
        await sleep(APPLY_DELAY_MS);
        for (const name of changed) {
          await resources[name][1]();
        }
      }
    });
  }

  function setKey(layer: number, index: number, code: Uint8Array) {
    return run(async () => {
      try {
        await keyboard.setKey(layer, index, code);
      } finally {
        state.keymaps[layer] = await keyboard.readKeymap(layer);
      }
    });
  }

  // every resource, not only those that differ from `state`: the keyboard's own Fn keys change it unseen
  function load(wanted: KeyboardState) {
    return run(async () => {
      try {
        for (const [write] of Object.values(resources)) {
          await write(wanted);
        }
      } finally {
        await sleep(APPLY_DELAY_MS);
        for (const [, read] of Object.values(resources)) {
          await read();
        }
      }

      return loadMismatches(wanted, toRaw(state));
    });
  }

  return {
    firmware: firmwareVersion(info),
    snapshot,
    state,
    update,
    setKey,
    load,
  };
}
