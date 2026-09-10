const BASS_RANGE_HZ = [40, 250] as const;
const TREBLE_RANGE_HZ = [2_000, 8_000] as const;

export interface AudioPreviewBand {
  bass: number;
  treble: number;
}

interface AudioPreviewAnalyser {
  fftSize: number;
  frequencyBinCount: number;
  disconnect?(): void;
  getByteFrequencyData(data: Uint8Array): void;
}

interface AudioPreviewSource {
  connect(node: AudioPreviewAnalyser): void;
  disconnect(): void;
}

interface AudioPreviewContext {
  sampleRate: number;
  close(): Promise<void>;
  createAnalyser(): AudioPreviewAnalyser;
  createMediaStreamSource(stream: MediaStream): AudioPreviewSource;
  resume(): Promise<void>;
}

export interface AudioPreviewInputDependencies {
  createAudioContext(): AudioPreviewContext;
  getUserMedia(): Promise<MediaStream>;
}

interface AudioPreviewSession {
  analyser: AudioPreviewAnalyser;
  context: AudioPreviewContext;
  frequencyData: Uint8Array;
  released?: boolean;
  source: AudioPreviewSource;
  stream: MediaStream;
}

function browserDependencies(): AudioPreviewInputDependencies {
  return {
    createAudioContext: () =>
      new AudioContext() as unknown as AudioPreviewContext,
    getUserMedia: () => {
      const mediaDevices =
        typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
      if (!mediaDevices?.getUserMedia) {
        return Promise.reject(
          new Error("Microphone capture is not available in this browser."),
        );
      }
      return mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
        },
      });
    },
  };
}

/** Return the rounded mean level in a frequency range. */
export function reduceFrequencyBand(
  frequencyData: Uint8Array,
  sampleRate: number,
  fftSize: number,
  minimumHz: number,
  maximumHz: number,
): number {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("The audio sample rate must be greater than zero.");
  }
  if (!Number.isInteger(fftSize) || fftSize <= 0 || fftSize % 2 !== 0) {
    throw new Error("The audio FFT size must be a positive even integer.");
  }
  if (frequencyData.byteLength !== fftSize / 2) {
    throw new Error("The audio frequency data does not match the FFT size.");
  }
  const nyquistHz = sampleRate / 2;
  if (
    !Number.isFinite(minimumHz) ||
    !Number.isFinite(maximumHz) ||
    minimumHz < 0 ||
    maximumHz <= minimumHz ||
    maximumHz > nyquistHz
  ) {
    throw new Error(
      "The audio frequency range is not valid for this sample rate.",
    );
  }
  const hertzPerBin = sampleRate / fftSize;
  const firstBin = Math.ceil(minimumHz / hertzPerBin);
  const lastBin = Math.floor(maximumHz / hertzPerBin);
  if (firstBin > lastBin || lastBin >= frequencyData.byteLength) {
    throw new Error("The audio frequency range has no analyser bins.");
  }
  let total = 0;
  for (let bin = firstBin; bin <= lastBin; bin += 1)
    total += frequencyData[bin]!;
  return Math.round(total / (lastBin - firstBin + 1));
}

export class AudioPreviewInput {
  private session: AudioPreviewSession | undefined;
  private starting: AudioPreviewSession | undefined;
  private generation = 0;

  constructor(
    private readonly dependencies: AudioPreviewInputDependencies = browserDependencies(),
  ) {}

  async start(): Promise<void> {
    this.stop();
    const generation = ++this.generation;
    let pending: AudioPreviewSession | undefined;
    let stream: MediaStream | undefined;
    let context: AudioPreviewContext | undefined;
    try {
      stream = await this.dependencies.getUserMedia();
      if (!this.isCurrent(generation)) {
        this.stopStream(stream);
        return;
      }
      context = this.dependencies.createAudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 2_048;
      const source = context.createMediaStreamSource(stream);
      pending = {
        analyser,
        context,
        frequencyData: new Uint8Array(analyser.frequencyBinCount),
        source,
        stream,
      };
      source.connect(analyser);
      this.starting = pending;
      await context.resume();
      if (!this.isCurrent(generation)) return;
      this.session = pending;
      this.starting = undefined;
      pending = undefined;
    } catch (error) {
      if (this.isCurrent(generation)) {
        if (pending) {
          this.release(pending);
          if (this.starting === pending) this.starting = undefined;
          pending = undefined;
        } else {
          if (stream) this.stopStream(stream);
          if (context) this.closeContext(context);
        }
        throw error;
      }
    } finally {
      if (pending) this.release(pending);
      if (this.starting === pending) this.starting = undefined;
    }
  }

  stop(): void {
    this.generation += 1;
    if (this.starting) {
      const starting = this.starting;
      this.starting = undefined;
      this.release(starting);
    }
    if (!this.session) return;
    const session = this.session;
    this.session = undefined;
    this.release(session);
  }

  sample(): AudioPreviewBand {
    const session = this.session;
    if (!session) return { bass: 0, treble: 0 };
    session.analyser.getByteFrequencyData(session.frequencyData);
    return {
      bass: reduceFrequencyBand(
        session.frequencyData,
        session.context.sampleRate,
        session.analyser.fftSize,
        ...BASS_RANGE_HZ,
      ),
      treble: reduceFrequencyBand(
        session.frequencyData,
        session.context.sampleRate,
        session.analyser.fftSize,
        ...TREBLE_RANGE_HZ,
      ),
    };
  }

  private isCurrent(generation: number): boolean {
    return this.generation === generation;
  }

  private release(session: AudioPreviewSession): void {
    if (session.released) return;
    session.released = true;
    try {
      session.source.disconnect();
    } catch {
      // The source can already be disconnected after a browser shutdown.
    }
    try {
      session.analyser.disconnect?.();
    } catch {
      // The analyser can already be disconnected after a browser shutdown.
    }
    this.stopStream(session.stream);
    this.closeContext(session.context);
  }

  private closeContext(context: AudioPreviewContext): void {
    try {
      void context.close().catch(() => undefined);
    } catch {
      // A failed close must not leave an unhandled promise.
    }
  }

  private stopStream(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Continue cleanup if the browser already released a track.
      }
    }
  }
}
