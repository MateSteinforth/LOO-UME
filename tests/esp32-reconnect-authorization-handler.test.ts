import { createServer, request as httpRequest, type Server } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createEsp32ReconnectAuthorizationHandler,
  type Esp32ReconnectAuthorizationHandler,
} from "../scripts/esp32-reconnect-authorization-handler.ts";
import { parsePanelAssemblyDefinition } from "../src/sculpture/PanelAssembly.ts";
import { createProjectPackageZip } from "../web/src/ProjectPackage.ts";
import { PORTABLE_ZIP_RESOURCE_LIMITS } from "../web/src/ZipResourceLimits.ts";

const servers: Server[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function serve(
  handler: Esp32ReconnectAuthorizationHandler,
): Promise<string> {
  const server = createServer((request, response) => {
    void handler.handle(request, response).then((handled) => {
      if (!handled) {
        response.statusCode = 404;
        response.end("Not found.");
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function projectPackageBytes(name: string): Promise<Uint8Array> {
  const definition = parsePanelAssemblyDefinition(
    JSON.parse(
      await readFile(
        "sculptures/rhombicosidodecahedron/sculpture.json",
        "utf8",
      ),
    ),
  );
  definition.name = name;
  return createProjectPackageZip(definition, new Map(), definition.id);
}

async function requestWithDeclaredLength(
  url: string,
  contentLength: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: "PUT",
        headers: {
          "X-LOO-UME-ESP32": "1",
          Origin: target.origin,
          "Content-Type": "application/zip",
          "Content-Length": String(contentLength),
          Connection: "close",
        },
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode ?? 0));
      },
    );
    request.once("error", reject);
    request.end();
  });
}

async function requestStatus(
  url: string,
  headers: Record<string, string>,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const request = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        headers,
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode ?? 0));
      },
    );
    request.once("error", reject);
    request.end();
  });
}

