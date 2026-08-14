import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, isAbsolute, resolve } from "node:path";
import { report } from "node:process";

export const OPENSCAD_MANIFEST_PATH = "toolchains/openscad-2021.01.json";
export const MANAGED_OPENSCAD_DIRECTORY = ".tools/openscad-2021.01";
export const MANAGED_OPENSCAD_RECEIPT = "install.json";

const EXPECTED = Object.freeze({
  version: "2021.01",
  releaseUrl:
    "https://github.com/openscad/openscad/releases/tag/openscad-2021.01",
  sourceUrl:
    "https://files.openscad.org/openscad-2021.01.src.tar.gz",
  sourceSha256:
    "d938c297e7e5f65dbab1461cac472fc60dfeaa4999ea2c19b31a4184f2d70359",
  licenseId:
    "GPL-2.0-or-later WITH LicenseRef-OpenSCAD-CGAL-exception",
  licenseUrl:
    "https://raw.githubusercontent.com/openscad/openscad/openscad-2021.01/COPYING",
  targetId: "linux-x64",
  artifactUrl:
    "https://files.openscad.org/OpenSCAD-2021.01-x86_64.AppImage",
  artifactSize: 40_759_336,
  artifactSha256:
    "f758528f2cd213f773c7a105fb63bf3b45bf754b0f586fbb7c9cd653ffcd0882",
  companionUrl:
    "https://deb.debian.org/debian/pool/main/libg/libgpg-error/libgpg-error0_1.51-4_amd64.deb",
  companionSize: 82_108,
  companionSha256:
    "22b95570fd41c113ef6f5651563b4d748292844baab1278a46eb940c1dec2322",
  companionSourceUrl: "https://gnupg.org/ftp/gcrypt/libgpg-error/",
  companionPackageInfoUrl:
    "https://packages.debian.org/trixie/amd64/libgpg-error0/download",
});

export interface DownloadArtifact {
  fileName: string;
  url: string;
  size: number;
  sha256: string;
}

export interface OpenScadCompanion extends DownloadArtifact {
  id: "libgpg-error0";
  sourceUrl: string;
  packageInfoUrl: string;
  license: "LGPL-2.1-or-later";
}

export interface OpenScadDistribution {
  schemaVersion: "1.0.0";
  name: "OpenSCAD";
  version: "2021.01";
  releaseUrl: string;
  source: { url: string; sha256: string };
  license: { id: string; url: string };
  target: {
    id: "linux-x64";
    platform: "linux";
    architecture: "x64";
    operatingSystems: [
      { id: "debian"; version: "13"; codename: "trixie" },
      { id: "ubuntu"; version: "24.04"; codename: "noble" },
    ];
    minimumGlibc: "2.38";
    requiredCommand: "dpkg-deb";
    artifact: DownloadArtifact;
    companions: [OpenScadCompanion];
    executable: "squashfs-root/usr/bin/openscad";
    libraryDirectories: [
      "squashfs-root/usr/lib",
      "local-deps/usr/lib/x86_64-linux-gnu",
    ];
  };
}

export interface ManagedOpenScadReceipt {
  schemaVersion: "1.0.0";
  target: "linux-x64";
  version: "2021.01";
  detectedVersion: "2021.01";
  artifactSha256: string;
  companionSha256: string;
  executable: string;
  libraryDirectories: string[];
}

export interface ManagedOpenScadCommand {
  command: string;
  environment: NodeJS.ProcessEnv;
}

export interface HostDescription {
  platform: string;
  architecture: string;
  osRelease: string;
  glibcVersion: string | undefined;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}.`);
  }
}

function safeRelativePath(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    isAbsolute(value) ||
    value.includes("\\") ||
    value.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new Error(`${label} must be a safe relative path.`);
  }
  return value;
}

function exactHttpsUrl(value: unknown, expected: string, label: string): void {
  exact(value, expected, label);
  const parsed = new URL(String(value));
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${label} must be the pinned HTTPS URL.`);
  }
}

function validateDownload(
  value: unknown,
  expected: { url: string; size: number; sha256: string },
  label: string,
): DownloadArtifact & Record<string, unknown> {
  const entry = object(value, label);
  if (
    typeof entry.fileName !== "string" ||
    entry.fileName.length === 0 ||
    entry.fileName.includes("/") ||
    entry.fileName.includes("\\")
  ) {
    throw new Error(`${label}.fileName must be one file name.`);
  }
  exactHttpsUrl(entry.url, expected.url, `${label}.url`);
  exact(entry.size, expected.size, `${label}.size`);
  exact(entry.sha256, expected.sha256, `${label}.sha256`);
  return entry as DownloadArtifact & Record<string, unknown>;
}

