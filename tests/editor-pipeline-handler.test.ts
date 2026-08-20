import { createServer, request as httpRequest, type Server } from "node:http";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEditorPipelineHandler } from "../scripts/editor-pipeline-handler.ts";
import type {
  OpenScadGeneratorStatus,
  OpenScadRuntime,
} from "../src/cad/OpenScadRuntime.ts";
import { serializeAsciiStl } from "../src/cad/Stl.ts";
import { sha256Bytes } from "../src/sculpture/GeneratedMechanics.ts";

const temporaryDirectories: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolvePromise) =>
    server.close(() => resolvePromise())
  )));
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

function status(available: boolean): OpenScadGeneratorStatus {
  return {
    schemaVersion: "1.0.0",
    available,
    generator: "openscad",
    supportedVersion: "2021.01",
    ...(available ? { detectedVersion: "2021.01" } : {}),
    message: available
      ? "OpenSCAD 2021.01 is ready for local generation."
      : "OpenSCAD was not found. Install OpenSCAD 2021.01.",
  };
}

function fakeRuntime(available: boolean, onRender?: () => void): OpenScadRuntime {
  return {
    status: status(available),
    async render(_inputScad, outputStl) {
      onRender?.();
      await writeFile(
        outputStl,
        serializeAsciiStl(
          "fake-part",
          [[0, 0, 0], [10, 0, 0], [0, 10, 2]],
          [[0, 1, 2]],
        ),
      );
    },
    async close() {},
  };
}

