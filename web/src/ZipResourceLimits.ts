export interface ZipResourceLimits {
  maximumArchiveBytes: number;
  maximumEntries: number;
  maximumEntryBytes: number;
  maximumExpandedBytes: number;
  maximumCompressionRatio: number;
  compressionRatioMinimumBytes: number;
}

export interface ZipEntryResourceMetadata {
  path: string;
  compressedBytes: number;
  expandedBytes: number;
}

export const PORTABLE_ZIP_RESOURCE_LIMITS: ZipResourceLimits = {
  maximumArchiveBytes: 128 * 1024 * 1024,
  maximumEntries: 512,
  maximumEntryBytes: 64 * 1024 * 1024,
  maximumExpandedBytes: 256 * 1024 * 1024,
  maximumCompressionRatio: 200,
  compressionRatioMinimumBytes: 1024 * 1024,
};

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const MAXIMUM_EOCD_SEARCH_BYTES = 65_557;

function unsigned32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function findEndOfCentralDirectory(bytes: Uint8Array, view: DataView): number {
  const lower = Math.max(0, bytes.length - MAXIMUM_EOCD_SEARCH_BYTES);
  for (let offset = bytes.length - 22; offset >= lower; offset -= 1) {
    if (unsigned32(view, offset) !== END_OF_CENTRAL_DIRECTORY) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + 22 + commentLength === bytes.length) return offset;
  }
  throw new Error("ZIP central directory is missing or truncated.");
}

export function inspectZipResources(
  bytes: Uint8Array,
  limits: ZipResourceLimits = PORTABLE_ZIP_RESOURCE_LIMITS,
): ReadonlyMap<string, ZipEntryResourceMetadata> {
  if (bytes.length > limits.maximumArchiveBytes) {
    throw new Error(`ZIP exceeds the ${limits.maximumArchiveBytes}-byte archive limit.`);
  }
  if (bytes.length < 22) throw new Error("ZIP central directory is missing or truncated.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndOfCentralDirectory(bytes, view);
  const disk = view.getUint16(endOffset + 4, true);
  const centralDisk = view.getUint16(endOffset + 6, true);
  const diskEntries = view.getUint16(endOffset + 8, true);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralBytes = unsigned32(view, endOffset + 12);
  const centralOffset = unsigned32(view, endOffset + 16);
  if (
    disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount ||
    entryCount === 0xffff || centralBytes === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    throw new Error("ZIP64 and multi-disk project archives are not supported.");
  }
  if (entryCount > limits.maximumEntries) {
    throw new Error(`ZIP exceeds the ${limits.maximumEntries}-entry limit.`);
  }
  if (centralOffset + centralBytes !== endOffset) {
    throw new Error("ZIP central directory offsets are inconsistent.");
  }

  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntryResourceMetadata>();
  let expandedTotal = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > endOffset || unsigned32(view, offset) !== CENTRAL_DIRECTORY_ENTRY) {
      throw new Error("ZIP central directory entry is invalid or truncated.");
    }
    const flags = view.getUint16(offset + 8, true);
    const compression = view.getUint16(offset + 10, true);
    const compressedBytes = unsigned32(view, offset + 20);
    const expandedBytes = unsigned32(view, offset + 24);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = unsigned32(view, offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > endOffset || localOffset >= centralOffset) {
      throw new Error("ZIP central directory entry points outside the archive.");
    }
    if (
      compressedBytes === 0xffffffff || expandedBytes === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      throw new Error("ZIP64 project entries are not supported.");
    }
    if ((flags & 1) !== 0) throw new Error("Encrypted ZIP entries are not supported.");
    if (compression !== 0 && compression !== 8) {
      throw new Error(`ZIP entry uses unsupported compression method ${compression}.`);
    }
    const path = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (entries.has(path)) throw new Error(`ZIP contains duplicate file ${path}.`);
    if (expandedBytes > limits.maximumEntryBytes) {
      throw new Error(`ZIP entry ${path} exceeds the per-entry expansion limit.`);
    }
    expandedTotal += expandedBytes;
    if (expandedTotal > limits.maximumExpandedBytes) {
      throw new Error("ZIP exceeds the total expansion limit.");
    }
    if (
      expandedBytes >= limits.compressionRatioMinimumBytes &&
      expandedBytes / Math.max(1, compressedBytes) > limits.maximumCompressionRatio
    ) {
      throw new Error(`ZIP entry ${path} has a suspicious compression ratio.`);
    }
    entries.set(path, { path, compressedBytes, expandedBytes });
    offset = nextOffset;
  }
  if (offset !== endOffset) throw new Error("ZIP central directory size is inconsistent.");
  return entries;
}