export function parseOpenScadDistribution(
  value: unknown,
): OpenScadDistribution {
  const manifest = object(value, "OpenSCAD manifest");
  exact(manifest.schemaVersion, "1.0.0", "schemaVersion");
  exact(manifest.name, "OpenSCAD", "name");
  exact(manifest.version, EXPECTED.version, "version");
  exactHttpsUrl(manifest.releaseUrl, EXPECTED.releaseUrl, "releaseUrl");

  const source = object(manifest.source, "source");
  exactHttpsUrl(source.url, EXPECTED.sourceUrl, "source.url");
  exact(source.sha256, EXPECTED.sourceSha256, "source.sha256");

  const license = object(manifest.license, "license");
  exact(license.id, EXPECTED.licenseId, "license.id");
  exactHttpsUrl(license.url, EXPECTED.licenseUrl, "license.url");

  const target = object(manifest.target, "target");
  exact(target.id, EXPECTED.targetId, "target.id");
  exact(target.platform, "linux", "target.platform");
  exact(target.architecture, "x64", "target.architecture");
  if (
    !Array.isArray(target.operatingSystems) ||
    target.operatingSystems.length !== 2
  ) {
    throw new Error(
      "target.operatingSystems must contain Debian 13 and Ubuntu 24.04.",
    );
  }
  const expectedSystems = [
    { id: "debian", version: "13", codename: "trixie" },
    { id: "ubuntu", version: "24.04", codename: "noble" },
  ];
  target.operatingSystems.forEach((value, index) => {
    const operatingSystem = object(
      value,
      `target.operatingSystems[${index}]`,
    );
    exact(
      operatingSystem.id,
      expectedSystems[index]!.id,
      "operating system id",
    );
    exact(operatingSystem.version, expectedSystems[index]!.version, "operating system version");
    exact(operatingSystem.codename, expectedSystems[index]!.codename, "operating system codename");
  });
  exact(target.minimumGlibc, "2.38", "target.minimumGlibc");
  exact(target.requiredCommand, "dpkg-deb", "target.requiredCommand");
  validateDownload(
    target.artifact,
    {
      url: EXPECTED.artifactUrl,
      size: EXPECTED.artifactSize,
      sha256: EXPECTED.artifactSha256,
    },
    "target.artifact",
  );

  if (!Array.isArray(target.companions) || target.companions.length !== 1) {
    throw new Error(
      "target.companions must contain the pinned libgpg-error0 package.",
    );
  }
  const companion = validateDownload(
    target.companions[0],
    {
      url: EXPECTED.companionUrl,
      size: EXPECTED.companionSize,
      sha256: EXPECTED.companionSha256,
    },
    "target.companions[0]",
  );
  exact(companion.id, "libgpg-error0", "target.companions[0].id");
  exactHttpsUrl(
    companion.sourceUrl,
    EXPECTED.companionSourceUrl,
    "target.companions[0].sourceUrl",
  );
  exactHttpsUrl(
    companion.packageInfoUrl,
    EXPECTED.companionPackageInfoUrl,
    "target.companions[0].packageInfoUrl",
  );
  exact(
    companion.license,
    "LGPL-2.1-or-later",
    "target.companions[0].license",
  );

  exact(
    safeRelativePath(target.executable, "target.executable"),
    "squashfs-root/usr/bin/openscad",
    "target.executable",
  );
  if (
    !Array.isArray(target.libraryDirectories) ||
    target.libraryDirectories.length !== 2
  ) {
    throw new Error(
      "target.libraryDirectories must contain the two pinned runtime paths.",
    );
  }
  const expectedLibraries = [
    "squashfs-root/usr/lib",
    "local-deps/usr/lib/x86_64-linux-gnu",
  ];
  target.libraryDirectories.forEach((entry, index) => {
    exact(
      safeRelativePath(entry, `target.libraryDirectories[${index}]`),
      expectedLibraries[index],
      `target.libraryDirectories[${index}]`,
    );
  });

  return manifest as unknown as OpenScadDistribution;
}

export function loadOpenScadDistribution(
  rootDirectory: string,
): OpenScadDistribution {
  const path = resolve(rootDirectory, OPENSCAD_MANIFEST_PATH);
  return parseOpenScadDistribution(JSON.parse(readFileSync(path, "utf8")));
}

