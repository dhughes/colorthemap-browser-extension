import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so the WebExtension build plugin doesn't
// run during unit tests.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
