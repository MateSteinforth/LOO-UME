import { defineConfig } from "vitest/config";

const geometry = [
  "tests/*e2e.test.ts",
  "tests/panel-outline-boundary.test.ts",
  "tests/panel-closure-solids.test.ts",
  "tests/structural-solids.test.ts",
  "tests/structural-pipeline.test.ts",
  "tests/structural-artifacts.test.ts",
  "tests/generated-structural-assets.test.ts",
  "tests/kicad-diamond-panel-demo.test.ts",
  "tests/photo-wedge-panel-demo.test.ts",
];
const host = [
  "tests/*-handler.test.ts",
  "tests/local-editor-*.test.ts",
  "tests/looume-launcher.test.ts",
  "tests/bootstrap-*.test.ts",
  "tests/desktop-build-receipt.test.ts",
  "tests/electron-*.test.ts",
  "tests/verify-packaged-firmware.test.ts",
  "tests/esp32-setup.test.ts",
];

export default defineConfig({
  test: {
    root: ".",
    projects: [
      {
        test: {
          name: "fast",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: [...geometry, ...host],
        },
      },
      { test: { name: "geometry", environment: "node", include: geometry } },
      { test: { name: "host", environment: "node", include: host } },
    ],
  },
});
