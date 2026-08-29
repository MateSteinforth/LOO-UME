import type { Plugin } from "vite";
import {
  createEditorPipelineHandler,
  type EditorPipelineHandler,
} from "./editor-pipeline-handler.ts";
import { createEsp32DeviceHandler } from "./esp32-device-handler.ts";
import { createProjectLibraryHandler } from "./project-library-handler.ts";

/** Local-only Vite adapter for the shared bounded editor pipeline handler. */
export function editorPipelinePlugin(): Plugin {
  let handler: Promise<EditorPipelineHandler> | undefined;
  return {
    name: "editor-sculpture-pipeline",
    configureServer(server) {
      handler = createEditorPipelineHandler({ rootDirectory: process.cwd() });
      const deviceHandler = createEsp32DeviceHandler();
      const projectLibraryHandler = createProjectLibraryHandler({
        rootDirectory: process.cwd(),
        allowNonLoopbackHost: process.env.LOO_UME_PROJECT_LIBRARY_LAN === "1",
      });
      server.middlewares.use(async (request, response, next) => {
        try {
          if (await projectLibraryHandler.handle(request, response)) return;
          if (await deviceHandler.handle(request, response)) return;
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
