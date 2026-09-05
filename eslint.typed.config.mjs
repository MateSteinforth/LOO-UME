import { defineConfig } from "eslint/config";
import base from "./eslint.config.mjs";

export default defineConfig(base, {
  files: ["**/*.ts"],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/switch-exhaustiveness-check": "error",
  },
});
