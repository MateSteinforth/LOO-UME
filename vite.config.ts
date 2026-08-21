import { defineConfig } from "vite";
import { editorPipelinePlugin } from "./scripts/editor-pipeline-plugin.ts";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: "web",
  base: "./",
  plugins: [editorPipelinePlugin()],
  server: {
    host: "127.0.0.1",
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./web/index.html", import.meta.url)),
        wiringManual: fileURLToPath(
          new URL("./web/wiring-manual.html", import.meta.url),
        ),
      },
    },
  },
});
