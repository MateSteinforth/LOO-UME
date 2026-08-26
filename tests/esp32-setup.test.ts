import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertApprovedEsp32Chip,
  assertApprovedImprovIdentity,
  assertApprovedSerialDevice,
  assertSingleAuthorizedCp2102,
  assertConfigReadback,
  assertStandalonePresetReadback,
  assertStandaloneStateReadback,
  assertStateReadback,
  connectExistingSimulatorDevice,
  createEsp32FlashOptions,
  ESP32_FLASH_BAUD_RATE,
  mappedPanelFramebuffer,
  persistStandaloneAnimation,
  privateDeviceUrl,
  provisionVisibleWifi,
  remapStateToLiveTables,
  resolveVerifiedWledAddress,
  reopenApprovedSerialPort,
  runCombinedClassicReset,
  runCombinedHardReset,
  sendSimulatorFramebuffer,
  type Esp32SetupPayload,
} from "../web/src/Esp32Setup.ts";

function payload(): Esp32SetupPayload {
  return {
    mode: "smoke",
    expectedLedCount: 64,
    config: {
      def: { ps: 1, on: true, bri: 128 },
      hw: {
        led: {
          total: 64,
          maxpwr: 1000,
          ins: [{ start: 0, len: 64, pin: [16], order: 0, type: 22 }],
        },
      },
      if: { live: { en: true, mso: true, rlm: false, timeout: 25 } },
    },
    expectedEffectName: "Rainbow",
    expectedPaletteName: "Forest",
    state: {
      on: true,
      bri: 128,
      seg: { id: 0, start: 0, stop: 64, fx: 8, pal: 6, sx: 120, ix: 90, frz: false },
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
    expect(() => assertApprovedEsp32Chip("ESP32-D0WDQ6 (revision 1)")).not.toThrow();
    expect(() => assertApprovedEsp32Chip("ESP32-S3")).toThrow(/approved classic ESP32/);
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
    expect(ESP32_FLASH_BAUD_RATE).toBe(115200);
  });

  it("sets DTR and RTS together for bootloader entry and hard reset", async () => {
    const signals: SerialOutputSignals[] = [];
    const waits: number[] = [];
    const device = {
      async setSignals(value: SerialOutputSignals) {
        signals.push(value);
      },
    };
    const delay = async (milliseconds: number): Promise<void> => {
      waits.push(milliseconds);
    };
    await runCombinedClassicReset(device as unknown as SerialPort, 50, delay);
    await runCombinedHardReset(device as unknown as SerialPort, false, delay);
    expect(signals).toEqual([
      { dataTerminalReady: false, requestToSend: true },
      { dataTerminalReady: true, requestToSend: false },
      { dataTerminalReady: false, requestToSend: false },
      { dataTerminalReady: false, requestToSend: true },
      { dataTerminalReady: false, requestToSend: false },
    ]);
    expect(waits).toEqual([100, 50, 100]);
  });

  it("reacquires the sole authorized CP2102 after macOS re-enumerates it", async () => {
    const selectedPort = {
      getInfo: () => ({ usbVendorId: 0x10c4, usbProductId: 0xea60 }),
      open: vi.fn().mockRejectedValue(new DOMException("stale")),
    } as unknown as SerialPort;
    const refreshedPort = {
      getInfo: () => ({ usbVendorId: 0x10c4, usbProductId: 0xea60 }),
      open: vi.fn().mockRejectedValueOnce(new DOMException("busy")).mockResolvedValueOnce(undefined),
    } as unknown as SerialPort;
    const updates: string[] = [];
    const getPorts = vi.fn().mockResolvedValue([refreshedPort]);
    await expect(reopenApprovedSerialPort(
      { getPorts },
      selectedPort,
      { baudRate: 115200 },
      2,
      async () => undefined,
      (message) => updates.push(message),
    )).resolves.toBe(refreshedPort);
    expect(selectedPort.open).not.toHaveBeenCalled();
    expect(refreshedPort.open).toHaveBeenCalledTimes(2);
    expect(updates).toEqual([]);

    refreshedPort.open = vi.fn().mockRejectedValue(new DOMException("busy"));
    await expect(reopenApprovedSerialPort(
      { getPorts: vi.fn().mockResolvedValue([refreshedPort]) },
      selectedPort,
      { baudRate: 115200 },
      2,
      async () => undefined,
    )).rejects.toThrow(/did not reopen after reset/);
  });

  it("requires one CP2102 and reports the exact Wi-Fi provisioning stage", async () => {
    const cp2102 = {
      getInfo: () => ({ usbVendorId: 0x10c4, usbProductId: 0xea60 }),
    } as unknown as SerialPort;
    await expect(assertSingleAuthorizedCp2102({
      getPorts: vi.fn().mockResolvedValue([cp2102]),
    })).resolves.toBeUndefined();
    await expect(assertSingleAuthorizedCp2102({
      getPorts: vi.fn().mockResolvedValue([cp2102, cp2102]),
    })).rejects.toThrow(/exactly one/);

    const updates: string[] = [];
    const provision = vi.fn().mockResolvedValue(undefined);
    await provisionVisibleWifi({
      scan: vi.fn()
        .mockResolvedValueOnce([{ name: "other", rssi: -70 }])
        .mockResolvedValueOnce([{ name: "AZ24", rssi: -51 }]),
      provision,
    }, "AZ24", "secret", (message) => updates.push(message), 2, async () => undefined);
    expect(provision).toHaveBeenCalledWith("AZ24", "secret", 60_000);
    expect(updates).toEqual([
      "Scanning for the 2.4 GHz network AZ24 (1/2).",
      "AZ24 was not visible; the ESP32 found 1 other network. Retrying.",
      "Scanning for the 2.4 GHz network AZ24 (2/2).",
      "Wi-Fi network AZ24 is visible at -51 dBm.",
      "Sending Wi-Fi credentials to WLED. Waiting up to 60 seconds.",
    ]);
    await expect(provisionVisibleWifi({
      scan: vi.fn().mockResolvedValue([{ name: "AZ24", rssi: -51 }]),
      provision: vi.fn().mockRejectedValue("TIMEOUT"),
    }, "AZ24", "secret", () => undefined, 1, async () => undefined)).rejects.toThrow(
      /did not connect to AZ24 within 60 seconds/,
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
      "http://localhost/api/esp32-device?address=loo-ume.local&path=%2Fjson%2Finfo",
      "http://localhost/api/esp32-device?address=192.168.68.72&path=%2Fjson%2Finfo",
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
      def: { ps: 1, on: true, bri: 128 },
      hw: { led: { total: 64, maxpwr: 1000, ins: [
        { start: 0, len: 64, pin: [16], order: 0, type: 22, extra: true },
      ] } },
      if: { live: { en: true, mso: true, rlm: false, timeout: 25 } },
    };
    const state = {
      on: true,
      bri: 128,
      seg: [{ start: 0, stop: 64, fx: 8, pal: 6, sx: 120, ix: 90, frz: false }],
    };
    expect(() => assertConfigReadback(config, value)).not.toThrow();
    expect(() => assertStateReadback(state, value)).not.toThrow();
    expect(() => assertConfigReadback({ ...config, id: { mdns: "wled" } }, value))
      .toThrow(/configuration read-back/);
    expect(() => assertConfigReadback({
      ...config,
      hw: { led: { ...config.hw.led, maxpwr: 2000 } },
    }, value)).toThrow(/configuration read-back/);
    expect(() => assertConfigReadback({
      ...config,
      if: { live: { ...config.if.live, timeout: 650 } },
    }, value)).toThrow(/configuration read-back/);
    expect(() => assertStateReadback({ ...state, bri: 127 }, value))
      .toThrow(/state read-back/);
    const standaloneState = {
      ...state,
      ps: 1,
      seg: [{ ...state.seg[0], col: [[255, 122, 24], [5, 8, 22], [0, 0, 0]] }],
    };
    value.state.seg = {
      ...(value.state.seg as object),
      col: [[255, 122, 24], [5, 8, 22], [0, 0, 0]],
    };
    expect(() => assertStandaloneStateReadback(standaloneState, value)).not.toThrow();
    expect(() => assertStandaloneStateReadback({ ...standaloneState, ps: 0 }, value))
      .toThrow(/complete standalone preset/);
    expect(() => assertStandaloneStateReadback({
      ...standaloneState,
      seg: [{ ...standaloneState.seg[0], col: [[0, 0, 0]] }],
    }, value)).toThrow(/complete standalone preset/);
  });

  it("sends one complete physical panel framebuffer through the fixed device broker", async () => {
    const pixels = Array.from({ length: 64 }, (_, index) =>
      [index, 255 - index, index % 3] as [number, number, number]
    );
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await sendSimulatorFramebuffer(new URL("http://192.168.68.53/"), pixels);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("address=192.168.68.53");
    expect(String(url)).toContain("/api/esp32-frame");
    expect(init).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        "Content-Type": "application/octet-stream",
        "X-LOO-UME-ESP32": "1",
      }),
    });
    expect(Array.from(new Uint8Array(init.body as ArrayBuffer))).toEqual(pixels.flat());
    await expect(sendSimulatorFramebuffer(
      new URL("http://192.168.68.53/"),
      pixels.slice(1),
    )).rejects.toThrow(/exactly 64/);
  });

  it("requires the saved standalone preset to match the simulator settings", () => {
    const value = payload();
    expect(() => assertStandalonePresetReadback({
      "1": {
        n: "LOO/UME standalone",
        on: true,
        bri: 128,
        seg: value.state.seg,
      },
    }, value)).not.toThrow();
    expect(() => assertStandalonePresetReadback({
      "1": {
        n: "LOO/UME standalone",
        on: true,
        bri: 128,
        seg: { ...(value.state.seg as object), fx: 7 },
      },
    }, value)).toThrow(/does not match/);
  });

  it("writes and verifies the native standalone boot preset", async () => {
    const value = payload();
    const presetSegment = { ...(value.state.seg as object), fx: 2, pal: 1 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(["Solid", "Blink", "Rainbow"])))
      .mockResolvedValueOnce(new Response(JSON.stringify(["Default", "Forest"])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        "1": {
          n: "LOO/UME standalone",
          on: true,
          bri: 128,
          seg: presetSegment,
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ leds: { bootps: 1 } })));
    vi.stubGlobal("fetch", fetchMock);
    await persistStandaloneAnimation(new URL("http://192.168.68.53/"), value);
    const saveRequest = fetchMock.mock.calls[2]!;
    expect(String(saveRequest[0])).toContain("path=%2Fjson%2Fstate");
    expect(JSON.parse(String(saveRequest[1].body))).toMatchObject({
      psave: 1,
      bootps: 1,
      n: "LOO/UME standalone",
      o: true,
      seg: { fx: 2, pal: 1, sx: 120, ix: 90 },
    });
  });

  it("orders simulator pixels by the first panel's physical addresses", () => {
    const pixels = new Uint32Array(64);
    pixels[3] = 0x123456;
    pixels[7] = 0xa1b2c3;
    const entries = Array.from({ length: 64 }, (_, physicalIndex) => ({
      physicalIndex,
      logicalIndex: 63 - physicalIndex,
    }));
    const framebuffer = mappedPanelFramebuffer(pixels, entries.reverse(), 0);
    expect(framebuffer[56]).toEqual([0xa1, 0xb2, 0xc3]);
    expect(framebuffer[60]).toEqual([0x12, 0x34, 0x56]);
    expect(() => mappedPanelFramebuffer(pixels, entries.slice(1), 0))
      .toThrow(/exactly 64 mapped pixels/);
  });

  it("reconnects only to the exact persisted one-panel device", async () => {
    const value = payload();
    const info = {
      arch: "esp32",
      ip: "192.168.68.53",
      leds: { count: 64 },
      mac: "aa:bb:cc:dd:ee:ff",
    };
    const config = {
      id: { mdns: "loo-ume" },
      def: { ps: 1, on: true, bri: 128 },
      hw: { led: { total: 64, maxpwr: 1000, ins: [
        { start: 0, len: 64, pin: [16], order: 0, type: 22 },
      ] } },
      if: { live: { en: true, mso: true, rlm: false, timeout: 25 } },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(info)))
      .mockResolvedValueOnce(new Response(JSON.stringify(info)))
      .mockResolvedValueOnce(new Response(JSON.stringify(config)))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        "Solid", "Blink", "Breathe", "Wipe", "Wipe Random", "Random Colors",
        "Sweep", "Dynamic", "Rainbow",
      ])))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        "Default", "Random Cycle", "Color 1", "Colors 1&2", "Color Gradient",
        "Colors Only", "Forest",
      ])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        "1": {
          n: "LOO/UME standalone",
          on: true,
          bri: 128,
          seg: value.state.seg,
        },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ leds: { bootps: 1 } })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(connectExistingSimulatorDevice(value)).resolves.toEqual(
      new URL("http://192.168.68.53/"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(8);

    fetchMock.mockReset()
      .mockResolvedValueOnce(new Response(JSON.stringify(info)))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ...info,
        mac: "11:22:33:44:55:66",
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify(config)));
    await expect(connectExistingSimulatorDevice(value)).rejects.toThrow(
      /does not match the verified device/,
    );
  });
});
