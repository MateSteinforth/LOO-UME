import { describe, expect, it } from "vitest";
import { readJsonResponse } from "../web/src/JsonResponse.ts";

describe("JSON response reader", () => {
  it("reads valid JSON without depending on a media-type header", async () => {
    await expect(readJsonResponse(
      new Response('{"ready":true}'),
      "Sculpture registry",
    )).resolves.toEqual({ ready: true });
  });

  it("turns an HTML history fallback into one bounded operator error", async () => {
    await expect(readJsonResponse(
      new Response("<!doctype html><title>WLED Orbital Lab</title>"),
      "Sculpture JSON",
    )).rejects.toThrow(
      "Sculpture JSON returned an HTML page from the requested URL instead of JSON. " +
        "Restart the local preview if staged project files changed, then try again.",
    );
  });

  it("does not expose the JSON parser message for malformed input", async () => {
    await expect(readJsonResponse(
      new Response("{"),
      "Panel profile",
    )).rejects.toThrow(
      "Panel profile returned invalid JSON from the requested URL.",
    );
  });
});
