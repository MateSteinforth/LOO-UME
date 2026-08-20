import { defineConfig } from "vite";
import { editorPipelinePlugin } from "./scripts/editor-pipeline-plugin.ts";

export default defineConfig({
  root: "web",
  base: "./",
  plugins: [editorPipelinePlugin()],
  optimizeDeps: {
    exclude: ["manifold-3d"],
  },
  server: {
    host: "127.0.0.1",
    fs: {
      allow: [".."],
    },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
