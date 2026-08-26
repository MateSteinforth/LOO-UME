import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  createEsp32DeviceHandler,
  createDdpPacket,
  esp32TargetUrl,
  resolvedEsp32Target,
} from "../scripts/esp32-device-handler.ts";

describe("ESP32 loopback device proxy policy", () => {
  it("creates one pushed RGB DDP frame for one to three panels", () => {
    const pixels = Uint8Array.from({ length: 192 }, (_, index) => index & 0xff);
    const packet = createDdpPacket(pixels, 7);
    expect(Array.from(packet.slice(0, 10))).toEqual([
      0x41, 7, 0x0b, 1, 0, 0, 0, 0, 0, 192,
    ]);
    expect(packet.slice(10)).toEqual(pixels);
    const threePanels = createDdpPacket(new Uint8Array(576), 8);
    expect(Array.from(threePanels.slice(0, 10))).toEqual([
      0x41, 8, 0x0b, 1, 0, 0, 0, 0, 2, 64,
    ]);
    expect(() => createDdpPacket(pixels.slice(1), 7)).toThrow(/1 through 192/);
    expect(() => createDdpPacket(new Uint8Array(579), 7)).toThrow(/1 through 192/);
    expect(() => createDdpPacket(pixels, 0)).toThrow(/1 through 15/);
  });

  it("allows only fixed WLED operations on private addresses", () => {
    expect(esp32TargetUrl("192.168.68.72", "/json/info", "GET").href).toBe(
      "http://192.168.68.72/json/info",
    );
    expect(esp32TargetUrl("loo-ume.local", "/reset", "GET").href).toBe(
      "http://loo-ume.local/reset",
    );
    expect(() => esp32TargetUrl("8.8.8.8", "/json/info", "GET")).toThrow(
      /not allowed/,
    );
    expect(() => esp32TargetUrl("127.0.0.1", "/json/info", "GET")).toThrow(
      /not allowed/,
    );
    expect(() => esp32TargetUrl("192.168.68.72", "/", "GET")).toThrow(
      /not allowed/,
    );
    expect(() => esp32TargetUrl(
      "192.168.68.72",
      "/json/info?redirect=http://example.com",
      "GET",
    )).toThrow(/not allowed/);
  });

  it("pins the fixed mDNS name to private resolved addresses", async () => {
    await expect(resolvedEsp32Target(
      "loo-ume.local",
      "/json/info",
      "GET",
      async () => ["192.168.68.53"],
    )).resolves.toEqual(new URL("http://192.168.68.53/json/info"));
    await expect(resolvedEsp32Target(
      "loo-ume.local",
      "/json/info",
      "GET",
      async () => ["8.8.8.8"],
    )).rejects.toThrow(/private addresses/);
  });

  it("requires the editor header before forwarding a fixed request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ mac: "aa:bb:cc:dd:ee:ff" }),
      { headers: { "Content-Type": "application/json" } },
    ));
    const handler = createEsp32DeviceHandler(fetchMock);
    const response = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;
    const request = Readable.from([]) as unknown as IncomingMessage;
    Object.assign(request, {
      method: "GET",
      url: "/api/esp32-device?address=192.168.68.53&path=%2Fjson%2Finfo",
      headers: { host: "localhost:4173" },
    });
    await expect(handler.handle(request, response)).resolves.toBe(true);
    expect(response.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();

    request.headers["x-loo-ume-esp32"] = "1";
    await expect(handler.handle(request, response)).resolves.toBe(true);
    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("http://192.168.68.53/json/info"),
      expect.objectContaining({ method: "GET", redirect: "error" }),
    );
  });

  it("bounds mDNS resolution before it can start an upstream request", async () => {
    const fetchMock = vi.fn();
    const handler = createEsp32DeviceHandler(
      fetchMock,
      () => new Promise(() => undefined),
      1,
    );
    const response = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;
    const request = Readable.from([]) as unknown as IncomingMessage;
    Object.assign(request, {
      method: "GET",
      url: "/api/esp32-device?address=loo-ume.local&path=%2Fjson%2Finfo",
      headers: {
        host: "localhost:4173",
        "x-loo-ume-esp32": "1",
      },
    });
    await expect(handler.handle(request, response)).resolves.toBe(true);
    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a bounded private-address DDP frame through the loopback endpoint", async () => {
    const sent = vi.fn().mockResolvedValue(undefined);
    const handler = createEsp32DeviceHandler(fetch, undefined, undefined, sent);
    const response = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;
    const pixels = Buffer.alloc(192, 23);
    const request = Readable.from([pixels]) as unknown as IncomingMessage;
    Object.assign(request, {
      method: "POST",
      url: "/api/esp32-frame?address=192.168.68.53",
      headers: {
        host: "localhost:4173",
        "content-type": "application/octet-stream",
        "x-loo-ume-esp32": "1",
      },
    });
    await expect(handler.handle(request, response)).resolves.toBe(true);
    expect(response.statusCode).toBe(204);
    expect(sent).toHaveBeenCalledWith(
      "192.168.68.53",
      expect.objectContaining({ byteLength: 202 }),
    );
  });
});
