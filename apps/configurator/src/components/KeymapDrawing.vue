<script setup lang="ts">
import { keyAt, keycodeName, KNOB, LAYOUT, type KeyRect } from "@yogo75/core";

/** One layer, as the keyboard holds it. */
const props = defineProps<{ keymap: Uint8Array }>();

const { t } = useI18n();

const rects = [...LAYOUT.values(), KNOB];
const width = Math.max(...rects.map((r) => r.x + r.w));
const height = Math.max(...rects.map((r) => r.y + r.h));

const keys = computed(() =>
  [...LAYOUT].map(([index, rect]) => ({
    index,
    rect,
    name: keycodeName(keyAt(props.keymap, index)),
  })),
);

function place(rect: KeyRect) {
  return {
    left: `${(rect.x / width) * 100}%`,
    top: `${(rect.y / height) * 100}%`,
    width: `${(rect.w / width) * 100}%`,
    height: `${(rect.h / height) * 100}%`,
  };
}
</script>

<template>
  <div
    class="@container relative w-full max-w-5xl"
    :style="{ aspectRatio: `${width} / ${height}` }"
  >
    <div
      v-for="{ index, rect, name } in keys"
      :key="index"
      class="absolute p-[0.2%]"
      :style="place(rect)"
    >
      <div
        class="flex h-full items-center justify-center overflow-hidden rounded border border-zinc-300 bg-white px-0.5 text-[clamp(7px,1.1cqw,13px)] shadow-sm"
        :title="`${index}: ${name}`"
      >
        <span class="truncate">{{ name }}</span>
      </div>
    </div>
    <div class="absolute p-[0.4%]" :style="place(KNOB)">
      <div
        class="h-full rounded-full border-2 border-zinc-400 bg-zinc-200"
        role="img"
        :aria-label="t('keymap.knob')"
        :title="t('keymap.knob')"
      />
    </div>
  </div>
</template>
