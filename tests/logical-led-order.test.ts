import { describe, expect, it } from "vitest";
import {
  compareLogicalLedOrder,
  logicalLedOrderKey,
  LOGICAL_LED_UV_BIN_SCALE,
} from "../src/sculpture/PanelAssembly.ts";
import type { LedMappingEntry } from "../web/src/LedMapping.ts";

function entry(
  panelId: string,
  panelPixelY: number,
  panelPixelX: number,
  v: number,
  u: number,
): LedMappingEntry {
  return {
    physicalIndex: 0,
    logicalIndex: 0,
    panelId,
    panelPixelX,
    panelPixelY,
    u,
    v,
    x: 0,
    y: 0,
    z: 0,
  };
}

describe("logical LED order", () => {
  it("uses one-billionth normalized UV bins", () => {
    expect(LOGICAL_LED_UV_BIN_SCALE).toBe(1_000_000_000);
    expect(logicalLedOrderKey(entry("P-01", 2, 3, 0.4, 0.6))).toEqual({
      latitudeBin: 400_000_000,
      longitudeBin: 600_000_000,
      panelId: "P-01",
      panelPixelY: 2,
      panelPixelX: 3,
    });
  });

  it("ignores small platform float differences in symmetric positions", () => {
    const entries = [
      entry("P-02", 0, 0, 0.4 - 2e-12, 0.6 + 2e-12),
      entry("P-01", 0, 0, 0.4 + 2e-12, 0.6 - 2e-12),
    ];
    expect(entries.sort(compareLogicalLedOrder).map(({ panelId }) => panelId))
      .toEqual(["P-01", "P-02"]);
  });

  it("uses panel address after the spatial bins", () => {
    const entries = [
      entry("P-01", 1, 0, 0.4, 0.6),
      entry("P-01", 0, 1, 0.4, 0.6),
      entry("P-01", 0, 0, 0.4, 0.6),
      entry("P-00", 7, 7, 0.4, 0.6),
    ];
    expect(entries.sort(compareLogicalLedOrder).map((value) =>
      `${value.panelId}:${value.panelPixelY}:${value.panelPixelX}`
    )).toEqual([
      "P-00:7:7",
      "P-01:0:0",
      "P-01:0:1",
      "P-01:1:0",
    ]);
  });

  it("keeps distinct spatial bins in north-to-south order", () => {
    const entries = [
      entry("P-01", 0, 0, 0.4 + 2e-9, 0.1),
      entry("P-02", 0, 0, 0.4, 0.9),
    ];
    expect(entries.sort(compareLogicalLedOrder).map(({ panelId }) => panelId))
      .toEqual(["P-02", "P-01"]);
  });
});
