<script setup lang="ts">
import {
  TooltipArrow,
  TooltipContent,
  TooltipPortal,
  TooltipRoot,
  TooltipTrigger,
} from "reka-ui";
</script>

<template>
  <TooltipRoot>
    <TooltipTrigger as-child>
      <slot />
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent
        side="top"
        :side-offset="4"
        class="z-50 max-w-xs rounded-md bg-zinc-900 px-2 py-1 text-xs text-white shadow"
      >
        <slot name="content" />
        <TooltipArrow class="fill-zinc-900" />
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>