export function parseOsRelease(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (!match) continue;
    const raw = match[2]!;
    result[match[1]!] =
      raw.startsWith('"') && raw.endsWith('"')
        ? raw.slice(1, -1).replace(/\\([\\"$\`])/g, "$1")
        : raw;
  }
  return result;
}

function versionAtLeast(actual: string, minimum: string): boolean {
  const parse = (value: string): number[] | undefined => {
    if (!/^\d+(?:\.\d+)*$/.test(value)) return undefined;
    return value.split(".").map(Number);
  };
  const left = parse(actual);
  const right = parse(minimum);
  if (!left || !right) return false;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

export function detectOpenScadHost(): HostDescription {
  const diagnostic = report?.getReport?.() as
    | { header?: { glibcVersionRuntime?: string } }
    | undefined;
  const header = diagnostic?.header;
  let osRelease = "";
  try {
    osRelease = readFileSync("/etc/os-release", "utf8");
  } catch {
    // The support check below produces one complete operator-facing error.
  }
  return {
    platform: process.platform,
    architecture: process.arch,
    osRelease,
    glibcVersion: header?.glibcVersionRuntime,
  };
}

export function isSupportedOpenScadHost(
  manifest: OpenScadDistribution,
  host: HostDescription,
): boolean {
  const release = parseOsRelease(host.osRelease);
  const target = manifest.target;
  return (
    host.platform === target.platform &&
    host.architecture === target.architecture &&
    target.operatingSystems.some(
      (system) =>
        release.ID === system.id &&
        release.VERSION_ID === system.version &&
        release.VERSION_CODENAME === system.codename,
    ) &&
    host.glibcVersion !== undefined &&
    versionAtLeast(host.glibcVersion, target.minimumGlibc)
  );
}

export function assertSupportedOpenScadHost(
  manifest: OpenScadDistribution,
  host: HostDescription,
): void {
  if (isSupportedOpenScadHost(manifest, host)) return;
  const release = parseOsRelease(host.osRelease);
  throw new Error(
    `OpenSCAD automatic installation supports only Debian 13 (trixie) or Ubuntu 24.04 (noble) x86-64 with glibc ${manifest.target.minimumGlibc} or newer. ` +
      `Detected ${host.platform}/${host.architecture}, ${release.PRETTY_NAME ?? "unknown Linux"}, glibc ${host.glibcVersion ?? "unknown"}.`,
  );
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseReceipt(
  value: unknown,
  manifest: OpenScadDistribution,
): ManagedOpenScadReceipt {
  const receipt = object(value, "managed OpenSCAD receipt");
  exact(receipt.schemaVersion, "1.0.0", "receipt.schemaVersion");
  exact(receipt.target, manifest.target.id, "receipt.target");
  exact(receipt.version, manifest.version, "receipt.version");
  exact(receipt.detectedVersion, manifest.version, "receipt.detectedVersion");
  exact(
    receipt.artifactSha256,
    manifest.target.artifact.sha256,
    "receipt.artifactSha256",
  );
  exact(
    receipt.companionSha256,
    manifest.target.companions[0].sha256,
    "receipt.companionSha256",
  );
  exact(
    receipt.executable,
    manifest.target.executable,
    "receipt.executable",
  );
  if (
    !Array.isArray(receipt.libraryDirectories) ||
    receipt.libraryDirectories.length !==
      manifest.target.libraryDirectories.length ||
    receipt.libraryDirectories.some(
      (entry, index) => entry !== manifest.target.libraryDirectories[index],
    )
  ) {
    throw new Error("receipt.libraryDirectories does not match the manifest.");
  }
  return receipt as unknown as ManagedOpenScadReceipt;
}

export function createManagedOpenScadReceipt(
  manifest: OpenScadDistribution,
): ManagedOpenScadReceipt {
  return {
    schemaVersion: "1.0.0",
    target: manifest.target.id,
    version: manifest.version,
    detectedVersion: manifest.version,
    artifactSha256: manifest.target.artifact.sha256,
    companionSha256: manifest.target.companions[0].sha256,
    executable: manifest.target.executable,
    libraryDirectories: [...manifest.target.libraryDirectories],
  };
}

export function resolveManagedOpenScadCommand(
  rootDirectory: string,
  manifest?: OpenScadDistribution,
  environment: NodeJS.ProcessEnv = process.env,
  host = detectOpenScadHost(),
): ManagedOpenScadCommand | undefined {
  try {
    const selected = manifest ?? loadOpenScadDistribution(rootDirectory);
    if (!isSupportedOpenScadHost(selected, host)) return undefined;
    const installation = resolve(rootDirectory, MANAGED_OPENSCAD_DIRECTORY);
    const receipt = parseReceipt(
      JSON.parse(
        readFileSync(
          resolve(installation, MANAGED_OPENSCAD_RECEIPT),
          "utf8",
        ),
      ),
      selected,
    );
    const command = resolve(
      installation,
      safeRelativePath(receipt.executable, "receipt.executable"),
    );
    if (!existsSync(command)) return undefined;
    const libraries = receipt.libraryDirectories.map((path) =>
      resolve(
        installation,
        safeRelativePath(path, "receipt.libraryDirectories entry"),
      ),
    );
    if (libraries.some((path) => !existsSync(path))) return undefined;
    return {
      command,
      environment: {
        ...environment,
        LD_LIBRARY_PATH: [...libraries, environment.LD_LIBRARY_PATH]
          .filter(Boolean)
          .join(delimiter),
      },
    };
  } catch {
    return undefined;
  }
}
