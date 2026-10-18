<script setup lang="ts">
import {
  keyAt,
  keycodeName,
  KNOB,
  KNOB_LEFT,
  KNOB_PRESS,
  KNOB_RIGHT,
  knobNames,
  LAYOUT,
  type KeyRect,
} from "@yogo75/core";
import { PALETTE_DRAG_TYPE } from "../palette.ts";

/** One layer and its knob, as the keyboard holds them; `selected` is the key (or knob action) listening. */
const props = defineProps<{ keymap: Uint8Array; selected?: number }>();
const emit = defineEmits<{
  select: [index: number];
  drop: [index: number, name: string];
}>();

const { t } = useI18n();

const rects = [...LAYOUT.values(), KNOB];
const width = Math.max(...rects.map((r) => r.x + r.w));
const height = Math.max(...rects.map((r) => r.y + r.h));

const knob = computed(() => knobNames(props.keymap));

const keys = computed(() =>
  [...LAYOUT].map(([index, rect]) => ({
    index,
    rect,
    name: keycodeName(keyAt(props.keymap, index)),
  })),
);

/** Drop handlers for a key (or knob action): only a palette entry is accepted. */
function dropTarget(index: number) {
  return {
    onDragover: (e: DragEvent) => {
      if (e.dataTransfer?.types.includes(PALETTE_DRAG_TYPE)) {
        e.preventDefault();
      }
    },
    onDrop: (e: DragEvent) => {
      const name = e.dataTransfer?.getData(PALETTE_DRAG_TYPE);
      if (name) {
        e.preventDefault();
        emit("drop", index, name);
      }
    },
  };
}

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

function knobPart(index: number) {
  return {
    role: "button",
    tabindex: 0,
    "aria-pressed": props.selected === index,
    class: [
      "cursor-pointer hover:stroke-zinc-500",
      props.selected === index && "fill-amber-100 stroke-amber-500",
    ],
    ...dropTarget(index),
    onClick: () => emit("select", index),
    onKeydown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        emit("select", index);
      }
    },
  };
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
      <button
        type="button"
        class="flex h-full w-full items-center justify-center overflow-hidden rounded border border-zinc-300 bg-white px-0.5 text-[clamp(7px,1.1cqw,13px)] shadow-sm hover:border-zinc-500"
        :class="{ 'border-amber-500 bg-amber-100': selected === index }"
        :aria-pressed="selected === index"
        :title="`${index}: ${name}`"
        v-bind="dropTarget(index)"
        @click="emit('select', index)"
      >
        <span class="truncate">{{ name }}</span>
      </button>
    </div>
    <div class="absolute p-[0.4%]" :style="place(KNOB)">
      <svg
        viewBox="0 0 100 100"
        class="h-full w-full text-[9px]"
        role="group"
        :aria-label="t('keymap.knob', knob)"
      >
        <g class="fill-white stroke-zinc-300">
          <path :d="ring(110, 250)" v-bind="knobPart(KNOB_LEFT)">
            <title>↺ {{ knob.left }}</title>
          </path>
          <path :d="ring(-70, 70)" v-bind="knobPart(KNOB_RIGHT)">
            <title>↻ {{ knob.right }}</title>
          </path>
          <circle cx="50" cy="50" :r="INNER - 4" v-bind="knobPart(KNOB_PRESS)">
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