async function listen(handler: Awaited<ReturnType<typeof createEditorPipelineHandler>>) {
  const server = createServer((request, response) => {
    void handler.handle(request, response).then((handled) => {
      if (!handled) {
        response.statusCode = 404;
        response.end();
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolvePromise) =>
    server.listen(0, "127.0.0.1", resolvePromise)
  );
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}
async function postWithDeclaredLength(
  origin: string,
  contentLength: number,
): Promise<{ statusCode: number; body: string }> {
  const url = new URL("/api/editor-pipeline", origin);
  return await new Promise((resolvePromise, reject) => {
    const request = httpRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data; boundary=size-limit-test",
        "Content-Length": String(contentLength),
        Origin: origin,
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => resolvePromise({
        statusCode: response.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    request.on("error", reject);
    request.end();
  });
}

async function expectNoPublishedProject(
  generatedPublicDirectory: string,
  runId: string,
): Promise<void> {
  await expect(readFile(join(
    generatedPublicDirectory,
    "generated-projects",
    runId,
    "sculpture.json",
  ))).rejects.toMatchObject({ code: "ENOENT" });
}

describe("shared editor pipeline handler", () => {
  it("serves the exact generator status contract", async () => {
    const handler = await createEditorPipelineHandler({
      openScadRuntime: fakeRuntime(false),
    });
    const origin = await listen(handler);
    const response = await fetch(`${origin}/api/generator-status`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      schemaVersion: "1.0.0",
      available: true,
      generator: "manifold",
      supportedVersion: "3.5.1",
      detectedVersion: "3.5.1",
    });
  });

  it("rejects an empty generation body after Manifold is available", async () => {
    const handler = await createEditorPipelineHandler({
      openScadRuntime: fakeRuntime(false),
    });
    const origin = await listen(handler);
    const response = await fetch(`${origin}/api/editor-pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: "{}",
    });
    expect(response.status).toBe(400);
  });

  it("rejects cross-origin generation requests", async () => {
    const handler = await createEditorPipelineHandler({
      openScadRuntime: fakeRuntime(true),
    });
    const origin = await listen(handler);
    const response = await fetch(`${origin}/api/editor-pipeline`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://malicious.example",
      },
      body: "{}",
    });
    const wrongScheme = await fetch(`${origin}/api/editor-pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin.replace("http:", "https:") },
      body: "{}",
    });
    expect(wrongScheme.status).toBe(403);

    expect(response.status).toBe(403);
  });
  it("rejects oversized raw JSON, sculpture fields, and multipart requests before generation", async () => {
    const generatedPublicDirectory = await mkdtemp(join(tmpdir(), "pipeline-limits-"));
    temporaryDirectories.push(generatedPublicDirectory);
    let renderCalls = 0;
    const handler = await createEditorPipelineHandler({
      rootDirectory: process.cwd(),
      generatedPublicDirectory,
      openScadRuntime: fakeRuntime(true, () => { renderCalls += 1; }),
    });
    const origin = await listen(handler);

    const rawResponse = await fetch(`${origin}/api/editor-pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({
        id: "oversized-raw-json",
        padding: "x".repeat(5 * 1024 * 1024),
      }),
    });
    expect(rawResponse.status).toBe(413);
    expect((await rawResponse.json() as { error: string }).error)
      .toBe("Sculpture JSON exceeds 5 MB.");

    const form = new FormData();
    form.append(
      "sculpture",
      new Blob(["x".repeat(5 * 1024 * 1024 + 1)], {
        type: "application/json",
      }),
      "sculpture.json",
    );
    const multipartResponse = await fetch(`${origin}/api/editor-pipeline`, {
      method: "POST",
      headers: { Origin: origin },
      body: form,
    });
    expect(multipartResponse.status).toBe(413);
    expect((await multipartResponse.json() as { error: string }).error)
      .toBe("Sculpture JSON exceeds 5 MB.");

    const totalResponse = await postWithDeclaredLength(
      origin,
      64 * 1024 * 1024 + 1,
    );
    expect(totalResponse.statusCode).toBe(413);
    expect((JSON.parse(totalResponse.body) as { error: string }).error)
      .toBe("Generation request exceeds 64 MB.");

    expect(renderCalls).toBe(0);
    await expectNoPublishedProject(
      generatedPublicDirectory,
      "oversized-raw-json-editor-preview",
    );
    await expectNoPublishedProject(
      generatedPublicDirectory,
      "oversized-multipart-json-editor-preview",
    );
    await expectNoPublishedProject(
      generatedPublicDirectory,
      "oversized-total-request-editor-preview",
    );
  });

  it("runs the bounded panel-outline generator and publishes its exact response", async () => {
    const generatedPublicDirectory = await mkdtemp(join(tmpdir(), "pipeline-public-"));
    temporaryDirectories.push(generatedPublicDirectory);
    const handler = await createEditorPipelineHandler({
      rootDirectory: process.cwd(),
      generatedPublicDirectory,
      openScadRuntime: fakeRuntime(true),
    });
    const origin = await listen(handler);
    const fixture = await readFile(
      "sculptures/panel-outline-prism/sculpture.json",
      "utf8",
    );
    const response = await fetch(`${origin}/api/editor-pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: fixture,
    });
    expect(response.status).toBe(200);
    const result = await response.json() as {
      ok: boolean;
      assetSculptureId: string;
      projectSource: string;
      definition: { generatedMechanics?: unknown };
    };
    expect(result).toMatchObject({
      ok: true,
      assetSculptureId: "panel-outline-prism-boundary-fixture-editor-preview",
      projectSource:
        "./generated-projects/panel-outline-prism-boundary-fixture-editor-preview/sculpture.json",
    });
    expect(result.definition.generatedMechanics).toBeDefined();
    await expect(readFile(join(
      generatedPublicDirectory,
      "generated-projects",
      result.assetSculptureId,
      "sculpture.json",
    ), "utf8")).resolves.toContain('"generation": "complete"');
  });

  it("publishes only a verified multipart design surface and preserves prior output on failure", async () => {
    const generatedPublicDirectory = await mkdtemp(join(tmpdir(), "pipeline-design-"));
    temporaryDirectories.push(generatedPublicDirectory);
    const handler = await createEditorPipelineHandler({
      rootDirectory: process.cwd(),
      generatedPublicDirectory,
      openScadRuntime: fakeRuntime(true),
    });
    const origin = await listen(handler);
    const definition = JSON.parse(await readFile(
      "sculptures/panel-outline-prism/sculpture.json",
      "utf8",
    )) as Record<string, unknown>;
    definition.id = "panel-outline-with-design";
    const glbBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]);
    definition.designSurface = {
      kind: "triangle-mesh",
      format: "glb",
      source: "design/source.glb",
      sha256: sha256Bytes(glbBytes),
      scaleToMillimeters: 1,
      status: "watertight",
    };
    const requestBody = (bytes?: Uint8Array): FormData => {
      const form = new FormData();
      form.append(
        "sculpture",
        new Blob([JSON.stringify(definition)], { type: "application/json" }),
        "sculpture.json",
      );
      if (bytes) {
        form.append(
          "designSurface",
          new Blob([Uint8Array.from(bytes)], { type: "model/gltf-binary" }),
          "source.glb",
        );
      }
      return form;
    };

    const response = await fetch(`${origin}/api/editor-pipeline`, {
      method: "POST",
      headers: { Origin: origin },
      body: requestBody(glbBytes),
    });
    expect(response.status).toBe(200);
    const result = await response.json() as { assetSculptureId: string };
    const publishedGlb = join(
      generatedPublicDirectory,
      "generated-projects",
      result.assetSculptureId,
      "design",
      "source.glb",
    );
    await expect(readFile(publishedGlb)).resolves.toEqual(Buffer.from(glbBytes));

    const missing = await fetch(`${origin}/api/editor-pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(definition),
    });
    expect(missing.status).toBe(400);
    expect((await missing.json() as { error: string }).error)
      .toMatch(/verified bytes.*design surface.*source\.glb/i);

    const tampered = Uint8Array.from(glbBytes);
    tampered[0] ^= 0xff;
    const mismatch = await fetch(`${origin}/api/editor-pipeline`, {
      method: "POST",
      headers: { Origin: origin },
      body: requestBody(tampered),
    });
    expect(mismatch.status).toBe(400);
    expect((await mismatch.json() as { error: string }).error)
      .toMatch(/failed SHA-256 verification/);
    await expect(readFile(publishedGlb)).resolves.toEqual(Buffer.from(glbBytes));
  });
});
