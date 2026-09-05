import type { Plugin } from "vite";
import {
  createEditorPipelineHandler,
  type EditorPipelineHandler,
} from "./editor-pipeline-handler.ts";
import { createEsp32DeviceHandler } from "./esp32-device-handler.ts";
import { createProjectLibraryHandler } from "./project-library-handler.ts";
import { createArtNetPreviewHandler } from "./artnet-preview-handler.ts";
import { createDdpPreviewHandler } from "./ddp-preview-handler.ts";
import { createApplicationUpdateHandler } from "./application-update-handler.ts";

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
      const artNetPreviewHandler = createArtNetPreviewHandler();
      const ddpPreviewHandler = createDdpPreviewHandler();
      const applicationUpdateHandler = createApplicationUpdateHandler({
        rootDirectory: process.cwd(),
      });
      server.middlewares.use((request, response, next) => {
        void (async () => {
          if (await projectLibraryHandler.handle(request, response)) return;
          if (await deviceHandler.handle(request, response)) return;
          if (await artNetPreviewHandler.handle(request, response)) return;
          if (await ddpPreviewHandler.handle(request, response)) return;
          if (await applicationUpdateHandler.handle(request, response)) return;
          if (!(await (await handler!).handle(request, response))) next();
        })().catch((error: unknown) => {
          next(error instanceof Error ? error : new Error(String(error)));
        });
      });
      server.httpServer?.once("close", () => {
        void handler?.then((activeHandler) => activeHandler.close());
        deviceHandler.close();
        void artNetPreviewHandler.close();
        void ddpPreviewHandler.close();
      });
    },
  };
}
