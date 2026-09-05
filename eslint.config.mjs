import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default defineConfig(
  {
    files: ["**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: {
      "preserve-caught-error": "off",
      "no-unassigned-vars": "off",
      "no-useless-escape": "off",
      "no-regex-spaces": "off",
      "no-control-regex": "off",
    },
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/.tools/**",
      "build/**",
      "dist/**",
      "electron-dist/**",
      "web/public/**",
      "artifacts/**",
      "release/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.base],
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "preserve-caught-error": "off",
      "no-unassigned-vars": "off",
      "no-useless-escape": "off",
      "no-regex-spaces": "off",
      "no-control-regex": "off",
    },
  },
  prettier,
);
