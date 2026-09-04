import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { isLoopbackHost } from "./editor-pipeline-handler.ts";

const ENDPOINT = "/api/esp32-reconnect-authorization";
const SCHEMA_VERSION = "1.0.0";

export interface Esp32ReconnectAuthorizationHandler {
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
  enabled(): Promise<boolean>;
}

interface Esp32ReconnectAuthorizationHandlerOptions {
  authorizationPath: string;
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

function requestOriginIsLocal(request: IncomingMessage): boolean {
  const host = request.headers.host;
  return typeof host === "string" && request.headers.origin === `http://${host}`;
}

function missingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function createEsp32ReconnectAuthorizationHandler(
  options: Esp32ReconnectAuthorizationHandlerOptions,
): Esp32ReconnectAuthorizationHandler {
  const authorizationPath = resolve(options.authorizationPath);

  const enabled = async (): Promise<boolean> => {
    let text: string;
    try {
      text = await readFile(authorizationPath, "utf8");
    } catch (error) {
      if (missingFile(error)) return false;
      throw error;
    }
    try {
      const value = JSON.parse(text) as { schemaVersion?: unknown; enabled?: unknown };
      return value.schemaVersion === SCHEMA_VERSION && value.enabled === true;
    } catch {
      return false;
    }
  };

  const enable = async (): Promise<void> => {
    await mkdir(dirname(authorizationPath), { recursive: true });
    const temporaryPath = `${authorizationPath}.${process.pid}.tmp`;
    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, enabled: true })}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      await rename(temporaryPath, authorizationPath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  };

  return {
    enabled,
    async handle(request, response) {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (pathname !== ENDPOINT) return false;
      if (!isLoopbackHost(request.headers.host)) {
        sendJson(response, 403, { error: "ESP32 reconnect authorization is loopback-only." });
        return true;
      }
      if (request.headers["x-loo-ume-esp32"] !== "1") {
        sendJson(response, 403, { error: "ESP32 reconnect authorization is missing." });
        return true;
      }
      if (request.method === "GET" || request.method === "HEAD") {
        const value = { schemaVersion: SCHEMA_VERSION, enabled: await enabled() };
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
        sendJson(response, 403, { error: "ESP32 reconnect authorization origin is not allowed." });
        return true;
      }
      await enable();
      sendJson(response, 200, { schemaVersion: SCHEMA_VERSION, enabled: true });
      return true;
    },
  };
}
