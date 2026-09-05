import { request as httpRequest } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  startLocalEditorServer,
  type LocalEditorServer,
} from "../scripts/local-editor-server.ts";
import {
  createApplicationUpdateHandler,
  type ApplicationUpdateHandler,
  type ApplicationUpdateCommand,
} from "../scripts/application-update-handler.ts";
import { sha256Bytes } from "../src/sculpture/GeneratedMechanics.ts";
import {
  getGeneratedMechanicsState,
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";
import { parsePanelHardwareProfile } from "../src/sculpture/Definition.ts";

const temporaryDirectories: string[] = [];
const localServers: LocalEditorServer[] = [];

afterEach(async () => {
  await Promise.all(localServers.splice(0).map((server) => server.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixtureServer(
  applicationUpdateHandler?: ApplicationUpdateHandler,
): Promise<LocalEditorServer> {
  const root = await mkdtemp(join(tmpdir(), "local-editor-server-"));
  temporaryDirectories.push(root);
  const distDirectory = join(root, "dist");
  const generatedPublicDirectory = join(root, "public");
  await mkdir(join(generatedPublicDirectory, "generated-projects", "sample"), {
    recursive: true,
  });
  await mkdir(distDirectory, { recursive: true });
  await writeFile(join(distDirectory, "index.html"), "<h1>Orbital Lab</h1>");
  await writeFile(
    join(
      generatedPublicDirectory,
      "generated-projects",
      "sample",
      "sculpture.json",
    ),
    '{"id":"sample"}\n',
  );
  const server = await startLocalEditorServer({
    rootDirectory: process.cwd(),
    distDirectory,
    generatedPublicDirectory,
    port: 0,
    applicationUpdateHandler,
  });
  localServers.push(server);
  return server;
}

function requestWithHost(
  port: number,
  path: string,
  host: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise, reject) => {
    const request = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path,
        headers: { Host: host },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () =>
          resolvePromise({
            status: response.statusCode ?? 0,
            body,
          }),
        );
      },
    );
    request.on("error", reject);
    request.end();
  });
}

