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
  managedOpenScadDirectory,
  MANAGED_OPENSCAD_RECEIPT,
  parseOpenScadDistribution,
  resolveManagedOpenScadCommand,
  selectOpenScadTarget,
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

const macArmHost: HostDescription = {
  platform: "darwin",
  architecture: "arm64",
  osRelease: "",
  glibcVersion: undefined,
  operatingSystemVersion: "15.6.1",
};
const macX64Host: HostDescription = {
  ...macArmHost,
  architecture: "x64",
};
const linuxTarget = selectOpenScadTarget(manifest, debianHost)!;
const macArmTarget = selectOpenScadTarget(manifest, macArmHost)!;
const macX64Target = selectOpenScadTarget(manifest, macX64Host)!;

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
  it("pins the Linux package and both native macOS targets", () => {
    expect(manifest).toMatchObject({
      schemaVersion: "2.0.0",
      targets: [
        {
          id: "linux-x64",
          version: "2021.01",
          installDirectory: ".tools/openscad-2021.01",
          source: {
            url: "https://files.openscad.org/openscad-2021.01.src.tar.gz",
            sha256:
              "d938c297e7e5f65dbab1461cac472fc60dfeaa4999ea2c19b31a4184f2d70359",
            revision: "openscad-2021.01",
          },
          artifact: {
            url: "https://files.openscad.org/OpenSCAD-2021.01-x86_64.AppImage",
            size: 40_759_336,
            sha256:
              "f758528f2cd213f773c7a105fb63bf3b45bf754b0f586fbb7c9cd653ffcd0882",
          },
          companions: [
            {
              sha256:
                "22b95570fd41c113ef6f5651563b4d748292844baab1278a46eb940c1dec2322",
              license: "LGPL-2.1-or-later",
            },
          ],
        },
        {
          id: "darwin-arm64",
          version: "2026.06.12",
          installDirectory:
            ".tools/openscad-2026.06.12-darwin-arm64",
          source: {
            url: "https://github.com/openscad/openscad",
            revision: null,
          },
          artifact: {
            url:
              "https://files.openscad.org/snapshots/OpenSCAD-2026.06.12.dmg",
            size: 64_447_344,
            sha256:
              "555be2ed313e67657b3d8ba3e1de0acd6141b982fd458776c52d3eda748f57c4",
          },
          companions: [],
          executable: "OpenSCAD.app/Contents/MacOS/OpenSCAD",
          libraryDirectories: [],
        },
        {
          id: "darwin-x64",
          architecture: "x64",
          version: "2026.06.12",
          installDirectory:
            ".tools/openscad-2026.06.12-darwin-x64",
          artifact: {
            sha256:
              "555be2ed313e67657b3d8ba3e1de0acd6141b982fd458776c52d3eda748f57c4",
          },
        },
      ],
    });
  });

  it("rejects changes to any pinned target artifact", () => {
    const linuxProgram = cloneManifest() as {
      targets: Array<{ artifact: { url: string } }>;
    };
    linuxProgram.targets[0]!.artifact.url =
      "https://example.test/OpenSCAD.AppImage";
    expect(() => parseOpenScadDistribution(linuxProgram)).toThrow(
      /targets\[0\]\.artifact\.url/,
    );

    const companion = cloneManifest() as {
      targets: Array<{ companions: Array<{ sha256: string }> }>;
    };
    companion.targets[0]!.companions[0]!.sha256 = "0".repeat(64);
    expect(() => parseOpenScadDistribution(companion)).toThrow(
      /targets\[0\]\.companions\[0\]\.sha256/,
    );

    const macProgram = cloneManifest() as {
      targets: Array<{ artifact: { sha256: string } }>;
    };
    macProgram.targets[1]!.artifact.sha256 = "0".repeat(64);
    expect(() => parseOpenScadDistribution(macProgram)).toThrow(
      /targets\[1\]\.artifact\.sha256/,
    );
  });

  it("selects only exact declared operating systems and architectures", () => {
    expect(selectOpenScadTarget(manifest, debianHost)?.id).toBe("linux-x64");
    expect(selectOpenScadTarget(manifest, ubuntuHost)?.id).toBe("linux-x64");
    expect(selectOpenScadTarget(manifest, macArmHost)?.id).toBe(
      "darwin-arm64",
    );
    expect(selectOpenScadTarget(manifest, macX64Host)?.id).toBe(
      "darwin-x64",
    );

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
      { ...macArmHost, operatingSystemVersion: "14.7.6" },
      { ...macArmHost, architecture: "ia32" },
      { ...macX64Host, operatingSystemVersion: undefined },
    ]) {
      expect(selectOpenScadTarget(manifest, host)).toBeUndefined();
      expect(() => assertSupportedOpenScadHost(manifest, host)).toThrow(
        /supports only Debian 13.*macOS 15/,
      );
    }
  });

  it("binds receipts to the target, version, and full artifact set", () => {
    expect(createManagedOpenScadReceipt(linuxTarget)).toMatchObject({
      schemaVersion: "2.0.0",
      target: "linux-x64",
      version: "2021.01",
      artifacts: [
        {
          fileName: "OpenSCAD-2021.01-x86_64.AppImage",
          sha256:
            "f758528f2cd213f773c7a105fb63bf3b45bf754b0f586fbb7c9cd653ffcd0882",
        },
        {
          fileName: "libgpg-error0_1.51-4_amd64.deb",
          sha256:
            "22b95570fd41c113ef6f5651563b4d748292844baab1278a46eb940c1dec2322",
        },
      ],
    });
    expect(createManagedOpenScadReceipt(macArmTarget)).toMatchObject({
      target: "darwin-arm64",
      version: "2026.06.12",
      artifacts: [
        {
          fileName: "OpenSCAD-2026.06.12.dmg",
          sha256:
            "555be2ed313e67657b3d8ba3e1de0acd6141b982fd458776c52d3eda748f57c4",
        },
      ],
    });
  });

  it("resolves a macOS receipt without a library environment change", async () => {
    const root = await temporaryRoot("mac managed path with spaces ");
    const installation = managedOpenScadDirectory(root, macX64Target);
    const command = join(installation, macX64Target.executable);
    await mkdir(join(command, ".."), { recursive: true });
    await writeFile(command, "test", "utf8");
    await writeFile(
      join(installation, MANAGED_OPENSCAD_RECEIPT),
      JSON.stringify(createManagedOpenScadReceipt(macX64Target)),
      "utf8",
    );
    const environment = {
      PATH: "/operator/bin",
      LD_LIBRARY_PATH: "/operator/linux-libs",
      DYLD_LIBRARY_PATH: "/operator/mac-libs",
    };
    expect(
      resolveManagedOpenScadCommand(
        root,
        manifest,
        environment,
        macX64Host,
      ),
    ).toEqual({
      command,
      environment,
      targetId: "darwin-x64",
      expectedVersion: "2026.06.12",
    });

    const validReceipt = createManagedOpenScadReceipt(macX64Target);
    const invalidReceipts = [
      { ...validReceipt, target: "darwin-arm64" },
      { ...validReceipt, version: "2021.01" },
      {
        ...validReceipt,
        artifacts: [
          {
            ...validReceipt.artifacts[0]!,
            sha256: "0".repeat(64),
          },
        ],
      },
    ];
    for (const invalidReceipt of invalidReceipts) {
      await writeFile(
        join(installation, MANAGED_OPENSCAD_RECEIPT),
        JSON.stringify(invalidReceipt),
        "utf8",
      );
      expect(
        resolveManagedOpenScadCommand(
          root,
          manifest,
          environment,
          macX64Host,
        ),
      ).toBeUndefined();
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
      join(root, linuxTarget.installDirectory, linuxTarget.executable),
    );
    const receipt = JSON.parse(
      await readFile(
        join(
          root,
          linuxTarget.installDirectory,
          MANAGED_OPENSCAD_RECEIPT,
        ),
        "utf8",
      ),
    );
    expect(receipt).toEqual(createManagedOpenScadReceipt(linuxTarget));
    expect(probes).toHaveLength(1);
    const stagingLibraries = linuxTarget.libraryDirectories.map((entry) =>
      join(root, ".tools/.openscad-2021.01.staging-one", entry)
    );
    expect(probes[0]!.libraryPath?.split(delimiter).slice(0, 2)).toEqual(
      stagingLibraries,
    );

    const reused = await installOpenScad(options);
    expect(reused.reused).toBe(true);
    expect(downloads.calls).toBe(2);
    expect(probes).toHaveLength(2);
    const installedLibraries = linuxTarget.libraryDirectories.map((entry) =>
      join(root, linuxTarget.installDirectory, entry)
    );
    expect(probes[1]!.libraryPath?.split(delimiter).slice(0, 2)).toEqual(
      installedLibraries,
    );
  });

  it("preserves the prior directory on failure and replaces it on recovery", async () => {
    const root = await temporaryRoot("openscad recovery ");
    const finalDirectory = join(root, linuxTarget.installDirectory);
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
    const finalDirectory = join(root, linuxTarget.installDirectory);
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
