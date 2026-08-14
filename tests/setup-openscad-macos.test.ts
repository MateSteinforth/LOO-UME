import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createManagedOpenScadReceipt,
  loadOpenScadDistribution,
  managedOpenScadDirectory,
  MANAGED_OPENSCAD_RECEIPT,
  type HostDescription,
} from "../src/cad/OpenScadDistribution.ts";
import {
  installOpenScad,
  machOArchitectures,
  validateMacOsAppTree,
  validateNativeMachO,
  type ArtifactDownloader,
  type CommandResult,
  type CommandRunner,
} from "../scripts/setup-openscad.ts";

const manifest = loadOpenScadDistribution(process.cwd());
const macArmTarget = manifest.targets.find(
  (target) => target.id === "darwin-arm64",
)!;
const macArmHost: HostDescription = {
  platform: "darwin",
  architecture: "arm64",
  osRelease: "",
  glibcVersion: undefined,
  operatingSystemVersion: "15.7.1",
};
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

async function temporaryRoot(label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), label));
  temporaryDirectories.push(root);
  return root;
}

function universalMachO(): Buffer {
  const bytes = Buffer.alloc(48);
  bytes.writeUInt32BE(0xcafebabe, 0);
  bytes.writeUInt32BE(2, 4);
  bytes.writeUInt32BE(0x01000007, 8);
  bytes.writeUInt32BE(0x0100000c, 28);
  return bytes;
}

function fakeDownloader(counter: { calls: number }): ArtifactDownloader {
  return async (_artifact, destination) => {
    counter.calls += 1;
    await writeFile(destination, "verified dmg", { flag: "wx" });
  };
}

interface MacRunnerState {
  calls: Array<{ command: string; args: string[] }>;
  copyFailure?: boolean;
  partialAttachFailure?: boolean;
  normalDetachFailure?: boolean;
  forceDetachFailure?: boolean;
  detachRemovesMount?: boolean;
  translated?: boolean;
}

function successfulResult(stdout = ""): CommandResult {
  return { code: 0, stdout, stderr: "" };
}

function fakeMacRunner(state: MacRunnerState): CommandRunner {
  return async (command, args) => {
    state.calls.push({ command, args: [...args] });
    if (command === "/usr/sbin/sysctl") {
      return successfulResult(state.translated ? "1\n" : "0\n");
    }
    if (command === "/usr/bin/uname") {
      return successfulResult("arm64\n");
    }
    if (
      (command === "/usr/bin/hdiutil" && args[0] === "help") ||
      (command === "/usr/bin/ditto" && args[0] === "-h")
    ) {
      return successfulResult();
    }
    if (command === "/usr/bin/hdiutil" && args[0] === "attach") {
      const mount = args.at(-1)!;
      const executable = join(
        mount,
        "OpenSCAD.app/Contents/MacOS/OpenSCAD",
      );
      await mkdir(join(mount, "OpenSCAD.app/Contents/Resources"), {
        recursive: true,
      });
      await mkdir(join(mount, "OpenSCAD.app/Contents/MacOS"), {
        recursive: true,
      });
      await writeFile(executable, universalMachO());
      await writeFile(
        join(mount, "OpenSCAD.app/Contents/Info.plist"),
        "plist",
      );
      return state.partialAttachFailure
        ? { code: 1, stdout: "", stderr: "partial attach failed" }
        : successfulResult();
    }
    if (command === "/usr/bin/ditto") {
      if (state.copyFailure) {
        return { code: 1, stdout: "", stderr: "copy failed" };
      }
      await cp(args[0]!, args[1]!, {
        recursive: true,
        verbatimSymlinks: true,
      });
      return successfulResult();
    }
    if (command === "/usr/bin/hdiutil" && args[0] === "detach") {
      const forced = args[1] === "-force";
      const mount = args[forced ? 2 : 1]!;
      if (!forced && state.normalDetachFailure) {
        return { code: 1, stdout: "", stderr: "normal detach failed" };
      }
      if (forced && state.forceDetachFailure) {
        return { code: 1, stdout: "", stderr: "force detach failed" };
      }
      if (state.detachRemovesMount) {
        await rm(mount, { recursive: true, force: true });
      } else {
        await rm(join(mount, "OpenSCAD.app"), {
          recursive: true,
          force: true,
        });
      }
      return successfulResult();
    }
    if (
      command.endsWith("/OpenSCAD") &&
      args.length === 1 &&
      args[0] === "--version"
    ) {
      return successfulResult("OpenSCAD version 2026.06.12\n");
    }
    throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
  };
}

