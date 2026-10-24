<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from "reka-ui";

const model = defineModel<boolean>({ required: true });
</script>

<template>
  <SwitchRoot
    v-model="model"
    class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-zinc-300 transition-colors data-[state=checked]:bg-zinc-900 disabled:opacity-50"
  >
    <SwitchThumb
      class="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-5.5"
    />
  </SwitchRoot>
</template>
