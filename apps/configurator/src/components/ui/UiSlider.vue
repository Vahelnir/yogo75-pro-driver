<script setup lang="ts">
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from "reka-ui";

const props = defineProps<{
  /** The value held, shown whenever the thumb isn't being moved. */
  value: number;
  min: number;
  max: number;
  label: string;
  /** Called once per gesture, on release; the slider shows `value` again once it settles. */
  commit: (value: number) => Promise<unknown>;
}>();

const moved = ref<number>();

async function onCommit([value]: number[]) {
  try {
    await props.commit(value);
  } finally {
    moved.value = undefined;
  }
}
</script>

<template>
  <SliderRoot
    :model-value="[moved ?? value]"
    :min="min"
    :max="max"
    class="relative flex h-5 w-48 touch-none items-center select-none"
    @update:model-value="(values) => (moved = values?.[0])"
    @value-commit="onCommit"
  >
    <SliderTrack class="relative h-1 grow rounded-full bg-zinc-300">
      <SliderRange class="absolute h-full rounded-full bg-zinc-900" />
    </SliderTrack>
    <SliderThumb
      :aria-label="label"
      class="block size-4 rounded-full bg-white shadow ring-1 ring-zinc-300 outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
    />
  </SliderRoot>
</template>
