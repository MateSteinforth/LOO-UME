import type { ChildProcess } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createManagedOpenScadReceipt,
  loadOpenScadDistribution,
  managedOpenScadDirectory,
  OPENSCAD_MANIFEST_PATH,
  selectOpenScadTarget,
  type HostDescription,
} from "../src/cad/OpenScadDistribution.ts";
import {
  parseOpenScadVersion,
  probeOpenScad,
  resolveOpenScadCommand,
  stopOpenScadChildren,
} from "../src/cad/OpenScadRuntime.ts";
const testState = vi.hoisted(() => ({
  host: {
    platform: "linux",
    architecture: "x64",
    osRelease: "ID=ubuntu\nVERSION_ID=24.04\nVERSION_CODENAME=noble\n",
    glibcVersion: "2.39",
  } as HostDescription,
}));
const linuxHost = { ...testState.host };

vi.mock("../src/cad/OpenScadDistribution.ts", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../src/cad/OpenScadDistribution.ts")
  >();
  return {
    ...actual,
    detectOpenScadHost: () => testState.host,
    resolveManagedOpenScadCommand(
      rootDirectory: string,
      manifest?: Parameters<typeof actual.resolveManagedOpenScadCommand>[1],
      environment?: NodeJS.ProcessEnv,
    ) {
      return actual.resolveManagedOpenScadCommand(
        rootDirectory,
        manifest,
        environment,
        testState.host,
      );
    },
  };
});

const temporaryDirectories: string[] = [];
const originalPath = process.env.PATH;
const originalLibraryPath = process.env.LD_LIBRARY_PATH;

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
  testState.host = { ...linuxHost };
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  if (originalLibraryPath === undefined) delete process.env.LD_LIBRARY_PATH;
  else process.env.LD_LIBRARY_PATH = originalLibraryPath;
});

async function writeExecutable(path: string, source: string): Promise<void> {
  await writeFile(path, `#!/bin/sh\n${source}\n`, "utf8");
  await chmod(path, 0o755);
}

async function fakeExecutable(output: string): Promise<{ root: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), "openscad-probe-"));
  temporaryDirectories.push(root);
  const path = join(root, "fake-openscad");
  await writeExecutable(path, `printf '%s\\n' '${output}'`);
  return { root, path };
}

async function fixtureRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(root);
  const manifest = loadOpenScadDistribution(process.cwd());
  await mkdir(join(root, "toolchains"), { recursive: true });
  await writeFile(
    join(root, OPENSCAD_MANIFEST_PATH),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return root;
}

async function installManagedFixture(root: string, source: string): Promise<void> {
  const manifest = loadOpenScadDistribution(root);
  const target = selectOpenScadTarget(manifest, testState.host)!;
  const installation = managedOpenScadDirectory(root, target);
  const executable = join(installation, target.executable);
  for (const directory of target.libraryDirectories) {
    await mkdir(join(installation, directory), { recursive: true });
  }
  await mkdir(dirname(executable), { recursive: true });
  await writeExecutable(executable, source);
  await writeFile(
    join(installation, "install.json"),
    `${JSON.stringify(createManagedOpenScadReceipt(target), null, 2)}\n`,
    "utf8",
  );
}

function fakeChild(pid: number, exited = false): {
  child: ChildProcess;
  close(): void;
  kill: ReturnType<typeof vi.fn>;
} {
  let exitCode: number | null = exited ? 0 : null;
  let closeListener: (() => void) | undefined;
  const kill = vi.fn(() => true);
  const child = {
    pid,
    get exitCode() {
      return exitCode;
    },
    kill,
    once(event: string, listener: () => void) {
      if (event === "close") closeListener = listener;
      return child;
    },
  } as unknown as ChildProcess;
  return {
    child,
    close() {
      exitCode = 0;
      closeListener?.();
    },
    kill,
  };
}


