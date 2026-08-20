import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: ".",
    include: ["tests/**/*.test.ts"],
    exclude: [
      "tests/open-scad-*.test.ts",
      "tests/setup-openscad-*.test.ts",
    ],
    environment: "node",
  },
});
