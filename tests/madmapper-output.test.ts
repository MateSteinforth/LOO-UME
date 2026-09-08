import { afterEach, describe, expect, it, vi } from "vitest";
import {
  logicalPixelsToRgbFramebuffer,
  ExternalFrameMirrorQueue,
} from "../web/src/ExternalFrameMirror.ts";

describe("external frame sculpture mirror", () => {
  afterEach(() => vi.useRealTimers());
  it("forwards about 30 frames from a 60 FPS simulator without the old 10 FPS cap", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const send = vi.fn(async () => undefined);
    const queue = new ExternalFrameMirrorQueue();
    queue.start({ minFrameIntervalMs: 1000 / 30, send });
    for (let frame = 0; frame < 60; frame++) {
      queue.push([[frame, 0, 0]]);
      await vi.advanceTimersByTimeAsync(1000 / 60);
    }
    expect(send.mock.calls.length).toBeGreaterThanOrEqual(29);
    expect(send.mock.calls.length).toBeLessThanOrEqual(30);
    queue.stop();
  });
  it("paces all sources at 30 FPS and sends the latest displayed frame", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const sent: number[] = [];
    const queue = new ExternalFrameMirrorQueue();
    queue.start({
      minFrameIntervalMs: 1000 / 30,
      send: async (pixels) => {
        sent.push(pixels[0]![0]);
      },
    });
    queue.push([[1, 0, 0]]);
    await vi.advanceTimersByTimeAsync(10);
    queue.push([[2, 0, 0]]);
    await vi.advanceTimersByTimeAsync(10);
    queue.push([[3, 0, 0]]);
    await vi.advanceTimersByTimeAsync(13);
    expect(sent).toEqual([1]);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([1, 3]);
    queue.push([[4, 0, 0]]);
    queue.stop();
    await vi.advanceTimersByTimeAsync(100);
    expect(sent).toEqual([1, 3]);
  });

  it("does not overlap requests across stop and restart", async () => {
    let finish!: () => void;
    const sent: number[] = [];
    const queue = new ExternalFrameMirrorQueue();
    queue.start({
      send: () =>
        new Promise<void>((resolve) => {
          sent.push(1);
          finish = resolve;
        }),
    });
    queue.push([[1, 0, 0]]);
    queue.stop();
    queue.start({
      send: async (pixels) => {
        sent.push(pixels[0]![0]);
      },
    });
    queue.push([[2, 0, 0]]);
    queue.push([[3, 0, 0]]);
    expect(sent).toEqual([1]);
    finish();
    await vi.waitFor(() => expect(sent).toEqual([1, 3]));
    expect(queue.statistics.sentFrames).toBe(1);
    queue.stop();
    await queue.drain();
  });
  it("converts logical packed colors without changing their order", () => {
    expect(
      logicalPixelsToRgbFramebuffer(
        Uint32Array.from([0xff0000, 0x00ff00, 0x0000ff]),
      ),
    ).toEqual([
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ]);
  });

  it("keeps only the latest frame while one send is active", async () => {
    const resolvers: Array<() => void> = [];
    const sent: number[] = [];
    const queue = new ExternalFrameMirrorQueue();
    queue.start({
      send: (pixels) =>
        new Promise<void>((resolve) => {
          sent.push(pixels[0]![0]);
          resolvers.push(resolve);
        }),
    });
    queue.push([[1, 0, 0]]);
    queue.push([[2, 0, 0]]);
    queue.push([[3, 0, 0]]);
    expect(sent).toEqual([1]);
    expect(queue.statistics.replacedFrames).toBe(1);
    resolvers.shift()!();
    await vi.waitFor(() => expect(sent).toEqual([1, 3]));
    resolvers.shift()!();
    await vi.waitFor(() => expect(queue.statistics.sentFrames).toBe(2));
  });

  it("discards pending work after stop and reports send errors", async () => {
    let resolveFirst!: () => void;
    const send = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const queue = new ExternalFrameMirrorQueue();
    queue.start({ send });
    queue.push([[1, 0, 0]]);
    queue.push([[2, 0, 0]]);
    queue.stop();
    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();
    expect(send).toHaveBeenCalledOnce();

    const onError = vi.fn();
    queue.start({ send: () => Promise.reject(new Error("offline")), onError });
    queue.push([[3, 0, 0]]);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(queue.active).toBe(false);
  });
});
