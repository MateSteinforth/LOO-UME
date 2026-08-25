import { sha256Text } from "../sculpture/GeneratedMechanics.ts";
import type { HardwareMappingContract } from "../../web/src/HardwareMapping.ts";

export const WLED_DIAGNOSTIC_REQUEST_LIMIT_BYTES = 1_024;
export const WLED_DIAGNOSTIC_BRIGHTNESS = 32;

export type DiagnosticRgbChannel = "red" | "green" | "blue";

export interface WledDiagnosticFrame {
  sequence: number;
  outputIndex: number;
  gpio: number;
  panelId: string;
  panelPixelX: number;
  panelPixelY: number;
  logicalIndex: number;
  physicalIndex: number;
  rgbChannel: DiagnosticRgbChannel;
  requestBytes: string;
}

export interface WledDiagnosticPlan {
  schemaVersion: "1.0.0";
  status: "unobserved-hardware-diagnostic";
  deploymentIdentity: string;
  mappingFingerprint: string;
  mappingFingerprintVersion: string;
  ledCount: number;
  brightness: number;
  requestLimitBytes: number;
  resetRequestBytes: string;
  frames: WledDiagnosticFrame[];
  planFingerprint: string;
}

const CHANNELS = [
  { id: "red", rgb: [32, 0, 0] },
  { id: "green", rgb: [0, 32, 0] },
  { id: "blue", rgb: [0, 0, 32] },
] as const;

function jsonRequest(value: unknown): string {
  return JSON.stringify(value);
}

function stateRequest(
  ledCount: number,
  individual: Array<number | [number, number, number]>,
): string {
  return jsonRequest({
    on: true,
    bri: WLED_DIAGNOSTIC_BRIGHTNESS,
    tt: 0,
    seg: {
      id: 0,
      start: 0,
      stop: ledCount,
      fx: 0,
      i: individual,
    },
  });
}

function requestByteLength(requestBytes: string): number {
  return new TextEncoder().encode(requestBytes).byteLength;
}

function assertRequestSize(requestBytes: string, maximumBytes: number): void {
  const byteLength = requestByteLength(requestBytes);
  if (byteLength > maximumBytes) {
    throw new Error(
      `WLED diagnostic request is ${byteLength} bytes; limit is ${maximumBytes}.`,
    );
  }
}

/**
 * Creates one low-brightness, one-pixel frame for every logical address and
 * RGB channel. Each record binds the visible pixel to output, panel, local,
 * logical, and physical identities from the guarded mapping contract.
 */
