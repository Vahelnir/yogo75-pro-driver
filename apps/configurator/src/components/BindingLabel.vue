<script setup lang="ts">
import type { Binding } from "../palette.ts";

/** A binding as drawn on a key: its two characters, its icon, short label and badge, or else its QMK name. */
defineProps<{ binding: Binding }>();
</script>

<template>
  <span v-if="binding.shifted" class="flex flex-col items-center leading-tight">
    <span>{{ binding.shifted }}</span>
    <span>{{ binding.short }}</span>
  </span>
  <span
    v-else-if="binding.icon || binding.short || binding.badge"
    class="inline-flex min-w-0 items-center gap-0.5"
  >
    <component :is="binding.icon" v-if="binding.icon" class="shrink-0" />
    <span v-if="binding.short" class="truncate">{{ binding.short }}</span>
    <span v-if="binding.badge">{{ binding.badge }}</span>
  </span>
  <span v-else class="truncate">{{ binding.name }}</span>
</template>
