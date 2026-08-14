import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createManagedOpenScadReceipt,
  loadOpenScadDistribution,
} from "../src/cad/OpenScadDistribution.ts";
import {
  parseOpenScadVersion,
  probeOpenScad,
} from "../src/cad/OpenScadRuntime.ts";

vi.mock("../src/cad/OpenScadDistribution.ts", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../src/cad/OpenScadDistribution.ts")
  >();
  return {
    ...actual,
    resolveManagedOpenScadCommand(
      rootDirectory: string,
      manifest?: Parameters<typeof actual.resolveManagedOpenScadCommand>[1],
      environment?: NodeJS.ProcessEnv,
    ) {
      return actual.resolveManagedOpenScadCommand(
        rootDirectory,
        manifest,
        environment,
        {
          platform: "linux",
          architecture: "x64",
          osRelease:
            "ID=ubuntu\nVERSION_ID=24.04\nVERSION_CODENAME=noble\n",
          glibcVersion: "2.39",
        },
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
    join(root, "toolchains/openscad-2021.01.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return root;
}

async function installManagedFixture(root: string, source: string): Promise<void> {
  const manifest = loadOpenScadDistribution(root);
  const installation = join(root, ".tools/openscad-2021.01");
  const executable = join(installation, manifest.target.executable);
  for (const directory of manifest.target.libraryDirectories) {
    await mkdir(join(installation, directory), { recursive: true });
  }
  await mkdir(dirname(executable), { recursive: true });
  await writeExecutable(executable, source);
  await writeFile(
    join(installation, "install.json"),
    `${JSON.stringify(createManagedOpenScadReceipt(manifest), null, 2)}\n`,
    "utf8",
  );
}

describe("OpenSCAD runtime probe", () => {
  it("parses the supported version format", () => {
    expect(parseOpenScadVersion("OpenSCAD version 2021.01\n")).toBe("2021.01");
    expect(parseOpenScadVersion("unrelated output")).toBeUndefined();
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
