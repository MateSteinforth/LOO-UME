import { createServer, type Server } from "node:http";
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

function fakeRuntime(available: boolean): OpenScadRuntime {
  return {
    status: status(available),
    async render(_inputScad, outputStl) {
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

describe("shared editor pipeline handler", () => {
  it("serves the exact generator status contract", async () => {
    const handler = await createEditorPipelineHandler({
      openScadRuntime: fakeRuntime(false),
    });
    const origin = await listen(handler);
    const response = await fetch(`${origin}/api/generator-status`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(status(false));
  });

  it("returns 503 before reading a generation request when OpenSCAD is absent", async () => {
    const handler = await createEditorPipelineHandler({
      openScadRuntime: fakeRuntime(false),
    });
    const origin = await listen(handler);
    const response = await fetch(`${origin}/api/editor-pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: "{}",
    });
    expect(response.status).toBe(503);
    expect((await response.json() as { error: string }).error).toContain("not found");
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
});
