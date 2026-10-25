<script setup lang="ts">
import IconDownload from "~icons/lucide/download";
import IconHistory from "~icons/lucide/history";
import IconUpload from "~icons/lucide/upload";
import { session } from "../keyboard.ts";
import { exportState, importState } from "../state-file.ts";

const { t } = useI18n();
const busy = ref(false);
const message = ref<{ error: boolean; text: string }>();
const picker = useTemplateRef("picker");

function download() {
  if (!session.value) {
    return;
  }

  const blob = new Blob([exportState(session.value)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "yogo75.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Runs a full write, then says whether the keyboard read back what was written. */
async function write(task: () => Promise<string[]>) {
  busy.value = true;
  message.value = undefined;
  try {
    const mismatches = await task();
    message.value = mismatches.length
      ? {
          error: true,
          text: t("state.mismatch", { resources: mismatches.join(", ") }),
        }
      : { error: false, text: t("state.done") };
  } catch (err) {
    message.value = {
      error: true,
      text: t("state.failed", { error: (err as Error).message }),
    };
  } finally {
    busy.value = false;
  }
}

function restore() {
  const current = session.value;
  if (current) {
    write(() => current.load(current.snapshot));
  }
}

async function upload() {
  const file = picker.value?.files?.[0];
  const current = session.value;
  if (!file || !current) {
    return;
  }

  picker.value!.value = "";
  const text = await file.text();
  write(() => importState(current, text));
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <UiButton :disabled="busy" @click="download">
      <IconDownload />
      {{ t("state.export") }}
    </UiButton>
    <UiButton :disabled="busy" @click="picker?.click()">
      <IconUpload />
      {{ t("state.import") }}
    </UiButton>
    <input
      ref="picker"
      type="file"
      accept=".json,application/json"
      class="hidden"
      @change="upload"
    />
    <UiButton :disabled="busy" @click="restore">
      <IconHistory />
      {{ t("state.restore") }}
    </UiButton>
    <p
      v-if="message"
      role="status"
      class="text-sm"
      :class="message.error ? 'text-red-700' : 'text-zinc-600'"
    >
      {{ message.text }}
    </p>
  </div>
</template>
