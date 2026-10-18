<script setup lang="ts">
import { keycode } from "@yogo75/core";
import KeymapDrawing from "../../components/KeymapDrawing.vue";
import KeyPalette from "../../components/KeyPalette.vue";
import { device, session } from "../../keyboard.ts";
import { KEY_NAMES } from "../../keycodes.ts";
import { macroNumbers } from "../../palette.ts";
import { isDongle } from "../../webhid.ts";

const { t } = useI18n();
const layer = ref(0);
/** The key (or knob action) listening for the next key press, which becomes its binding. */
const selected = ref<number>();
const error = ref<string>();
const drawing = useTemplateRef("drawing");
/** The selected key's element, which the palette opens next to. */
const anchor = computed(() =>
  selected.value === undefined
    ? undefined
    : (drawing.value?.querySelector(`[data-index="${selected.value}"]`) ??
      undefined),
);
const macros = computed(() =>
  session.value ? macroNumbers(session.value.state.macros) : [],
);
/** The key press just captured: its keyup is swallowed too, so that Space doesn't click the focused key. */
let captured: string | undefined;

function select(index: number) {
  selected.value = selected.value === index ? undefined : index;
  error.value = undefined;
}

function swallow(e: KeyboardEvent) {
  e.preventDefault();
  e.stopPropagation();
}

/** Binds the selected key to `name`, whether captured or picked in the palette. */
async function assign(name: string) {
  const index = selected.value;
  if (index === undefined || !session.value) {
    return;
  }

  selected.value = undefined;
  try {
    await session.value.setKey(layer.value, index, keycode(name));
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    triggerRef(session);
  }
}

async function bind(e: KeyboardEvent) {
  if (selected.value === undefined || !session.value) {
    return;
  }

  swallow(e);
  const name = KEY_NAMES[e.code];
  if (e.repeat || (!name && e.code !== "Escape")) {
    return;
  }

  captured = e.code;
  if (e.code === "Escape") {
    selected.value = undefined;
    return;
  }

  await assign(name);
}

useEventListener(globalThis, "keydown", bind, { capture: true });
useEventListener(
  globalThis,
  "keyup",
  (e: KeyboardEvent) => {
    if (selected.value !== undefined || e.code === captured) {
      swallow(e);
    }
    if (e.code === captured) {
      captured = undefined;
    }
  },
  { capture: true },
);
onClickOutside(
  drawing,
  () => {
    selected.value = undefined;
  },
  { ignore: ["[data-palette]"] },
);
</script>

<template>
  <dl class="mb-4 grid w-fit grid-cols-2 gap-x-4 gap-y-1">
    <dt class="text-zinc-500">{{ t("keymap.firmware") }}</dt>
    <dd>{{ session?.firmware }}</dd>
    <dt class="text-zinc-500">{{ t("keymap.connection") }}</dt>
    <dd>
      {{
        device && isDongle(device)
          ? t("connection_type.dongle")
          : t("connection_type.cable")
      }}
    </dd>
  </dl>
  <UiTabs
    v-if="session"
    v-model="layer"
    @update:model-value="selected = undefined"
    :options="[
      { value: 0, label: t('keymap.layers.base') },
      { value: 1, label: t('keymap.layers.fn') },
      { value: 2, label: t('keymap.layers.layer', { n: 2 }) },
      { value: 3, label: t('keymap.layers.layer', { n: 3 }) },
    ]"
  >
    <template #default="{ value }">
      <div ref="drawing">
        <KeymapDrawing
          :keymap="session.state.keymaps[value]"
          :selected
          @select="select"
        />
      </div>
    </template>
  </UiTabs>
  <KeyPalette :anchor :macros @pick="assign" />
  <p v-if="selected !== undefined" class="mt-4">
    {{ t("keymap.listening") }}
  </p>
  <p v-if="error" class="mt-4 text-red-700">
    {{ t("keymap.write_failed", { error }) }}
  </p>
</template>
