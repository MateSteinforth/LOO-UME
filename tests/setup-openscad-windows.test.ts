import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import {
  createManagedOpenScadReceipt,
  managedOpenScadDirectory,
  MANAGED_OPENSCAD_RECEIPT,
  type HostDescription,
  type OpenScadDistribution,
  type OpenScadTarget,
} from "../src/cad/OpenScadDistribution.ts";
import {
  installOpenScad,
  validateOpenScadWindowsZip,
  type ArtifactDownloader,
  type CommandRunner,
} from "../scripts/setup-openscad.ts";

interface ZipEntry {
  name: string;
  data?: string | Uint8Array;
  mode?: number;
  flags?: number;
  method?: number;
  creatorSystem?: number;
  dosAttributes?: number;
  localName?: string;
  localFlags?: number;
  localMethod?: number;
  compressedSize?: number;
  expandedSize?: number;
  crc?: number;
  disk?: number;
}

interface ZipOptions {
  disk?: number;
  centralDisk?: number;
  diskEntries?: number;
}

interface TestZip {
  bytes: Buffer;
  entryCount: number;
  expandedSize: number;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeStoredZip(
  definitions: ZipEntry[],
  options: ZipOptions = {},
): TestZip {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  let expandedSize = 0;

  for (const definition of definitions) {
    const name = Buffer.from(definition.name, "utf8");
    const localName = Buffer.from(
      definition.localName ?? definition.name,
      "utf8",
    );
    const data = typeof definition.data === "string"
      ? Buffer.from(definition.data)
      : Buffer.from(definition.data ?? []);
    const directory = definition.name.endsWith("/");
    const method = definition.method ?? 0;
    const flags = definition.flags ?? 0;
    const declaredCompressed = definition.compressedSize ?? data.length;
    const declaredExpanded = definition.expandedSize ?? data.length;
    const checksum = definition.crc ?? crc32(data);
    const mode = definition.mode ??
      (directory ? 0o040755 : 0o100644);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(definition.localFlags ?? flags, 6);
    local.writeUInt16LE(definition.localMethod ?? method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(declaredCompressed, 18);
    local.writeUInt32LE(declaredExpanded, 22);
    local.writeUInt16LE(localName.length, 26);
    localParts.push(local, localName, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(((definition.creatorSystem ?? 3) << 8) | 30, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(declaredCompressed, 20);
    central.writeUInt32LE(declaredExpanded, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(definition.disk ?? 0, 34);
    central.writeUInt32LE(
      ((mode << 16) | (definition.dosAttributes ??
        (directory ? 0x10 : 0))) >>> 0,
      38,
    );
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);

    localOffset += local.length + localName.length + data.length;
    expandedSize += declaredExpanded;
  }

  const centralOffset = localOffset;
  const centralSize = centralParts.reduce(
    (size, part) => size + part.length,
    0,
  );
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(options.disk ?? 0, 4);
  end.writeUInt16LE(options.centralDisk ?? 0, 6);
  end.writeUInt16LE(options.diskEntries ?? definitions.length, 8);
  end.writeUInt16LE(definitions.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  return {
    bytes: Buffer.concat([...localParts, ...centralParts, end]),
    entryCount: definitions.length,
    expandedSize,
  };
}

const rootName = "openscad-2021.01";
const windowsHost: HostDescription = {
  platform: "win32",
  architecture: "x64",
  osRelease: "10.0.26100",
  glibcVersion: undefined,
  operatingSystemVersion: "10.0.26100",
  nativeArchitecture: "x64",
};
const baseTarget: OpenScadTarget = {
  id: "win32-x64",
  platform: "win32",
  architecture: "x64",
  operatingSystems: [
    { id: "windows", version: "10.0", minimumBuild: "19044" },
  ],
  version: "2021.01",
  installDirectory: ".tools/openscad-2021.01-win32-x64",
  releaseUrl: "https://openscad.org/downloads.html",
  source: {
    url: "https://files.openscad.org/openscad-2021.01.src.tar.gz",
    revision: "openscad-2021.01",
  },
  license: {
    id: "GPL-2.0-or-later WITH LicenseRef-OpenSCAD-CGAL-exception",
    url: "https://example.test/COPYING",
  },
  artifact: {
    fileName: "OpenSCAD-2021.01-x86-64.zip",
    url: "https://files.openscad.org/OpenSCAD-2021.01-x86-64.zip",
    size: 1,
    sha256: "0".repeat(64),
  },
  companions: [],
  requiredCommands: [],
  extraction: {
    kind: "zip",
    rootDirectory: rootName,
    entryCount: 1,
    expandedSize: 0,
    allowedEntryPrefixes: ["openscad.com", "fonts/"],
  },
  executable: rootName + "/openscad.com",
  libraryDirectories: [],
};

function targetFor(zip: TestZip): OpenScadTarget {
  if (baseTarget.extraction.kind !== "zip") {
    throw new Error("The Windows test target must use ZIP extraction.");
  }
  return {
    ...baseTarget,
    extraction: {
      ...baseTarget.extraction,
      kind: "zip",
      entryCount: zip.entryCount,
      expandedSize: zip.expandedSize,
    },
  };
}

function policyFor(
  zip: TestZip,
  allowedEntryPrefixes = ["openscad.com", "fonts/"],
): Extract<OpenScadTarget["extraction"], { kind: "zip" }> {
  return {
    kind: "zip",
    rootDirectory: rootName,
    entryCount: zip.entryCount,
    expandedSize: zip.expandedSize,
    allowedEntryPrefixes,
  };
}

function validSmallZip(): TestZip {
  return makeStoredZip([
    { name: rootName + "/" },
    { name: rootName + "/openscad.com", data: "program" },
    { name: rootName + "/fonts/" },
    { name: rootName + "/fonts/font.txt", data: "font" },
  ]);
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

async function temporaryRoot(label: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), label));
  temporaryDirectories.push(directory);
  return directory;
}

function downloaderFor(
  zip: TestZip,
  calls: { count: number },
): ArtifactDownloader {
  return async (_artifact, destination) => {
    calls.count += 1;
    await writeFile(destination, zip.bytes, { flag: "wx" });
  };
}

function successfulWindowsRunner(): CommandRunner {
  return async (command, args) => {
    if (command.endsWith("openscad.com") && args[0] === "--version") {
      return {
        code: 0,
        stdout: "OpenSCAD version 2021.01\n",
        stderr: "",
      };
    }
    throw new Error("Unexpected command: " + command + " " + args.join(" "));
  };
}

describe("managed OpenSCAD Windows ZIP installation", () => {
  it("installs under spaces and an ampersand, writes the receipt last, and reuses it", async () => {
    const root = await temporaryRoot("orbital lab & windows ");
    const zip = validSmallZip();
    const target = targetFor(zip);
    const manifest: OpenScadDistribution = {
      schemaVersion: "2.0.0",
      name: "OpenSCAD",
      targets: [target],
    };
    const downloads = { count: 0 };
    let receiptPresentAtPublish = false;
    const options = {
      rootDirectory: root,
      manifest,
      host: windowsHost,
      runCommand: successfulWindowsRunner(),
      downloadArtifact: downloaderFor(zip, downloads),
      uniqueId: () => "windows-one",
      renamePath: async (source: string, destination: string) => {
        if (source.includes(".staging-")) {
          await access(join(source, MANAGED_OPENSCAD_RECEIPT));
          receiptPresentAtPublish = true;
        }
        await rename(source, destination);
      },
    };

    const installed = await installOpenScad(options);
    const finalDirectory = managedOpenScadDirectory(root, target);
    expect(installed).toEqual({
      installationDirectory: finalDirectory,
      command: join(finalDirectory, rootName, "openscad.com"),
      reused: false,
    });
    expect(
      await readFile(join(finalDirectory, rootName, "fonts/font.txt"), "utf8"),
    ).toBe("font");
    expect(receiptPresentAtPublish).toBe(true);
    expect(
      JSON.parse(
        await readFile(join(finalDirectory, MANAGED_OPENSCAD_RECEIPT), "utf8"),
      ),
    ).toEqual(createManagedOpenScadReceipt(target));
    expect(downloads.count).toBe(1);

    const reused = await installOpenScad(options);
    expect(reused.reused).toBe(true);
    expect(downloads.count).toBe(1);
  });

  it("validates all entries before extraction and preserves the prior install", async () => {
    const root = await temporaryRoot("windows rollback ");
    const finalDirectory = managedOpenScadDirectory(root, baseTarget);
    await mkdir(finalDirectory, { recursive: true });
    await writeFile(join(finalDirectory, "old-install.txt"), "keep");
    const zip = makeStoredZip([
      { name: rootName + "/" },
      { name: rootName + "/openscad.com", data: "program" },
      { name: rootName + "/unknown.dll", data: "bad" },
    ]);
    const target = targetFor(zip);

    await expect(
      installOpenScad({
        rootDirectory: root,
        manifest: {
          schemaVersion: "2.0.0",
          name: "OpenSCAD",
          targets: [target],
        },
        host: windowsHost,
        runCommand: successfulWindowsRunner(),
        downloadArtifact: downloaderFor(zip, { count: 0 }),
        uniqueId: () => "reject",
      }),
    ).rejects.toThrow(/not allowlisted/);
    expect(await readFile(join(finalDirectory, "old-install.txt"), "utf8"))
      .toBe("keep");
    expect(await readdir(join(root, ".tools"))).toEqual([
      "openscad-2021.01-win32-x64",
    ]);
  });
});

describe("strict OpenSCAD Windows ZIP validation", () => {
  it("accepts the exact root, allowlist, count, and expanded-size fixture", () => {
    const zip = validSmallZip();
    expect(validateOpenScadWindowsZip(zip.bytes, policyFor(zip))).toHaveLength(
      4,
    );
  });

  it.each([
    ["empty name", ""],
    ["backslash", rootName + "\\evil.dll"],
    ["absolute path", "/tmp/evil.dll"],
    ["UNC path", "//server/share/evil.dll"],
    ["invalid Windows character", rootName + "/bad?.dll"],
    ["drive path", "C:/evil.dll"],
    ["ADS path", rootName + "/openscad.com:evil"],
    ["control character", rootName + "/bad\u0001name"],
    ["empty segment", rootName + "//evil.dll"],
    ["dot segment", rootName + "/./evil.dll"],
    ["dot-dot segment", rootName + "/../evil.dll"],
    ["trailing dot", rootName + "/evil."],
    ["trailing space", rootName + "/evil "],
    ["reserved device", rootName + "/CON.txt"],
  ])("rejects a %s", (_label, unsafeName) => {
    const zip = makeStoredZip([
      { name: rootName + "/" },
      { name: unsafeName, data: "x" },
    ]);
    expect(() =>
      validateOpenScadWindowsZip(zip.bytes, policyFor(zip, ["fonts/"]))
    ).toThrow(/Unsafe OpenSCAD ZIP archive/);
  });

  it("rejects unknown entries and case-insensitive duplicates", () => {
    const unknown = makeStoredZip([
      { name: rootName + "/" },
      { name: rootName + "/unknown.dll", data: "x" },
    ]);
    expect(() =>
      validateOpenScadWindowsZip(unknown.bytes, policyFor(unknown))
    ).toThrow(/not allowlisted/);

    const duplicate = makeStoredZip([
      { name: rootName + "/" },
      { name: rootName + "/fonts/" },
      { name: rootName + "/fonts/File.txt", data: "x" },
      { name: rootName + "/fonts/file.txt", data: "y" },
    ]);
    expect(() =>
      validateOpenScadWindowsZip(
        duplicate.bytes,
        policyFor(duplicate),
      )
    ).toThrow(/case-insensitive duplicate/);
  });

  it("rejects file-directory collisions and inconsistent entry types", () => {
    const collision = makeStoredZip([
      { name: rootName + "/" },
      { name: rootName + "/fonts/" },
      { name: rootName + "/fonts/node", data: "file" },
      { name: rootName + "/fonts/node/child.txt", data: "child" },
    ]);
    expect(() =>
      validateOpenScadWindowsZip(
        collision.bytes,
        policyFor(collision),
      )
    ).toThrow(/below a file/);

    const wrongDirectory = makeStoredZip([
      { name: rootName + "/", mode: 0o100644 },
    ]);
    expect(() =>
      validateOpenScadWindowsZip(
        wrongDirectory.bytes,
        policyFor(wrongDirectory),
      )
    ).toThrow(/inconsistent Unix file type/);
  });

  it("requires the pinned Unix creator system and consistent DOS type bits", () => {
    const nonUnix = makeStoredZip([
      { name: rootName + "/", creatorSystem: 0 },
    ]);
    expect(() =>
      validateOpenScadWindowsZip(nonUnix.bytes, policyFor(nonUnix))
    ).toThrow(/required Unix creator system/);

    const directoryWithoutDosBit = makeStoredZip([
      { name: rootName + "/", dosAttributes: 0 },
    ]);
    expect(() =>
      validateOpenScadWindowsZip(
        directoryWithoutDosBit.bytes,
        policyFor(directoryWithoutDosBit),
      )
    ).toThrow(/inconsistent DOS directory type/);

    const fileWithDosBit = makeStoredZip([
      { name: rootName + "/openscad.com", data: "x", dosAttributes: 0x10 },
    ]);
    expect(() =>
      validateOpenScadWindowsZip(
        fileWithDosBit.bytes,
        policyFor(fileWithDosBit),
      )
    ).toThrow(/inconsistent DOS directory type/);
  });

  it("rejects Unix symbolic links and special file types", () => {
    for (const mode of [0o120777, 0o020666]) {
      const zip = makeStoredZip([
        { name: rootName + "/" },
        { name: rootName + "/openscad.com", data: "x", mode },
      ]);
      expect(() =>
        validateOpenScadWindowsZip(zip.bytes, policyFor(zip))
      ).toThrow(/unsafe or inconsistent Unix file type/);
    }
  });

  it("rejects encryption, unsupported methods, ZIP64, and multi-disk fields", () => {
    const encrypted = makeStoredZip([
      { name: rootName + "/", flags: 1, localFlags: 1 },
    ]);
    expect(() =>
      validateOpenScadWindowsZip(encrypted.bytes, policyFor(encrypted))
    ).toThrow(/encrypted/);

    const unsupported = makeStoredZip([
      { name: rootName + "/", method: 99, localMethod: 99 },
    ]);
    expect(() =>
      validateOpenScadWindowsZip(unsupported.bytes, policyFor(unsupported))
    ).toThrow(/compression method 99/);

    const zip64 = makeStoredZip([
      {
        name: rootName + "/openscad.com",
        data: "x",
        compressedSize: 0xffffffff,
        expandedSize: 0xffffffff,
      },
    ]);
    expect(() =>
      validateOpenScadWindowsZip(zip64.bytes, {
        ...policyFor(zip64),
        expandedSize: 0,
      })
    ).toThrow(/ZIP64/);

    const locatorBase = makeStoredZip([{ name: rootName + "/" }]);
    const oldEnd = locatorBase.bytes.length - 22;
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    const zip64Locator = Buffer.concat([
      locatorBase.bytes.subarray(0, oldEnd),
      locator,
      locatorBase.bytes.subarray(oldEnd),
    ]);
    expect(() =>
      validateOpenScadWindowsZip(zip64Locator, policyFor(locatorBase))
    ).toThrow(/ZIP64/);

    const multiDisk = makeStoredZip(
      [{ name: rootName + "/" }],
      { disk: 1, centralDisk: 1 },
    );
    expect(() =>
      validateOpenScadWindowsZip(multiDisk.bytes, policyFor(multiDisk))
    ).toThrow(/multi-disk/);
  });

  it("rejects local-central mismatches, bad CRCs, and overlapping local records", () => {
    const mismatch = makeStoredZip([
      {
        name: rootName + "/openscad.com",
        localName: rootName + "/openscad.exe",
        data: "x",
      },
    ]);
    expect(() =>
      validateOpenScadWindowsZip(mismatch.bytes, policyFor(mismatch))
    ).toThrow(/different local and central headers/);

    const badCrc = makeStoredZip([
      { name: rootName + "/" },
      { name: rootName + "/openscad.com", data: "x", crc: 7 },
    ]);
    expect(() =>
      validateOpenScadWindowsZip(badCrc.bytes, policyFor(badCrc))
    ).toThrow(/CRC validation/);

    const overlap = makeStoredZip([
      { name: rootName + "/", data: "" },
      { name: rootName + "/openscad.com", data: "x" },
    ]);
    const centralOffset = overlap.bytes.readUInt32LE(overlap.bytes.length - 6);
    const secondCentral = centralOffset + 46 +
      Buffer.byteLength(rootName + "/");
    overlap.bytes.writeUInt32LE(0, secondCentral + 42);
    expect(() =>
      validateOpenScadWindowsZip(overlap.bytes, policyFor(overlap))
    ).toThrow(/different local and central headers|overlap/);
  });

  it("rejects a deflate stream that expands past its declared bound", () => {
    const expected = Buffer.from("abc");
    const compressed = deflateSync(Buffer.from("abcd"));
    const oversized = makeStoredZip([
      { name: rootName + "/" },
      {
        name: rootName + "/openscad.com",
        data: compressed,
        method: 8,
        expandedSize: expected.length,
        crc: crc32(expected),
      },
    ]);
    expect(() =>
      validateOpenScadWindowsZip(oversized.bytes, policyFor(oversized))
    ).toThrow(/cannot be inflated/);
  });
  it("enforces the entry-count and expanded-size limits", () => {
    const zip = validSmallZip();
    expect(() =>
      validateOpenScadWindowsZip(zip.bytes, {
        ...policyFor(zip),
        entryCount: zip.entryCount - 1,
      })
    ).toThrow(/entry count/);
    expect(() =>
      validateOpenScadWindowsZip(zip.bytes, {
        ...policyFor(zip),
        entryCount: 222,
      })
    ).toThrow(/manifest entry-count/);
    expect(() =>
      validateOpenScadWindowsZip(zip.bytes, {
        ...policyFor(zip),
        expandedSize: 49_579_492,
      })
    ).toThrow(/manifest entry-count or expanded-size/);
    expect(() =>
      validateOpenScadWindowsZip(zip.bytes, {
        ...policyFor(zip),
        expandedSize: zip.expandedSize - 1,
      })
    ).toThrow(/expanded data exceeds/);
  });

  it("requires the exact root directory entry", () => {
    const rootless = makeStoredZip([
      { name: rootName + "/openscad.com", data: "x" },
    ]);
    expect(() =>
      validateOpenScadWindowsZip(rootless.bytes, policyFor(rootless))
    ).toThrow(/exact approved root directory entry is missing/);
  });
});
