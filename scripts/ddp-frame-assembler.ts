const DDP_HEADER_BYTES = 10;
const DDP_VERSION_FLAG = 0x40;
const DDP_PUSH_FLAG = 0x01;
const DDP_RGB_DATA_TYPE = 0x0b;
const DDP_DEFAULT_DESTINATION = 0x01;
const RGB_CHANNELS = 3;
const MAX_DDP_PAYLOAD_BYTES = 1_440;

export interface DdpFrameAssemblerOptions {
  pixelCount: number;
  partialFrameTimeoutMs?: number;
}

export interface DdpFrameStatistics {
  packetsReceived: number;
  packetsRejected: number;
  incompleteFrames: number;
  completedFrames: number;
  senderChanges: number;
}

export interface ParsedDdpPacket {
  sequence: number;
  push: boolean;
  offset: number;
  data: Uint8Array;
}

export interface DdpFrame {
  sequence: number;
  receivedAt: number;
  sender: string;
  pixels: Uint8Array;
}

export function parseDdpPacket(packet: Uint8Array): ParsedDdpPacket | undefined {
  if (packet.byteLength < DDP_HEADER_BYTES) return undefined;
  const flags = packet[0]!;
  const sequence = packet[1]!;
  if ((flags & ~DDP_PUSH_FLAG) !== DDP_VERSION_FLAG) return undefined;
  if (sequence > 15) return undefined;
  if (packet[2] !== DDP_RGB_DATA_TYPE || packet[3] !== DDP_DEFAULT_DESTINATION) {
    return undefined;
  }
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const offset = view.getUint32(4, false);
  const length = view.getUint16(8, false);
  if (
    length < RGB_CHANNELS ||
    length > MAX_DDP_PAYLOAD_BYTES ||
    length % RGB_CHANNELS !== 0 ||
    offset % RGB_CHANNELS !== 0 ||
    packet.byteLength !== DDP_HEADER_BYTES + length
  ) return undefined;
  return {
    sequence,
    push: (flags & DDP_PUSH_FLAG) !== 0,
    offset,
    data: packet.slice(DDP_HEADER_BYTES),
  };
}

export class DdpFrameAssembler {
  readonly pixelCount: number;
  readonly frameBytes: number;
  readonly partialFrameTimeoutMs: number;
  private readonly pixels: Uint8Array;
  private readonly coverage: Uint8Array;
  private coveredBytes = 0;
  private activeSender: string | undefined;
  private lastPacketAt = 0;
  private readonly mutableStatistics: DdpFrameStatistics = {
    packetsReceived: 0,
    packetsRejected: 0,
    incompleteFrames: 0,
    completedFrames: 0,
    senderChanges: 0,
  };

  constructor(options: DdpFrameAssemblerOptions) {
    if (!Number.isInteger(options.pixelCount) || options.pixelCount < 1 || options.pixelCount > 2_624) {
      throw new Error("DDP preview requires from 1 through 2,624 RGB pixels.");
    }
    const timeout = options.partialFrameTimeoutMs ?? 100;
    if (!Number.isFinite(timeout) || timeout < 10 || timeout > 5_000) {
      throw new Error("DDP partial-frame timeout must be from 10 through 5000 ms.");
    }
    this.pixelCount = options.pixelCount;
    this.frameBytes = options.pixelCount * RGB_CHANNELS;
    this.partialFrameTimeoutMs = timeout;
    this.pixels = new Uint8Array(this.frameBytes);
    this.coverage = new Uint8Array(this.frameBytes);
  }

  get statistics(): Readonly<DdpFrameStatistics> {
    return { ...this.mutableStatistics };
  }

  reset(): void {
    this.coverage.fill(0);
    this.coveredBytes = 0;
    this.activeSender = undefined;
    this.lastPacketAt = 0;
  }

  expire(now: number): void {
    if (this.coveredBytes > 0 && now - this.lastPacketAt > this.partialFrameTimeoutMs) {
      this.mutableStatistics.incompleteFrames += 1;
      this.reset();
    }
  }

  push(packet: Uint8Array, sender: string, now = Date.now()): DdpFrame | undefined {
    this.mutableStatistics.packetsReceived += 1;
    this.expire(now);
    const message = parseDdpPacket(packet);
    if (!message || message.offset + message.data.byteLength > this.frameBytes) {
      this.mutableStatistics.packetsRejected += 1;
      return undefined;
    }

    if (message.offset === 0) {
      if (this.coveredBytes > 0) this.mutableStatistics.incompleteFrames += 1;
      if (this.activeSender && this.activeSender !== sender) {
        this.mutableStatistics.senderChanges += 1;
      }
      this.reset();
      this.activeSender = sender;
    } else if (!this.activeSender || this.activeSender !== sender) {
      this.mutableStatistics.packetsRejected += 1;
      return undefined;
    }

    const end = message.offset + message.data.byteLength;
    for (let index = message.offset; index < end; index += 1) {
      if (this.coverage[index] !== 0) {
        this.mutableStatistics.packetsRejected += 1;
        this.mutableStatistics.incompleteFrames += 1;
        this.reset();
        return undefined;
      }
    }
    this.pixels.set(message.data, message.offset);
    this.coverage.fill(1, message.offset, end);
    this.coveredBytes += message.data.byteLength;
    this.lastPacketAt = now;
    if (!message.push) return undefined;
    if (this.coveredBytes !== this.frameBytes) {
      this.mutableStatistics.incompleteFrames += 1;
      this.reset();
      return undefined;
    }

    const frame: DdpFrame = {
      sequence: message.sequence,
      receivedAt: now,
      sender,
      pixels: this.pixels.slice(),
    };
    this.mutableStatistics.completedFrames += 1;
    this.reset();
    return frame;
  }
}
