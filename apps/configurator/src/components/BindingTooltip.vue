<script setup lang="ts">
import type { Binding } from "../palette.ts";

/** Wraps its slot in a tooltip giving the binding's label, QMK name and description. */
defineProps<{ binding: Binding }>();
</script>

<template>
  <UiTooltip>
    <slot />
    <template #content>
      <p v-if="binding.label !== binding.name" class="font-medium">
        {{ binding.label }}
      </p>
      <p class="font-mono text-zinc-300">{{ binding.name }}</p>
      <p v-if="binding.description" class="mt-1">
        {{ binding.description }}
      </p>
    </template>
  </UiTooltip>
</template>