describe("production local editor server", () => {
  it("serves the UI and Manifold status", async () => {
    const server = await fixtureServer();
    const page = await fetch(server.url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Orbital Lab");
    const status = await fetch(`${server.url}api/generator-status`);
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      schemaVersion: "1.0.0",
      available: true,
      generator: "manifold",
      supportedVersion: "3.5.1",
    });
    const library = await fetch(`${server.url}api/project-library`);
    expect(library.status).toBe(200);
    expect(await library.json()).toMatchObject({
      schemaVersion: "1.0.0",
      projects: expect.arrayContaining([
        expect.objectContaining({
          id: "generated-rhombicosidodecahedron-41-panel-preview",
          location: "demo",
          readOnly: false,
        }),
      ]),
    });
  });

  it("serves generated output as a live same-origin overlay", async () => {
    const server = await fixtureServer();
    const response = await fetch(
      `${server.url}generated-projects/sample/sculpture.json`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ id: "sample" });
  });

  it("reports and applies one update through the loopback-only endpoint", async () => {
    const applied = vi.fn();
    const commands: Array<{ command: string; args: readonly string[] }> = [];
    let releaseUpdate: (() => void) | undefined;
    const updateGate = new Promise<void>((resolvePromise) => {
      releaseUpdate = resolvePromise;
    });
    const command: ApplicationUpdateCommand = async (executable, args) => {
      commands.push({ command: executable, args });
      if (executable === "/bin/sh") await updateGate;
      const text = args.join(" ");
      if (text === "branch --show-current")
        return { stdout: "main\n", stderr: "" };
      if (text === "remote get-url origin") {
        return {
          stdout: "https://github.com/MateSteinforth/LOO-UME.git\n",
          stderr: "",
        };
      }
      if (text === "rev-parse --verify HEAD")
        return { stdout: "1111\n", stderr: "" };
      if (text === "rev-parse --verify origin/main")
        return { stdout: "2222\n", stderr: "" };
      if (text === "status --porcelain --untracked-files=normal") {
        return { stdout: "?? saved-project.loo.zip\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    };
    const handler = createApplicationUpdateHandler({
      rootDirectory: process.cwd(),
      command,
      onUpdateApplied: applied,
    });
    const server = await fixtureServer(handler);
    const status = await fetch(`${server.url}api/application-update`);
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      schemaVersion: "1.0.0",
      updateAvailable: true,
      canApply: true,
      localChanges: true,
    });

    const blocked = await fetch(`${server.url}api/application-update`, {
      method: "POST",
      headers: { Origin: "https://example.invalid" },
    });
    expect(blocked.status).toBe(403);
    const appliedRequest = fetch(`${server.url}api/application-update`, {
      method: "POST",
      headers: { Origin: server.url.slice(0, -1) },
    });
    await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 20));
    const concurrent = await fetch(`${server.url}api/application-update`, {
      method: "POST",
      headers: { Origin: server.url.slice(0, -1) },
    });
    expect(concurrent.status).toBe(409);
    expect(await concurrent.json()).toMatchObject({
      error: "A LOO/UME update is already running.",
    });
    releaseUpdate?.();
    const appliedResponse = await appliedRequest;
    expect(appliedResponse.status).toBe(200);
    expect(await appliedResponse.json()).toMatchObject({ ok: true });
    await new Promise<void>((resolvePromise) =>
      setTimeout(resolvePromise, 150),
    );
    expect(applied).toHaveBeenCalledOnce();
    expect(
      commands.some(
        ({ command: executable, args }) =>
          executable === "/bin/sh" &&
          args[0]?.endsWith("bootstrap-update-apply.sh"),
      ),
    ).toBe(true);
  });

  it("blocks non-loopback Host values and unsafe encoded paths", async () => {
    const server = await fixtureServer();
    const blockedHost = await requestWithHost(
      server.port,
      "/",
      "malicious.example",
    );
    expect(blockedHost.status).toBe(403);
    const unsafePath = await requestWithHost(
      server.port,
      "/generated-projects/%5csecret",
      `127.0.0.1:${server.port}`,
    );
    expect(unsafePath.status).toBe(400);
  });

  it("rejects invalid generation JSON while Manifold is available", async () => {
    const server = await fixtureServer();
    const origin = server.url.slice(0, -1);
    const response = await fetch(`${server.url}api/editor-pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: "{}",
    });
    expect(response.status).toBe(400);
  });

  it("stops accepting connections after clean shutdown", async () => {
    const server = await fixtureServer();
    await server.close();
    await expect(fetch(server.url)).rejects.toThrow();
  });

  it("closes the production server once", async () => {
    const server = await fixtureServer();
    const firstClose = server.close(100);
    const secondClose = server.close(100);
    expect(secondClose).toBe(firstClose);
    await expect(firstClose).resolves.toBeUndefined();
    await expect(fetch(server.url)).rejects.toThrow();
  });

  it("generates and serves a current project through the production server", async () => {
    const server = await fixtureServer();
    const origin = server.url.slice(0, -1);
    const fixture = JSON.parse(
      await readFile("sculptures/panel-outline-prism/sculpture.json", "utf8"),
    ) as Record<string, unknown>;
    const glbBytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]);
    fixture.designSurface = {
      kind: "triangle-mesh",
      format: "glb",
      source: "design/source.glb",
      sha256: sha256Bytes(glbBytes),
      scaleToMillimeters: 1,
      status: "watertight",
    };
    const requestBody = new FormData();
    requestBody.append(
      "sculpture",
      new Blob([JSON.stringify(fixture)], { type: "application/json" }),
      "sculpture.json",
    );
    requestBody.append(
      "designSurface",
      new Blob([Uint8Array.from(glbBytes)], { type: "model/gltf-binary" }),
      "source.glb",
    );
    const response = await fetch(`${server.url}api/editor-pipeline`, {
      method: "POST",
      headers: { Origin: origin },
      body: requestBody,
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      ok: boolean;
      projectSource: string;
      definition: unknown;
    };
    expect(result.ok).toBe(true);
    const definition = parsePanelAssemblyDefinition(result.definition);
    const profile = parsePanelHardwareProfile(
      JSON.parse(
        await readFile("catalog/panels/ws2812b-8x8-66x65.json", "utf8"),
      ),
    );
    expect(getGeneratedMechanicsState(definition, profile)).toBe("current");

    const publishedResponse = await fetch(
      new URL(result.projectSource, server.url),
    );
    expect(publishedResponse.status).toBe(200);
    expect(publishedResponse.headers.get("cache-control")).toBe("no-store");
    const publishedDefinition = parsePanelAssemblyDefinition(
      await publishedResponse.json(),
    );
    expect(publishedDefinition).toEqual(definition);
    expect(getGeneratedMechanicsState(publishedDefinition, profile)).toBe(
      "current",
    );

    const designSurface = publishedDefinition.designSurface!;
    const designResponse = await fetch(
      new URL(
        `${result.projectSource.slice(0, -"sculpture.json".length)}${designSurface.source}`,
        server.url,
      ),
    );
    expect(designResponse.status).toBe(200);
    expect(designResponse.headers.get("content-type")).toBe(
      "model/gltf-binary",
    );
    expect(new Uint8Array(await designResponse.arrayBuffer())).toEqual(
      glbBytes,
    );

    for (const part of publishedDefinition.generatedMechanics?.parts ?? []) {
      const partResponse = await fetch(
        new URL(
          `${result.projectSource.slice(0, -"sculpture.json".length)}${part.source}`,
          server.url,
        ),
      );
      expect(partResponse.status).toBe(200);
      expect((await partResponse.arrayBuffer()).byteLength).toBeGreaterThan(0);
    }
  });
});