describe("managed OpenSCAD macOS installation", () => {
  it("installs the native app in a path with spaces and reuses the receipt", async () => {
    const root = await temporaryRoot("orbital lab mac path ");
    const downloads = { calls: 0 };
    const state: MacRunnerState = { calls: [] };
    let receiptPresentAtPublish = false;
    const options = {
      rootDirectory: root,
      manifest,
      host: macArmHost,
      runCommand: fakeMacRunner(state),
      downloadArtifact: fakeDownloader(downloads),
      uniqueId: () => "mac-one",
      renamePath: async (source: string, destination: string) => {
        if (source.includes(".staging-")) {
          await access(join(source, MANAGED_OPENSCAD_RECEIPT));
          receiptPresentAtPublish = true;
        }
        await rename(source, destination);
      },
    };

    const installed = await installOpenScad(options);
    const finalDirectory = managedOpenScadDirectory(root, macArmTarget);
    expect(installed).toEqual({
      installationDirectory: finalDirectory,
      command: join(finalDirectory, macArmTarget.executable),
      reused: false,
    });
    expect(downloads.calls).toBe(1);
    expect(receiptPresentAtPublish).toBe(true);
    expect(
      JSON.parse(
        await readFile(
          join(finalDirectory, MANAGED_OPENSCAD_RECEIPT),
          "utf8",
        ),
      ),
    ).toEqual(createManagedOpenScadReceipt(macArmTarget));

    const attach = state.calls.find(
      ({ command, args }) =>
        command === "/usr/bin/hdiutil" && args[0] === "attach",
    )!;
    expect(attach.args.slice(1, 5)).toEqual([
      join(
        root,
        ".tools/.openscad-2026.06.12-darwin-arm64.staging-mac-one/OpenSCAD-2026.06.12.dmg",
      ),
      "-readonly",
      "-nobrowse",
      "-noautoopen",
    ]);
    expect(attach.args[5]).toBe("-mountpoint");
    expect(attach.args[6]).toContain(
      ".openscad-2026.06.12-darwin-arm64.mount-mac-one",
    );
    const copy = state.calls.find(
      ({ command, args }) =>
        command === "/usr/bin/ditto" && args[0] !== "-h",
    )!;
    expect(copy.args).toHaveLength(2);
    expect(copy.args[0]).toBe(join(attach.args[6]!, "OpenSCAD.app"));
    expect(copy.args[1]).toContain(
      ".staging-mac-one/OpenSCAD.app",
    );
    expect(
      state.calls.some(
        ({ command, args }) =>
          command === "/usr/bin/hdiutil" && args[0] === "detach",
      ),
    ).toBe(true);
    expect(
      state.calls.some(({ command }) =>
        command === "sudo" ||
        command.includes("xattr") ||
        command.includes("/Applications")
      ),
    ).toBe(false);

    const reused = await installOpenScad(options);
    expect(reused.reused).toBe(true);
    expect(downloads.calls).toBe(1);
  });

  it("rejects Rosetta and missing Apple tools before it writes", async () => {
    for (const failure of ["rosetta", "hdiutil", "ditto"] as const) {
      const root = await temporaryRoot(`mac preflight ${failure} `);
      const state: MacRunnerState = {
        calls: [],
        translated: failure === "rosetta",
      };
      const runner = fakeMacRunner(state);
      const guardedRunner: CommandRunner = async (command, args, options) => {
        if (
          (failure === "hdiutil" && command === "/usr/bin/hdiutil") ||
          (failure === "ditto" && command === "/usr/bin/ditto")
        ) {
          return { code: 1, stdout: "", stderr: "missing" };
        }
        return runner(command, args, options);
      };
      const downloader = vi.fn(fakeDownloader({ calls: 0 }));

      await expect(
        installOpenScad({
          rootDirectory: root,
          manifest,
          host: macArmHost,
          runCommand: guardedRunner,
          downloadArtifact: downloader,
        }),
      ).rejects.toThrow(
        failure === "rosetta"
          ? /Rosetta/
          : new RegExp(`${failure} is required`),
      );
      expect(downloader).not.toHaveBeenCalled();
      await expect(access(join(root, ".tools"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    }
  });

  it("forces cleanup after a partial attach reports failure", async () => {
    const root = await temporaryRoot("mac partial attach ");
    const state: MacRunnerState = {
      calls: [],
      partialAttachFailure: true,
      normalDetachFailure: true,
      detachRemovesMount: true,
    };
    await expect(
      installOpenScad({
        rootDirectory: root,
        manifest,
        host: macArmHost,
        runCommand: fakeMacRunner(state),
        downloadArtifact: fakeDownloader({ calls: 0 }),
        uniqueId: () => "partial",
      }),
    ).rejects.toThrow(/disk image attach failed.*partial attach failed/s);

    const detaches = state.calls.filter(
      ({ command, args }) =>
        command === "/usr/bin/hdiutil" && args[0] === "detach",
    );
    expect(detaches.map(({ args }) => args[1])).toEqual([
      expect.stringContaining(".mount-partial"),
      "-force",
    ]);
    await expect(
      access(
        join(
          root,
          ".tools/.openscad-2026.06.12-darwin-arm64.mount-partial",
        ),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      access(managedOpenScadDirectory(root, macArmTarget)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps the copy error after a normal detach needs force", async () => {
    const root = await temporaryRoot("mac detach failure ");
    const state: MacRunnerState = {
      calls: [],
      copyFailure: true,
      normalDetachFailure: true,
    };
    await expect(
      installOpenScad({
        rootDirectory: root,
        manifest,
        host: macArmHost,
        runCommand: fakeMacRunner(state),
        downloadArtifact: fakeDownloader({ calls: 0 }),
        uniqueId: () => "failure",
      }),
    ).rejects.toThrow(/application copy failed.*copy failed/s);

    const detaches = state.calls.filter(
      ({ command, args }) =>
        command === "/usr/bin/hdiutil" && args[0] === "detach",
    );
    expect(detaches.map(({ args }) => args[1])).toEqual([
      expect.stringContaining(".mount-failure"),
      "-force",
    ]);
    await expect(
      access(
        join(
          root,
          ".tools/.openscad-2026.06.12-darwin-arm64.mount-failure",
        ),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      access(managedOpenScadDirectory(root, macArmTarget)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("preserves operation and bounded cleanup failures", async () => {
    const root = await temporaryRoot("mac aggregate cleanup ");
    const state: MacRunnerState = {
      calls: [],
      copyFailure: true,
      normalDetachFailure: true,
      forceDetachFailure: true,
    };
    let caught: unknown;
    try {
      await installOpenScad({
        rootDirectory: root,
        manifest,
        host: macArmHost,
        runCommand: fakeMacRunner(state),
        downloadArtifact: fakeDownloader({ calls: 0 }),
        uniqueId: () => "aggregate",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    const combined = caught as AggregateError;
    expect(combined.message).toMatch(/installation and disk image cleanup/);
    expect(combined.errors[0]).toMatchObject({
      message: expect.stringMatching(/application copy failed.*copy failed/s),
    });
    expect(combined.errors[1]).toBeInstanceOf(AggregateError);
    const cleanup = combined.errors[1] as AggregateError;
    expect(cleanup.errors).toHaveLength(3);
    expect(cleanup.errors[0]).toMatchObject({
      message: expect.stringMatching(/disk image detach failed.*normal detach failed/s),
    });
    expect(cleanup.errors[1]).toMatchObject({
      message: expect.stringMatching(/force detach failed.*force detach failed/s),
    });
    expect(state.calls.filter(
      ({ command, args }) =>
        command === "/usr/bin/hdiutil" && args[0] === "detach",
    )).toHaveLength(2);
    await expect(
      access(managedOpenScadDirectory(root, macArmTarget)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

});

describe("macOS OpenSCAD payload validation", () => {
  it("recognizes both native slices in the pinned universal Mach-O form", () => {
    expect([...machOArchitectures(universalMachO())]).toEqual([
      0x01000007,
      0x0100000c,
    ]);
    expect(() =>
      machOArchitectures(Buffer.from("not macho"))
    ).toThrow(/not a Mach-O/);
  });

  it("rejects absolute and escaping app-bundle symbolic links", async () => {
    const root = await temporaryRoot("mac app links ");
    const bundle = join(root, "OpenSCAD.app");
    await mkdir(join(bundle, "Contents"), { recursive: true });
    await symlink("/tmp/outside", join(bundle, "Contents/absolute"));
    await expect(validateMacOsAppTree(bundle)).rejects.toThrow(
      /absolute symbolic link/,
    );

    await rm(join(bundle, "Contents/absolute"));
    await symlink("../../outside", join(bundle, "Contents/escaping"));
    await expect(validateMacOsAppTree(bundle)).rejects.toThrow(
      /escaping symbolic link/,
    );
  });

  it("rejects a valid Mach-O that has no native host slice", async () => {
    const root = await temporaryRoot("mac wrong slice ");
    const executable = join(root, "OpenSCAD");
    const x64MachO = Buffer.alloc(8);
    x64MachO.writeUInt32LE(0xfeedfacf, 0);
    x64MachO.writeUInt32LE(0x01000007, 4);
    await writeFile(executable, x64MachO);

    await expect(
      validateNativeMachO(executable, "arm64"),
    ).rejects.toThrow(/no native arm64 Mach-O slice/);
  });
});
