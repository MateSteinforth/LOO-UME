import { describe, expect, it } from "vitest";
import { ManifoldRuntimeUnavailableError } from "../src/cad/ManifoldRuntime.ts";
import {
  readEditorPipelineResult,
  shouldUseEditorPipelineFallback,
} from "../web/src/EditorPipelineResponse.ts";

describe("editor pipeline response", () => {
  it("reads a JSON object response", async () => {
    const result = await readEditorPipelineResult(new Response(
      JSON.stringify({
        ok: true,
        assetSculptureId: "generated",
        definition: {},
      }),
      { headers: { "content-type": "application/json; charset=utf-8" } },
    ));
    expect(result).toEqual({
      ok: true,
      assetSculptureId: "generated",
      definition: {},
    });
  });

  it("rejects an HTML app fallback without exposing a JSON syntax error", async () => {
    await expect(readEditorPipelineResult(new Response("<!doctype html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }))).rejects.toThrow(
      "Local generation fallback returned text/html instead of JSON (HTTP 200).",
    );
  });

  it("rejects malformed JSON with a stable operator error", async () => {
    await expect(readEditorPipelineResult(new Response("{", {
      status: 502,
      headers: { "content-type": "application/json" },
    }))).rejects.toThrow(
      "Local generation fallback returned invalid JSON (HTTP 502).",
    );
  });

  it("rejects incorrect field types before the caller uses them", async () => {
    await expect(readEditorPipelineResult(new Response(JSON.stringify({
      ok: true,
      assetSculptureId: "generated",
      definition: {},
      log: {},
    }), {
      headers: { "content-type": "application/json" },
    }))).rejects.toThrow(
      "invalid JSON contract (HTTP 200): log must be a string when present",
    );
  });

  it("selects fallback only for the typed runtime-load failure", () => {
    expect(shouldUseEditorPipelineFallback(
      new ManifoldRuntimeUnavailableError(new Error("load failed")),
    )).toBe(true);
    expect(shouldUseEditorPipelineFallback(
      new Error("Manifold closure is not valid"),
    )).toBe(false);
    expect(shouldUseEditorPipelineFallback(
      new Error("WebAssembly geometry validation failed"),
    )).toBe(false);
  });
});
