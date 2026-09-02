import type { IncomingMessage, ServerResponse } from "node:http";
import { isLoopbackHost } from "../scripts/editor-pipeline-handler.ts";
import type {
  ApplicationUpdateHandler,
  ApplicationUpdateStatus,
} from "../scripts/application-update-handler.ts";

export interface DesktopUpdateCheck {
  available: boolean;
  version: string;
}

export interface DesktopUpdater {
  readonly currentVersion: string;
  readonly enabled: boolean;
  check(): Promise<DesktopUpdateCheck>;
  download(): Promise<void>;
  install(): Promise<void>;
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

function requestOriginIsLocal(request: IncomingMessage): boolean {
  const host = request.headers.host;
  const origin = request.headers.origin;
  return typeof host === "string" && isLoopbackHost(host) && origin === `http://${host}`;
}

function conciseError(error: unknown): string {
  return error instanceof Error
    ? error.message.split("\n")[0]!.slice(0, 300)
    : "Desktop update failed.";
}

export function createDesktopUpdateHandler(
  updater: DesktopUpdater,
): ApplicationUpdateHandler {
  let applying = false;
  let statusRequest: Promise<ApplicationUpdateStatus> | undefined;

  const status = (): Promise<ApplicationUpdateStatus> => {
    if (!updater.enabled) {
      return Promise.resolve({
        schemaVersion: "1.0.0",
        currentCommit: updater.currentVersion,
        availableCommit: updater.currentVersion,
        updateAvailable: false,
        canApply: false,
        localChanges: false,
        message: "Desktop release updates require a signed packaged application.",
      });
    }
    if (!statusRequest) {
      statusRequest = updater.check().then((result) => ({
        schemaVersion: "1.0.0" as const,
        currentCommit: updater.currentVersion,
        availableCommit: result.version,
        updateAvailable: result.available,
        canApply: result.available,
        localChanges: false,
        message: result.available
          ? `LOO/UME ${result.version} is available from the verified desktop release channel.`
          : "LOO/UME is current.",
      })).catch((error) => ({
        schemaVersion: "1.0.0" as const,
        currentCommit: updater.currentVersion,
        availableCommit: null,
        updateAvailable: false,
        canApply: false,
        localChanges: false,
        message: conciseError(error),
      })).finally(() => {
        statusRequest = undefined;
      });
    }
    return statusRequest;
  };

  return {
    status,
    async handle(request, response) {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (pathname !== "/api/application-update") return false;
      if (!isLoopbackHost(request.headers.host)) {
        sendJson(response, 403, { error: "Application updates are loopback-only." });
        return true;
      }
      if (request.method === "GET" || request.method === "HEAD") {
        const value = await status();
        if (request.method === "HEAD") {
          response.statusCode = 200;
          response.setHeader("Cache-Control", "no-store");
          response.end();
        } else sendJson(response, 200, value);
        return true;
      }
      if (request.method !== "POST") {
        response.setHeader("Allow", "GET, HEAD, POST");
        sendJson(response, 405, { error: "Use GET, HEAD, or POST." });
        return true;
      }
      if (!requestOriginIsLocal(request)) {
        sendJson(response, 403, { error: "Application update origin is not allowed." });
        return true;
      }
      if (applying) {
        sendJson(response, 409, { error: "A LOO/UME update is already running." });
        return true;
      }
      const current = await status();
      if (!current.canApply) {
        sendJson(response, 409, { error: current.message });
        return true;
      }
      applying = true;
      try {
        await updater.download();
      } catch (error) {
        applying = false;
        sendJson(response, 409, { error: conciseError(error) });
        return true;
      }
      sendJson(response, 200, {
        ok: true,
        message: "LOO/UME desktop update verified. Restarting the application.",
      });
      setTimeout(() => {
        void updater.install().catch(() => {
          applying = false;
        });
      }, 100);
      return true;
    },
  };
}
