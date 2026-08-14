import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rename as renameEntry,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSupportedOpenScadHost,
  createManagedOpenScadReceipt,
  loadOpenScadDistribution,
  MANAGED_OPENSCAD_DIRECTORY,
  MANAGED_OPENSCAD_RECEIPT,
  parseOpenScadDistribution,
  resolveManagedOpenScadCommand,
  type HostDescription,
  type OpenScadDistribution,
} from "../src/cad/OpenScadDistribution.ts";
import {
  downloadVerifiedArtifact,
  installOpenScad,
  type ArtifactDownloader,
  type CommandRunner,
} from "../scripts/setup-openscad.ts";

const temporaryDirectories: string[] = [];
const manifest = loadOpenScadDistribution(process.cwd());
const debianHost: HostDescription = {
  platform: "linux",
  architecture: "x64",
  osRelease:
    'ID=debian\nVERSION_ID="13"\nVERSION_CODENAME=trixie\nPRETTY_NAME="Debian GNU/Linux 13 (trixie)"\n',
  glibcVersion: "2.41",
};
const ubuntuHost: HostDescription = {
  platform: "linux",
  architecture: "x64",
  osRelease:
    'ID=ubuntu\nVERSION_ID="24.04"\nVERSION_CODENAME=noble\nPRETTY_NAME="Ubuntu 24.04 LTS"\n',
  glibcVersion: "2.39",
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

async function temporaryRoot(label = "managed openscad "): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), label));
  temporaryDirectories.push(root);
  return root;
}

function cloneManifest(): unknown {
  return structuredClone(manifest);
}

function fakeDownloader(counter: { calls: number }): ArtifactDownloader {
  return async (artifact, destination) => {
    counter.calls += 1;
    const bytes = new Uint8Array(32);
    if (artifact.fileName.endsWith(".AppImage")) {
      bytes[0] = 0x7f;
      bytes[1] = 0x45;
      bytes[2] = 0x4c;
      bytes[3] = 0x46;
      bytes[8] = 0x41;
      bytes[9] = 0x49;
    }
    await writeFile(destination, bytes, { flag: "wx" });
  };
}

function fakeRunner(
  probes: Array<{ command: string; libraryPath: string | undefined }> = [],
): CommandRunner {
  return async (command, args, options) => {
    if (command === "dpkg-deb" && args[0] === "--version") {
      return { code: 0, stdout: "Debian dpkg-deb package archive backend", stderr: "" };
    }
    if (command.endsWith(".AppImage")) {
      const bytes = await readFile(command);
      expect(bytes[8]).toBe(0);
      expect(bytes[9]).toBe(0x49);
      const executable = join(
        options.cwd,
        "squashfs-root/usr/bin/openscad",
      );
      await mkdir(join(options.cwd, "squashfs-root/usr/lib"), {
        recursive: true,
      });
      await mkdir(join(options.cwd, "squashfs-root/usr/bin"), {
        recursive: true,
      });
      await writeFile(executable, "#!/bin/sh\n", "utf8");
      return { code: 0, stdout: "", stderr: "" };
    }
    if (command === "dpkg-deb" && args[0] === "-x") {
      await mkdir(
        join(args[2]!, "usr/lib/x86_64-linux-gnu"),
        { recursive: true },
      );
      await writeFile(
        join(args[2]!, "usr/lib/x86_64-linux-gnu/libgpg-error.so.0"),
        "test",
      );
      return { code: 0, stdout: "", stderr: "" };
    }
    if (command.endsWith("/openscad")) {
      probes.push({
        command,
        libraryPath: options.environment.LD_LIBRARY_PATH,
      });
      return {
        code: 0,
        stdout: "",
        stderr: "OpenSCAD version 2021.01\n",
      };
    }
    throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
  };
}

