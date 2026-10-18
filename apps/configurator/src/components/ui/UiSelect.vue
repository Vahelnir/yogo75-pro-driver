<script setup lang="ts">
import IconChevronDown from "~icons/lucide/chevron-down";
import {
  SelectContent,
  SelectItem,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from "reka-ui";

defineProps<{ options: { value: string; label: string }[] }>();
const model = defineModel<string>();
</script>

<template>
  <SelectRoot v-model="model">
    <SelectTrigger
      class="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1"
    >
      <SelectValue />
      <IconChevronDown />
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        position="popper"
        class="rounded-md border border-zinc-200 bg-white shadow"
      >
        <SelectViewport class="p-1">
          <SelectItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            class="cursor-pointer rounded px-2 py-1 text-sm outline-none data-highlighted:bg-zinc-100"
          >
            <SelectItemText>{{ option.label }}</SelectItemText>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
