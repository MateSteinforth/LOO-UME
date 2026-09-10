import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  allowsEditorAudioPermissionCheck,
  allowsEditorAudioPermissionRequest,
} from "../electron/AudioPermission.ts";

const isElectronCaptureChild =
  process.versions.electron !== undefined &&
  process.env.LOO_UME_ELECTRON_CAPTURE_TEST === "1";
const require = createRequire(import.meta.url);

interface CaptureResult {
  check: Array<Record<string, unknown>>;
  graph: { frequencyBinCount: number; trackCount: number; peak: number };
  request: Array<Record<string, unknown>>;
}

function createFakeCaptureWav(): { cleanup(): void; path: string } {
  const directory = mkdtempSync(join(tmpdir(), "loo-ume-electron-microphone-"));
  const sampleRate = 48_000;
  const samples = sampleRate;
  const data = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    data.writeInt16LE(
      Math.round(12_000 * Math.sin((2 * Math.PI * 440 * index) / sampleRate)),
      index * 2,
    );
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  const path = join(directory, "capture.wav");
  writeFileSync(path, Buffer.concat([header, data]));
  return {
    cleanup: () => rmSync(directory, { force: true, recursive: true }),
    path,
  };
}

async function runElectronCaptureChild(): Promise<void> {
  const { app, BrowserWindow } = await import("electron");
  const server = createServer((_, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end("<!doctype html><title>microphone capture</title>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port.");
  const editorUrl = `http://127.0.0.1:${address.port}/editor`;
  const check: Array<Record<string, unknown>> = [];
  const request: Array<Record<string, unknown>> = [];
  let window: Electron.BrowserWindow | undefined;

  try {
    await app.whenReady();
    const session = (await import("electron")).session.defaultSession;
    session.setPermissionCheckHandler(
      (_webContents, permission, requestingOrigin, details) => {
        const allowed = allowsEditorAudioPermissionCheck(
          { details, permission, requestingOrigin },
          editorUrl,
        );
        if (permission === "media" && details.mediaType === "audio") {
          check.push({ allowed, permission, requestingOrigin, ...details });
        }
        return allowed;
      },
    );
    session.setPermissionRequestHandler(
      (webContents, permission, callback, details) => {
        const webContentsUrl = webContents.getURL();
        const allowed = allowsEditorAudioPermissionRequest(
          { details, permission, webContentsUrl },
          editorUrl,
        );
        if (permission === "media") {
          request.push({ allowed, permission, webContentsUrl, ...details });
        }
        callback(allowed);
      },
    );
    window = new BrowserWindow({ show: false });
    await window.loadURL(editorUrl);
    const graph = (await window.webContents.executeJavaScript(`
      (async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        const source = context.createMediaStreamSource(stream);
        source.connect(analyser);
        await context.resume();
        await new Promise((resolve) => setTimeout(resolve, 250));
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const peak = data.reduce((maximum, value) => Math.max(maximum, value), 0);
        for (const track of stream.getTracks()) track.stop();
        await context.close();
        return { frequencyBinCount: analyser.frequencyBinCount, peak, trackCount: stream.getAudioTracks().length };
      })()
    `)) as CaptureResult["graph"];
    process.stdout.write(
      `${JSON.stringify({ check, graph, request } satisfies CaptureResult)}\n`,
    );
  } finally {
    window?.destroy();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    app.quit();
  }
}

if (isElectronCaptureChild) {
  void runElectronCaptureChild().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    process.exitCode = 1;
  });
} else {
  const { describe, expect, it } = await import("vitest");
  describe("Electron microphone capture", () => {
    const testElectronCapture = process.platform === "linux" ? it : it.skip;
    testElectronCapture(
      "allows the trusted main-frame audio stream and processes fake capture input",
      () => {
        const testFile = fileURLToPath(import.meta.url);
        const electron = require("electron") as string;
        const captureFile = createFakeCaptureWav();
        const result = (() => {
          try {
            return spawnSync(
              "xvfb-run",
              [
                "--auto-servernum",
                electron,
                "--no-sandbox",
                "--use-fake-device-for-media-stream",
                `--use-file-for-fake-audio-capture=${captureFile.path}`,
                "--require",
                require.resolve("tsx/cjs"),
                testFile,
              ],
              {
                encoding: "utf8",
                env: { ...process.env, LOO_UME_ELECTRON_CAPTURE_TEST: "1" },
                timeout: 20_000,
              },
            );
          } finally {
            captureFile.cleanup();
          }
        })();
        if (result.error) throw result.error;
        expect(result.status, result.stderr).toBe(0);
        const output = result.stdout.trim().split("\n").at(-1);
        expect(output).toBeDefined();
        const capture = JSON.parse(output!) as CaptureResult;
        expect(capture.request).toHaveLength(1);
        expect(capture.check).toContainEqual(
          expect.objectContaining({
            allowed: true,
            isMainFrame: true,
            mediaType: "audio",
          }),
        );
        expect(capture.request[0]).toMatchObject({
          allowed: true,
          isMainFrame: true,
          mediaTypes: ["audio"],
        });
        expect(capture.graph.trackCount).toBe(1);
        expect(capture.graph.frequencyBinCount).toBe(1_024);
        expect(capture.graph.peak).toBeGreaterThan(0);
      },
      30_000,
    );
  });
}
