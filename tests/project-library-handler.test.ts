import { createServer, request as httpRequest, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
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

async function fixture(
  allowNonLoopbackHost = false,
  commitLibraryState?: (bytes: Uint8Array) => Promise<void>,
): Promise<{
  root: string;
  url: string;
  packageBytes: Uint8Array;
  changedPackageBytes: Uint8Array;
}> {
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
  const changedDefinition = structuredClone(definition);
  changedDefinition.name = `${definition.name} saved`;
  const changedPackageBytes = createProjectPackageZip(
    changedDefinition,
    new Map(),
    changedDefinition.id,
  );
  await Promise.all([
    writeFile(join(demoDirectory, "flagship.loo.zip"), packageBytes),
    writeFile(join(localDirectory, "working-copy.loo.zip"), packageBytes),
    writeFile(join(localDirectory, "invalid.loo.zip"), "not a zip"),
    writeFile(join(root, "projects", "manifest.json"), JSON.stringify({
      defaultSource: "./projects/demos/flagship.loo.zip",
    })),
  ]);
  const newestTime = new Date();
  const olderTime = new Date(newestTime.getTime() - 60_000);
  await Promise.all([
    utimes(join(localDirectory, "working-copy.loo.zip"), newestTime, newestTime),
    utimes(join(demoDirectory, "flagship.loo.zip"), olderTime, olderTime),
  ]);
  const handler = createProjectLibraryHandler({
    rootDirectory: root,
    allowNonLoopbackHost,
    commitLibraryState,
  });
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
    root,
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    packageBytes,
    changedPackageBytes,
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
        location: "demo" | "local";
        modifiedTimeMs: number;
      }>;
      invalidPackages: Array<{ source: string }>;
    };
    expect(library.projects).toHaveLength(2);
    expect(library.defaultSource).toContain("/demo/flagship.loo.zip");
    expect(library.projects.map(({ readOnly }) => readOnly)).toEqual([false, false]);
    expect(library.projects[0]!.location).toBe("local");
    expect(library.projects[0]!.modifiedTimeMs)
      .toBeGreaterThanOrEqual(library.projects[1]!.modifiedTimeMs);
    expect(library.invalidPackages).toEqual([
      expect.objectContaining({ source: "local/invalid.loo.zip" }),
    ]);
    const local = library.projects.find(({ location }) => location === "local")!;
    const demo = library.projects.find(({ location }) => location === "demo")!;
    const project = await fetch(new URL(local.source, url));
    expect(project.status).toBe(200);
    expect(project.headers.get("content-type")).toBe("application/zip");
    expect(new Uint8Array(await project.arrayBuffer())).toEqual(packageBytes);
    expect(project.headers.get("etag")).toBe(`"${local.revision}"`);
    const thumbnail = await fetch(
      new URL(demo.thumbnailSource, url),
    );
    expect(thumbnail.status).toBe(200);
    expect(thumbnail.headers.get("content-type")).toBe("image/svg+xml");
    expect(await thumbnail.text()).toContain("<svg");
  });

  it("renames, hides, and overwrites bundled projects through local overrides", async () => {
    const { root, url, changedPackageBytes } = await fixture();
    const library = await (await fetch(`${url}api/project-library`)).json() as {
      projects: Array<{ filename: string; location: "demo" | "local"; revision: string }>;
    };
    const demo = library.projects.find(({ location }) => location === "demo")!;
    const demoEndpoint = `${url}api/project-library/package/demo/${demo.filename}`;
    const renamed = await fetch(demoEndpoint, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "If-Match": `"${demo.revision}"`,
      },
      body: JSON.stringify({ filename: "renamed-bundle.loo.zip" }),
    });
    expect(renamed.status).toBe(200);
    expect(await readFile(
      join(root, "projects", "demos", demo.filename),
    )).not.toHaveLength(0);
    expect(await readFile(
      join(root, "projects", "local", "renamed-bundle.loo.zip"),
    )).not.toHaveLength(0);
    const afterRename = await (await fetch(`${url}api/project-library`)).json() as {
      projects: Array<{ filename: string; location: "demo" | "local" }>;
    };
    expect(afterRename.projects).not.toContainEqual(expect.objectContaining({
      filename: demo.filename,
      location: "demo",
    }));
    expect(afterRename.projects).toContainEqual(expect.objectContaining({
      filename: "renamed-bundle.loo.zip",
      location: "local",
    }));
    expect((await fetch(demoEndpoint)).status).toBe(404);
    expect((await fetch(demoEndpoint, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "If-Match": `"${demo.revision}"`,
      },
      body: JSON.stringify({ filename: "stale-second-copy.loo.zip" }),
    })).status).toBe(412);
    await expect(readFile(
      join(root, "projects", "local", "stale-second-copy.loo.zip"),
    )).rejects.toMatchObject({ code: "ENOENT" });

    const secondFixture = await fixture();
    const secondLibrary = await (await fetch(`${secondFixture.url}api/project-library`)).json() as {
      projects: Array<{ filename: string; location: "demo" | "local"; revision: string }>;
    };
    const secondDemo = secondLibrary.projects.find(({ location }) => location === "demo")!;
    const overwritten = await fetch(
      `${secondFixture.url}api/project-library/package/demo/${secondDemo.filename}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/zip",
          "If-Match": `"${secondDemo.revision}"`,
        },
        body: new Blob([Uint8Array.from(changedPackageBytes)]),
      },
    );
    expect(overwritten.status).toBe(200);
    expect(new Uint8Array(await readFile(
      join(secondFixture.root, "projects", "local", secondDemo.filename),
    ))).toEqual(changedPackageBytes);
    expect(await readFile(
      join(secondFixture.root, "projects", "demos", secondDemo.filename),
    )).not.toHaveLength(0);
  });

  it("hides a deleted bundled project without deleting its tracked ZIP", async () => {
    const { root, url } = await fixture();
    const library = await (await fetch(`${url}api/project-library`)).json() as {
      projects: Array<{ filename: string; location: "demo" | "local"; revision: string }>;
    };
    const demo = library.projects.find(({ location }) => location === "demo")!;
    const response = await fetch(
      `${url}api/project-library/package/demo/${demo.filename}`,
      { method: "DELETE", headers: { "If-Match": `"${demo.revision}"` } },
    );
    expect(response.status).toBe(204);
    expect(await readFile(join(root, "projects", "demos", demo.filename)))
      .not.toHaveLength(0);
    const afterDelete = await (await fetch(`${url}api/project-library`)).json() as {
      projects: Array<{ filename: string; location: "demo" | "local" }>;
    };
    expect(afterDelete.projects).not.toContainEqual(expect.objectContaining({
      filename: demo.filename,
      location: "demo",
    }));
    expect((await fetch(
      `${url}api/project-library/package/demo/${demo.filename}`,
      { method: "DELETE", headers: { "If-Match": `"${demo.revision}"` } },
    )).status).toBe(412);
  });

  it("rolls back a bundled overlay when its hide record cannot be committed", async () => {
    const { root, url } = await fixture(false, async () => {
      throw new Error("injected state failure");
    });
    const library = await (await fetch(`${url}api/project-library`)).json() as {
      projects: Array<{ filename: string; location: "demo" | "local"; revision: string }>;
    };
    const demo = library.projects.find(({ location }) => location === "demo")!;
    const response = await fetch(
      `${url}api/project-library/package/demo/${demo.filename}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${demo.revision}"`,
        },
        body: JSON.stringify({ filename: "rolled-back.loo.zip" }),
      },
    );
    expect(response.status).toBe(400);
    await expect(readFile(
      join(root, "projects", "local", "rolled-back.loo.zip"),
    )).rejects.toMatchObject({ code: "ENOENT" });
    expect((await fetch(`${url}api/project-library/package/demo/${demo.filename}`)).status)
      .toBe(200);
  });

  it("rejects local filenames that collide with visible bundled projects", async () => {
    const { url, packageBytes } = await fixture();
    const library = await (await fetch(`${url}api/project-library`)).json() as {
      projects: Array<{ filename: string; location: "demo" | "local"; revision: string }>;
    };
    const demo = library.projects.find(({ location }) => location === "demo")!;
    const local = library.projects.find(({ location }) => location === "local")!;
    expect((await fetch(
      `${url}api/project-library/package/local/${demo.filename}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/zip",
          "If-None-Match": "*",
        },
        body: new Blob([Uint8Array.from(packageBytes)]),
      },
    )).status).toBe(412);
    expect((await fetch(
      `${url}api/project-library/package/local/${local.filename}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${local.revision}"`,
        },
        body: JSON.stringify({ filename: demo.filename }),
      },
    )).status).toBe(412);
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

  it("accepts an explicit LAN review Host without changing the default", async () => {
    const { url } = await fixture(true);
    expect(await requestWithHost(
      new URL("api/project-library", url),
      "192.168.68.61:4175",
    )).toBe(200);
  });

  it("creates, replaces, renames, and deletes local ZIPs with revision checks", async () => {
    const { root, url, packageBytes, changedPackageBytes } = await fixture();
    const endpoint = `${url}api/project-library/package/local/new-project.loo.zip`;
    const created = await fetch(endpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/zip",
        "If-None-Match": "*",
      },
      body: new Blob([Uint8Array.from(packageBytes)]),
    });
    expect(created.status).toBe(200);
    const createdRevision = (await created.json() as { revision: string }).revision;
    expect(new Uint8Array(await readFile(
      join(root, "projects", "local", "new-project.loo.zip"),
    ))).toEqual(packageBytes);

    const replaced = await fetch(endpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/zip",
        "If-Match": `"${createdRevision}"`,
      },
      body: new Blob([Uint8Array.from(changedPackageBytes)]),
    });
    expect(replaced.status).toBe(200);
    const replacedRevision = (await replaced.json() as { revision: string }).revision;
    expect(replacedRevision).not.toBe(createdRevision);
    expect((await fetch(endpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/zip",
        "If-Match": `"${createdRevision}"`,
      },
      body: new Blob([Uint8Array.from(packageBytes)]),
    })).status).toBe(412);

    const renamed = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "If-Match": `"${replacedRevision}"`,
      },
      body: JSON.stringify({ filename: "renamed-project.loo.zip" }),
    });
    expect(renamed.status).toBe(200);
    const renamedEndpoint = `${url}api/project-library/package/local/renamed-project.loo.zip`;
    expect(new Uint8Array(await (await fetch(renamedEndpoint)).arrayBuffer()))
      .toEqual(changedPackageBytes);
    expect((await fetch(renamedEndpoint, {
      method: "DELETE",
      headers: { "If-Match": `"${replacedRevision}"` },
    })).status).toBe(204);
    expect((await fetch(renamedEndpoint)).status).toBe(404);
  });

  it("rejects invalid saves and missing write preconditions", async () => {
    const { url, packageBytes } = await fixture();
    const endpoint = `${url}api/project-library/package/local/guarded.loo.zip`;
    expect((await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/zip" },
      body: new Blob([Uint8Array.from(packageBytes)]),
    })).status).toBe(428);
    expect((await fetch(endpoint, {
      method: "PUT",
      headers: {
        "Content-Type": "application/zip",
        "If-None-Match": "*",
      },
      body: "not a zip",
    })).status).toBe(400);
  });
});
