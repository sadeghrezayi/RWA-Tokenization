import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC (not esbuild) so NestJS decorator metadata is emitted for DI in tests.
export const swcPlugin = swc.vite({
  jsc: {
    parser: { syntax: "typescript", decorators: true },
    transform: { legacyDecorator: true, decoratorMetadata: true },
    target: "es2022",
  },
  module: { type: "es6" },
});

export default defineConfig({
  plugins: [swcPlugin],
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test/integration/**"],
  },
});
