<script setup lang="ts">
import { PALETTE, PALETTE_DRAG_TYPE } from "../palette.ts";

/** The bindings that can't be typed, the keyboard's macros last: picked for the selected key, or dragged onto one. */
const props = defineProps<{ macros: number[] }>();
const emit = defineEmits<{ pick: [name: string] }>();

const { t } = useI18n();

const groups = computed(() =>
  [
    ...PALETTE.map((group) => ({
      label: t(group.label),
      entries: group.entries.map((e) => ({ name: e.name, label: t(e.label) })),
    })),
    {
      label: t("palette.groups.macros"),
      entries: props.macros.map((n) => ({
        name: `MACRO(${n})`,
        label: t("palette.macro", { n }),
      })),
    },
  ].filter((group) => group.entries.length),
);

function drag(e: DragEvent, name: string) {
  e.dataTransfer?.setData(PALETTE_DRAG_TYPE, name);
}
</script>

<template>
  <!-- shortcut: mouse only, as key capture swallows Tab and the arrows; revisit with keyboard navigation -->
  <div
    data-palette
    class="mt-4 grid max-w-5xl grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4 text-sm"
  >
    <section v-for="group in groups" :key="group.label">
      <h3 class="mb-1 text-xs font-medium text-zinc-500">{{ group.label }}</h3>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="entry in group.entries"
          :key="entry.name"
          type="button"
          draggable="true"
          class="flex cursor-grab flex-col items-start rounded border border-zinc-300 bg-white px-2 py-1 text-left shadow-sm hover:border-zinc-500"
          @click="emit('pick', entry.name)"
          @dragstart="drag($event, entry.name)"
        >
          <span>{{ entry.label }}</span>
          <span class="font-mono text-xs text-zinc-500">{{ entry.name }}</span>
        </button>
      </div>
    </section>
  </div>
</template>