export function createWledDiagnosticPlan(
  contract: HardwareMappingContract,
  deploymentIdentity: string,
): WledDiagnosticPlan {
  if (!contract.readiness.mappingReady) {
    throw new Error("Hardware diagnostics require a current mapping-ready contract.");
  }
  if (!/^[0-9a-f]{64}$/.test(deploymentIdentity)) {
    throw new Error("Hardware diagnostics require the exact deployment identity.");
  }
  const entries = [...contract.mapping.entries].sort(
    (left, right) => left.logicalIndex - right.logicalIndex,
  );
  if (entries.length !== contract.ledmap.map.length) {
    throw new Error("Hardware diagnostics require complete mapping entries.");
  }
  const resetRequestBytes = stateRequest(entries.length, [0, entries.length, [0, 0, 0]]);
  assertRequestSize(resetRequestBytes, WLED_DIAGNOSTIC_REQUEST_LIMIT_BYTES);

  let previousLogicalIndex: number | undefined;
  const frames: WledDiagnosticFrame[] = [];
  for (const entry of entries) {
    if (
      entry.panelId === null ||
      entry.panelPixelX === null ||
      entry.panelPixelY === null ||
      contract.ledmap.map[entry.logicalIndex] !== entry.physicalIndex
    ) {
      throw new Error("Hardware diagnostics found an incomplete mapping entry.");
    }
    const output = contract.outputs.find((candidate) =>
      entry.physicalIndex >= candidate.startIndex &&
      entry.physicalIndex < candidate.startIndex + candidate.pixelCount
    );
    if (!output || output.gpio === null) {
      throw new Error(`Physical index ${entry.physicalIndex} has no GPIO output.`);
    }
    for (const channel of CHANNELS) {
      const individual: Array<number | [number, number, number]> = [];
      if (previousLogicalIndex !== undefined) {
        individual.push(previousLogicalIndex, [0, 0, 0]);
      }
      individual.push(entry.logicalIndex, [...channel.rgb]);
      const requestBytes = stateRequest(entries.length, individual);
      assertRequestSize(requestBytes, WLED_DIAGNOSTIC_REQUEST_LIMIT_BYTES);
      frames.push({
        sequence: frames.length,
        outputIndex: output.outputIndex,
        gpio: output.gpio,
        panelId: entry.panelId,
        panelPixelX: entry.panelPixelX,
        panelPixelY: entry.panelPixelY,
        logicalIndex: entry.logicalIndex,
        physicalIndex: entry.physicalIndex,
        rgbChannel: channel.id,
        requestBytes,
      });
      previousLogicalIndex = entry.logicalIndex;
    }
  }
  const fingerprintInput = {
    deploymentIdentity,
    mappingFingerprint: contract.fingerprint,
    mappingFingerprintVersion: contract.fingerprintVersion,
    resetRequestBytes,
    frames,
  };
  return {
    schemaVersion: "1.0.0",
    status: "unobserved-hardware-diagnostic",
    deploymentIdentity,
    mappingFingerprint: contract.fingerprint,
    mappingFingerprintVersion: contract.fingerprintVersion,
    ledCount: entries.length,
    brightness: WLED_DIAGNOSTIC_BRIGHTNESS,
    requestLimitBytes: WLED_DIAGNOSTIC_REQUEST_LIMIT_BYTES,
    resetRequestBytes,
    frames,
    planFingerprint: sha256Text(JSON.stringify(fingerprintInput)),
  };
}

export interface SendWledDiagnosticRequestOptions {
  baseUrl: string;
  fetcher?: typeof fetch;
  maximumAttempts?: number;
  maximumRequestBytes?: number;
  retryDelay?: (attempt: number) => Promise<void>;
}

function stateEndpoint(baseUrl: string): URL {
  const url = new URL(baseUrl);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("WLED diagnostic host must be a credential-free HTTP(S) URL.");
  }
  return new URL("/json/state", url);
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Sends one bounded JSON state request with deterministic retry behavior. */
export async function sendWledDiagnosticRequest(
  requestBytes: string,
  options: SendWledDiagnosticRequestOptions,
): Promise<void> {
  const maximumAttempts = options.maximumAttempts ?? 3;
  if (!Number.isInteger(maximumAttempts) || maximumAttempts < 1 || maximumAttempts > 5) {
    throw new Error("WLED diagnostic attempts must be an integer from 1 through 5.");
  }
  assertRequestSize(
    requestBytes,
    options.maximumRequestBytes ?? WLED_DIAGNOSTIC_REQUEST_LIMIT_BYTES,
  );
  const endpoint = stateEndpoint(options.baseUrl);
  const fetcher = options.fetcher ?? fetch;
  const retryDelay = options.retryDelay ?? (async (attempt: number) => {
    await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** (attempt - 1)));
  });
  let lastError: unknown;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: requestBytes,
      });
      if (response.ok) return;
      const error = new Error(`WLED diagnostic request failed with HTTP ${response.status}.`);
      if (!retryableStatus(response.status)) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (
        error instanceof Error &&
        error.message.startsWith("WLED diagnostic request failed with HTTP 4") &&
        !/HTTP (408|425|429)\./.test(error.message)
      ) {
        throw error;
      }
    }
    if (attempt < maximumAttempts) await retryDelay(attempt);
  }
  throw new Error(
    `WLED diagnostic request failed after ${maximumAttempts} attempts: ` +
      (lastError instanceof Error ? lastError.message : String(lastError)),
  );
}
