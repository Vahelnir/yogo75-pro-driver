<script setup lang="ts">
import { device, session } from "../../keyboard.ts";
import { isDongle } from "../../webhid.ts";

const { t } = useI18n();
</script>

<template>
  <dl class="grid w-fit grid-cols-2 gap-x-4 gap-y-1">
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
</template>
