<script setup lang="ts">
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from "reka-ui";

const props = defineProps<{
  /** The value held, shown whenever the thumb isn't being moved. */
  value: number;
  min: number;
  max: number;
  label: string;
  /**
   * Called once per gesture: on release of a drag, on key release or blur for the keyboard. A function rather
   * than an event, so the slider can await the write before showing `value` (the read-back) again.
   */
  commit: (value: number) => Promise<unknown>;
}>();
defineSlots<{ default?(props: { value: number }): unknown }>();

const moved = ref<number>();
// counts moves and commits, so a write that ends doesn't reset a thumb moved again since
let latest = 0;
let byKey = false;
let keyMovePending = false;

function setByKey(key: boolean) {
  byKey = key;
}

function onMove(values: number[] | undefined) {
  moved.value = values?.[0];
  latest++;
}

async function commit(value: number) {
  const mine = ++latest;
  try {
    await props.commit(value);
  } finally {
    if (latest === mine) {
      moved.value = undefined;
    }
  }
}

// Reka commits on every key press: a held arrow would queue one flash save per step
function onValueCommit([value]: number[]) {
  if (byKey) {
    keyMovePending = true;
  } else {
    keyMovePending = false;
    commit(value);
  }
}

function onKeyGestureEnd() {
  if (keyMovePending && moved.value !== undefined) {
    keyMovePending = false;
    commit(moved.value);
  }
}
</script>

<template>
  <SliderRoot
    :model-value="[moved ?? value]"
    :min="min"
    :max="max"
    class="relative flex h-5 w-48 touch-none items-center select-none"
    @keydown.capture="setByKey(true)"
    @pointerdown.capture="setByKey(false)"
    @update:model-value="onMove"
    @value-commit="onValueCommit"
  >
    <SliderTrack class="relative h-1 grow rounded-full bg-zinc-300">
      <SliderRange class="absolute h-full rounded-full bg-zinc-900" />
    </SliderTrack>
    <SliderThumb
      :aria-label="label"
      class="block size-4 rounded-full bg-white shadow ring-1 ring-zinc-300 outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
      @keyup="onKeyGestureEnd"
      @blur="onKeyGestureEnd"
    />
  </SliderRoot>
  <slot :value="moved ?? value" />
</template>
