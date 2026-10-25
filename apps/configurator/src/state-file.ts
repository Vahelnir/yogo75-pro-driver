import { stateFromJson, stateToJson } from "@yogo75/core";
import { toRaw } from "vue";
import type { Session } from "./session.ts";

/** The keyboard's state as a `yogo75 save` file, which `yogo75 load` reads. */
export function exportState(session: Session): string {
  return stateToJson(toRaw(session.state));
}

/**
 * Loads a `yogo75 save` file onto the keyboard; rejects, writing nothing, when the file is invalid. Resolves with
 * the resources the keyboard doesn't hold as the file says.
 */
export async function importState(
  session: Session,
  text: string,
): Promise<string[]> {
  return session.load(stateFromJson(text));
}
