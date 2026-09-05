import { describe, expect, it, vi } from "vitest";
import { scanEsp32WifiNetworks } from "../web/src/Esp32Setup.ts";
import { createWifiCredentialsClient } from "../web/src/WifiCredentialsClient.ts";

describe("ESP32 Wi-Fi selection", () => {
  it("requires desktop storage in Electron and validates password bytes", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response("", { status: 404 }));
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    const client = createWifiCredentialsClient(request, storage, true);
    await expect(
      client.save({ ssid: "Studio", password: "test-password" }),
    ).rejects.toThrow("Desktop Wi-Fi storage is unavailable");
    await expect(
      client.save({ ssid: "Studio", password: "test-password" }),
    ).rejects.toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
    await expect(
      client.save({ ssid: "Studio", password: "é".repeat(33) }),
    ).rejects.toThrow("valid Wi-Fi");
  });
  it("sorts visible networks and releases the serial port after scanning", async () => {
    const port = {
      getInfo: () => ({ usbVendorId: 0x10c4, usbProductId: 0xea60 }),
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as SerialPort;
    const session = {
      initialize: vi
        .fn()
        .mockResolvedValue({ firmware: "WLED", chipFamily: "esp32" }),
      scan: vi.fn().mockResolvedValue([
        { name: "Studio", rssi: -80 },
        { name: "Guest", rssi: -65 },
        { name: "Studio", rssi: -45 },
        { name: "", rssi: -20 },
      ]),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const serial = { requestPort: vi.fn().mockResolvedValue(port) };
    expect(await scanEsp32WifiNetworks(serial, async () => session)).toEqual([
      { name: "Studio", rssi: -45 },
      { name: "Guest", rssi: -65 },
    ]);
    expect(session.close).toHaveBeenCalledOnce();
    expect(port.close).toHaveBeenCalledOnce();
    session.initialize.mockRejectedValueOnce(new Error("No Improv"));
    await expect(
      scanEsp32WifiNetworks(serial, async () => session),
    ).rejects.toThrow("No Improv");
    expect(session.close).toHaveBeenCalledTimes(2);
    expect(port.close).toHaveBeenCalledTimes(2);
  });

  it("restores browser credentials and forgets them after pending saves", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response("Not found", { status: 404 }),
      );
    const client = createWifiCredentialsClient(request, storage);
    const value = { ssid: "Studio", password: "test-password" };
    await client.save(value);
    expect(await createWifiCredentialsClient(request, storage).load()).toEqual(
      value,
    );
    await Promise.all([client.save(value), client.forget()]);
    expect(await client.load()).toBeNull();
    expect(values.size).toBe(0);
  });

  it("does not fall back to browser password storage when desktop storage fails", async () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = createWifiCredentialsClient(request, storage);
    await expect(
      client.save({ ssid: "Studio", password: "test-password" }),
    ).rejects.toThrow();
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
