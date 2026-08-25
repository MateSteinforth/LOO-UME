import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { isLoopbackHost } from "./editor-pipeline-handler.ts";

interface FullFlashArtifact {
  name: string;
  byteLength: number;
  sha256: string;
  flashAddress: number;
  eraseAll: boolean;
  flashMode: "dio";
  flashFrequency: "40m";
  flashSize: "4MB";
}

interface FirmwareReceipt {
  schemaVersion: string;
  status: string;
  target: {
    board: string;
    module: string;
    platformioEnvironment: string;
    wledCommit: string;
  };
  fullFlashArtifact: FullFlashArtifact;
}

export interface Esp32FirmwareHandlerOptions {
  rootDirectory?: string;
  receiptPath?: string;
  firmwarePath?: string;
}

export interface Esp32FirmwareHandler {
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

function parseReceipt(input: unknown): FirmwareReceipt {
  if (typeof input !== "object" || input === null) {
    throw new Error("The firmware build receipt is invalid.");
  }
  const receipt = input as Partial<FirmwareReceipt>;
  const artifact = receipt.fullFlashArtifact;
  if (
    receipt.schemaVersion !== "1.1.0" ||
    receipt.status !== "built-not-flashed" ||
    receipt.target?.board !== "ESP32-DevKitC V4" ||
    receipt.target.module !== "ESP32-WROOM-32E-N4" ||
    receipt.target.platformioEnvironment !== "orbital_esp32dev" ||
    !/^[0-9a-f]{40}$/.test(receipt.target.wledCommit) ||
    artifact?.name !== "wled-orbital-esp32dev-full-flash.bin" ||
    !Number.isSafeInteger(artifact.byteLength) ||
    artifact.byteLength <= 0 ||
    !/^[0-9a-f]{64}$/.test(artifact.sha256) ||
    artifact.flashAddress !== 0 ||
    artifact.eraseAll !== true ||
    artifact.flashMode !== "dio" ||
    artifact.flashFrequency !== "40m" ||
    artifact.flashSize !== "4MB"
  ) {
    throw new Error("The firmware build receipt is invalid.");
  }
  return receipt as FirmwareReceipt;
}

export async function loadVerifiedEsp32Firmware(
  receiptPath: string,
  firmwarePath: string,
): Promise<{ receipt: FirmwareReceipt; bytes: Buffer }> {
  const [receiptBytes, bytes] = await Promise.all([
    readFile(receiptPath, "utf8"),
    readFile(firmwarePath),
  ]);
  const receipt = parseReceipt(JSON.parse(receiptBytes) as unknown);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (
    bytes.byteLength !== receipt.fullFlashArtifact.byteLength ||
    digest !== receipt.fullFlashArtifact.sha256
  ) {
    throw new Error("The local ESP32 image does not match its build receipt.");
  }
  return { receipt, bytes };
}

export function createEsp32FirmwareHandler(
  options: Esp32FirmwareHandlerOptions = {},
): Esp32FirmwareHandler {
  const rootDirectory = resolve(options.rootDirectory ?? process.cwd());
  const receiptPath = resolve(
    options.receiptPath ?? resolve(rootDirectory, "firmware/build-receipt.json"),
  );
  const firmwarePath = resolve(
    options.firmwarePath ??
      resolve(rootDirectory, "build/firmware/wled-orbital-esp32dev-full-flash.bin"),
  );

  return {
    async handle(request, response) {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (
        pathname !== "/api/esp32-firmware-status" &&
        pathname !== "/api/esp32-firmware"
      ) return false;
      if (!isLoopbackHost(request.headers.host)) {
        sendJson(response, 403, { error: "ESP32 setup accepts only a loopback Host." });
        return true;
      }
      if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        sendJson(response, 405, { error: "Use GET." });
        return true;
      }
      try {
        const verified = await loadVerifiedEsp32Firmware(receiptPath, firmwarePath);
        const status = {
          available: true,
          target: verified.receipt.target,
          artifact: verified.receipt.fullFlashArtifact,
        };
        if (pathname.endsWith("-status")) {
          sendJson(response, 200, status);
        } else {
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/octet-stream");
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("Content-Length", String(verified.bytes.byteLength));
          response.setHeader("X-Firmware-Sha256", verified.receipt.fullFlashArtifact.sha256);
          response.end(verified.bytes);
        }
      } catch (error) {
        sendJson(response, 503, {
          available: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    },
  };
}
