import {
  loadMismatches,
  profileFromYaml,
  profileToYaml,
  stateDiff,
  stateFromJson,
  type KeyboardState,
} from "@yogo75/core";
import { toRaw } from "vue";
import type { Session } from "./session.ts";

/** The keyboard's state as the YAML profile `yogo75 save` writes, which `yogo75 load` reads. */
export function exportState(session: Session, { full = false } = {}): string {
  return profileToYaml(toRaw(session.state), session.firmware, { full });
}

/** A parsed import: the state to load, and the resources it changes on the keyboard. */
export interface Import {
  state: KeyboardState;
  changes: string[];
}

/**
 * Parses a `yogo75 save` file, YAML profile or JSON by its extension as the CLI does. Throws every problem of an
 * invalid file, before anything is written.
 */
export function parseImport(
  session: Session,
  fileName: string,
  text: string,
): Import {
  const current = toRaw(session.state);
  const state = /\.ya?ml$/i.test(fileName)
    ? profileFromYaml(text, current)
    : stateFromJson(text);

  // colours are written, and read back, as 0xFE where the file has 0xFF: a change only if it differs both ways
  const loaded = loadMismatches(state, current);
  const changes = stateDiff(state, current).filter((r) => loaded.includes(r));
  return { state, changes };
}
