import { defineConfig } from "vitest/config";
import { swcPlugin } from "./vitest.config.js";

// Integration tests share one Postgres database — no parallel files.
export default defineConfig({
  plugins: [swcPlugin],
  test: {
    include: ["test/integration/**/*.test.ts"],
    fileParallelism: false,
    setupFiles: ["reflect-metadata"],
  },
});
