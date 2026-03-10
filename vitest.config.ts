import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/components/**/*.test.ts"],
    restoreMocks: true,
    clearMocks: true,
  },
});
