import { defineConfig } from "vite";
import { editorPipelinePlugin } from "./scripts/editor-pipeline-plugin.ts";

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
  },
});
