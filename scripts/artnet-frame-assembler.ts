const ART_NET_ID = Uint8Array.from([0x41, 0x72, 0x74, 0x2d, 0x4e, 0x65, 0x74, 0x00]);
const ART_DMX_OPCODE = 0x5000;
const ART_NET_PROTOCOL_MINIMUM = 14;
const ART_DMX_HEADER_BYTES = 18;
const RGB_CHANNELS = 3;
const RGB_PIXELS_PER_UNIVERSE = 170;

export interface ArtNetFrameAssemblerOptions {
  pixelCount: number;
  startUniverse?: number;
  partialFrameTimeoutMs?: number;
  allowedSender?: string;
}

export interface ArtNetFrameStatistics {
  packetsReceived: number;
  packetsRejected: number;
  duplicatePackets: number;
  incompleteFrames: number;
  completedFrames: number;
}

export interface ArtNetFrame {
  sequence: number;
  receivedAt: number;
  pixels: Uint8Array;
  universes: number[];
}

export interface ParsedArtDmx {
  sequence: number;
  universe: number;
  data: Uint8Array;
}

export function parseArtDmx(packet: Uint8Array): ParsedArtDmx | undefined {
  if (packet.byteLength < ART_DMX_HEADER_BYTES) return undefined;
  if (ART_NET_ID.some((byte, index) => packet[index] !== byte)) return undefined;
  const opcode = packet[8]! | (packet[9]! << 8);
  if (opcode !== ART_DMX_OPCODE) return undefined;
  const protocolVersion = (packet[10]! << 8) | packet[11]!;
  if (protocolVersion < ART_NET_PROTOCOL_MINIMUM) return undefined;
  const length = (packet[16]! << 8) | packet[17]!;
  if (length < 2 || length > 512 || length % 2 !== 0) return undefined;
  if (packet.byteLength !== ART_DMX_HEADER_BYTES + length) return undefined;
  return {
    sequence: packet[12]!,
    universe: packet[14]! | (packet[15]! << 8),
    data: packet.slice(ART_DMX_HEADER_BYTES),
  };
}

function isNewerSequence(candidate: number, active: number): boolean {
  if (candidate === 0 || active === 0 || candidate === active) return false;
  const distance = (candidate - active + 255) % 255;
  return distance > 0 && distance <= 127;
}

export class ArtNetFrameAssembler {
  readonly pixelCount: number;
  readonly startUniverse: number;
  readonly endUniverse: number;
  readonly universeCount: number;
  readonly partialFrameTimeoutMs: number;
  readonly allowedSender: string;
  private activeSequence: number | undefined;
  private lastPacketAt = 0;
  private readonly parts = new Map<number, Uint8Array>();
  private readonly mutableStatistics: ArtNetFrameStatistics = {
    packetsReceived: 0,
    packetsRejected: 0,
    duplicatePackets: 0,
    incompleteFrames: 0,
    completedFrames: 0,
  };

  constructor(options: ArtNetFrameAssemblerOptions) {
    if (!Number.isInteger(options.pixelCount) || options.pixelCount < 1 || options.pixelCount > 2_624) {
      throw new Error("Art-Net preview requires from 1 through 2,624 RGB pixels.");
    }
    const startUniverse = options.startUniverse ?? 1;
    if (!Number.isInteger(startUniverse) || startUniverse < 0 || startUniverse > 32_767) {
      throw new Error("Art-Net start universe must be from 0 through 32767.");
    }
    const universeCount = Math.ceil(options.pixelCount / RGB_PIXELS_PER_UNIVERSE);
    if (startUniverse + universeCount - 1 > 32_767) {
      throw new Error("Art-Net preview exceeds universe 32767.");
    }
    const timeout = options.partialFrameTimeoutMs ?? 100;
    if (!Number.isFinite(timeout) || timeout < 10 || timeout > 5_000) {
      throw new Error("Art-Net partial-frame timeout must be from 10 through 5000 ms.");
    }
    this.pixelCount = options.pixelCount;
    this.startUniverse = startUniverse;
    this.universeCount = universeCount;
    this.endUniverse = startUniverse + universeCount - 1;
    this.partialFrameTimeoutMs = timeout;
    this.allowedSender = options.allowedSender ?? "127.0.0.1";
  }

  get statistics(): Readonly<ArtNetFrameStatistics> {
    return { ...this.mutableStatistics };
  }

  reset(): void {
    this.activeSequence = undefined;
    this.lastPacketAt = 0;
    this.parts.clear();
  }

  expire(now: number): void {
    if (
      this.parts.size > 0 &&
      now - this.lastPacketAt > this.partialFrameTimeoutMs
    ) {
      this.mutableStatistics.incompleteFrames += 1;
      this.reset();
    }
  }

  push(packet: Uint8Array, sender: string, now = Date.now()): ArtNetFrame | undefined {
    this.mutableStatistics.packetsReceived += 1;
    this.expire(now);
    const message = parseArtDmx(packet);
    if (
      sender !== this.allowedSender ||
      !message ||
      message.universe < this.startUniverse ||
      message.universe > this.endUniverse ||
      message.data.byteLength !== this.expectedUniverseBytes(message.universe)
    ) {
      this.mutableStatistics.packetsRejected += 1;
      return undefined;
    }

    if (this.activeSequence === undefined) {
      this.activeSequence = message.sequence;
    } else if (message.sequence !== this.activeSequence) {
      if (
        message.sequence !== 0 &&
        this.activeSequence !== 0 &&
        !isNewerSequence(message.sequence, this.activeSequence)
      ) {
        this.mutableStatistics.packetsRejected += 1;
        return undefined;
      }
      if (this.parts.size > 0) this.mutableStatistics.incompleteFrames += 1;
      this.parts.clear();
      this.activeSequence = message.sequence;
    } else if (this.parts.has(message.universe)) {
      this.mutableStatistics.duplicatePackets += 1;
      if (message.sequence === 0) {
        this.mutableStatistics.incompleteFrames += 1;
        this.parts.clear();
      } else {
        return undefined;
      }
    }

    this.parts.set(message.universe, message.data);
    this.lastPacketAt = now;
    if (this.parts.size !== this.universeCount) return undefined;

    const pixels = new Uint8Array(this.pixelCount * RGB_CHANNELS);
    let offset = 0;
    const universes: number[] = [];
    for (let universe = this.startUniverse; universe <= this.endUniverse; universe += 1) {
      const part = this.parts.get(universe);
      if (!part) return undefined;
      pixels.set(part, offset);
      offset += part.byteLength;
      universes.push(universe);
    }
    const sequence = this.activeSequence;
    this.mutableStatistics.completedFrames += 1;
    this.reset();
    return { sequence, receivedAt: now, pixels, universes };
  }

  private expectedUniverseBytes(universe: number): number {
    const universeOffset = universe - this.startUniverse;
    const remainingPixels = this.pixelCount - universeOffset * RGB_PIXELS_PER_UNIVERSE;
    return Math.min(RGB_PIXELS_PER_UNIVERSE, remainingPixels) * RGB_CHANNELS;
  }
}
