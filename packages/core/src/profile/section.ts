/** What every section of the profile format shares: its interface, error collection and YAML node walking. */
import { isMap, isScalar, type LineCounter, type Node } from "yaml";
import type { Base } from "../base.ts";
import type { KeyboardState } from "../state.ts";

/** One top-level key of the profile. A resource no section covers is left as the keyboard has it on load. */
export interface Section {
  key: string;
  /** The section's value (plain values, `Map` for ordered keys), or undefined when it has nothing to write. */
  toYaml(state: KeyboardState, base: Base, full: boolean): unknown;
  /** Sets the section's resources on `state` to the base's, then applies `node` (undefined: absent). */
  fromYaml(
    node: Node | undefined,
    base: Base,
    state: KeyboardState,
    problems: Problems,
  ): void;
}

/** Collects every problem of a file, each with its line and path, to throw them all at once. */
export class Problems {
  #found: { line: number; message: string }[] = [];
  #lines: LineCounter;

  constructor(lines: LineCounter) {
    this.#lines = lines;
  }

  /** `at` is a node or an offset in the text; none means the top of the file. */
  add(at: Node | number | undefined, path: string, message: string) {
    const offset = typeof at === "number" ? at : (at?.range?.[0] ?? 0);
    const line = this.#lines.linePos(offset).line;
    this.#found.push({ line, message: `${path ? `${path}: ` : ""}${message}` });
  }

  /** Every problem in file order, one per line. */
  throwIfAny() {
    if (this.#found.length) {
      const sorted = this.#found.toSorted((a, b) => a.line - b.line);
      throw new Error(
        sorted.map((p) => `line ${p.line}: ${p.message}`).join("\n"),
      );
    }
  }
}

export interface Entry {
  key: string;
  keyNode: Node;
  /** Undefined for an empty value (`A:`). */
  value: Node | undefined;
  path: string;
}

/** The entries of a map node under `path`; an empty node has none, anything else is reported. */
export function entries(
  node: Node | undefined,
  path: string,
  problems: Problems,
): Entry[] {
  if (node === undefined || isEmpty(node)) {
    return [];
  }

  if (!isMap(node)) {
    problems.add(node, path, "expected a map");
    return [];
  }

  return node.items.flatMap((pair) => {
    const keyNode = pair.key as Node;
    const key = text(keyNode);
    if (key === undefined) {
      problems.add(keyNode, path, "a key must be a plain value");
      return [];
    }

    const value = isEmpty(pair.value as Node)
      ? undefined
      : (pair.value as Node);
    return [{ key, keyNode, value, path: path ? `${path}.${key}` : key }];
  });
}

/** A scalar as written (`0x10` stays text, not 16); undefined for anything else. */
export function text(node: Node | undefined): string | undefined {
  if (!isScalar(node) || node.value === null) {
    return undefined;
  }

  return typeof node.value === "string"
    ? node.value
    : (node.source ?? String(node.value));
}

function isEmpty(node: Node | null | undefined) {
  return node == null || (isScalar(node) && node.value === null);
}
