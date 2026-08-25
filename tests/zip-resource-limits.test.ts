import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import {
  inspectZipResources,
  type ZipResourceLimits,
} from "../web/src/ZipResourceLimits.ts";

const LIMITS: ZipResourceLimits = {
  maximumArchiveBytes: 1024 * 1024,
  maximumEntries: 2,
  maximumEntryBytes: 20,
  maximumExpandedBytes: 30,
  maximumCompressionRatio: 4,
  compressionRatioMinimumBytes: 100,
};

describe("portable ZIP resource limits", () => {
  it("accepts a bounded normal archive", () => {
    const entries = inspectZipResources(zipSync({
      "project/sculpture.json": new Uint8Array(10),
      "project/profile.json": new Uint8Array(12),
    }), LIMITS);
    expect(entries.size).toBe(2);
  });

  it("rejects entry count, individual expansion, and total expansion", () => {
    expect(() => inspectZipResources(zipSync({
      a: new Uint8Array(), b: new Uint8Array(), c: new Uint8Array(),
    }), LIMITS)).toThrow(/2-entry limit/);
    expect(() => inspectZipResources(zipSync({
      a: new Uint8Array(21),
    }), LIMITS)).toThrow(/per-entry expansion limit/);
    expect(() => inspectZipResources(zipSync({
      a: new Uint8Array(16), b: new Uint8Array(16),
    }), LIMITS)).toThrow(/total expansion limit/);
  });

  it("rejects suspicious compression and oversized archive bytes", () => {
    expect(() => inspectZipResources(zipSync({
      repeated: new Uint8Array(1024),
    }), {
      ...LIMITS,
      maximumEntryBytes: 2048,
      maximumExpandedBytes: 2048,
    })).toThrow(/suspicious compression ratio/);
    expect(() => inspectZipResources(
      zipSync({ a: new Uint8Array(10) }),
      { ...LIMITS, maximumArchiveBytes: 10 },
    )).toThrow(/archive limit/);
  });
});
