<script setup lang="ts">
import { PALETTE, PALETTE_DRAG_TYPE } from "../palette.ts";

/** The bindings that can't be typed, the keyboard's macros last: picked for the selected key, or dragged onto one. */
const props = defineProps<{ macros: number[] }>();
const emit = defineEmits<{ pick: [name: string] }>();

const { t } = useI18n();
const tab = ref(0);

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
  <div data-palette class="mt-6 max-w-5xl text-sm">
    <UiTabs
      v-model="tab"
      :options="groups.map((group, i) => ({ value: i, label: group.label }))"
    >
      <template #default="{ value }">
        <div class="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-1">
          <button
            v-for="entry in groups[value].entries"
            :key="entry.name"
            type="button"
            draggable="true"
            class="flex cursor-grab flex-col items-start rounded border border-zinc-300 bg-white px-2 py-1 text-left shadow-sm hover:border-zinc-500"
            @click="emit('pick', entry.name)"
            @dragstart="drag($event, entry.name)"
          >
            <span>{{ entry.label }}</span>
            <span class="font-mono text-xs text-zinc-500">{{
              entry.name
            }}</span>
          </button>
        </div>
      </template>
    </UiTabs>
  </div>
</template>
