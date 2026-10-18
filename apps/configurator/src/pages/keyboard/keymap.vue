<script setup lang="ts">
import { connectionType, session } from "../../keyboard.ts";

const { t } = useI18n();
</script>

<template>
  <dl class="grid w-fit grid-cols-2 gap-x-4 gap-y-1">
    <dt class="text-zinc-500">{{ t("firmware") }}</dt>
    <dd>{{ session?.firmware }}</dd>
    <dt class="text-zinc-500">{{ t("connection") }}</dt>
    <dd>{{ t(connectionType()) }}</dd>
  </dl>
</template>
