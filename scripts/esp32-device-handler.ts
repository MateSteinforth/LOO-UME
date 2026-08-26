import type { IncomingMessage, ServerResponse } from "node:http";
import { lookup } from "node:dns/promises";
import { createSocket } from "node:dgram";
import { isLoopbackHost } from "./editor-pipeline-handler.ts";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const RESOLVE_TIMEOUT_MS = 2_000;
const UPSTREAM_TIMEOUT_MS = 8_000;
const DDP_PORT = 4048;
const MAX_DDP_PIXEL_BYTES = 2_624 * 3;
const DDP_CHANNELS_PER_PACKET = 1_440;
const ALLOWED_REQUESTS = new Set([
  "GET /json/info",
  "GET /json/cfg",
  "POST /json/cfg",
  "GET /json/state",
  "POST /json/state",
  "GET /json/eff",
  "GET /json/pal",
  "GET /presets.json",
  "GET /reset",
  "POST /upload",
  "GET /edit?func=edit&path=/ledmap.json",
]);

export interface Esp32DeviceHandler {
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
}

type SendDdp = (address: string, bytes: Uint8Array) => Promise<void>;

export function createDdpPacket(
  pixels: Uint8Array,
  sequence: number,
  channelOffset = 0,
  push = true,
): Uint8Array {
  if (
    pixels.byteLength < 3 ||
    pixels.byteLength > DDP_CHANNELS_PER_PACKET ||
    pixels.byteLength % 3 !== 0
  ) {
    throw new Error("A DDP packet requires from 1 through 480 RGB pixels.");
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 15) {
    throw new Error("The DDP sequence must be from 1 through 15.");
  }
  if (!Number.isInteger(channelOffset) || channelOffset < 0 || channelOffset > 0xffffffff) {
    throw new Error("The DDP channel offset is invalid.");
  }
  const packet = new Uint8Array(10 + pixels.byteLength);
  packet.set([
    push ? 0x41 : 0x40, sequence, 0x0b, 0x01,
    channelOffset >>> 24,
    channelOffset >>> 16,
    channelOffset >>> 8,
    channelOffset,
    pixels.byteLength >> 8, pixels.byteLength & 0xff,
  ]);
  packet.set(pixels, 10);
  return packet;
}

export function createDdpPackets(
  pixels: Uint8Array,
  firstSequence: number,
): Uint8Array[] {
  if (
    pixels.byteLength < 3 ||
    pixels.byteLength > MAX_DDP_PIXEL_BYTES ||
    pixels.byteLength % 3 !== 0
  ) {
    throw new Error("The DDP preview requires from 1 through 2,624 RGB pixels.");
  }
  const packets: Uint8Array[] = [];
  for (let offset = 0; offset < pixels.byteLength; offset += DDP_CHANNELS_PER_PACKET) {
    const packetIndex = packets.length;
    const end = Math.min(offset + DDP_CHANNELS_PER_PACKET, pixels.byteLength);
    packets.push(createDdpPacket(
      pixels.slice(offset, end),
      (firstSequence - 1 + packetIndex) % 15 + 1,
      offset,
      end === pixels.byteLength,
    ));
  }
  return packets;
}

const sendDdp: SendDdp = (address, bytes) =>
  new Promise((resolvePromise, reject) => {
    const socket = createSocket("udp4");
    let settled = false;
    const finish = (error?: Error | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolvePromise();
    };
    const timer = setTimeout(
      () => finish(new Error("The WLED DDP send timed out.")),
      1_000,
    );
    socket.once("error", finish);
    socket.send(bytes, DDP_PORT, address, finish);
  });

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
  sendRealtime: SendDdp = sendDdp,
): Esp32DeviceHandler {
  let ddpSequence = 1;
  return {
    async handle(request, response) {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");
      if (
        requestUrl.pathname !== "/api/esp32-device" &&
        requestUrl.pathname !== "/api/esp32-frame"
      ) return false;
      if (!isLoopbackHost(request.headers.host)) {
        sendJson(response, 403, { error: "ESP32 access accepts only a loopback Host." });
        return true;
      }
      if (request.headers["x-loo-ume-esp32"] !== "1") {
        sendJson(response, 403, { error: "ESP32 access requires the editor authorization header." });
        return true;
      }
      if (requestUrl.pathname === "/api/esp32-frame") {
        const address = requestUrl.searchParams.get("address") ?? "";
        if (
          request.method !== "POST" ||
          !privateIpv4(address) ||
          request.headers["content-type"] !== "application/octet-stream"
        ) {
          sendJson(response, 400, { error: "The ESP32 realtime request is not allowed." });
          return true;
        }
        try {
          const body = await requestBody(request);
          const packets = createDdpPackets(
            Uint8Array.from(body ?? Buffer.alloc(0)),
            ddpSequence,
          );
          ddpSequence = (ddpSequence - 1 + packets.length) % 15 + 1;
          for (const packet of packets) await sendRealtime(address, packet);
          response.statusCode = 204;
          response.setHeader("Cache-Control", "no-store");
          response.end();
        } catch (error) {
          sendJson(response, 502, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
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
