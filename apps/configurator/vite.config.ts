import VueI18n from "@intlify/unplugin-vue-i18n/vite";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Icons from "unplugin-icons/vite";
import Components from "unplugin-vue-components/vite";
import { defineConfig } from "vite";
import { VueRouterAutoImports } from "vue-router/unplugin";
import VueRouter from "vue-router/vite";

export default defineConfig({
  // `/` when self-hosted; GitHub Pages builds with BASE=/<repo>/
  base: process.env.BASE ?? "/",
  plugins: [
    VueRouter({ dts: "src/generated/typed-router.d.ts" }),
    vue(),
    AutoImport({
      imports: ["vue", VueRouterAutoImports, "vue-i18n", "@vueuse/core"],
      dts: "src/generated/auto-imports.d.ts",
    }),
    Components({
      dirs: ["src/components/ui"],
      dts: "src/generated/components.d.ts",
    }),
    Icons({ compiler: "vue3" }),
    VueI18n({ include: new URL("src/locales/**", import.meta.url).pathname }),
    tailwindcss(),
  ],
});
