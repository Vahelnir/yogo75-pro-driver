<script setup lang="ts">
import {
  bindingOf,
  NUMPAD_KEYS,
  PALETTE,
  PALETTE_DRAG_TYPE,
  TYPED_KEYS,
} from "../palette.ts";
import BindingTooltip from "./BindingTooltip.vue";

/** Every binding, plain keys first and the keyboard's macros last: picked for the selected key, or dragged onto one. */
const props = defineProps<{ macros: number[] }>();
const emit = defineEmits<{ pick: [name: string] }>();

const { t } = useI18n();
const tab = ref(0);

const groups = computed(() =>
  [
    {
      label: t("palette.groups.keys"),
      entries: TYPED_KEYS.map((name) => bindingOf(name, t)),
    },
    {
      label: t("palette.groups.numpad"),
      entries: NUMPAD_KEYS.map((name) => bindingOf(name, t)),
    },
    ...PALETTE.map((group) => ({
      label: t(group.label),
      entries: group.entries.map((e) => bindingOf(e.name, t)),
    })),
    {
      label: t("palette.groups.macros"),
      entries: props.macros.map((n) => bindingOf(`MACRO(${n})`, t)),
    },
  ].filter((group) => group.entries.length),
);

function drag(e: DragEvent, name: string) {
  e.dataTransfer?.setData(PALETTE_DRAG_TYPE, name);
}
</script>

<template>
  <!-- shortcut: mouse only, as key capture swallows Tab and the arrows; revisit with keyboard navigation -->
  <div data-palette class="mt-6 max-w-5xl text-sm">
    <UiTabs
      v-model="tab"
      :options="groups.map((group, i) => ({ value: i, label: group.label }))"
    >
      <template #default="{ value }">
        <div class="flex flex-wrap gap-1">
          <BindingTooltip
            v-for="entry in groups[value].entries"
            :key="entry.name"
            :binding="entry"
          >
            <button
              type="button"
              draggable="true"
              class="flex min-w-10 cursor-grab flex-col items-center rounded border border-zinc-300 bg-white px-2 py-0.5 shadow-sm hover:border-zinc-500"
              @click="emit('pick', entry.name)"
              @dragstart="drag($event, entry.name)"
            >
              <span class="inline-flex items-center gap-1">
                <component :is="entry.icon" v-if="entry.icon" />
                {{ entry.label }}
              </span>
              <span
                v-if="entry.label !== entry.name"
                class="font-mono text-xs text-zinc-500"
                >{{ entry.name }}</span
              >
            </button>
          </BindingTooltip>
        </div>
      </template>
    </UiTabs>
  </div>
</template>
