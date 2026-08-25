import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertApprovedEsp32Chip,
  assertApprovedImprovIdentity,
  assertApprovedSerialDevice,
  assertConfigReadback,
  assertStateReadback,
  createEsp32FlashOptions,
  privateDeviceUrl,
  remapStateToLiveTables,
  resolveVerifiedWledAddress,
  type Esp32SetupPayload,
} from "../web/src/Esp32Setup.ts";

function payload(): Esp32SetupPayload {
  return {
    mode: "smoke",
    expectedLedCount: 64,
    config: {
      hw: {
        led: {
          total: 64,
          ins: [{ start: 0, len: 64, pin: [16], order: 0, type: 22 }],
        },
      },
    },
    expectedEffectName: "Rainbow",
    expectedPaletteName: "Forest",
    state: {
      on: true,
      bri: 128,
      seg: { id: 0, start: 0, stop: 64, fx: 8, pal: 6, sx: 120, ix: 90 },
    },
  };
}

describe("guarded ESP32 setup contracts", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("accepts only the measured CP2102 and classic ESP32/WLED identity", () => {
    expect(() => assertApprovedSerialDevice({
      usbVendorId: 0x10c4,
      usbProductId: 0xea60,
    })).not.toThrow();
    expect(() => assertApprovedSerialDevice({
      usbVendorId: 0x1a86,
      usbProductId: 0x7523,
    })).toThrow(/CP2102/);
    expect(() => assertApprovedEsp32Chip("ESP32")).not.toThrow();
    expect(() => assertApprovedEsp32Chip("ESP32-S3")).toThrow(/Expected ESP32/);
    expect(() => assertApprovedImprovIdentity({
      firmware: "WLED",
      chipFamily: "esp32",
    })).not.toThrow();
    expect(() => assertApprovedImprovIdentity({
      firmware: "other",
      chipFamily: "esp32",
    })).toThrow(/WLED on ESP32/);
  });

  it("binds the destructive flash to one complete offset-zero image", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const options = createEsp32FlashOptions(bytes);
    expect(options.fileArray).toEqual([{ data: bytes, address: 0 }]);
    expect(options).toMatchObject({
      flashMode: "dio",
      flashFreq: "40m",
      flashSize: "4MB",
      eraseAll: true,
      compress: true,
    });
    expect(options.calculateMD5Hash?.(bytes)).toBe(
      createHash("md5").update(bytes).digest("hex"),
    );
  });

  it("accepts only local private device addresses", () => {
    expect(privateDeviceUrl("http://192.168.68.51/config").href).toBe(
      "http://192.168.68.51/",
    );
    expect(privateDeviceUrl("http://4.3.2.1/").href).toBe("http://4.3.2.1/");
    expect(() => privateDeviceUrl("https://192.168.68.51/")).toThrow(/non-HTTP/);
    expect(() => privateDeviceUrl("http://8.8.8.8/")).toThrow(/private network/);
    expect(() => privateDeviceUrl("http://192.168.68.51.example.com/")).toThrow(
      /private network/,
    );
  });

  it("binds the mDNS name and current DHCP address to the same device MAC", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        mac: "aa:bb:cc:dd:ee:ff",
        ip: "192.168.68.72",
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        mac: "aa:bb:cc:dd:ee:ff",
        ip: "192.168.68.72",
      })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(resolveVerifiedWledAddress("aa:bb:cc:dd:ee:ff")).resolves.toEqual(
      new URL("http://192.168.68.72/"),
    );
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://loo-ume.local/json/info",
      "http://192.168.68.72/json/info",
    ]);

    fetchMock.mockReset().mockResolvedValueOnce(new Response(JSON.stringify({
      mac: "11:22:33:44:55:66",
      ip: "192.168.68.51",
    })));
    await expect(resolveVerifiedWledAddress("aa:bb:cc:dd:ee:ff")).rejects.toThrow(
      /different WLED device/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps simulator names to live WLED IDs and fails when a name is absent", () => {
    const value = payload();
    remapStateToLiveTables(
      value,
      ["Solid", "Blink", "Rainbow"],
      ["Default", "Forest"],
    );
    expect(value.state.seg).toMatchObject({ fx: 2, pal: 1 });
    expect(() => remapStateToLiveTables(
      payload(),
      ["Solid"],
      ["Default", "Forest"],
    )).toThrow(/does not match/);
  });

  it("requires exact live config and state read-back", () => {
    const value = payload();
    const config = {
      id: { mdns: "loo-ume" },
      hw: { led: { total: 64, ins: [
        { start: 0, len: 64, pin: [16], order: 0, type: 22, extra: true },
      ] } },
    };
    const state = {
      on: true,
      bri: 128,
      seg: [{ start: 0, stop: 64, fx: 8, pal: 6, sx: 120, ix: 90 }],
    };
    expect(() => assertConfigReadback(config, value)).not.toThrow();
    expect(() => assertStateReadback(state, value)).not.toThrow();
    expect(() => assertConfigReadback({ ...config, id: { mdns: "wled" } }, value))
      .toThrow(/configuration read-back/);
    expect(() => assertStateReadback({ ...state, bri: 127 }, value))
      .toThrow(/state read-back/);
  });
});
