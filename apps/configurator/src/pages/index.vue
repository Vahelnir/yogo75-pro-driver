<script setup lang="ts">
import IconUsb from "~icons/lucide/usb";
import { asleep, connectTo, session } from "../keyboard.ts";
import { authorisedKeyboard, requestKeyboard } from "../webhid.ts";

const { t } = useI18n();
const router = useRouter();
const supported = "hid" in navigator;
const connecting = ref(false);
const error = ref<string>();

async function connectWith(find: () => Promise<HIDDevice | undefined>) {
  connecting.value = true;
  error.value = undefined;

  try {
    const hid = await find();
    if (hid) {
      await connectTo(hid);
      await router.push("/keyboard");
    }
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    connecting.value = false;
  }
}

onMounted(() => {
  if (supported && !session.value) {
    connectWith(authorisedKeyboard);
  }
});
</script>

<template>
  <div
    class="mx-auto flex max-w-md flex-col items-center gap-4 pt-16 text-center"
  >
    <p v-if="!supported">{{ t("unsupported") }}</p>
    <template v-else>
      <UiButton :disabled="connecting" @click="connectWith(requestKeyboard)">
        <IconUsb />
        {{ connecting ? t("connecting") : t("connect") }}
      </UiButton>
      <p v-if="asleep" class="text-amber-700">{{ t("asleep") }}</p>
      <p v-if="error" class="text-red-700">
        {{ t("connectFailed", { error }) }}
      </p>
    </template>
  </div>
</template>
