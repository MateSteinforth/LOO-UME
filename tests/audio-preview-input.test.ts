import { describe, expect, it, vi } from "vitest";
import {
  AudioPreviewInput,
  reduceFrequencyBand,
  type AudioPreviewInputDependencies,
} from "../web/src/AudioPreviewInput.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function fakeStream() {
  const stop = vi.fn();
  return {
    stream: { getTracks: () => [{ stop }] } as unknown as MediaStream,
    stop,
  };
}

function fakeDependencies(
  overrides: Partial<AudioPreviewInputDependencies> = {},
) {
  const analyser = {
    disconnect: vi.fn(),
    fftSize: 2_048,
    frequencyBinCount: 1_024,
    getByteFrequencyData: vi.fn((data: Uint8Array): void => {
      data.fill(0);
    }),
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    close: vi.fn(() => Promise.resolve()),
    createAnalyser: vi.fn(() => analyser),
    createMediaStreamSource: vi.fn(() => source),
    resume: vi.fn(() => Promise.resolve()),
    sampleRate: 48_000,
  };
  const input = fakeStream();
  const dependencies: AudioPreviewInputDependencies = {
    createAudioContext: vi.fn(() => context),
    getUserMedia: vi.fn(() => Promise.resolve(input.stream)),
    ...overrides,
  };
  return { analyser, context, dependencies, input, source };
}

describe("audio preview input", () => {
  it("reduces validated analyser bins to an integer mean", () => {
    const data = new Uint8Array(8);
    data.set([0, 10, 20, 30, 40, 50, 60, 70]);
    expect(reduceFrequencyBand(data, 16_000, 16, 1_000, 3_500)).toBe(20);
    expect(() => reduceFrequencyBand(data, 0, 16, 1_000, 3_500)).toThrow(
      "sample rate",
    );
    expect(() => reduceFrequencyBand(data, 16_000, 8, 1_000, 3_500)).toThrow(
      "does not match",
    );
    expect(() => reduceFrequencyBand(data, 16_000, 16, 3_500, 1_000)).toThrow(
      "not valid",
    );
  });

  it("captures analyser bands without monitoring microphone audio", async () => {
    const fake = fakeDependencies();
    fake.analyser.getByteFrequencyData.mockImplementation(
      (data: Uint8Array) => {
        data.fill(0);
        data.fill(101, 2, 11);
        data.fill(203, 86, 342);
      },
    );
    const preview = new AudioPreviewInput(fake.dependencies);
    await preview.start();
    expect(fake.source.connect).toHaveBeenCalledWith(fake.analyser);
    expect(preview.sample()).toEqual({ bass: 101, treble: 203 });
    preview.stop();
    expect(preview.sample()).toEqual({ bass: 0, treble: 0 });
    expect(fake.input.stop).toHaveBeenCalledOnce();
    expect(fake.context.close).toHaveBeenCalledOnce();
  });

  it("releases a stream when audio nodes cannot start", async () => {
    const input = fakeStream();
    const fake = fakeDependencies({
      getUserMedia: () => Promise.resolve(input.stream),
    });
    fake.context.createMediaStreamSource.mockImplementation(() => {
      throw new Error("Source failed");
    });
    await expect(
      new AudioPreviewInput(fake.dependencies).start(),
    ).rejects.toThrow("Source failed");
    expect(input.stop).toHaveBeenCalledOnce();
    expect(fake.context.close).toHaveBeenCalledOnce();
  });

  it("stops a stream that resolves after cancellation", async () => {
    const permission = deferred<MediaStream>();
    const input = fakeStream();
    const fake = fakeDependencies({ getUserMedia: () => permission.promise });
    const preview = new AudioPreviewInput(fake.dependencies);
    const starting = preview.start();
    preview.stop();
    permission.resolve(input.stream);
    await starting;
    expect(input.stop).toHaveBeenCalledOnce();
    expect(fake.context.createMediaStreamSource).not.toHaveBeenCalled();
    expect(preview.sample()).toEqual({ bass: 0, treble: 0 });
  });

  it("releases active nodes when stop occurs during audio context resume", async () => {
    const resume = deferred<void>();
    const fake = fakeDependencies();
    fake.context.resume.mockReturnValue(resume.promise);
    const preview = new AudioPreviewInput(fake.dependencies);
    const starting = preview.start();
    await Promise.resolve();
    preview.stop();
    expect(fake.input.stop).toHaveBeenCalledOnce();
    expect(fake.source.disconnect).toHaveBeenCalledOnce();
    expect(fake.context.close).toHaveBeenCalledOnce();
    resume.resolve();
    await starting;
  });

  it("cancels an old permission request when a new start retries", async () => {
    const firstPermission = deferred<MediaStream>();
    const first = fakeStream();
    const second = fakeStream();
    const fake = fakeDependencies();
    const getUserMedia = vi
      .fn()
      .mockReturnValueOnce(firstPermission.promise)
      .mockResolvedValueOnce(second.stream);
    fake.dependencies.getUserMedia = getUserMedia;
    const preview = new AudioPreviewInput(fake.dependencies);
    const firstStart = preview.start();
    await preview.start();
    firstPermission.resolve(first.stream);
    await firstStart;
    expect(first.stop).toHaveBeenCalledOnce();
    expect(preview.sample()).toEqual({ bass: 0, treble: 0 });
    preview.stop();
    expect(second.stop).toHaveBeenCalledOnce();
  });
});
