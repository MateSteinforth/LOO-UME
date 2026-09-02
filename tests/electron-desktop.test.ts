import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDesktopUpdateHandler,
  type DesktopUpdater,
} from "../electron/DesktopUpdateHandler.ts";
import { quitAfterLastWindowCloses } from "../electron/DesktopLifecycle.ts";
import { isApprovedCp2102 } from "../electron/SerialPolicy.ts";
import { migrateLegacyProjectLibrary } from "../electron/ProjectLibraryMigration.ts";

const servers: ReturnType<typeof createServer>[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve) => server.close(() => resolve()))
  ));
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

async function serveUpdater(updater: DesktopUpdater): Promise<string> {
  const handler = createDesktopUpdateHandler(updater);
  const server = createServer((request, response) => {
    void handler.handle(request, response);
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe("Electron desktop boundaries", () => {
  it("quits the desktop process when its last window closes", () => {
    const quit = vi.fn();
    quitAfterLastWindowCloses({ quit });
    expect(quit).toHaveBeenCalledOnce();
  });

  it("permits only the approved CP2102 USB identity", () => {
    expect(isApprovedCp2102({ vendorId: "10C4", productId: "EA60" })).toBe(true);
    expect(isApprovedCp2102({ vendorId: 0x10c4, productId: 0xea60 })).toBe(true);
    expect(isApprovedCp2102({ vendorId: "1a86", productId: "7523" })).toBe(false);
    expect(isApprovedCp2102({})).toBe(false);
  });

  it("checks, downloads, and installs only through the loopback origin", async () => {
    const download = vi.fn(async () => undefined);
    const install = vi.fn(async () => undefined);
    const url = await serveUpdater({
      currentVersion: "1.2.3",
      enabled: true,
      check: async () => ({ available: true, version: "1.2.4" }),
      download,
      install,
    });
    const status = await fetch(`${url}/api/application-update`);
    expect(await status.json()).toMatchObject({
      currentCommit: "1.2.3",
      availableCommit: "1.2.4",
      updateAvailable: true,
      canApply: true,
    });
    const denied = await fetch(`${url}/api/application-update`, {
      method: "POST",
      headers: { Origin: "https://example.invalid" },
    });
    expect(denied.status).toBe(403);
    expect(download).not.toHaveBeenCalled();
    const applied = await fetch(`${url}/api/application-update`, {
      method: "POST",
      headers: { Origin: url },
    });
    expect(applied.status).toBe(200);
    expect(download).toHaveBeenCalledOnce();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(install).toHaveBeenCalledOnce();
  });

  it("does not offer release updates from an unpackaged application", async () => {
    const check = vi.fn(async () => ({ available: true, version: "9.9.9" }));
    const handler = createDesktopUpdateHandler({
      currentVersion: "1.2.3",
      enabled: false,
      check,
      download: async () => undefined,
      install: async () => undefined,
    });
    expect(await handler.status()).toMatchObject({
      updateAvailable: false,
      canApply: false,
      localChanges: false,
    });
    expect(check).not.toHaveBeenCalled();
  });

  it("imports an earlier Mac Project Library once without overwriting desktop data", async () => {
    const root = await mkdtemp(join(tmpdir(), "loo-ume-electron-projects-"));
    temporaryDirectories.push(root);
    const source = join(root, "legacy");
    const destination = join(root, "desktop");
    await Promise.all([mkdir(source), mkdir(destination)]);
    await writeFile(join(source, "sculpture.loo.zip"), "legacy-project");
    await writeFile(join(source, ".library-state.json"), "{\"hiddenDemos\":[]}");
    await writeFile(join(source, "not-a-project.txt"), "ignored");
    expect(await migrateLegacyProjectLibrary(source, destination)).toEqual([
      ".library-state.json",
      "sculpture.loo.zip",
    ]);
    expect(await readFile(join(destination, "sculpture.loo.zip"), "utf8"))
      .toBe("legacy-project");
    await writeFile(join(source, "sculpture.loo.zip"), "changed-legacy");
    expect(await migrateLegacyProjectLibrary(source, destination)).toEqual([]);
    expect(await readFile(join(destination, "sculpture.loo.zip"), "utf8"))
      .toBe("legacy-project");
  });
});