describe("managed OpenSCAD distribution policy", () => {
  it("pins the exact upstream program, companion, source, and license metadata", () => {
    expect(manifest).toMatchObject({
      schemaVersion: "1.0.0",
      version: "2021.01",
      source: {
        url: "https://files.openscad.org/openscad-2021.01.src.tar.gz",
        sha256:
          "d938c297e7e5f65dbab1461cac472fc60dfeaa4999ea2c19b31a4184f2d70359",
      },
      license: {
        id: "GPL-2.0-or-later WITH LicenseRef-OpenSCAD-CGAL-exception",
      },
      target: {
        id: "linux-x64",
        artifact: {
          url: "https://files.openscad.org/OpenSCAD-2021.01-x86_64.AppImage",
          size: 40_759_336,
          sha256:
            "f758528f2cd213f773c7a105fb63bf3b45bf754b0f586fbb7c9cd653ffcd0882",
        },
        companions: [
          {
            url:
              "https://deb.debian.org/debian/pool/main/libg/libgpg-error/libgpg-error0_1.51-4_amd64.deb",
            size: 82_108,
            sha256:
              "22b95570fd41c113ef6f5651563b4d748292844baab1278a46eb940c1dec2322",
            sourceUrl: "https://gnupg.org/ftp/gcrypt/libgpg-error/",
            packageInfoUrl:
              "https://packages.debian.org/trixie/amd64/libgpg-error0/download",
            license: "LGPL-2.1-or-later",
          },
        ],
        executable: "squashfs-root/usr/bin/openscad",
        libraryDirectories: [
          "squashfs-root/usr/lib",
          "local-deps/usr/lib/x86_64-linux-gnu",
        ],
      },
    });
  });

  it("rejects changes to either download policy", () => {
    const program = cloneManifest() as {
      target: { artifact: { url: string } };
    };
    program.target.artifact.url = "https://example.test/OpenSCAD.AppImage";
    expect(() => parseOpenScadDistribution(program)).toThrow(
      /target\.artifact\.url/,
    );

    const companion = cloneManifest() as {
      target: { companions: Array<{ sha256: string }> };
    };
    companion.target.companions[0]!.sha256 = "0".repeat(64);
    expect(() => parseOpenScadDistribution(companion)).toThrow(
      /companions\[0\]\.sha256/,
    );
  });

  it("accepts only the declared Debian and Ubuntu x64 hosts", () => {
    expect(() => assertSupportedOpenScadHost(manifest, debianHost)).not.toThrow();
    expect(() => assertSupportedOpenScadHost(manifest, ubuntuHost)).not.toThrow();
    for (const host of [
      { ...debianHost, architecture: "arm64" },
      {
        ...debianHost,
        osRelease: "ID=debian\nVERSION_ID=12\nVERSION_CODENAME=bookworm\n",
      },
      { ...ubuntuHost, glibcVersion: "2.37" },
      {
        ...debianHost,
        osRelease: "ID=debian\nVERSION_ID=12\nVERSION_CODENAME=trixie\n",
      },
      {
        ...debianHost,
        osRelease: "ID=debian\nVERSION_ID=13\nVERSION_CODENAME=bookworm\n",
      },
      { ...ubuntuHost, platform: "darwin" },
    ]) {
      expect(() => assertSupportedOpenScadHost(manifest, host)).toThrow(
        /supports only Debian 13.*Ubuntu 24\.04/,
      );
    }
  });
});

