<script setup lang="ts">
import IconLanguages from "~icons/lucide/languages";
import IconUnplug from "~icons/lucide/unplug";
import { TooltipProvider } from "reka-ui";
import { device, disconnect, forget, session } from "./keyboard.ts";

const { t, locale } = useI18n();
const router = useRouter();

useEventListener(
  globalThis.navigator?.hid,
  "disconnect",
  (e: HIDConnectionEvent) => {
    if (e.device === device.value) {
      forget();
      router.push("/");
    }
  },
);

async function leave() {
  await disconnect();
  await router.push("/");
}
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div class="min-h-screen bg-zinc-50 text-zinc-900">
      <header
        class="flex items-center justify-between border-b border-zinc-200 px-4 py-3"
      >
        <h1 class="font-semibold">{{ t("app.title") }}</h1>
        <UiButton v-if="session" class="ml-auto mr-4" @click="leave">
          <IconUnplug />
          {{ t("app.disconnect") }}
        </UiButton>
        <label class="flex items-center gap-2 text-sm">
          <IconLanguages :aria-label="t('app.language')" />
          <UiSelect
            v-model="locale"
            :options="[
              { value: 'en', label: 'English' },
              { value: 'fr', label: 'Français' },
            ]"
          />
        </label>
      </header>
      <main class="p-4">
        <RouterView />
      </main>
    </div>
  </TooltipProvider>
</template>
