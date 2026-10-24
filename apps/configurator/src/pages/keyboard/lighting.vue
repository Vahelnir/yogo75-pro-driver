<script setup lang="ts">
import { LIGHTING_MODES, MAX_SPEED, type KeyboardState } from "@yogo75/core";
import { session } from "../../keyboard.ts";
import {
  brightness,
  color,
  isLit,
  isRainbow,
  ledMode,
  lightingBrightness,
  lightingColor,
  lightingMode,
  lightingOn,
  lightingRainbow,
  lightingSpeed,
  speed,
} from "../../lighting.ts";

const { t } = useI18n();
const error = ref<string>();

// 0 (all off) is replaced by the switch; 254 (music sync) needs ATK's desktop app: both are only shown, disabled,
// while the keyboard holds them
const HIDDEN = [0, 254];

const modes = computed(() => {
  const held = session.value && ledMode(session.value.state.config);
  const names: Record<number, string> = {
    0: t("lighting.mode.all_off"),
    1: t("lighting.mode.rainbow_flow_1"),
    2: t("lighting.mode.color_breathing"),
    3: t("lighting.mode.monochrome_breath"),
    4: t("lighting.mode.rainbow"),
    5: t("lighting.mode.single_light_up"),
    6: t("lighting.mode.colorful_vortex_1"),
    7: t("lighting.mode.rainbow_flow_2"),
    8: t("lighting.mode.rainbow_flow_4"),
    9: t("lighting.mode.spectral_fluctuation_1"),
    10: t("lighting.mode.spectral_fluctuation_2"),
    11: t("lighting.mode.spectral_fluctuation_3"),
    12: t("lighting.mode.neon"),
    13: t("lighting.mode.cloud_burst"),
    14: t("lighting.mode.colorful_vortex_2"),
    15: t("lighting.mode.colorful_ribbon_fluttering_1"),
    16: t("lighting.mode.spectral_diffusion_1"),
    17: t("lighting.mode.rainbow_intersection"),
    18: t("lighting.mode.spectral_diffusion_2"),
    19: t("lighting.mode.rainbow_flow_3"),
    20: t("lighting.mode.dynamic_rainbow"),
    253: t("lighting.mode.custom"),
    254: t("lighting.mode.music_rhythm"),
  };
  return LIGHTING_MODES.filter(
    ({ mode }) => !HIDDEN.includes(mode) || mode === held,
  ).map(({ mode }) => ({
    value: String(mode),
    label: names[mode],
    disabled: HIDDEN.includes(mode),
  }));
});

const settings = computed(() => {
  const held = session.value && ledMode(session.value.state.config);
  return LIGHTING_MODES.find(({ mode }) => mode === held)?.settings ?? [];
});

// the colour has no visible effect while the rainbow is on, where the mode offers the rainbow
const showsColor = computed(
  () =>
    settings.value.includes("color") &&
    !(
      settings.value.includes("rainbow") &&
      session.value &&
      isRainbow(session.value.state.config)
    ),
);

async function write(recipe: (next: KeyboardState) => void) {
  error.value = undefined;
  try {
    await session.value?.update(recipe);
  } catch (err) {
    error.value = (err as Error).message;
  }
}
</script>

<template>
  <div v-if="session" class="flex flex-col items-start gap-3">
    <label class="flex items-center gap-4">
      {{ t("lighting.backlight") }}
      <UiSwitch
        :model-value="isLit(session.state.config)"
        @update:model-value="(on) => write(lightingOn(on))"
      />
    </label>
    <label class="flex items-center gap-4">
      {{ t("lighting.effect") }}
      <UiSelect
        :model-value="String(ledMode(session.state.config))"
        :options="modes"
        @update:model-value="(mode) => write(lightingMode(Number(mode)))"
      />
    </label>
    <div v-if="settings.includes('brightness')" class="flex items-center gap-4">
      {{ t("lighting.brightness") }}
      <UiSlider
        :value="brightness(session.state.config)"
        :min="0"
        :max="100"
        :label="t('lighting.brightness')"
        :commit="(percent) => write(lightingBrightness(percent))"
        #default="{ value }"
      >
        {{ t("lighting.percent", { percent: value }) }}
      </UiSlider>
    </div>
    <div v-if="settings.includes('speed')" class="flex items-center gap-4">
      {{ t("lighting.speed") }}
      <span class="text-sm text-zinc-500">{{ t("lighting.slow") }}</span>
      <UiSlider
        :value="speed(session.state.config)"
        :min="0"
        :max="MAX_SPEED"
        :label="t('lighting.speed')"
        :commit="(value) => write(lightingSpeed(value))"
      />
      <span class="text-sm text-zinc-500">{{ t("lighting.fast") }}</span>
    </div>
    <label v-if="settings.includes('rainbow')" class="flex items-center gap-4">
      {{ t("lighting.rainbow") }}
      <UiSwitch
        :model-value="isRainbow(session.state.config)"
        @update:model-value="(rainbow) => write(lightingRainbow(rainbow))"
      />
    </label>
    <div v-if="showsColor" class="flex items-center gap-4">
      {{ t("lighting.color") }}
      <UiColorPicker
        :value="color(session.state.config)"
        :label="t('lighting.color')"
        :commit="(picked) => write(lightingColor(picked))"
      />
    </div>
  </div>
  <p v-if="error" class="mt-4 text-red-700">
    {{ t("lighting.write_failed", { error }) }}
  </p>
</template>
