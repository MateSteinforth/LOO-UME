import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertApprovedEsp32Chip,
  assertApprovedImprovIdentity,
  assertApprovedSerialDevice,
  assertSingleAuthorizedCp2102,
  applyAndVerifyDevice,
  assertConfigReadback,
  assertLedmapReadback,
  assertStandalonePresetReadback,
  assertStandaloneStateReadback,
  assertStateReadback,
  canEnableReconnectedSimulator,
  connectExistingSimulatorDevice,
  createSimulatorSetupConfig,
  createEsp32FlashOptions,
  ESP32_FLASH_BAUD_RATE,
  PRESET_PERSISTENCE_DEADLINE_MS,
  RESTART_VERIFICATION_DEADLINE_MS,
  RESTART_VERIFICATION_MINIMUM_WINDOW_MS,
  RESTART_VERIFICATION_REQUEST_TIMEOUT_MS,
  isCurrentSimulatorSetup,
  mappedPanelFramebuffer,
  parseWledPresetJson,
  persistStandaloneAnimation,
  privateDeviceUrl,
  provisionVisibleWifi,
  remapStateToLiveTables,
  resolveVerifiedWledAddress,
  retryExistingSimulatorDiscovery,
  reopenApprovedSerialPort,
  runCombinedClassicReset,
  runCombinedHardReset,
  sendSimulatorFramebuffer,
  settleSimulatorDeviceWork,
  synchronizeDeviceLedmap,
  verifyRestartedDevice,
  type Esp32SetupPayload,
} from "../web/src/Esp32Setup.ts";
import { ESP32_UPSTREAM_TIMEOUT_MS } from "../scripts/esp32-device-handler.ts";

