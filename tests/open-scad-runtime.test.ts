import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseOpenScadVersion,
  probeOpenScad,
} from "../src/cad/OpenScadRuntime.ts";

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

  it("uses the explicit command without system or local environment changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "openscad-explicit-order-"));
    temporaryDirectories.push(root);
    const bin = join(root, "bin");
    const local = join(root, ".tools/openscad-2021.01/squashfs-root/AppRun");
    await mkdir(bin, { recursive: true });
    await mkdir(join(root, ".tools/openscad-2021.01/squashfs-root"), {
      recursive: true,
    });
    await writeExecutable(join(bin, "openscad"), "printf '%s\\n' 'OpenSCAD version 2021.01'");
    await writeExecutable(local, "printf '%s\\n' 'OpenSCAD version 2021.01'");
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

  it("prefers the system command and keeps its environment unchanged", async () => {
    const root = await mkdtemp(join(tmpdir(), "openscad-system-order-"));
    temporaryDirectories.push(root);
    const bin = join(root, "bin");
    const local = join(root, ".tools/openscad-2021.01/squashfs-root/AppRun");
    await mkdir(bin, { recursive: true });
    await mkdir(join(root, ".tools/openscad-2021.01/squashfs-root"), {
      recursive: true,
    });
    await writeExecutable(join(bin, "openscad"), [
      "if [ \"$LD_LIBRARY_PATH\" = \"operator-libs\" ]; then",
      "  printf '%s\\n' 'OpenSCAD version 2021.01'",
      "else",
      "  printf '%s\\n' 'OpenSCAD version 2025.03'",
      "fi",
    ].join("\n"));
    await writeExecutable(local, "printf '%s\\n' 'OpenSCAD version 2025.03'");
    process.env.PATH = bin;
    process.env.LD_LIBRARY_PATH = "operator-libs";
    const status = await probeOpenScad(root, undefined);
    expect(status).toMatchObject({ available: true, detectedVersion: "2021.01" });
  });

  it("adds legacy libraries only for the repository AppRun fallback", async () => {
    const root = await mkdtemp(join(tmpdir(), "openscad-local-fallback-"));
    temporaryDirectories.push(root);
    const bin = join(root, "bin");
    const localRoot = join(root, ".tools/openscad-2021.01");
    const local = join(localRoot, "squashfs-root/AppRun");
    const localDependencies = join(localRoot, "local-deps/usr/lib/x86_64-linux-gnu");
    await mkdir(bin, { recursive: true });
    await mkdir(join(localRoot, "squashfs-root"), { recursive: true });
    await mkdir(localDependencies, { recursive: true });
    await writeExecutable(local, [
      `if [ \"$LD_LIBRARY_PATH\" = \"${localDependencies}:operator-libs\" ]; then`,
      "  printf '%s\\n' 'OpenSCAD version 2021.01'",
      "else",
      "  printf '%s\\n' 'OpenSCAD version 2025.03'",
      "fi",
    ].join("\n"));
    process.env.PATH = bin;
    process.env.LD_LIBRARY_PATH = "operator-libs";
    const status = await probeOpenScad(root, undefined);
    expect(status).toMatchObject({ available: true, detectedVersion: "2021.01" });
  });
});
