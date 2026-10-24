<script setup lang="ts">
import {
  ColorAreaArea,
  ColorAreaRoot,
  ColorAreaThumb,
  ColorFieldInput,
  ColorFieldRoot,
  ColorSliderRoot,
  ColorSliderThumb,
  ColorSliderTrack,
  ColorSwatch,
  convertToHsb,
  normalizeColor,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
  type Color,
} from "reka-ui";

const props = defineProps<{
  /** The colour held, as `#rrggbb`, shown whenever no change is pending. */
  value: string;
  label: string;
  /**
   * Called once per change: on release of a drag, on key release, on Enter or blur of the hex field, or when the
   * popover closes. A function rather than an event, so the picker can await the write before showing `value`
   * (the read-back) again.
   */
  commit: (color: string) => Promise<unknown>;
}>();

const moved = ref<string>();
let pending = false;
// counts moves and commits, so a write that ends doesn't reset a colour moved again since
let latest = 0;
let byKey = false;

const shown = computed(() => moved.value ?? props.value);
// a hex string has no hue at black, white or grey: the hue is kept here, for the area to follow the hue slider
const hue = ref(0);
const achromatic = computed(() => {
  const { s, b } = convertToHsb(normalizeColor(shown.value));
  return s === 0 || b === 0;
});
watch(
  shown,
  () => {
    if (!achromatic.value) {
      hue.value = convertToHsb(normalizeColor(shown.value)).h;
    }
  },
  { immediate: true },
);
// Reka's area takes the hue of a colour only while it has saturation: it is remounted to follow the slider
const areaKey = ref(0);
const areaColor = computed<Color>(() => ({
  ...convertToHsb(normalizeColor(shown.value)),
  h: hue.value,
}));

function setByKey(key: boolean) {
  byKey = key;
}

function onMove(color: string) {
  moved.value = color;
  pending = true;
  latest++;
}

async function commitPending() {
  if (!pending || moved.value === undefined) {
    return;
  }

  pending = false;
  // Reka's hex field sends the colour again on every blur and Enter, even unchanged
  if (moved.value === props.value) {
    moved.value = undefined;
    return;
  }

  const mine = ++latest;
  try {
    await props.commit(moved.value);
  } finally {
    if (latest === mine) {
      moved.value = undefined;
    }
  }
}

// Reka's slider ends a change on every key press: a held arrow would queue one flash save per step, so key
// changes wait for the key release
function onPointerChangeEnd() {
  if (!byKey) {
    commitPending();
  }
}

function onHue(color: Color) {
  if (!("h" in color)) {
    return;
  }

  hue.value = color.h;
  if (achromatic.value) {
    areaKey.value++;
  }
}

function onOpen(open: boolean) {
  if (!open) {
    commitPending();
  }
}
</script>

<template>
  <PopoverRoot @update:open="onOpen">
    <PopoverTrigger
      :aria-label="label"
      class="rounded-md border border-zinc-300 bg-white p-1"
    >
      <ColorSwatch :color="shown" class="block h-5 w-10 rounded" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        side="bottom"
        align="start"
        :side-offset="4"
        class="z-50 flex w-56 flex-col gap-3 rounded-md border border-zinc-200 bg-white p-3 shadow"
        @keydown.capture="setByKey(true)"
        @pointerdown.capture="setByKey(false)"
        @keyup="commitPending"
        @focusout="commitPending"
      >
        <ColorAreaRoot
          :key="areaKey"
          :model-value="areaColor"
          color-space="hsb"
          x-channel="saturation"
          y-channel="brightness"
          v-slot="{ style }"
          @update:model-value="onMove"
          @change-end="onPointerChangeEnd"
        >
          <ColorAreaArea :style="style" class="relative h-36 w-full rounded">
            <ColorAreaThumb
              class="block size-4 rounded-full ring-2 ring-white shadow outline-none focus-visible:ring-zinc-900"
            />
          </ColorAreaArea>
        </ColorAreaRoot>
        <ColorSliderRoot
          :model-value="shown"
          color-space="hsb"
          channel="hue"
          class="relative flex h-4 w-full touch-none items-center select-none"
          @update:color="onHue"
          @update:model-value="(color) => onMove(color as string)"
          @change-end="onPointerChangeEnd"
        >
          <ColorSliderTrack class="relative h-3 grow rounded-full" />
          <ColorSliderThumb
            class="block size-4 rounded-full bg-white shadow ring-1 ring-zinc-300 outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
          />
        </ColorSliderRoot>
        <ColorFieldRoot
          :model-value="shown"
          disable-wheel-change
          @update:model-value="onMove"
        >
          <ColorFieldInput
            :aria-label="label"
            class="w-full rounded-md border border-zinc-300 px-2 py-1 font-mono text-sm"
          />
        </ColorFieldRoot>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