describe("verified OpenSCAD downloads", () => {
  it("accepts an exact HTTPS response and rejects a checksum mismatch", async () => {
    const root = await temporaryRoot("openscad download ");
    const bytes = new TextEncoder().encode("verified artifact");
    const artifact = {
      fileName: "artifact.bin",
      url: "https://files.openscad.org/artifact.bin",
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    const fetchExact = vi.fn(async () =>
      new Response(bytes, {
        headers: { "content-length": String(bytes.length) },
      })
    ) as unknown as typeof fetch;
    const destination = join(root, "artifact.bin");
    await downloadVerifiedArtifact(artifact, destination, fetchExact);
    expect(await readFile(destination)).toEqual(Buffer.from(bytes));

    const badDestination = join(root, "bad.bin");
    await expect(
      downloadVerifiedArtifact(
        { ...artifact, sha256: "0".repeat(64) },
        badDestination,
        fetchExact,
      ),
    ).rejects.toThrow(/failed SHA-256 verification/);
    await expect(access(badDestination)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects non-HTTPS redirects and excessive response size", async () => {
    const root = await temporaryRoot("openscad redirect ");
    const artifact = {
      fileName: "artifact.bin",
      url: "https://files.openscad.org/artifact.bin",
      size: 2,
      sha256: "0".repeat(64),
    };
    const redirect = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://example.test/artifact.bin" },
      })
    ) as unknown as typeof fetch;
    await expect(
      downloadVerifiedArtifact(artifact, join(root, "redirect"), redirect),
    ).rejects.toThrow(/Unsafe download redirect/);

    const oversized = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]))
    ) as unknown as typeof fetch;
    await expect(
      downloadVerifiedArtifact(artifact, join(root, "large"), oversized),
    ).rejects.toThrow(/exceeds its pinned size/);
  });
});

