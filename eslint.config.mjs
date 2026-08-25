// Root ESLint flat config. Type-aware rules run per-package via projectService,
// which picks up each workspace package's own tsconfig.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/",
      "**/dist/",
      "**/build/",
      "**/coverage/",
      "**/.next/",
      "**/next-env.d.ts",
      "contracts/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // NestJS modules are decorator-only classes by design.
      "@typescript-eslint/no-extraneous-class": ["error", { allowWithDecorator: true }],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // CI-support scripts run under Node, outside any workspace package, so the
    // browser-ish default globals do not describe them. Same standalone-script
    // convention as .claude/hooks: runnable and checkable on their own.
    files: [".github/scripts/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly" },
    },
    rules: {
      // Stripping ANSI colour REQUIRES matching the escape byte; the rule
      // exists to catch control characters that arrived by accident.
      "no-control-regex": "off",
    },
  },
  prettier,
);
