<script setup lang="ts">
import KeymapDrawing from "../../components/KeymapDrawing.vue";
import { device, session } from "../../keyboard.ts";
import { isDongle } from "../../webhid.ts";

const { t } = useI18n();
const layer = ref(0);
</script>

<template>
  <dl class="mb-4 grid w-fit grid-cols-2 gap-x-4 gap-y-1">
    <dt class="text-zinc-500">{{ t("keymap.firmware") }}</dt>
    <dd>{{ session?.firmware }}</dd>
    <dt class="text-zinc-500">{{ t("keymap.connection") }}</dt>
    <dd>
      {{
        device && isDongle(device)
          ? t("connection_type.dongle")
          : t("connection_type.cable")
      }}
    </dd>
  </dl>
  <UiTabs
    v-if="session"
    v-model="layer"
    :options="[
      { value: 0, label: t('keymap.layers.base') },
      { value: 1, label: t('keymap.layers.fn') },
      { value: 2, label: t('keymap.layers.layer', { n: 2 }) },
      { value: 3, label: t('keymap.layers.layer', { n: 3 }) },
    ]"
  >
    <template #default="{ value }">
      <KeymapDrawing
        :keymap="session.state.keymaps[value]"
        :knob="session.knobs[value]"
      />
    </template>
  </UiTabs>
</template>
