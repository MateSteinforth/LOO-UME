import { describe, expect, it, vi } from "vitest";
import { loadGeneratorStatus } from "../web/src/GeneratorStatus.ts";

const READY = {
  schemaVersion: "1.0.0",
  available: true,
  generator: "manifold",
  supportedVersion: "3.5.1",
  detectedVersion: "3.5.1",
  message: "Manifold 3.5.1 is ready for local generation.",
} as const;

describe("local generator status discovery", () => {
  it("uses in-browser Manifold without requesting the loopback API on LAN origins", async () => {
    const fetchStatus = vi.fn();

    await expect(loadGeneratorStatus(fetchStatus, "192.168.68.61"))
      .resolves.toEqual({
        schemaVersion: "1.0.0",
        available: true,
        generator: "manifold",
        supportedVersion: "3.5.1",
        detectedVersion: "3.5.1",
        message: "Manifold 3.5.1 is ready for in-browser generation.",
      });
    expect(fetchStatus).not.toHaveBeenCalled();
  });

  it("accepts a ready Manifold status", async () => {
    const fetchStatus = vi.fn(async () => Response.json(READY));

    await expect(loadGeneratorStatus(fetchStatus)).resolves.toEqual(READY);
    expect(fetchStatus).toHaveBeenCalledWith("./api/generator-status", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  });

  it.each(["localhost", "127.0.0.1", "::1", "[::1]"])(
    "keeps helper discovery for loopback hostname %s",
    async (hostname) => {
      const fetchStatus = vi.fn(async () => Response.json(READY));

      await expect(loadGeneratorStatus(fetchStatus, hostname))
        .resolves.toEqual(READY);
      expect(fetchStatus).toHaveBeenCalledOnce();
    },
  );
  it("accepts an unavailable status and keeps its repair message", async () => {
    const status = {
      ...READY,
      available: false,
      detectedVersion: undefined,
      message: "Manifold WASM could not be loaded. Restart LOO/UME.",
    };

    await expect(loadGeneratorStatus(async () => Response.json(status)))
      .resolves.toEqual({
        schemaVersion: "1.0.0",
        available: false,
        generator: "manifold",
        supportedVersion: "3.5.1",
        message: status.message,
      });
  });

  it("uses a safe unavailable status for a malformed response", async () => {
    const result = await loadGeneratorStatus(async () => Response.json({
      ...READY,
      supportedVersion: "9.9.9",
    }));

    expect(result.available).toBe(false);
    expect(result.message).toContain("status response is invalid");
    expect(result.message).toContain("supportedVersion must be 3.5.1");
  });

  it("bounds an HTML history fallback without exposing parser text", async () => {
    const result = await loadGeneratorStatus(async () =>
      new Response("<!doctype html><title>LOO/UME</title>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );

    expect(result.available).toBe(false);
    expect(result.message).toContain(
      "Local generator status returned an HTML page",
    );
    expect(result.message).not.toContain("Unexpected token");
  });

  it("uses a safe unavailable status for a non-OK response", async () => {
    const result = await loadGeneratorStatus(async () =>
      new Response("unavailable", { status: 503 })
    );

    expect(result.available).toBe(false);
    expect(result.message).toBe(
      "Printable STL generation is unavailable because the local generator status request failed with HTTP 503.",
    );
  });

  it("uses a safe unavailable status when fetch fails", async () => {
    const result = await loadGeneratorStatus(async () => {
      throw new Error("connection refused");
    });

    expect(result.available).toBe(false);
    expect(result.message).toBe(
      "Printable STL generation is unavailable because the local generator status could not be read: connection refused.",
    );
  });
});