describe("managed OpenSCAD installation", () => {
  it("rejects an unsupported host and a missing extractor before writing", async () => {
    const unsupportedRoot = await temporaryRoot("openscad unsupported ");
    const unsupportedRunner = vi.fn(fakeRunner());
    const unsupportedDownloader = vi.fn(fakeDownloader({ calls: 0 }));
    await expect(
      installOpenScad({
        rootDirectory: unsupportedRoot,
        manifest,
        host: { ...debianHost, architecture: "arm64" },
        runCommand: unsupportedRunner,
        downloadArtifact: unsupportedDownloader,
      }),
    ).rejects.toThrow(/supports only/);
    expect(unsupportedRunner).not.toHaveBeenCalled();
    expect(unsupportedDownloader).not.toHaveBeenCalled();
    await expect(access(join(unsupportedRoot, ".tools"))).rejects.toMatchObject({
      code: "ENOENT",
    });

    const missingToolRoot = await temporaryRoot("openscad no dpkg ");
    await expect(
      installOpenScad({
        rootDirectory: missingToolRoot,
        manifest,
        host: debianHost,
        runCommand: async () => ({ code: 1, stdout: "", stderr: "missing" }),
        downloadArtifact: fakeDownloader({ calls: 0 }),
      }),
    ).rejects.toThrow(/dpkg-deb is required/);
    await expect(access(join(missingToolRoot, ".tools"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("installs in a path with spaces, writes the receipt last, and reuses it", async () => {
    const root = await temporaryRoot("orbital lab with spaces ");
    const downloads = { calls: 0 };
    const probes: Array<{
      command: string;
      libraryPath: string | undefined;
    }> = [];
    const runner = fakeRunner(probes);
    const options = {
      rootDirectory: root,
      manifest,
      host: debianHost,
      runCommand: runner,
      downloadArtifact: fakeDownloader(downloads),
      uniqueId: () => "one",
    };

    const installed = await installOpenScad(options);
    expect(installed.reused).toBe(false);
    expect(downloads.calls).toBe(2);
    expect(installed.command).toBe(
      join(root, MANAGED_OPENSCAD_DIRECTORY, manifest.target.executable),
    );
    const receipt = JSON.parse(
      await readFile(
        join(
          root,
          MANAGED_OPENSCAD_DIRECTORY,
          MANAGED_OPENSCAD_RECEIPT,
        ),
        "utf8",
      ),
    );
    expect(receipt).toEqual(createManagedOpenScadReceipt(manifest));
    expect(probes).toHaveLength(1);
    const stagingLibraries = manifest.target.libraryDirectories.map((entry) =>
      join(root, ".tools/.openscad-2021.01.staging-one", entry)
    );
    expect(probes[0]!.libraryPath?.split(delimiter).slice(0, 2)).toEqual(
      stagingLibraries,
    );

    const reused = await installOpenScad(options);
    expect(reused.reused).toBe(true);
    expect(downloads.calls).toBe(2);
    expect(probes).toHaveLength(2);
    const installedLibraries = manifest.target.libraryDirectories.map((entry) =>
      join(root, MANAGED_OPENSCAD_DIRECTORY, entry)
    );
    expect(probes[1]!.libraryPath?.split(delimiter).slice(0, 2)).toEqual(
      installedLibraries,
    );
  });

  it("preserves the prior directory on failure and replaces it on recovery", async () => {
    const root = await temporaryRoot("openscad recovery ");
    const finalDirectory = join(root, MANAGED_OPENSCAD_DIRECTORY);
    await mkdir(finalDirectory, { recursive: true });
    await writeFile(join(finalDirectory, "keep.txt"), "previous", "utf8");

    let calls = 0;
    await expect(
      installOpenScad({
        rootDirectory: root,
        manifest,
        host: debianHost,
        runCommand: fakeRunner(),
        downloadArtifact: async (artifact, destination) => {
          calls += 1;
          if (calls === 2) throw new Error("network stopped");
          await fakeDownloader({ calls: 0 })(artifact, destination);
        },
        uniqueId: () => "failed",
      }),
    ).rejects.toThrow(/network stopped/);
    expect(await readFile(join(finalDirectory, "keep.txt"), "utf8")).toBe(
      "previous",
    );

    const result = await installOpenScad({
      rootDirectory: root,
      manifest,
      host: debianHost,
      runCommand: fakeRunner(),
      downloadArtifact: fakeDownloader({ calls: 0 }),
      uniqueId: () => "failed",
    });
    expect(result.reused).toBe(false);
    await expect(access(join(finalDirectory, "keep.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(
      resolveManagedOpenScadCommand(
        root,
        manifest,
        { LD_LIBRARY_PATH: "operator-libs" },
        debianHost,
      )?.environment.LD_LIBRARY_PATH?.split(delimiter).slice(-1),
    ).toEqual(["operator-libs"]);
  });

  it("reports both publication and prior-install restore failures", async () => {
    const root = await temporaryRoot("openscad failed rollback ");
    const finalDirectory = join(root, MANAGED_OPENSCAD_DIRECTORY);
    const backupDirectory = join(
      root,
      ".tools/.openscad-2021.01.previous-publication-failure",
    );
    await mkdir(finalDirectory, { recursive: true });
    await writeFile(join(finalDirectory, "keep.txt"), "previous", "utf8");

    let renameCalls = 0;
    let failure: unknown;
    try {
      await installOpenScad({
        rootDirectory: root,
        manifest,
        host: debianHost,
        runCommand: fakeRunner(),
        downloadArtifact: fakeDownloader({ calls: 0 }),
        uniqueId: () => "publication-failure",
        renamePath: async (source, destination) => {
          renameCalls += 1;
          if (renameCalls === 2) throw new Error("promotion failed");
          if (renameCalls === 3) throw new Error("restore failed");
          await renameEntry(source, destination);
        },
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    const aggregate = failure as AggregateError;
    expect(aggregate.message).toContain("promotion failed");
    expect(aggregate.message).toContain("restore failed");
    expect(aggregate.message).toContain(backupDirectory);
    expect(
      aggregate.errors.map((error) =>
        error instanceof Error ? error.message : String(error)
      ),
    ).toEqual(["promotion failed", "restore failed"]);
    expect(await readFile(join(backupDirectory, "keep.txt"), "utf8")).toBe(
      "previous",
    );
    await expect(access(finalDirectory)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("returns no managed command for a root without a valid manifest", async () => {
    const root = await temporaryRoot("openscad no manifest ");
    expect(resolveManagedOpenScadCommand(root)).toBeUndefined();
  });
});
