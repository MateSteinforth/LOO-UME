import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createEsp32ReconnectAuthorizationHandler,
  type Esp32ReconnectAuthorizationHandler,
} from "../scripts/esp32-reconnect-authorization-handler.ts";

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
});
