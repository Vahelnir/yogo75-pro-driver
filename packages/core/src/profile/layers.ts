/** `layers.<0–3>.<position>: <binding>`: the keymap, slot by slot. */
import { fromHex, hex } from "../bytes.ts";
import { keycode, keycodeName } from "../keycode.ts";
import {
  CODE_BYTES,
  keyAt,
  keyIndex,
  KEYS,
  KNOB_LEFT,
  KNOB_PRESS,
  KNOB_RIGHT,
  positionName,
} from "../keymap.ts";
import {
  entries,
  text,
  type Entry,
  type Problems,
  type Section,
} from "./section.ts";

// shortcut: slots 96–111 (no key, `10 00 00`) have no position and always take the base's value; give them one if a keyboard is found holding anything else there
const SLOTS = [...Array(KEYS).keys(), KNOB_LEFT, KNOB_RIGHT, KNOB_PRESS];
const LAYER = /^[0-3]$/;

export const layers: Section = {
  key: "layers",

  toYaml(state, base, full) {
    const layers = new Map<number, Map<string, unknown>>();
    state.keymaps.forEach((map, layer) => {
      const slots = new Map<string, unknown>();
      for (const index of SLOTS) {
        const code = keyAt(map, index);
        if (full || hex(code) !== hex(keyAt(base.keymaps[layer], index))) {
          slots.set(positionName(index), binding(code));
        }
      }

      if (slots.size) {
        layers.set(layer, slots);
      }
    });

    return layers.size ? layers : undefined;
  },

  fromYaml(node, base, state, problems) {
    state.keymaps = base.keymaps.map((map) => map.slice());

    for (const layer of entries(node, "layers", problems)) {
      if (!LAYER.test(layer.key)) {
        problems.add(
          layer.keyNode,
          layer.path,
          "unknown layer: layers are 0-3",
        );
        continue;
      }

      const map = state.keymaps[Number(layer.key)];
      const seen = new Map<number, string>();
      for (const slot of entries(layer.value, layer.path, problems)) {
        let index;
        try {
          index = keyIndex(slot.key);
        } catch (e) {
          problems.add(slot.keyNode, slot.path, (e as Error).message);
          continue;
        }

        if (seen.has(index)) {
          problems.add(
            slot.keyNode,
            slot.path,
            `same key as ${seen.get(index)}`,
          );
          continue;
        }
        seen.set(index, slot.path);

        const code = parseBinding(slot, problems);
        if (code) {
          keyAt(map, index).set(code);
        }
      }
    }
  },
};

/** A key name, or `{ raw }` for a code with no name. */
function binding(code: Uint8Array): unknown {
  const name = keycodeName(code);
  return name.startsWith("0x") ? { raw: hex(code) } : name;
}

function parseBinding({ keyNode, value, path }: Entry, problems: Problems) {
  if (value === undefined) {
    problems.add(keyNode, path, "missing binding");
    return undefined;
  }

  const name = text(value);
  if (name !== undefined) {
    try {
      return keycode(name);
    } catch (e) {
      problems.add(value, path, (e as Error).message);
      return undefined;
    }
  }

  let code;
  for (const entry of entries(value, path, problems)) {
    const raw = entry.key === "raw" ? text(entry.value) : undefined;
    if (entry.key !== "raw") {
      problems.add(entry.keyNode, entry.path, "unknown key");
    } else if (raw === undefined || !/^ *([0-9a-f]{2} *){3}$/i.test(raw)) {
      problems.add(
        entry.value ?? entry.keyNode,
        entry.path,
        `must be ${CODE_BYTES} hex bytes`,
      );
    } else {
      code = fromHex(raw);
    }
  }

  return code;
}