function payload(): Esp32SetupPayload {
  return {
    sourceFingerprint: "test-mapping-fingerprint",
    sourceRevision: 4,
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
      if: { live: { en: true, mso: true, rlm: false, timeout: 25, "no-gc": true } },
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
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

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
    expect(RESTART_VERIFICATION_REQUEST_TIMEOUT_MS).toBeGreaterThan(
      ESP32_UPSTREAM_TIMEOUT_MS,
    );
  });

  it("derives bounded buses through the complete loaded 41-panel simulator", () => {
    const template = payload().config;
    const config = createSimulatorSetupConfig(template, [
      { startIndex: 0, pixelCount: 192, gpio: 16 },
    ], 3) as {
      def: unknown;
      hw: { led: { total: number; maxpwr: number; ins: unknown[] } };
      if: unknown;
    };
    expect(config).toMatchObject({
      def: { ps: 1, on: true, bri: 128 },
      hw: { led: {
        total: 192,
        maxpwr: 3000,
        ins: [{ start: 0, len: 192, pin: [16], order: 3, maxpwr: 3000 }],
      } },
      if: { live: { en: true, mso: true, rlm: false, timeout: 25, "no-gc": true } },
    });
    const fullConfig = createSimulatorSetupConfig(template, [
      { startIndex: 0, pixelCount: 704, gpio: 16 },
      { startIndex: 704, pixelCount: 640, gpio: 17 },
      { startIndex: 1_344, pixelCount: 640, gpio: 18 },
      { startIndex: 1_984, pixelCount: 640, gpio: 19 },
    ], 0) as { hw: { led: { total: number; maxpwr: number; ins: unknown[] } } };
    expect(fullConfig.hw.led).toMatchObject({
      total: 2_624,
      maxpwr: 0,
      ins: [
        { start: 0, len: 704, pin: [16], maxpwr: 14_000 },
        { start: 704, len: 640, pin: [17], maxpwr: 14_000 },
        { start: 1_344, len: 640, pin: [18], maxpwr: 14_000 },
        { start: 1_984, len: 640, pin: [19], maxpwr: 14_000 },
      ],
    });
    expect(() => createSimulatorSetupConfig(template, [
      { startIndex: 0, pixelCount: 2_688, gpio: 16 },
    ], 0)).toThrow(/1 through 41/);
    for (const gpio of [6, 10, 20, 24, 30, 34, 39]) {
      expect(() => createSimulatorSetupConfig(template, [
        { startIndex: 0, pixelCount: 192, gpio },
      ], 0)).toThrow(/approved GPIO/);
    }
    expect(() => createSimulatorSetupConfig(template, [
      { startIndex: 0, pixelCount: 192, gpio: 16 },
    ], 6))
      .toThrow(/WLED color order/);
  });

  it("requires the exact generated ledmap JSON", () => {
    expect(() => assertLedmapReadback(
      '{"map":[0,2,1]}\n',
      '{"map":[0,2,1]}\n',
    )).not.toThrow();
    expect(() => assertLedmapReadback(
      '{"map":[0,1,2]}',
      '{"map":[0,2,1]}',
    )).toThrow(/does not match/);
    expect(() => assertLedmapReadback("not-json", '{"map":[0]}'))
      .toThrow(/invalid JSON/);
  });

  it("rejects an async ESP32 result after the loaded project changes", async () => {
    const oldPayload = payload();
    let currentRevision = 4;
    let currentFingerprint = oldPayload.sourceFingerprint;
    let resolveDevice!: (value: URL) => void;
    const oldRequest = new Promise<URL>((resolve) => {
      resolveDevice = resolve;
    });
    const accepted: URL[] = [];
    const completion = oldRequest.then((deviceUrl) => {
      if (isCurrentSimulatorSetup(
        oldPayload,
        currentRevision,
        currentFingerprint,
      )) accepted.push(deviceUrl);
    });
    currentRevision = 5;
    currentFingerprint = "new-project-fingerprint";
    resolveDevice(new URL("http://192.168.68.53/"));
    await completion;
    expect(accepted).toEqual([]);
  });

  it("drains prior device work and blocks reconnect while setup is active", async () => {
    const value = payload();
    expect(canEnableReconnectedSimulator(
      value,
      value.sourceRevision,
      value.sourceFingerprint,
      true,
    )).toBe(false);

    let resolveReconnect!: () => void;
    let resolveFrame!: () => void;
    const reconnect = new Promise<void>((resolve) => {
      resolveReconnect = resolve;
    });
    const frame = new Promise<void>((resolve) => {
      resolveFrame = resolve;
    });
    let settled = false;
    const draining = settleSimulatorDeviceWork([
      reconnect,
      Promise.reject(new Error("old save failed")),
      frame,
    ]).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveReconnect();
    await Promise.resolve();
    expect(settled).toBe(false);
    resolveFrame();
    await draining;
    expect(settled).toBe(true);
  });

  it("retries automatic reconnect after transient mDNS failure", async () => {
    const discover = vi.fn()
      .mockRejectedValueOnce(new Error("mDNS not ready"))
      .mockRejectedValueOnce(new Error("proxy still resolving"))
      .mockResolvedValueOnce("ready");
    const delays: number[] = [];
    const updates: string[] = [];
    await expect(retryExistingSimulatorDiscovery(
      discover,
      3,
      async (milliseconds) => {
        delays.push(milliseconds);
      },
      () => true,
      (message) => updates.push(message),
    )).resolves.toBe("ready");
    expect(discover).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([2_000, 2_000]);
    expect(updates).toEqual([
      "Checking loo-ume.local for the configured ESP32 (1/3).",
      "ESP32 discovery failed (1/3): mDNS not ready Retrying in 2 seconds.",
      "Checking loo-ume.local for the configured ESP32 (2/3).",
      "ESP32 discovery failed (2/3): proxy still resolving Retrying in 2 seconds.",
      "Checking loo-ume.local for the configured ESP32 (3/3).",
    ]);
  });

  it("cancels automatic discovery before another stale-project attempt", async () => {
    let current = true;
    const discover = vi.fn().mockImplementation(async () => {
      current = false;
      throw new Error("mDNS not ready");
    });
    const delay = vi.fn();
    await expect(retryExistingSimulatorDiscovery(
      discover,
      12,
      delay,
      () => current,
    )).rejects.toThrow(/cancelled/);
    expect(discover).toHaveBeenCalledOnce();
    expect(delay).not.toHaveBeenCalled();
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
      if: { live: { en: true, mso: true, rlm: false, timeout: 25, "no-gc": true } },
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

  it("sends a mapped physical framebuffer through the fixed device broker", async () => {
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
    const expected = pixels.flatMap((pixel) => pixel.map((channel) =>
      Math.floor((channel / 255) ** 2.2 * 255 + 0.5)
    ));
    expect(Array.from(new Uint8Array(init.body as ArrayBuffer))).toEqual(expected);
    expect(expected.slice(0, 3)).toEqual([0, 255, 0]);
    await expect(sendSimulatorFramebuffer(
      new URL("http://192.168.68.53/"),
      [],
    )).rejects.toThrow(/1 through 2,624/);
  });

  it("gamma-corrects dim DDP colors like native WLED rendering", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await sendSimulatorFramebuffer(
      new URL("http://192.168.68.53/"),
      [[5, 8, 22], [255, 122, 24]],
    );
    const body = fetchMock.mock.calls[0]![1].body as ArrayBuffer;
    expect(Array.from(new Uint8Array(body))).toEqual([0, 0, 1, 255, 50, 1]);
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
        seg: [value.state.seg, { stop: 0 }, { stop: 0 }],
      },
    }, value)).not.toThrow();
    expect(() => assertStandalonePresetReadback({
      "1": {
        n: "LOO/UME standalone",
        on: true,
        bri: 128,
        seg: [value.state.seg, { start: 64, stop: 128 }],
      },
    }, value)).toThrow(/does not match/);
    expect(() => assertStandalonePresetReadback({
      "1": {
        n: "LOO/UME standalone",
        on: true,
        bri: 128,
        seg: { ...(value.state.seg as object), fx: 7 },
      },
    }, value)).toThrow(/does not match/);
  });

  it("accepts only WLED's sparse leading-comma preset representation", () => {
    expect(parseWledPresetJson('{   ,"1":{"n":"LOO/UME standalone"}}')).toEqual({
      "1": { n: "LOO/UME standalone" },
    });
    expect(parseWledPresetJson('{"1":{}}')).toEqual({ "1": {} });
    expect(() => parseWledPresetJson('{"1":,}')).toThrow(/invalid JSON/);
    expect(() => parseWledPresetJson('{ ,,"1":{}}')).toThrow(/invalid JSON/);
  });

  it("writes and verifies the native standalone boot preset", async () => {
    const value = payload();
    value.state.o = true;
    value.state.bootps = 99;
    value.state.live = true;
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
    const saveBody = JSON.parse(String(saveRequest[1].body)) as Record<string, unknown>;
    expect(saveBody).toMatchObject({
      psave: 1,
      n: "LOO/UME standalone",
      live: false,
      seg: { fx: 2, pal: 1, sx: 120, ix: 90 },
    });
    expect(saveBody).not.toHaveProperty("o");
    expect(saveBody).not.toHaveProperty("bootps");
  });

  it("reconciles a lost state-write response without repeating the mutation", async () => {
    const value = payload();
    const presetSegment = { ...(value.state.seg as object), fx: 2, pal: 1 };
    const updates: string[] = [];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(["Solid", "Blink", "Rainbow"])))
      .mockResolvedValueOnce(new Response(JSON.stringify(["Default", "Forest"])))
      .mockRejectedValueOnce(new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError",
      ))
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
    await expect(persistStandaloneAnimation(
      new URL("http://192.168.68.53/"),
      value,
      () => true,
      (message) => updates.push(message),
    )).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("path=%2Fjson%2Fstate")
    )).toHaveLength(1);
    expect(updates).toEqual([
      expect.stringMatching(/state-write response was lost.*Verifying the exact saved state/),
    ]);
  });

  it("waits for WLED to finish storing the standalone preset", async () => {
    expect(PRESET_PERSISTENCE_DEADLINE_MS).toBe(20_000);
    const value = payload();
    const savedPreset = {
      "1": {
        n: "LOO/UME standalone",
        on: true,
        bri: 128,
        seg: { ...(value.state.seg as object), fx: 2, pal: 1 },
      },
    };
    let resolveDelayedInfo!: (response: Response) => void;
    const delayedInfo = new Promise<Response>((resolve) => {
      resolveDelayedInfo = resolve;
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(["Solid", "Blink", "Rainbow"])))
      .mockResolvedValueOnce(new Response(JSON.stringify(["Default", "Forest"])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
      .mockResolvedValueOnce(new Response("{incomplete"))
      .mockImplementationOnce(() => delayedInfo)
      .mockResolvedValueOnce(new Response(JSON.stringify(savedPreset)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ leds: { bootps: 1 } })));
    vi.stubGlobal("fetch", fetchMock);
    const persistence = persistStandaloneAnimation(
      new URL("http://192.168.68.53/"),
      value,
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(fetchMock).toHaveBeenCalledTimes(5);
    resolveDelayedInfo(new Response(JSON.stringify({ leds: { bootps: 1 } })));
    await expect(persistence).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it("bounds preset verification by elapsed time and cancels stale saves", async () => {
    vi.useFakeTimers();
    const value = payload();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(["Rainbow"])))
      .mockResolvedValueOnce(new Response(JSON.stringify(["Forest"])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
      .mockResolvedValue(new Response("{incomplete"));
    vi.stubGlobal("fetch", fetchMock);
    const startedAt = Date.now();
    const persistence = persistStandaloneAnimation(
      new URL("http://192.168.68.53/"),
      value,
    );
    const rejection = expect(persistence).rejects.toThrow(/within 20 seconds/);
    await vi.runAllTimersAsync();
    await rejection;
    expect(Date.now() - startedAt).toBeLessThanOrEqual(PRESET_PERSISTENCE_DEADLINE_MS);

    vi.useRealTimers();
    let current = true;
    fetchMock.mockReset()
      .mockResolvedValueOnce(new Response(JSON.stringify(["Rainbow"])))
      .mockResolvedValueOnce(new Response(JSON.stringify(["Forest"])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
      .mockImplementationOnce(async () => {
        current = false;
        return new Response("{incomplete");
      })
      .mockResolvedValueOnce(new Response(JSON.stringify({ leds: { bootps: 1 } })));
    await expect(persistStandaloneAnimation(
      new URL("http://192.168.68.53/"),
      value,
      () => current,
    )).rejects.toThrow(/cancelled/);
    expect(fetchMock).toHaveBeenCalledTimes(5);
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
      .toThrow(/contiguous mapped output/);
  });

  it("orders all three loaded panels into one contiguous physical framebuffer", () => {
    const pixels = Uint32Array.from(
      { length: 192 },
      (_, index) => (index << 16) | ((191 - index) << 8) | (index % 7),
    );
    const entries = Array.from({ length: 192 }, (_, physicalIndex) => ({
      physicalIndex,
      logicalIndex: 191 - physicalIndex,
    })).reverse();
    const framebuffer = mappedPanelFramebuffer(pixels, entries, 0, 192);
    expect(framebuffer).toHaveLength(192);
    expect(framebuffer[0]).toEqual([191, 0, 2]);
    expect(framebuffer[191]).toEqual([0, 191, 0]);
  });

  it("reconnects only to the exact persisted loaded simulator device and ledmap", async () => {
    const value = payload();
    value.ledmapBytes = '{"map":[0,1,2]}\n';
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
      if: { live: { en: true, mso: true, rlm: false, timeout: 25, "no-gc": true } },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(info)))
      .mockResolvedValueOnce(new Response(JSON.stringify(info)))
      .mockResolvedValueOnce(new Response(JSON.stringify(config)))
      .mockResolvedValueOnce(new Response(value.ledmapBytes))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ledmap: 0 })))
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
    expect(fetchMock).toHaveBeenCalledTimes(10);

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

    const unauthorizedPersist = vi.fn().mockResolvedValue(undefined);
    fetchMock.mockReset()
      .mockResolvedValueOnce(new Response(JSON.stringify(info)))
      .mockResolvedValueOnce(new Response(JSON.stringify(info)))
      .mockResolvedValueOnce(new Response(JSON.stringify(config)))
      .mockResolvedValueOnce(new Response('{"map":[2,1,0]}'));
    await expect(connectExistingSimulatorDevice(value, {
      persist: unauthorizedPersist,
    })).rejects.toThrow(/ledmap does not match the loaded simulator/);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(unauthorizedPersist).not.toHaveBeenCalled();

    const persistAfterLedmapUpdate = vi.fn().mockResolvedValue(undefined);
    value.allowLedmapUpdate = true;
    fetchMock.mockReset()
      .mockResolvedValueOnce(new Response(JSON.stringify(info)))
      .mockResolvedValueOnce(new Response(JSON.stringify(info)))
      .mockResolvedValueOnce(new Response(JSON.stringify(config)))
      .mockResolvedValueOnce(new Response('{"map":[2,1,0]}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ledmap: 0 })))
      .mockResolvedValueOnce(new Response(value.ledmapBytes));
    await expect(connectExistingSimulatorDevice(value, {
      persist: persistAfterLedmapUpdate,
    })).resolves.toEqual(
      new URL("http://192.168.68.53/"),
    );
    const ledmapUpdatePaths = fetchMock.mock.calls.map(([request]) =>
      new URL(String(request)).searchParams.get("path")
    );
    expect(ledmapUpdatePaths).toEqual([
      "/json/info",
      "/json/info",
      "/json/cfg",
      "/edit?func=edit&path=/ledmap.json",
      "/upload",
      "/json/state",
      "/json/state",
      "/edit?func=edit&path=/ledmap.json",
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[5]![1]?.body))).toEqual({ ledmap: 0 });
    expect(persistAfterLedmapUpdate).toHaveBeenCalledOnce();

    for (const failureResponses of [
      [new Response("upload failed", { status: 500 })],
      [
        new Response(JSON.stringify({ success: true })),
        new Response("activation failed", { status: 500 }),
      ],
      [
        new Response(JSON.stringify({ success: true })),
        new Response(JSON.stringify({ success: true })),
        new Response(JSON.stringify({ ledmap: 1 })),
      ],
    ]) {
      const failedPersist = vi.fn().mockResolvedValue(undefined);
      fetchMock.mockReset()
        .mockResolvedValueOnce(new Response(JSON.stringify(info)))
        .mockResolvedValueOnce(new Response(JSON.stringify(info)))
        .mockResolvedValueOnce(new Response(JSON.stringify(config)))
        .mockResolvedValueOnce(new Response('{"map":[2,1,0]}'));
      for (const response of failureResponses) fetchMock.mockResolvedValueOnce(response);
      await expect(connectExistingSimulatorDevice(value, {
        persist: failedPersist,
      })).rejects.toThrow();
      expect(failedPersist).not.toHaveBeenCalled();
    }

    fetchMock.mockReset()
      .mockResolvedValueOnce(new Response("not-json"));
    await expect(synchronizeDeviceLedmap(
      new URL("http://192.168.68.53/"),
      value.ledmapBytes,
    )).rejects.toThrow(/returned invalid JSON/);
    expect(fetchMock).toHaveBeenCalledOnce();

    fetchMock.mockReset()
      .mockResolvedValueOnce(new Response('{"map":[2,1,0]}'));
    await expect(synchronizeDeviceLedmap(
      new URL("http://192.168.68.53/"),
      value.ledmapBytes,
      true,
      () => false,
    )).rejects.toThrow(/was cancelled/);
    expect(fetchMock).toHaveBeenCalledOnce();

    const interruptedContinuation = vi.fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    fetchMock.mockReset()
      .mockResolvedValueOnce(new Response('{"map":[2,1,0]}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));
    await expect(synchronizeDeviceLedmap(
      new URL("http://192.168.68.53/"),
      value.ledmapBytes,
      true,
      interruptedContinuation,
    )).rejects.toThrow(/was cancelled/);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset()
      .mockResolvedValueOnce(new Response(value.ledmapBytes))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ledmap: 0 })))
      .mockResolvedValueOnce(new Response(value.ledmapBytes));
    await expect(synchronizeDeviceLedmap(
      new URL("http://192.168.68.53/"),
      value.ledmapBytes,
      true,
    )).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const persist = vi.fn().mockRejectedValue(new Error("preset write failed"));
    value.allowLedmapUpdate = false;
    fetchMock.mockReset()
      .mockRejectedValueOnce(new Error("mDNS not ready"))
      .mockRejectedValueOnce(new Error("proxy still resolving"))
      .mockResolvedValueOnce(new Response(JSON.stringify(info)))
      .mockResolvedValueOnce(new Response(JSON.stringify(info)))
      .mockResolvedValueOnce(new Response(JSON.stringify(config)))
      .mockResolvedValueOnce(new Response(value.ledmapBytes))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ledmap: 0 })));
    await expect(connectExistingSimulatorDevice(value, {
      discoveryAttempts: 3,
      delay: async () => undefined,
      persist,
    })).rejects.toThrow(/preset write failed/);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("retries the complete restarted snapshot and keeps exact ledmap checks", async () => {
    const value = payload();
    value.ledmapBytes = '{"map":[0,1,2]}\n';
    const info = {
      arch: "esp32",
      ip: "192.168.68.53",
      leds: { bootps: 1, count: 64 },
      mac: "aa:bb:cc:dd:ee:ff",
    };
    const config = {
      id: { mdns: "loo-ume" },
      def: { ps: 1, on: true, bri: 128 },
      hw: { led: { total: 64, maxpwr: 1000, ins: [
        { start: 0, len: 64, pin: [16], order: 0, type: 22 },
      ] } },
      if: { live: { en: true, mso: true, rlm: false, timeout: 25, "no-gc": true } },
    };
    const state = {
      on: true,
      bri: 128,
      ps: 1,
      seg: [value.state.seg],
    };
    const presets = {
      "1": {
        n: "LOO/UME standalone",
        on: true,
        bri: 128,
        seg: value.state.seg,
      },
    };
    const response = (body: unknown): Response =>
      new Response(typeof body === "string" ? body : JSON.stringify(body));
    let resolvePendingState!: (response: Response) => void;
    const pendingState = new Promise<Response>((resolve) => {
      resolvePendingState = resolve;
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ success: true })) // config write
      .mockResolvedValueOnce(response("uploaded"))
      .mockResolvedValueOnce(response(value.ledmapBytes))
      .mockResolvedValueOnce(response([
        "Solid", "Blink", "Breathe", "Wipe", "Wipe Random", "Random Colors",
        "Sweep", "Dynamic", "Rainbow",
      ]))
      .mockResolvedValueOnce(response([
        "Default", "Random Cycle", "Color 1", "Colors 1&2", "Color Gradient",
        "Colors Only", "Forest",
      ]))
      .mockResolvedValueOnce(response({ success: true }))
      .mockResolvedValueOnce(response(presets))
      .mockResolvedValueOnce(response({ leds: { bootps: 1 } }))
      .mockResolvedValueOnce(response(config))
      .mockResolvedValueOnce(response(info))
      .mockResolvedValueOnce(response(state))
      .mockResolvedValueOnce(response("resetting"))
      .mockResolvedValueOnce(response(info)) // mDNS lookup
      .mockResolvedValueOnce(response(info)) // IP lookup
      .mockResolvedValueOnce(response(config))
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockImplementationOnce(() => pendingState)
      .mockResolvedValueOnce(response(presets))
      .mockResolvedValueOnce(response(value.ledmapBytes))
      .mockResolvedValueOnce(response(config))
      .mockResolvedValueOnce(response(info))
      .mockResolvedValueOnce(response(state))
      .mockResolvedValueOnce(response(presets))
      .mockResolvedValueOnce(response(value.ledmapBytes));
    vi.stubGlobal("fetch", fetchMock);

    const verification = applyAndVerifyDevice(
      new URL("http://192.168.68.53/"),
      value,
      () => undefined,
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(19));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(fetchMock).toHaveBeenCalledTimes(19);
    resolvePendingState(response(state));
    await expect(verification).resolves.toEqual(new URL("http://192.168.68.53/"));
    const paths = fetchMock.mock.calls.map(([request]) =>
      new URL(String(request)).searchParams.get("path")
    );
    const ledmapReads = paths
      .map((path, index) => path === "/edit?func=edit&path=/ledmap.json" ? index : -1)
      .filter((index) => index >= 0);
    expect(ledmapReads).toHaveLength(3);
    expect(ledmapReads[0]).toBeLessThan(paths.indexOf("/reset"));
    expect(ledmapReads[1]).toBeGreaterThan(paths.indexOf("/reset"));
    expect(ledmapReads[2]).toBeGreaterThan(paths.indexOf("/reset"));
  });

  it("stops restarted snapshot retries at the strict wall-clock deadline", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error("device still restarting"));
    vi.stubGlobal("fetch", fetchMock);
    const value = payload();
    value.ledmapBytes = '{"map":[0]}\n';
    const verification = verifyRestartedDevice(
      new URL("http://192.168.68.53/"),
      value,
      "aa:bb:cc:dd:ee:ff",
      () => undefined,
    );
    const rejection = expect(verification).rejects.toThrow(
      /did not stabilize: device still restarting/,
    );
    await vi.advanceTimersByTimeAsync(
      RESTART_VERIFICATION_DEADLINE_MS -
        RESTART_VERIFICATION_MINIMUM_WINDOW_MS + 500,
    );
    const callsAtMinimumWindow = fetchMock.mock.calls.length;
    expect(callsAtMinimumWindow).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(RESTART_VERIFICATION_MINIMUM_WINDOW_MS - 500);
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(callsAtMinimumWindow);
  });
});
