import { createServer, request as httpRequest, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectLibraryHandler } from "../scripts/project-library-handler.ts";
import { parsePanelAssemblyDefinition } from "../src/sculpture/PanelAssembly.ts";
import { createProjectPackageZip } from "../web/src/ProjectPackage.ts";

const temporaryDirectories: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve) => server.close(() => resolve()))
  ));
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

async function fixture(): Promise<{ url: string; packageBytes: Uint8Array }> {
  const root = await mkdtemp(join(tmpdir(), "project-library-handler-"));
  temporaryDirectories.push(root);
  const demoDirectory = join(root, "projects", "demos");
  const localDirectory = join(root, "projects", "local");
  await Promise.all([
    mkdir(demoDirectory, { recursive: true }),
    mkdir(localDirectory, { recursive: true }),
  ]);
  const definition = parsePanelAssemblyDefinition(JSON.parse(
    await readFile("sculptures/rhombicosidodecahedron/sculpture.json", "utf8"),
  ));
  const packageBytes = createProjectPackageZip(definition, new Map(), definition.id);
  await Promise.all([
    writeFile(join(demoDirectory, "flagship.loo.zip"), packageBytes),
    writeFile(join(localDirectory, "working-copy.loo.zip"), packageBytes),
    writeFile(join(localDirectory, "invalid.loo.zip"), "not a zip"),
    writeFile(join(root, "projects", "manifest.json"), JSON.stringify({
      defaultSource: "./projects/demos/flagship.loo.zip",
    })),
  ]);
  const handler = createProjectLibraryHandler({ rootDirectory: root });
  const server = createServer((request, response) => {
    void handler.handle(request, response).then((handled) => {
      if (!handled) {
        response.statusCode = 404;
        response.end();
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  servers.push(server);
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    packageBytes,
  };
}

function requestWithHost(
  url: URL,
  host: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: { Host: host },
    }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode ?? 0));
    });
    request.on("error", reject);
    request.end();
  });
}

describe("project library handler", () => {
  it("lists valid demo and local ZIPs and serves their exact bytes", async () => {
    const { url, packageBytes } = await fixture();
    const response = await fetch(`${url}api/project-library`);
    expect(response.status).toBe(200);
    const library = await response.json() as {
      defaultSource: string;
      projects: Array<{
        source: string;
        thumbnailSource: string;
        readOnly: boolean;
        revision: string;
      }>;
      invalidPackages: Array<{ source: string }>;
    };
    expect(library.projects).toHaveLength(2);
    expect(library.defaultSource).toContain("/demo/flagship.loo.zip");
    expect(library.projects.map(({ readOnly }) => readOnly)).toEqual([true, false]);
    expect(library.invalidPackages).toEqual([
      expect.objectContaining({ source: "local/invalid.loo.zip" }),
    ]);
    const project = await fetch(new URL(library.projects[1]!.source, url));
    expect(project.status).toBe(200);
    expect(project.headers.get("content-type")).toBe("application/zip");
    expect(new Uint8Array(await project.arrayBuffer())).toEqual(packageBytes);
    expect(project.headers.get("etag")).toBe(`"${library.projects[1]!.revision}"`);
    const thumbnail = await fetch(
      new URL(library.projects[0]!.thumbnailSource, url),
    );
    expect(thumbnail.status).toBe(200);
    expect(thumbnail.headers.get("content-type")).toBe("image/svg+xml");
    expect(await thumbnail.text()).toContain("<svg");
  });

  it("rejects non-loopback hosts, writes, and unsafe package paths", async () => {
    const { url } = await fixture();
    expect(await requestWithHost(
      new URL("api/project-library", url),
      "malicious.example",
    )).toBe(403);
    expect((await fetch(`${url}api/project-library`, { method: "POST" })).status)
      .toBe(405);
    expect((await fetch(
      `${url}api/project-library/package/local/%2e%2e%2fsecret.loo.zip`,
    )).status).toBe(400);
    expect((await fetch(
      `${url}api/project-library/package/local/not-a-project.zip`,
    )).status).toBe(400);
  });
});
