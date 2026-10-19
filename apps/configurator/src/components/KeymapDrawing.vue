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
import { describe, PALETTE_DRAG_TYPE } from "../palette.ts";
import BindingLabel from "./BindingLabel.vue";
import BindingTooltip from "./BindingTooltip.vue";

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
const knobBindings = computed(() => ({
  left: describe(knob.value.left, t),
  right: describe(knob.value.right, t),
  press: describe(knob.value.press, t),
}));
/** Each knob label, upright in a box inside the ring's side or the press disc (viewBox units). */
const knobLabels = computed(() => [
  {
    binding: knobBindings.value.left,
    box: { x: 8.5, y: 30, width: 16, height: 40 },
  },
  {
    binding: knobBindings.value.right,
    box: { x: 75.5, y: 30, width: 16, height: 40 },
  },
  {
    binding: knobBindings.value.press,
    box: { x: 25, y: 40, width: 50, height: 20 },
  },
]);

const keys = computed(() =>
  [...LAYOUT].map(([index, rect]) => ({
    index,
    rect,
    binding: describe(keycodeName(keyAt(props.keymap, index)), t),
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
      v-for="{ index, rect, binding } in keys"
      :key="index"
      class="absolute p-[0.2%]"
      :style="place(rect)"
    >
      <BindingTooltip :binding>
        <button
          type="button"
          class="flex h-full w-full items-center justify-center overflow-hidden rounded border px-0.5 text-[clamp(7px,1.1cqw,13px)] shadow-sm"
          :class="
            selected === index
              ? 'border-amber-500 bg-amber-100 ring-2 ring-amber-500'
              : 'border-zinc-300 bg-white hover:border-zinc-500'
          "
          :aria-pressed="selected === index"
          :aria-label="binding.label"
          v-bind="dropTarget(index)"
          @click="emit('select', index)"
        >
          <BindingLabel :binding />
        </button>
      </BindingTooltip>
    </div>
    <div class="absolute p-[0.4%]" :style="place(KNOB)">
      <svg
        viewBox="0 0 100 100"
        class="h-full w-full text-[9px]"
        role="group"
        :aria-label="t('keymap.knob', knob)"
      >
        <g class="fill-white stroke-zinc-300">
          <BindingTooltip :binding="knobBindings.left">
            <path :d="ring(110, 250)" v-bind="knobPart(KNOB_LEFT)" />
          </BindingTooltip>
          <BindingTooltip :binding="knobBindings.right">
            <path :d="ring(-70, 70)" v-bind="knobPart(KNOB_RIGHT)" />
          </BindingTooltip>
          <BindingTooltip :binding="knobBindings.press">
            <circle
              cx="50"
              cy="50"
              :r="INNER - 4"
              v-bind="knobPart(KNOB_PRESS)"
            />
          </BindingTooltip>
        </g>
        <foreignObject
          v-for="{ binding, box } in knobLabels"
          :key="box.x"
          v-bind="box"
          class="pointer-events-none"
        >
          <div
            class="flex h-full items-center justify-center overflow-hidden text-center"
          >
            <BindingLabel :binding />
          </div>
        </foreignObject>
      </svg>
    </div>
  </div>
</template>