describe("OpenSCAD runtime probe", () => {
  it("parses the supported version format", () => {
    expect(parseOpenScadVersion("OpenSCAD version 2021.01\n")).toBe("2021.01");
    expect(parseOpenScadVersion("unrelated output")).toBeUndefined();
  });

  it("uses openscad.com for Windows system fallback and keeps an override", async () => {
    const root = await fixtureRoot("openscad-windows-command-");
    testState.host = {
      platform: "win32",
      architecture: "x64",
      nativeArchitecture: "x64",
      osRelease: "",
      glibcVersion: undefined,
      operatingSystemVersion: "10.0.19045",
    };
    expect(resolveOpenScadCommand(root, "")).toMatchObject({
      command: "openscad.com",
      expectedVersion: "2021.01",
      targetId: "win32-x64",
    });
    expect(resolveOpenScadCommand(root, "  custom.com  ").command).toBe("custom.com");
  });

  it("reports a supported explicit executable as available", async () => {
    const fake = await fakeExecutable("OpenSCAD version 2021.01");
    await expect(probeOpenScad(fake.root, fake.path)).resolves.toEqual({
      schemaVersion: "1.0.0",
      available: true,
      generator: "openscad",
      supportedVersion: "2021.01",
      detectedVersion: "2021.01",
      message: "OpenSCAD 2021.01 is ready for local generation.",
    });
  });

  it("rejects a mismatched version with repair instructions", async () => {
    const fake = await fakeExecutable("OpenSCAD version 2025.03");
    const status = await probeOpenScad(fake.root, fake.path);
    expect(status).toMatchObject({
      available: false,
      supportedVersion: "2021.01",
      detectedVersion: "2025.03",
    });
    expect(status.message).toContain("set OPENSCAD");
    expect(status.message).toContain("Restart WLED Orbital Lab");
  });

  it("reports an absent explicit executable without throwing", async () => {
    const root = await mkdtemp(join(tmpdir(), "openscad-missing-"));
    temporaryDirectories.push(root);
    const status = await probeOpenScad(root, join(root, "absent"));
    expect(status.available).toBe(false);
    expect(status.message).toContain("OpenSCAD was not found");
  });

  it("uses the explicit command without system or managed environment changes", async () => {
    const root = await fixtureRoot("openscad-explicit-order-");
    const bin = join(root, "bin");
    await mkdir(bin, { recursive: true });
    await writeExecutable(
      join(bin, "openscad"),
      "printf '%s\\n' 'OpenSCAD version 2021.01'",
    );
    await installManagedFixture(
      root,
      "printf '%s\\n' 'OpenSCAD version 2021.01'",
    );
    const explicit = join(root, "explicit-openscad");
    await writeExecutable(explicit, [
      "if [ \"$LD_LIBRARY_PATH\" = \"operator-libs\" ]; then",
      "  printf '%s\\n' 'OpenSCAD version 2025.03'",
      "else",
      "  printf '%s\\n' 'OpenSCAD version 2021.01'",
      "fi",
    ].join("\n"));
    process.env.PATH = bin;
    process.env.LD_LIBRARY_PATH = "operator-libs";
    const status = await probeOpenScad(root, explicit);
    expect(status).toMatchObject({ available: false, detectedVersion: "2025.03" });
  });

  it("prefers a receipt-backed managed command and isolates its libraries", async () => {
    const root = await fixtureRoot("openscad-managed-order-");
    const bin = join(root, "bin");
    await mkdir(bin, { recursive: true });
    await writeExecutable(
      join(bin, "openscad"),
      "printf '%s\\n' 'OpenSCAD version 2025.03'",
    );
    const installation = join(root, ".tools/openscad-2021.01");
    const libraryPath = [
      join(installation, "squashfs-root/usr/lib"),
      join(installation, "local-deps/usr/lib/x86_64-linux-gnu"),
      "operator-libs",
    ].join(":");
    await installManagedFixture(root, [
      `if [ \"$LD_LIBRARY_PATH\" = \"${libraryPath}\" ]; then`,
      "  printf '%s\\n' 'OpenSCAD version 2021.01'",
      "else",
      "  printf '%s\\n' 'OpenSCAD version 2025.03'",
      "fi",
    ].join("\n"));
    process.env.PATH = bin;
    process.env.LD_LIBRARY_PATH = "operator-libs";
    const status = await probeOpenScad(root, undefined);
    expect(status).toMatchObject({ available: true, detectedVersion: "2021.01" });
    expect(process.env.LD_LIBRARY_PATH).toBe("operator-libs");
  });

  it("falls back to a supported system command after a managed version mismatch", async () => {
    const root = await fixtureRoot("openscad-managed-mismatch-");
    const bin = join(root, "bin");
    await mkdir(bin, { recursive: true });
    await writeExecutable(
      join(bin, "openscad"),
      "printf '%s\\n' 'OpenSCAD version 2021.01'",
    );
    await installManagedFixture(
      root,
      "printf '%s\\n' 'OpenSCAD version 2025.03'",
    );
    process.env.PATH = bin;

    const status = await probeOpenScad(root, undefined);
    expect(status).toMatchObject({
      available: true,
      supportedVersion: "2021.01",
      detectedVersion: "2021.01",
    });
  });

  it("falls back from managed Windows OpenSCAD to openscad.com", async () => {
    const root = await fixtureRoot("openscad-windows-order-");
    const bin = join(root, "bin");
    await mkdir(bin, { recursive: true });
    await writeExecutable(
      join(bin, "openscad.com"),
      "printf '%s\\n' 'OpenSCAD version 2021.01'",
    );
    testState.host = {
      platform: "win32",
      architecture: "x64",
      nativeArchitecture: "x64",
      osRelease: "",
      glibcVersion: undefined,
      operatingSystemVersion: "10.0.20348",
    };
    await installManagedFixture(
      root,
      "printf '%s\\n' 'OpenSCAD version 2025.03'",
    );
    process.env.PATH = bin;

    const status = await probeOpenScad(root, undefined);
    expect(status).toMatchObject({
      available: true,
      supportedVersion: "2021.01",
      detectedVersion: "2021.01",
    });
  });

  it("uses the macOS target version without changing its environment", async () => {
    const root = await fixtureRoot("openscad-macos-version-");
    testState.host = {
      platform: "darwin",
      architecture: "arm64",
      osRelease: "",
      glibcVersion: undefined,
      operatingSystemVersion: "15.7",
    };
    process.env.LD_LIBRARY_PATH = "operator-libs";
    await installManagedFixture(root, [
      "if [ \"$LD_LIBRARY_PATH\" = \"operator-libs\" ]; then",
      "  printf '%s\\n' 'OpenSCAD version 2026.06.12'",
      "else",
      "  printf '%s\\n' 'OpenSCAD version 2021.01'",
      "fi",
    ].join("\n"));

    const status = await probeOpenScad(root, undefined);
    expect(status).toEqual({
      schemaVersion: "1.0.0",
      available: true,
      generator: "openscad",
      supportedVersion: "2026.06.12",
      detectedVersion: "2026.06.12",
      message: "OpenSCAD 2026.06.12 is ready for local generation.",
    });
    expect(process.env.LD_LIBRARY_PATH).toBe("operator-libs");
  });

  it("ignores a receipt for another native target", async () => {
    const root = await fixtureRoot("openscad-cross-target-receipt-");
    testState.host = {
      platform: "darwin",
      architecture: "arm64",
      osRelease: "",
      glibcVersion: undefined,
      operatingSystemVersion: "15.7",
    };
    await installManagedFixture(
      root,
      "printf '%s\\n' 'OpenSCAD version 2025.03'",
    );
    const manifest = loadOpenScadDistribution(root);
    const macTarget = selectOpenScadTarget(manifest, testState.host)!;
    const linuxTarget = manifest.targets.find(({ id }) => id === "linux-x64")!;
    await writeFile(
      join(managedOpenScadDirectory(root, macTarget), "install.json"),
      `${JSON.stringify(createManagedOpenScadReceipt(linuxTarget), null, 2)}\n`,
      "utf8",
    );
    const bin = join(root, "bin");
    await mkdir(bin, { recursive: true });
    await writeExecutable(
      join(bin, "openscad"),
      "printf '%s\\n' 'OpenSCAD version 2026.06.12'",
    );
    process.env.PATH = bin;

    const status = await probeOpenScad(root, undefined);
    expect(status).toMatchObject({
      available: true,
      supportedVersion: "2026.06.12",
      detectedVersion: "2026.06.12",
    });
  });

  it.each(["missing", "invalid"])(
    "ignores a %s managed receipt and keeps the system environment unchanged",
    async (receiptState) => {
      const root = await fixtureRoot(`openscad-${receiptState}-receipt-`);
      const bin = join(root, "bin");
      await mkdir(bin, { recursive: true });
      await writeExecutable(join(bin, "openscad"), [
        "if [ \"$LD_LIBRARY_PATH\" = \"operator-libs\" ]; then",
        "  printf '%s\\n' 'OpenSCAD version 2021.01'",
        "else",
        "  printf '%s\\n' 'OpenSCAD version 2025.03'",
        "fi",
      ].join("\n"));
      const installation = join(root, ".tools/openscad-2021.01");
      await mkdir(installation, { recursive: true });
      if (receiptState === "invalid") {
        await writeFile(
          join(installation, "install.json"),
          '{"schemaVersion":"1.0.0","version":"tampered"}\n',
          "utf8",
        );
      }
      process.env.PATH = bin;
      process.env.LD_LIBRARY_PATH = "operator-libs";
      const status = await probeOpenScad(root, undefined);
      expect(status).toMatchObject({ available: true, detectedVersion: "2021.01" });
      expect(process.env.LD_LIBRARY_PATH).toBe("operator-libs");
    },
  );
});