describe("ESP32 reconnect authorization handler", () => {
  it("keeps authorization when the loopback port changes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "esp32-reconnect-"));
    temporaryDirectories.push(directory);
    const authorizationPath = join(directory, "authorization.json");
    const firstUrl = await serve(
      createEsp32ReconnectAuthorizationHandler({
        authorizationPath,
      }),
    );
    const headers = { "X-LOO-UME-ESP32": "1" };

    const initial = await fetch(
      `${firstUrl}/api/esp32-reconnect-authorization`,
      {
        headers,
      },
    );
    expect(await initial.json()).toEqual({
      schemaVersion: "1.0.0",
      enabled: false,
    });

    const denied = await fetch(
      `${firstUrl}/api/esp32-reconnect-authorization`,
      {
        method: "POST",
        headers,
      },
    );
    expect(denied.status).toBe(403);

    const enabled = await fetch(
      `${firstUrl}/api/esp32-reconnect-authorization`,
      {
        method: "POST",
        headers: { ...headers, Origin: firstUrl },
      },
    );
    expect(await enabled.json()).toEqual({
      schemaVersion: "1.0.0",
      enabled: true,
    });
    expect(JSON.parse(await readFile(authorizationPath, "utf8"))).toEqual({
      schemaVersion: "1.0.0",
      enabled: true,
    });

    const secondUrl = await serve(
      createEsp32ReconnectAuthorizationHandler({
        authorizationPath,
      }),
    );
    expect(secondUrl).not.toBe(firstUrl);
    const restarted = await fetch(
      `${secondUrl}/api/esp32-reconnect-authorization`,
      {
        headers,
      },
    );
    expect(await restarted.json()).toEqual({
      schemaVersion: "1.0.0",
      enabled: true,
    });
  });

  it("fails closed for invalid saved authorization", async () => {
    const directory = await mkdtemp(join(tmpdir(), "esp32-reconnect-invalid-"));
    temporaryDirectories.push(directory);
    const authorizationPath = join(directory, "authorization.json");
    await writeFile(authorizationPath, "invalid\n");
    const handler = createEsp32ReconnectAuthorizationHandler({
      authorizationPath,
    });
    await expect(handler.enabled()).resolves.toBe(false);
  });

  it("stores exact validated project bytes when the loopback port changes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "esp32-reconnect-project-"));
    temporaryDirectories.push(directory);
    const authorizationPath = join(directory, "authorization.json");
    const packageBytes = await projectPackageBytes("Startup project");
    const firstUrl = await serve(
      createEsp32ReconnectAuthorizationHandler({ authorizationPath }),
    );
    const headers = {
      "X-LOO-UME-ESP32": "1",
      Origin: firstUrl,
      "Content-Type": "application/zip",
    };

    const saved = await fetch(`${firstUrl}/api/esp32-reconnect-project`, {
      method: "PUT",
      headers,
      body: Buffer.from(packageBytes),
    });
    expect(saved.status).toBe(204);

    const secondUrl = await serve(
      createEsp32ReconnectAuthorizationHandler({ authorizationPath }),
    );
    const restored = await fetch(`${secondUrl}/api/esp32-reconnect-project`, {
      headers: { "X-LOO-UME-ESP32": "1" },
    });
    expect(restored.status).toBe(200);
    expect(restored.headers.get("content-type")).toBe("application/zip");
    expect(new Uint8Array(await restored.arrayBuffer())).toEqual(packageBytes);
  });

  it("returns 404 until a startup project snapshot exists", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "esp32-reconnect-missing-project-"),
    );
    temporaryDirectories.push(directory);
    const url = await serve(
      createEsp32ReconnectAuthorizationHandler({
        authorizationPath: join(directory, "authorization.json"),
      }),
    );

    const response = await fetch(`${url}/api/esp32-reconnect-project`, {
      headers: { "X-LOO-UME-ESP32": "1" },
    });
    expect(response.status).toBe(404);
  });

  it("preserves a saved snapshot when invalid or oversized bytes are rejected", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "esp32-reconnect-invalid-project-"),
    );
    temporaryDirectories.push(directory);
    const authorizationPath = join(directory, "authorization.json");
    const packageBytes = await projectPackageBytes("Saved startup project");
    const url = await serve(
      createEsp32ReconnectAuthorizationHandler({ authorizationPath }),
    );
    const headers = {
      "X-LOO-UME-ESP32": "1",
      Origin: url,
      "Content-Type": "application/zip",
    };
    expect(
      (
        await fetch(`${url}/api/esp32-reconnect-project`, {
          method: "PUT",
          headers,
          body: Buffer.from(packageBytes),
        })
      ).status,
    ).toBe(204);

    expect(
      (
        await fetch(`${url}/api/esp32-reconnect-project`, {
          method: "PUT",
          headers,
          body: new Uint8Array([1, 2, 3]),
        })
      ).status,
    ).toBe(400);
    expect(
      await requestWithDeclaredLength(
        `${url}/api/esp32-reconnect-project`,
        PORTABLE_ZIP_RESOURCE_LIMITS.maximumArchiveBytes + 1,
      ),
    ).toBe(413);

    const restored = await fetch(`${url}/api/esp32-reconnect-project`, {
      headers: { "X-LOO-UME-ESP32": "1" },
    });
    expect(new Uint8Array(await restored.arrayBuffer())).toEqual(packageBytes);
  });

  it("requires the ESP32 guard and a same-origin ZIP save request", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "esp32-reconnect-project-guard-"),
    );
    temporaryDirectories.push(directory);
    const packageBytes = await projectPackageBytes("Guarded startup project");
    const url = await serve(
      createEsp32ReconnectAuthorizationHandler({
        authorizationPath: join(directory, "authorization.json"),
      }),
    );
    const endpoint = `${url}/api/esp32-reconnect-project`;

    expect((await fetch(endpoint)).status).toBe(403);
    expect(
      await requestStatus(endpoint, {
        "X-LOO-UME-ESP32": "1",
        Host: "example.test",
      }),
    ).toBe(403);
    expect(
      (
        await fetch(endpoint, {
          method: "PUT",
          headers: {
            "X-LOO-UME-ESP32": "1",
            Origin: "http://example.test",
            "Content-Type": "application/zip",
          },
          body: Buffer.from(packageBytes),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(endpoint, {
          method: "PUT",
          headers: { "X-LOO-UME-ESP32": "1", Origin: url },
          body: Buffer.from(packageBytes),
        })
      ).status,
    ).toBe(415);
  });
});
