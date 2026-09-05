import { afterEach, describe, expect, it, vi } from "vitest";
import type { LedMappingEntry } from "../web/src/LedMapping.ts";
import {
  ArtNetPreviewRecordParser,
  ArtNetPreviewClient,
  physicalRgbToLogicalPixels,
} from "../web/src/ArtNetPreview.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function fakeReceiver() {
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  const signals: AbortSignal[] = [];
  const request = vi.fn((_url: string, options: RequestInit) => {
    const signal = options.signal!;
    signals.push(signal);
    return Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            streams.push(controller);
            signal.addEventListener(
              "abort",
              () => controller.error(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          },
        }),
      ),
    );
  });
  vi.stubGlobal("fetch", request);
  return { request, streams, signals };
}

const receiveOptions = {
  pixelCount: 2,
  startUniverse: 1,
  mappingFingerprint: "12345678",
};

function record(payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(28 + payload.byteLength);
  bytes.set([0x4c, 0x55, 0x4d, 0x46, 1, 9, 0, 2]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 12, false);
  view.setUint32(12, 3, false);
  view.setUint32(16, 4, false);
  view.setUint32(20, 5, false);
  view.setUint32(24, payload.byteLength, false);
  bytes.set(payload, 28);
  return bytes;
}

describe("browser Art-Net preview", () => {
  it("reopens a silent receiver and preserves a receiver that delivers frames", async () => {
    vi.useFakeTimers();
    const receiver = fakeReceiver();
    const client = new ArtNetPreviewClient();
    const onFrame = vi.fn();
    const running = client.start({ ...receiveOptions, onFrame });
    try {
      await vi.advanceTimersByTimeAsync(3_500);
      expect(receiver.request).toHaveBeenCalledTimes(2);
      expect(receiver.signals[0]!.aborted).toBe(true);
      for (let index = 0; index < 5; index += 1) {
        receiver.streams[1]!.enqueue(record(new Uint8Array(6)));
        await vi.advanceTimersByTimeAsync(1_000);
      }
      expect(onFrame).toHaveBeenCalledTimes(5);
      expect(receiver.request).toHaveBeenCalledTimes(2);
    } finally {
      client.stop();
      await running;
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries a closed stream and a temporary listener conflict", async () => {
    vi.useFakeTimers();
    const receiver = fakeReceiver();
    const client = new ArtNetPreviewClient();
    const onFrame = vi.fn();
    const running = client.start({ ...receiveOptions, onFrame });
    try {
      await vi.advanceTimersByTimeAsync(0);
      receiver.request.mockResolvedValueOnce(
        new Response(null, { status: 409 }),
      );
      receiver.streams[0]!.close();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(receiver.request).toHaveBeenCalledTimes(3);
      receiver.streams[1]!.enqueue(record(new Uint8Array(6)));
      await vi.advanceTimersByTimeAsync(0);
      expect(onFrame).toHaveBeenCalledOnce();
    } finally {
      client.stop();
      await running;
    }
  });

  it("cancels retry delays and permits a new project session", async () => {
    vi.useFakeTimers();
    const receiver = fakeReceiver();
    receiver.request.mockRejectedValueOnce(new TypeError("Network failure"));
    const client = new ArtNetPreviewClient();
    const running = client.start({ ...receiveOptions, onFrame: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    client.stop();
    const next = client.start({ ...receiveOptions, onFrame: vi.fn() });
    await running;
    expect(client.active).toBe(true);
    client.stop();
    await next;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(receiver.request).toHaveBeenCalledTimes(2);
    expect(client.active).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports invalid requests without endless retries", async () => {
    vi.useFakeTimers();
    const receiver = fakeReceiver();
    receiver.request.mockResolvedValueOnce(new Response(null, { status: 400 }));
    const client = new ArtNetPreviewClient();
    await expect(
      client.start({ ...receiveOptions, onFrame: vi.fn() }),
    ).rejects.toThrow("HTTP 400");
    expect(client.active).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("parses records split at arbitrary stream chunk boundaries", () => {
    const parser = new ArtNetPreviewRecordParser();
    const bytes = record(Uint8Array.from([1, 2, 3, 4, 5, 6]));
    expect(parser.push(bytes.slice(0, 7))).toEqual([]);
    expect(parser.push(bytes.slice(7, 30))).toEqual([]);
    expect(parser.push(bytes.slice(30))).toEqual([
      {
        sequence: 9,
        universeCount: 2,
        completedFrames: 12,
        incompleteFrames: 3,
        rejectedPackets: 4,
        duplicatePackets: 5,
        physicalRgb: Uint8Array.from([1, 2, 3, 4, 5, 6]),
      },
    ]);
  });

  it("maps direct physical RGB addresses into logical renderer order", () => {
    const entries = [
      { physicalIndex: 1, logicalIndex: 0 },
      { physicalIndex: 0, logicalIndex: 1 },
    ] as LedMappingEntry[];
    expect(
      physicalRgbToLogicalPixels(
        Uint8Array.from([10, 20, 30, 40, 50, 60]),
        entries,
      ),
    ).toEqual(Uint32Array.from([0x28323c, 0x0a141e]));
  });
});
