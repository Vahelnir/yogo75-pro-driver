<script setup lang="ts">
import { keyAt, keycodeName, KNOB, LAYOUT, type KeyRect } from "@yogo75/core";

/** One layer and its knob, as the keyboard holds them. */
const props = defineProps<{ keymap: Uint8Array; knob: Uint8Array }>();

const { t } = useI18n();

const rects = [...LAYOUT.values(), KNOB];
const width = Math.max(...rects.map((r) => r.x + r.w));
const height = Math.max(...rects.map((r) => r.y + r.h));

const knob = computed(() => ({
  left: keycodeName(keyAt(props.knob, 0)),
  right: keycodeName(keyAt(props.knob, 1)),
  press: keycodeName(keyAt(props.knob, 2)),
}));

const keys = computed(() =>
  [...LAYOUT].map(([index, rect]) => ({
    index,
    rect,
    name: keycodeName(keyAt(props.keymap, index)),
  })),
);

/** Radii of the knob's rotation ring, in its 100 × 100 viewBox; the press disc sits inside it. */
const OUTER = 49;
const INNER = 33;

/** SVG path of the ring between two angles, in degrees clockwise from the right. */
function ring(from: number, to: number): string {
  function at(radius: number, degrees: number) {
    const a = (degrees * Math.PI) / 180;
    return `${50 + radius * Math.cos(a)} ${50 + radius * Math.sin(a)}`;
  }

  return [
    `M ${at(OUTER, from)}`,
    `A ${OUTER} ${OUTER} 0 0 1 ${at(OUTER, to)}`,
    `L ${at(INNER, to)}`,
    `A ${INNER} ${INNER} 0 0 0 ${at(INNER, from)}`,
    "Z",
  ].join(" ");
}

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
      <svg
        viewBox="0 0 100 100"
        class="h-full w-full text-[9px]"
        role="img"
        :aria-label="t('keymap.knob', knob)"
      >
        <g class="fill-white stroke-zinc-300">
          <path :d="ring(110, 250)">
            <title>↺ {{ knob.left }}</title>
          </path>
          <path :d="ring(-70, 70)">
            <title>↻ {{ knob.right }}</title>
          </path>
          <circle cx="50" cy="50" :r="INNER - 4">
            <title>{{ knob.press }}</title>
          </circle>
        </g>
        <g class="pointer-events-none fill-zinc-900" text-anchor="middle">
          <text x="50" y="53">{{ knob.press }}</text>
          <text transform="translate(16.5 50) rotate(-90)" dy="3">
            {{ knob.left }}
          </text>
          <text transform="translate(83.5 50) rotate(90)" dy="3">
            {{ knob.right }}
          </text>
        </g>
      </svg>
    </div>
  </div>
</template>
