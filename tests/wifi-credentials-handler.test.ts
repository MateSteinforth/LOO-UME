import { createServer, request as httpRequest, type Server } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createWifiCredentialsHandler,
  type WifiCredentialsHandler,
} from "../scripts/wifi-credentials-handler.ts";

const servers: Server[] = [];
const directories: string[] = [];
const encryptedPrefix = "encrypted:";
const encrypt = async (text: string): Promise<string> =>
  `${encryptedPrefix}${Buffer.from(text).toString("base64")}`;
const decrypt = async (ciphertext: string): Promise<string> => {
  if (!ciphertext.startsWith(encryptedPrefix))
    throw new Error("Not encrypted.");
  return Buffer.from(
    ciphertext.slice(encryptedPrefix.length),
    "base64",
  ).toString("utf8");
};

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
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function serve(handler: WifiCredentialsHandler): Promise<string> {
  const server = createServer((request, response) => {
    void handler.handle(request, response).then((handled) => {
      if (!handled) {
        response.statusCode = 404;
        response.end();
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

async function setup(): Promise<{ url: string; credentialsPath: string }> {
  const directory = await mkdtemp(join(tmpdir(), "wifi-credentials-"));
  directories.push(directory);
  const credentialsPath = join(directory, "credentials.json");
  return {
    url: await serve(
      createWifiCredentialsHandler({ credentialsPath, encrypt, decrypt }),
    ),
    credentialsPath,
  };
}

const headers = { "X-LOO-UME-ESP32": "1" };

async function statusWithHost(url: string, host: string): Promise<number> {
  const target = new URL(`${url}/api/wifi-credentials`);
  return await new Promise<number>((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        headers: { ...headers, Host: host },
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

describe("Wi-Fi credentials handler", () => {
  it("stores encrypted credentials, reads them after restart, and forgets them", async () => {
    const { url, credentialsPath } = await setup();
    const credentials = { ssid: "Studio network", password: "correct horse" };
    const saved = await fetch(`${url}/api/wifi-credentials`, {
      method: "PUT",
      headers: { ...headers, Origin: url, "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
    expect(saved.status).toBe(200);
    expect(saved.headers.get("cache-control")).toBe("no-store");
    expect(await saved.json()).toEqual({ credentials });
    const onDisk = await readFile(credentialsPath, "utf8");
    expect(onDisk).not.toContain(credentials.password);
    expect(onDisk).toBe(await encrypt(JSON.stringify(credentials)));
    expect((await stat(credentialsPath)).mode & 0o777).toBe(0o600);

    const restartedUrl = await serve(
      createWifiCredentialsHandler({ credentialsPath, encrypt, decrypt }),
    );
    expect(
      await (
        await fetch(`${restartedUrl}/api/wifi-credentials`, { headers })
      ).json(),
    ).toEqual({ credentials });
    const forgotten = await fetch(`${restartedUrl}/api/wifi-credentials`, {
      method: "DELETE",
      headers: { ...headers, Origin: restartedUrl },
    });
    expect(await forgotten.json()).toEqual({ credentials: null });
    expect(
      await (
        await fetch(`${restartedUrl}/api/wifi-credentials`, { headers })
      ).json(),
    ).toEqual({ credentials: null });
  });

  it("rejects unauthorized hosts, headers, and origins", async () => {
    const { url } = await setup();
    expect((await fetch(`${url}/api/wifi-credentials`)).status).toBe(403);
    expect(await statusWithHost(url, "example.test")).toBe(403);
    expect(
      (
        await fetch(`${url}/api/wifi-credentials`, {
          headers: { ...headers, Origin: "http://localhost:9" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${url}/api/wifi-credentials`, {
          method: "PUT",
          headers,
          body: "{}",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(`${url}/api/wifi-credentials`, {
          method: "DELETE",
          headers: { ...headers, Origin: "http://localhost:9" },
        })
      ).status,
    ).toBe(403);
  });

  it("rejects oversized, invalid, and unsupported requests", async () => {
    const { url } = await setup();
    const writeHeaders = {
      ...headers,
      Origin: url,
      "Content-Type": "application/json",
    };
    expect(
      (
        await fetch(`${url}/api/wifi-credentials`, {
          method: "PUT",
          headers: writeHeaders,
          body: "x".repeat(2049),
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await fetch(`${url}/api/wifi-credentials`, {
          method: "PUT",
          headers: writeHeaders,
          body: JSON.stringify({ ssid: "", password: "x" }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${url}/api/wifi-credentials`, {
          method: "PUT",
          headers: writeHeaders,
          body: JSON.stringify({ ssid: "x".repeat(33), password: "" }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${url}/api/wifi-credentials`, {
          method: "PUT",
          headers: writeHeaders,
          body: JSON.stringify({ ssid: "x", password: "x".repeat(65) }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${url}/api/wifi-credentials`, {
          method: "PUT",
          headers: { ...headers, Origin: url },
          body: JSON.stringify({ ssid: "x", password: "" }),
        })
      ).status,
    ).toBe(415);
    expect(
      (await fetch(`${url}/api/wifi-credentials`, { method: "POST", headers }))
        .status,
    ).toBe(405);
  });
});