describe("OpenSCAD process-tree shutdown", () => {
  it("stops a Windows tree normally and is idempotent", async () => {
    const process = fakeChild(41);
    const terminate = vi.fn(async (
      _pid: number,
      force: boolean,
      _timeoutMs: number,
    ) => {
      if (!force) process.close();
    });
    const children = new Set([process.child]);
    await stopOpenScadChildren(children, 20, "win32", terminate);
    expect(terminate).toHaveBeenCalledWith(41, false, 20);
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(process.kill).not.toHaveBeenCalled();

    await stopOpenScadChildren(children, 20, "win32", terminate);
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("uses a forced tree stop after the grace period and waits for close", async () => {
    const process = fakeChild(42);
    const terminate = vi.fn(async (
      _pid: number,
      force: boolean,
      _timeoutMs: number,
    ) => {
      if (force) process.close();
    });
    await stopOpenScadChildren(
      new Set([process.child]),
      2,
      "win32",
      terminate,
    );
    expect(terminate.mock.calls.map((call) => call.slice(0, 2))).toEqual([
      [42, false],
      [42, true],
    ]);
  });

  it("bounds hung attempts and reports forced-stop errors", async () => {
    const process = fakeChild(43);
    const terminate = vi.fn((
      _pid: number,
      force: boolean,
      _timeoutMs: number,
    ): Promise<void> => force
      ? Promise.reject(new Error("forced failure"))
      : new Promise(() => undefined));
    await expect(stopOpenScadChildren(
      new Set([process.child]),
      2,
      "win32",
      terminate,
    )).rejects.toBeInstanceOf(AggregateError);
  });

  it("reports a child that stays active after a successful forced stop", async () => {
    const process = fakeChild(44);
    await expect(stopOpenScadChildren(
      new Set([process.child]),
      2,
      "win32",
      async () => undefined,
    )).rejects.toThrow(/did not exit after forced stop/);
  });
});
