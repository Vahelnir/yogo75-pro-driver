<script setup lang="ts">
import { baseForFirmware, BASES } from "@yogo75/core";
import IconDownload from "~icons/lucide/download";
import IconHistory from "~icons/lucide/history";
import IconUpload from "~icons/lucide/upload";
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from "reka-ui";
import { session } from "../keyboard.ts";
import { exportState, parseImport, type Import } from "../state-file.ts";

const { t } = useI18n();
const busy = ref(false);
const message = ref<{ error: boolean; text: string }>();
const picker = useTemplateRef("picker");
const full = ref(false);
/** The file picked for import, parsed or with its errors, while the dialog asks for confirmation. */
const pending = ref<{ file: string; parsed?: Import; errors?: string }>();

function download() {
  if (!session.value) {
    return;
  }

  const blob = new Blob([exportState(session.value, { full: full.value })], {
    type: "application/yaml",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "yogo75.yaml";
  link.click();
  URL.revokeObjectURL(link.href);

  const { firmware } = session.value;
  message.value = baseForFirmware(firmware)
    ? undefined
    : {
        error: false,
        text: t("state.no_base", { firmware, base: BASES.at(-1)!.name }),
      };
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
  try {
    pending.value = {
      file: file.name,
      parsed: parseImport(current, file.name, text),
    };
  } catch (err) {
    pending.value = { file: file.name, errors: (err as Error).message };
  }
}

function confirm() {
  const current = session.value;
  const parsed = pending.value?.parsed;
  pending.value = undefined;
  if (current && parsed) {
    write(() => current.load(parsed.state));
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <UiButton :disabled="busy" @click="download">
      <IconDownload />
      {{ t("state.export") }}
    </UiButton>
    <label class="flex items-center gap-1 text-sm">
      <input v-model="full" type="checkbox" />
      {{ t("state.full_export") }}
    </label>
    <UiButton :disabled="busy" @click="picker?.click()">
      <IconUpload />
      {{ t("state.import") }}
    </UiButton>
    <input
      ref="picker"
      type="file"
      accept=".yaml,.yml,.json,application/json"
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

    <DialogRoot
      :open="!!pending"
      @update:open="(open) => !open && (pending = undefined)"
    >
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 z-40 bg-black/30" />
        <DialogContent
          class="fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[90vw] max-w-lg -translate-1/2 flex-col gap-3 rounded-md bg-white p-4 shadow-lg"
        >
          <DialogTitle class="font-medium">
            {{ t("state.import_title", { file: pending?.file }) }}
          </DialogTitle>
          <template v-if="pending?.errors">
            <DialogDescription class="text-sm text-red-700">
              {{ t("state.import_invalid") }}
            </DialogDescription>
            <pre
              class="overflow-auto rounded bg-zinc-100 p-2 text-xs whitespace-pre-wrap"
              >{{ pending.errors }}</pre>
          </template>
          <DialogDescription
            v-else-if="pending?.parsed?.changes.length"
            class="text-sm"
          >
            {{
              t("state.import_changes", {
                resources: pending.parsed.changes.join(", "),
              })
            }}
          </DialogDescription>
          <DialogDescription v-else class="text-sm">
            {{ t("state.import_unchanged") }}
          </DialogDescription>
          <div class="flex justify-end gap-2">
            <DialogClose
              class="rounded-md px-4 py-2 text-sm hover:bg-zinc-100"
              >{{ t("state.cancel") }}</DialogClose
            >
            <UiButton v-if="pending?.parsed" @click="confirm">
              {{ t("state.write") }}
            </UiButton>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>
