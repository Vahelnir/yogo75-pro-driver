<script setup lang="ts">
import IconKeyboard from "~icons/lucide/keyboard";
import IconUsb from "~icons/lucide/usb";
import { asleep, connectTo, device, session } from "../keyboard.ts";
import { authorisedKeyboards, isDongle, requestKeyboard } from "../webhid.ts";

const { t } = useI18n();
const router = useRouter();
const supported = "hid" in navigator;
const keyboards = shallowRef<HIDDevice[]>([]);
const connecting = ref(false);
const error = ref<string>();

async function refresh() {
  keyboards.value = await authorisedKeyboards();
}

async function connectWith(find: () => Promise<HIDDevice | undefined>) {
  connecting.value = true;
  error.value = undefined;

  try {
    const hid = await find();
    // the keyboard already connected keeps its session
    if (hid && !(hid === device.value && session.value)) {
      await connectTo(hid);
    }
    if (hid) {
      await router.push("/keyboard");
    }
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    connecting.value = false;
    await refresh();
  }
}

useEventListener(globalThis.navigator?.hid, ["connect", "disconnect"], refresh);
onMounted(() => {
  if (supported) {
    refresh();
  }
});
</script>

<template>
  <div class="mx-auto flex max-w-md flex-col gap-4 pt-16">
    <p v-if="!supported" class="text-center">{{ t("unsupported") }}</p>
    <template v-else>
      <section v-if="keyboards.length" class="flex flex-col gap-2">
        <h2 class="text-sm text-zinc-500">{{ t("authorised") }}</h2>
        <button
          v-for="hid in keyboards"
          :key="hid.productId"
          :disabled="connecting"
          class="flex items-center gap-3 rounded-md border border-zinc-300 bg-white px-4 py-3 text-left hover:border-zinc-500 disabled:opacity-50"
          @click="connectWith(async () => hid)"
        >
          <IconKeyboard />
          <span class="flex-1">
            {{ hid.productName }}
            <span class="block text-sm text-zinc-500">
              {{ t(isDongle(hid) ? "dongle" : "cable") }}
            </span>
          </span>
          <span v-if="hid === device && session" class="text-sm text-green-700">
            {{ t("connected") }}
          </span>
        </button>
      </section>
      <UiButton
        :disabled="connecting"
        class="self-center"
        @click="connectWith(requestKeyboard)"
      >
        <IconUsb />
        {{ connecting ? t("connecting") : t("addKeyboard") }}
      </UiButton>
      <p v-if="asleep" class="text-center text-amber-700">{{ t("asleep") }}</p>
      <p v-if="error" class="text-center text-red-700">
        {{ t("connectFailed", { error }) }}
      </p>
    </template>
  </div>
</template>
