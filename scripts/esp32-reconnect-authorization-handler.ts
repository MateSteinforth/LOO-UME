import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { readProjectPackageSummary } from "../web/src/ProjectPackage.ts";
import { PORTABLE_ZIP_RESOURCE_LIMITS } from "../web/src/ZipResourceLimits.ts";
import { isLoopbackHost } from "./editor-pipeline-handler.ts";

const ENDPOINT = "/api/esp32-reconnect-authorization";
const PROJECT_ENDPOINT = "/api/esp32-reconnect-project";
const SCHEMA_VERSION = "1.0.0";

export interface Esp32ReconnectAuthorizationHandler {
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
  enabled(): Promise<boolean>;
}

interface Esp32ReconnectAuthorizationHandlerOptions {
  authorizationPath: string;
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  value: unknown,
): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

function requestOriginIsLocal(request: IncomingMessage): boolean {
  const host = request.headers.host;
  return (
    typeof host === "string" && request.headers.origin === `http://${host}`
  );
}

function missingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

class SnapshotRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readRequestBytes(request: IncomingMessage): Promise<Uint8Array> {
  const declaredLength = request.headers["content-length"];
  if (typeof declaredLength === "string" && /^\d+$/.test(declaredLength)) {
    const size = Number(declaredLength);
    if (
      !Number.isSafeInteger(size) ||
      size > PORTABLE_ZIP_RESOURCE_LIMITS.maximumArchiveBytes
    ) {
      request.resume();
      throw new SnapshotRequestError(413, "Project snapshot is too large.");
    }
  } else if (declaredLength !== undefined) {
    request.resume();
    throw new SnapshotRequestError(
      400,
      "Project snapshot Content-Length is invalid.",
    );
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > PORTABLE_ZIP_RESOURCE_LIMITS.maximumArchiveBytes) {
      request.resume();
      throw new SnapshotRequestError(413, "Project snapshot is too large.");
    }
    chunks.push(bytes);
  }
  return new Uint8Array(Buffer.concat(chunks, size));
}

export function createEsp32ReconnectAuthorizationHandler(
  options: Esp32ReconnectAuthorizationHandlerOptions,
): Esp32ReconnectAuthorizationHandler {
  const authorizationPath = resolve(options.authorizationPath);
  const snapshotPath = `${authorizationPath}.project.loo.zip`;

  const enabled = async (): Promise<boolean> => {
    let text: string;
    try {
      text = await readFile(authorizationPath, "utf8");
    } catch (error) {
      if (missingFile(error)) return false;
      throw error;
    }
    try {
      const value = JSON.parse(text) as {
        schemaVersion?: unknown;
        enabled?: unknown;
      };
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

  const saveSnapshot = async (bytes: Uint8Array): Promise<void> => {
    await mkdir(dirname(snapshotPath), { recursive: true });
    const temporaryPath = `${snapshotPath}.${randomUUID()}.tmp`;
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      await rename(temporaryPath, snapshotPath);
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  };

  return {
    enabled,
    async handle(request, response) {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (pathname !== ENDPOINT && pathname !== PROJECT_ENDPOINT) return false;
      if (!isLoopbackHost(request.headers.host)) {
        sendJson(response, 403, {
          error: "ESP32 reconnect authorization is loopback-only.",
        });
        return true;
      }
      if (request.headers["x-loo-ume-esp32"] !== "1") {
        sendJson(response, 403, {
          error: "ESP32 reconnect authorization is missing.",
        });
        return true;
      }
      if (pathname === PROJECT_ENDPOINT) {
        if (request.method === "GET") {
          let bytes: Uint8Array;
          try {
            bytes = new Uint8Array(await readFile(snapshotPath));
          } catch (error) {
            if (missingFile(error)) {
              sendJson(response, 404, {
                error: "ESP32 startup project snapshot was not found.",
              });
              return true;
            }
            throw error;
          }
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/zip");
          response.setHeader("Content-Length", String(bytes.byteLength));
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("X-Content-Type-Options", "nosniff");
          response.end(bytes);
          return true;
        }
        if (request.method !== "PUT") {
          response.setHeader("Allow", "GET, PUT");
          sendJson(response, 405, { error: "Use GET or PUT." });
          return true;
        }
        if (!requestOriginIsLocal(request)) {
          sendJson(response, 403, {
            error: "ESP32 startup project snapshot origin is not allowed.",
          });
          return true;
        }
        if (
          request.headers["content-type"]?.split(";", 1)[0] !==
          "application/zip"
        ) {
          sendJson(response, 415, {
            error: "Save a project snapshot as application/zip.",
          });
          return true;
        }
        try {
          const bytes = await readRequestBytes(request);
          readProjectPackageSummary(bytes);
          await saveSnapshot(bytes);
        } catch (error) {
          if (error instanceof SnapshotRequestError) {
            sendJson(response, error.status, { error: error.message });
          } else {
            sendJson(response, 400, {
              error: `Project snapshot is invalid: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
          return true;
        }
        response.statusCode = 204;
        response.setHeader("Cache-Control", "no-store");
        response.end();
        return true;
      }
      if (request.method === "GET" || request.method === "HEAD") {
        const value = {
          schemaVersion: SCHEMA_VERSION,
          enabled: await enabled(),
        };
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
        sendJson(response, 403, {
          error: "ESP32 reconnect authorization origin is not allowed.",
        });
        return true;
      }
      await enable();
      sendJson(response, 200, { schemaVersion: SCHEMA_VERSION, enabled: true });
      return true;
    },
  };
}
