<script setup lang="ts">
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from "reka-ui";

defineProps<{ options: { value: number; label: string }[] }>();
const model = defineModel<number>();
</script>

<template>
  <TabsRoot v-model="model">
    <TabsList class="mb-4 flex gap-1 border-b border-zinc-200">
      <TabsTrigger
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        class="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-zinc-500 hover:text-zinc-900 data-[state=active]:border-zinc-900 data-[state=active]:text-zinc-900"
      >
        {{ option.label }}
      </TabsTrigger>
    </TabsList>
    <TabsContent
      v-for="option in options"
      :key="option.value"
      :value="option.value"
    >
      <slot :value="option.value" />
    </TabsContent>
  </TabsRoot>
</template>
