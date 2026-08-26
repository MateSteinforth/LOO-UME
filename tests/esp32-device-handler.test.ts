import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  createEsp32DeviceHandler,
  esp32TargetUrl,
  resolvedEsp32Target,
} from "../scripts/esp32-device-handler.ts";

describe("ESP32 loopback device proxy policy", () => {
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
});
