import { defineConfig } from "vitest/config";
import { swcPlugin } from "./vitest.config.js";

// Integration tests share one Postgres database — no parallel files — and it
// is a database of their OWN (see globalSetup), never the developer's.
// Chain-heavy setups (deploying the full ERC-3643 suite + ONCHAINID identities)
// can exceed the 10s vitest defaults when anvil is warming up or busy, so the
// hook/test timeouts are raised to remove that source of flakiness.
export default defineConfig({
  plugins: [swcPlugin],
  test: {
    include: ["test/integration/**/*.test.ts"],
    globalSetup: ["./test/integration/use-a-separate-database.ts"],
    fileParallelism: false,
    setupFiles: ["reflect-metadata"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
