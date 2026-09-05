import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  isLoopbackHost,
  isSameOriginRequest,
} from "./editor-pipeline-handler.ts";

const ENDPOINT = "/api/wifi-credentials";
const MAX_REQUEST_BYTES = 2 * 1024;

export interface WifiCredentials {
  ssid: string;
  password: string;
}

export interface WifiCredentialsHandler {
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
}

interface WifiCredentialsHandlerOptions {
  credentialsPath: string;
  encrypt: (text: string) => string | Promise<string>;
  decrypt: (ciphertext: string) => string | Promise<string>;
}

class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
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

function missingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function hasAllowedOrigin(request: IncomingMessage): boolean {
  return request.headers.origin === undefined || isSameOriginRequest(request);
}

async function readRequestBytes(request: IncomingMessage): Promise<Uint8Array> {
  const declaredLength = request.headers["content-length"];
  if (typeof declaredLength === "string" && /^\d+$/.test(declaredLength)) {
    const declaredBytes = Number(declaredLength);
    if (
      !Number.isSafeInteger(declaredBytes) ||
      declaredBytes > MAX_REQUEST_BYTES
    ) {
      request.resume();
      throw new HttpError(413, "Credential input exceeds 2 KiB.");
    }
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      request.resume();
      throw new HttpError(413, "Credential input exceeds 2 KiB.");
    }
    chunks.push(buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function parseCredentials(bytes: Uint8Array): WifiCredentials {
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new HttpError(400, "Credentials must be valid JSON.");
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !("ssid" in value) ||
    !("password" in value) ||
    typeof value.ssid !== "string" ||
    typeof value.password !== "string"
  ) {
    throw new HttpError(400, "Credentials must contain ssid and password.");
  }
  const encoder = new TextEncoder();
  const ssidBytes = encoder.encode(value.ssid).byteLength;
  const passwordBytes = encoder.encode(value.password).byteLength;
  if (ssidBytes < 1 || ssidBytes > 32 || passwordBytes > 64) {
    throw new HttpError(400, "Credential values have invalid UTF-8 lengths.");
  }
  return { ssid: value.ssid, password: value.password };
}

export function createWifiCredentialsHandler(
  options: WifiCredentialsHandlerOptions,
): WifiCredentialsHandler {
  const credentialsPath = resolve(options.credentialsPath);
  let mutations = Promise.resolve();

  const readCredentials = async (): Promise<WifiCredentials | null> => {
    let ciphertext: string;
    try {
      ciphertext = await readFile(credentialsPath, "utf8");
    } catch (error) {
      if (missingFile(error)) return null;
      throw error;
    }
    try {
      const value = JSON.parse(await options.decrypt(ciphertext)) as unknown;
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      return parseCredentials(bytes);
    } catch {
      return null;
    }
  };

  const mutate = async (operation: () => Promise<void>): Promise<void> => {
    const next = mutations.then(operation, operation);
    mutations = next.catch(() => undefined);
    await next;
  };

  const saveCredentials = async (
    credentials: WifiCredentials,
  ): Promise<void> => {
    await mkdir(dirname(credentialsPath), { recursive: true });
    const temporaryPath = `${credentialsPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(
        temporaryPath,
        await options.encrypt(JSON.stringify(credentials)),
        {
          encoding: "utf8",
          mode: 0o600,
        },
      );
      await rename(temporaryPath, credentialsPath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  };

  return {
    async handle(request, response) {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (pathname !== ENDPOINT) return false;
      if (!isLoopbackHost(request.headers.host)) {
        sendJson(response, 403, {
          error: "Wi-Fi credentials are loopback-only.",
        });
        return true;
      }
      if (request.headers["x-loo-ume-esp32"] !== "1") {
        sendJson(response, 403, {
          error: "Wi-Fi credential authorization is missing.",
        });
        return true;
      }
      const isWrite = request.method === "PUT" || request.method === "DELETE";
      if (
        (isWrite && !isSameOriginRequest(request)) ||
        (!isWrite && !hasAllowedOrigin(request))
      ) {
        sendJson(response, 403, {
          error: "Wi-Fi credential origin is not allowed.",
        });
        return true;
      }
      if (request.method === "GET") {
        try {
          sendJson(response, 200, { credentials: await readCredentials() });
        } catch {
          sendJson(response, 500, {
            error: "Wi-Fi credentials are unavailable.",
          });
        }
        return true;
      }
      if (request.method === "PUT") {
        try {
          const contentType = request.headers["content-type"];
          if (
            typeof contentType !== "string" ||
            !contentType.toLowerCase().startsWith("application/json")
          ) {
            throw new HttpError(415, "Use Content-Type: application/json.");
          }
          const credentials = parseCredentials(await readRequestBytes(request));
          await mutate(() => saveCredentials(credentials));
          sendJson(response, 200, { credentials });
        } catch (error) {
          if (error instanceof HttpError)
            sendJson(response, error.statusCode, { error: error.message });
          else
            sendJson(response, 500, {
              error: "Wi-Fi credentials are unavailable.",
            });
        }
        return true;
      }
      if (request.method === "DELETE") {
        try {
          await mutate(async () => {
            await rm(credentialsPath, { force: true });
          });
          sendJson(response, 200, { credentials: null });
        } catch {
          sendJson(response, 500, {
            error: "Wi-Fi credentials are unavailable.",
          });
        }
        return true;
      }
      response.setHeader("Allow", "GET, PUT, DELETE");
      sendJson(response, 405, { error: "Use GET, PUT, or DELETE." });
      return true;
    },
  };
}
