import { createSocket, type Socket as UdpSocket } from "node:dgram";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isLoopbackHost } from "./editor-pipeline-handler.ts";
import {
  ArtNetFrameAssembler,
  type ArtNetFrame,
  type ArtNetFrameStatistics,
} from "./artnet-frame-assembler.ts";

const DEFAULT_ART_NET_PORT = 6454;
const STREAM_HEADER_BYTES = 28;
const STREAM_MAGIC = Uint8Array.from([0x4c, 0x55, 0x4d, 0x46]);

export interface ArtNetPreviewStatus {
  active: boolean;
  bindAddress: "127.0.0.1";
  port: number;
  pixelCount: number | null;
  startUniverse: number | null;
  endUniverse: number | null;
  mappingFingerprint: string | null;
  streamedFrames: number;
  backpressureDrops: number;
  lastFrameAt: number | null;
  assembler: ArtNetFrameStatistics | null;
}

export interface ArtNetPreviewHandler {
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
  status(): ArtNetPreviewStatus;
  close(): Promise<void>;
}

export interface ArtNetPreviewHandlerOptions {
  udpPort?: number;
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

function streamRecord(
  frame: ArtNetFrame,
  statistics: ArtNetFrameStatistics,
): Uint8Array {
  const record = new Uint8Array(STREAM_HEADER_BYTES + frame.pixels.byteLength);
  record.set(STREAM_MAGIC);
  const view = new DataView(record.buffer);
  view.setUint8(4, 1);
  view.setUint8(5, frame.sequence);
  view.setUint16(6, frame.universes.length, false);
  view.setUint32(8, statistics.completedFrames, false);
  view.setUint32(12, statistics.incompleteFrames, false);
  view.setUint32(16, statistics.packetsRejected, false);
  view.setUint32(20, statistics.duplicatePackets, false);
  view.setUint32(24, frame.pixels.byteLength, false);
  record.set(frame.pixels, STREAM_HEADER_BYTES);
  return record;
}

function listen(socket: UdpSocket, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    socket.once("error", onError);
    socket.bind(port, "127.0.0.1", () => {
      socket.off("error", onError);
      const address = socket.address();
      resolve(typeof address === "string" ? port : address.port);
    });
  });
}

export function createArtNetPreviewHandler(
  options: ArtNetPreviewHandlerOptions = {},
): ArtNetPreviewHandler {
  const configuredPort = options.udpPort ?? DEFAULT_ART_NET_PORT;
  if (!Number.isInteger(configuredPort) || configuredPort < 0 || configuredPort > 65_535) {
    throw new Error("Art-Net UDP port must be from 0 through 65535.");
  }
  let socket: UdpSocket | undefined;
  let response: ServerResponse | undefined;
  let assembler: ArtNetFrameAssembler | undefined;
  let expiryTimer: ReturnType<typeof setInterval> | undefined;
  let actualPort = configuredPort;
  let pixelCount: number | null = null;
  let startUniverse: number | null = null;
  let mappingFingerprint: string | null = null;
  let streamedFrames = 0;
  let backpressureDrops = 0;
  let lastFrameAt: number | null = null;
  let backpressured = false;

  const stop = async (): Promise<void> => {
    if (expiryTimer) clearInterval(expiryTimer);
    expiryTimer = undefined;
    const activeSocket = socket;
    socket = undefined;
    assembler = undefined;
    pixelCount = null;
    startUniverse = null;
    mappingFingerprint = null;
    backpressured = false;
    if (response && !response.writableEnded) response.end();
    response = undefined;
    if (activeSocket) {
      await new Promise<void>((resolve) => activeSocket.close(() => resolve()));
    }
  };

  const currentStatus = (): ArtNetPreviewStatus => ({
    active: socket !== undefined,
    bindAddress: "127.0.0.1",
    port: actualPort,
    pixelCount,
    startUniverse,
    endUniverse: assembler?.endUniverse ?? null,
    mappingFingerprint,
    streamedFrames,
    backpressureDrops,
    lastFrameAt,
    assembler: assembler?.statistics ?? null,
  });

  return {
    status: currentStatus,
    close: stop,
    async handle(request, serverResponse) {
      const requestUrl = new URL(request.url ?? "/", "http://localhost");
      if (!requestUrl.pathname.startsWith("/api/artnet-preview")) return false;
      if (!isLoopbackHost(request.headers.host)) {
        sendJson(serverResponse, 403, { error: "Art-Net preview accepts only a loopback Host." });
        return true;
      }
      if (requestUrl.pathname === "/api/artnet-preview/status") {
        if (request.method !== "GET") {
          sendJson(serverResponse, 405, { error: "Use GET for Art-Net preview status." });
        } else {
          sendJson(serverResponse, 200, currentStatus());
        }
        return true;
      }
      if (requestUrl.pathname !== "/api/artnet-preview/stream") return false;
      if (
        request.method !== "GET" ||
        request.headers["x-loo-ume-artnet-preview"] !== "1"
      ) {
        sendJson(serverResponse, 403, { error: "Art-Net preview stream authorization is missing." });
        return true;
      }
      if (socket) {
        sendJson(serverResponse, 409, { error: "An Art-Net preview stream is already active." });
        return true;
      }
      const requestedPixels = Number(requestUrl.searchParams.get("pixels"));
      const requestedUniverse = Number(requestUrl.searchParams.get("startUniverse") ?? "1");
      const requestedFingerprint = requestUrl.searchParams.get("fingerprint") ?? "";
      if (!/^[0-9a-f]{8}$/.test(requestedFingerprint)) {
        sendJson(serverResponse, 400, { error: "A valid mapping fingerprint is required." });
        return true;
      }
      let nextAssembler: ArtNetFrameAssembler;
      try {
        nextAssembler = new ArtNetFrameAssembler({
          pixelCount: requestedPixels,
          startUniverse: requestedUniverse,
        });
      } catch (error) {
        sendJson(serverResponse, 400, {
          error: error instanceof Error ? error.message : String(error),
        });
        return true;
      }
      const nextSocket = createSocket("udp4");
      try {
        actualPort = await listen(nextSocket, configuredPort);
      } catch (error) {
        nextSocket.close();
        sendJson(serverResponse, 409, {
          error: `Cannot open Art-Net UDP port ${configuredPort}: ${error instanceof Error ? error.message : String(error)}`,
        });
        return true;
      }
      socket = nextSocket;
      response = serverResponse;
      assembler = nextAssembler;
      pixelCount = requestedPixels;
      startUniverse = requestedUniverse;
      mappingFingerprint = requestedFingerprint;
      streamedFrames = 0;
      backpressureDrops = 0;
      lastFrameAt = null;
      serverResponse.statusCode = 200;
      serverResponse.setHeader("Content-Type", "application/octet-stream");
      serverResponse.setHeader("Cache-Control", "no-store");
      serverResponse.setHeader("X-Content-Type-Options", "nosniff");
      serverResponse.flushHeaders();
      serverResponse.on("drain", () => { backpressured = false; });
      serverResponse.once("close", () => { void stop(); });
      nextSocket.on("message", (packet, remote) => {
        const frame = nextAssembler.push(packet, remote.address);
        if (!frame) return;
        lastFrameAt = frame.receivedAt;
        if (backpressured || !response || response.writableEnded) {
          backpressureDrops += 1;
          return;
        }
        streamedFrames += 1;
        backpressured = !response.write(streamRecord(frame, nextAssembler.statistics));
      });
      expiryTimer = setInterval(() => nextAssembler.expire(Date.now()), 50);
      expiryTimer.unref?.();
      return true;
    },
  };
}
