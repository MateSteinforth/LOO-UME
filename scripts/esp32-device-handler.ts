import type { IncomingMessage, ServerResponse } from "node:http";
import { lookup } from "node:dns/promises";
import { isLoopbackHost } from "./editor-pipeline-handler.ts";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const RESOLVE_TIMEOUT_MS = 2_000;
const UPSTREAM_TIMEOUT_MS = 8_000;
const ALLOWED_REQUESTS = new Set([
  "GET /json/info",
  "GET /json/cfg",
  "POST /json/cfg",
  "GET /json/state",
  "POST /json/state",
  "GET /json/eff",
  "GET /json/pal",
  "GET /reset",
  "POST /upload",
  "GET /edit?func=edit&path=/ledmap.json",
]);

export interface Esp32DeviceHandler {
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
}

function privateIpv4(value: string): boolean {
  const octets = value.split(".").map(Number);
  return octets.length === 4 && octets.every((part) =>
    Number.isInteger(part) && part >= 0 && part <= 255
  ) && (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

export function esp32TargetUrl(
  address: string,
  targetPath: string,
  method: string,
): URL {
  if (
    (!privateIpv4(address) && address !== "loo-ume.local") ||
    !ALLOWED_REQUESTS.has(`${method} ${targetPath}`)
  ) {
    throw new Error("The ESP32 target or request is not allowed.");
  }
  return new URL(`http://${address}${targetPath}`);
}

type ResolveIpv4 = (hostname: string) => Promise<string[]>;

const resolveIpv4: ResolveIpv4 = async (hostname) =>
  (await lookup(hostname, { all: true, family: 4 })).map((entry) => entry.address);

export async function resolvedEsp32Target(
  address: string,
  targetPath: string,
  method: string,
  resolve: ResolveIpv4 = resolveIpv4,
  timeoutMs = RESOLVE_TIMEOUT_MS,
): Promise<URL> {
  const target = esp32TargetUrl(address, targetPath, method);
  if (address !== "loo-ume.local") return target;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    resolve(address),
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("The WLED mDNS lookup timed out.")),
        timeoutMs,
      );
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
  if (addresses.length === 0 || addresses.some((candidate) => !privateIpv4(candidate))) {
    throw new Error("The WLED mDNS name did not resolve only to private addresses.");
  }
  target.hostname = addresses[0]!;
  return target;
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

async function requestBody(request: IncomingMessage): Promise<Buffer | undefined> {
  if (request.method === "GET") return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > MAX_BODY_BYTES) throw new Error("ESP32 request body is too large.");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

async function responseBody(response: Response): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("ESP32 response body is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
}

export function createEsp32DeviceHandler(
  fetchImpl: typeof fetch = fetch,
  resolve: ResolveIpv4 = resolveIpv4,
  resolveTimeoutMs = RESOLVE_TIMEOUT_MS,
): Esp32DeviceHandler {
  return {
    async handle(request, response) {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");
      if (requestUrl.pathname !== "/api/esp32-device") return false;
      if (!isLoopbackHost(request.headers.host)) {
        sendJson(response, 403, { error: "ESP32 access accepts only a loopback Host." });
        return true;
      }
      if (request.headers["x-loo-ume-esp32"] !== "1") {
        sendJson(response, 403, { error: "ESP32 access requires the editor authorization header." });
        return true;
      }
      const address = requestUrl.searchParams.get("address") ?? "";
      const targetPath = requestUrl.searchParams.get("path") ?? "";
      const method = request.method ?? "GET";
      let target: URL;
      try {
        target = await resolvedEsp32Target(
          address,
          targetPath,
          method,
          resolve,
          resolveTimeoutMs,
        );
      } catch {
        sendJson(response, 400, { error: "The ESP32 target or request is not allowed." });
        return true;
      }
      try {
        const body = await requestBody(request);
        const upstreamBody = body
          ? Uint8Array.from(body).buffer as ArrayBuffer
          : undefined;
        const headers = new Headers();
        const contentType = request.headers["content-type"];
        if (typeof contentType === "string") headers.set("Content-Type", contentType);
        const upstream = await fetchImpl(target, {
          method,
          headers,
          body: upstreamBody,
          redirect: "error",
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });
        const bytes = await responseBody(upstream);
        response.statusCode = upstream.status;
        response.setHeader(
          "Content-Type",
          upstream.headers.get("content-type") ?? "application/octet-stream",
        );
        response.setHeader("Cache-Control", "no-store");
        response.end(bytes);
      } catch (error) {
        sendJson(response, 502, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    },
  };
}
