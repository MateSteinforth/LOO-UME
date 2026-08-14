import type { Plugin } from "vite";
import {
  createEditorPipelineHandler,
  type EditorPipelineHandler,
} from "./editor-pipeline-handler.ts";

/** Local-only Vite adapter for the shared bounded editor pipeline handler. */
export function editorPipelinePlugin(): Plugin {
  let handler: Promise<EditorPipelineHandler> | undefined;
  return {
    name: "editor-sculpture-pipeline",
    configureServer(server) {
      handler = createEditorPipelineHandler({ rootDirectory: process.cwd() });
      server.middlewares.use(async (request, response, next) => {
        try {
          if (!await (await handler!).handle(request, response)) next();
        } catch (error) {
          next(error instanceof Error ? error : new Error(String(error)));
        }
      });
      server.httpServer?.once("close", () => {
        void handler?.then((activeHandler) => activeHandler.close());
      });
    },
  };
}
