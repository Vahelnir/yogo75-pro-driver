<script setup lang="ts">
import {
  PopoverAnchor,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
} from "reka-ui";
import { PALETTE } from "../palette.ts";

/** Next to `anchor` while it is set: the bindings that can't be typed, the keyboard's macros last. */
defineProps<{ anchor?: Element; macros: number[] }>();
const emit = defineEmits<{ pick: [name: string] }>();

const { t } = useI18n();
</script>

<template>
  <PopoverRoot :open="anchor !== undefined">
    <PopoverAnchor :reference="anchor" />
    <PopoverPortal>
      <!-- shortcut: mouse only, as key capture swallows Tab and the arrows; revisit with keyboard navigation -->
      <PopoverContent
        data-palette
        side="bottom"
        align="start"
        :side-offset="4"
        :collision-padding="8"
        class="max-h-[60vh] w-96 overflow-y-auto rounded-md border border-zinc-200 bg-white p-2 text-sm shadow"
        @open-auto-focus.prevent
      >
        <section v-for="group in PALETTE" :key="group.label" class="mb-2">
          <h3 class="mb-1 text-xs font-medium text-zinc-500">
            {{ t(group.label) }}
          </h3>
          <div class="grid grid-cols-2 gap-1">
            <button
              v-for="entry in group.entries"
              :key="entry.name"
              type="button"
              class="flex flex-col items-start rounded px-2 py-1 text-left hover:bg-zinc-100"
              @click="emit('pick', entry.name)"
            >
              <span>{{ t(entry.label) }}</span>
              <span class="font-mono text-xs text-zinc-500">{{
                entry.name
              }}</span>
            </button>
          </div>
        </section>
        <section v-if="macros.length">
          <h3 class="mb-1 text-xs font-medium text-zinc-500">
            {{ t("palette.groups.macros") }}
          </h3>
          <div class="grid grid-cols-2 gap-1">
            <button
              v-for="n in macros"
              :key="n"
              type="button"
              class="flex flex-col items-start rounded px-2 py-1 text-left hover:bg-zinc-100"
              @click="emit('pick', `MACRO(${n})`)"
            >
              <span>{{ t("palette.macro", { n }) }}</span>
              <span class="font-mono text-xs text-zinc-500"
                >MACRO({{ n }})</span
              >
            </button>
          </div>
        </section>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
