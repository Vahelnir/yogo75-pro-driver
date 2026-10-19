import Icons from "unplugin-icons/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // palette.ts imports its icons as components
  plugins: [Icons({ compiler: "vue3" })],
  test: { include: ["test/**/*.test.ts"] },
});
