import { describe, expect, it, vi } from "vitest";
import { loadGeneratorStatus } from "../web/src/GeneratorStatus.ts";

const READY = {
  schemaVersion: "1.0.0",
  available: true,
  generator: "openscad",
  supportedVersion: "2021.01",
  detectedVersion: "2021.01",
  message: "OpenSCAD 2021.01 is ready for local generation.",
} as const;

describe("local generator status discovery", () => {
  it("accepts a ready OpenSCAD status", async () => {
    const fetchStatus = vi.fn(async () => Response.json(READY));

    await expect(loadGeneratorStatus(fetchStatus)).resolves.toEqual(READY);
    expect(fetchStatus).toHaveBeenCalledWith("./api/generator-status", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  });

  it("accepts an unavailable status and keeps its repair message", async () => {
    const status = {
      ...READY,
      available: false,
      detectedVersion: undefined,
      message: "Install OpenSCAD 2021.01, and then restart WLED Orbital Lab.",
    };

    await expect(loadGeneratorStatus(async () => Response.json(status)))
      .resolves.toEqual({
        schemaVersion: "1.0.0",
        available: false,
        generator: "openscad",
        supportedVersion: "2021.01",
        message: status.message,
      });
  });

  it("uses a safe unavailable status for a malformed response", async () => {
    const result = await loadGeneratorStatus(async () => Response.json({
      ...READY,
      supportedVersion: "2024.01",
    }));

    expect(result.available).toBe(false);
    expect(result.message).toContain("status response is invalid");
    expect(result.message).toContain("supportedVersion must be 2021.01");
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
