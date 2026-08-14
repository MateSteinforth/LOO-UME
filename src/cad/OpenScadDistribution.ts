import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, isAbsolute, resolve } from "node:path";
import { report } from "node:process";

export const OPENSCAD_MANIFEST_PATH =
  "toolchains/openscad-distributions.json";
export const MANAGED_OPENSCAD_RECEIPT = "install.json";

/** The Linux directory is retained so existing callers can migrate safely. */
export const MANAGED_OPENSCAD_DIRECTORY = ".tools/openscad-2021.01";

export interface DownloadArtifact {
  fileName: string;
  url: string;
  size: number;
  sha256: string;
}

export interface OpenScadCompanion extends DownloadArtifact {
  id: string;
  sourceUrl: string;
  packageInfoUrl: string;
  license: string;
}

export interface OpenScadOperatingSystem {
  id: "debian" | "ubuntu" | "macos";
  version: string;
  codename?: string;
}

export interface OpenScadSource {
  url: string;
  sha256?: string;
  revision: string | null;
  note?: string;
}

export interface OpenScadTarget {
  id: "linux-x64" | "darwin-arm64" | "darwin-x64";
  platform: "linux" | "darwin";
  architecture: "x64" | "arm64";
  operatingSystems: OpenScadOperatingSystem[];
  minimumGlibc?: string;
  version: "2021.01" | "2026.06.12";
  installDirectory: string;
  releaseUrl: string;
  source: OpenScadSource;
  license: { id: string; url: string };
  artifact: DownloadArtifact;
  companions: OpenScadCompanion[];
  requiredCommands: string[];
  extraction:
    | { kind: "legacy-appimage"; patchHeader: true }
    | { kind: "dmg"; bundlePath: string };
  executable: string;
  libraryDirectories: string[];
}

export interface OpenScadDistribution {
  schemaVersion: "2.0.0";
  name: "OpenSCAD";
  targets: OpenScadTarget[];
}

export interface ManagedOpenScadArtifactReceipt {
  fileName: string;
  sha256: string;
}

export interface ManagedOpenScadReceipt {
  schemaVersion: "2.0.0";
  target: OpenScadTarget["id"];
  version: OpenScadTarget["version"];
  detectedVersion: OpenScadTarget["version"];
  artifacts: ManagedOpenScadArtifactReceipt[];
  executable: string;
  libraryDirectories: string[];
}

export interface ManagedOpenScadCommand {
  command: string;
  environment: NodeJS.ProcessEnv;
  targetId: OpenScadTarget["id"];
  expectedVersion: OpenScadTarget["version"];
}

export interface HostDescription {
  platform: string;
  architecture: string;
  osRelease: string;
  glibcVersion: string | undefined;
  operatingSystemVersion?: string;
}

const EXPECTED_MANIFEST = Object.freeze({
  schemaVersion: "2.0.0",
  name: "OpenSCAD",
  targets: [
    {
      id: "linux-x64",
      platform: "linux",
      architecture: "x64",
      operatingSystems: [
        { id: "debian", version: "13", codename: "trixie" },
        { id: "ubuntu", version: "24.04", codename: "noble" },
      ],
      minimumGlibc: "2.38",
      version: "2021.01",
      installDirectory: ".tools/openscad-2021.01",
      releaseUrl:
        "https://github.com/openscad/openscad/releases/tag/openscad-2021.01",
      source: {
        url: "https://files.openscad.org/openscad-2021.01.src.tar.gz",
        sha256:
          "d938c297e7e5f65dbab1461cac472fc60dfeaa4999ea2c19b31a4184f2d70359",
        revision: "openscad-2021.01",
      },
      license: {
        id: "GPL-2.0-or-later WITH LicenseRef-OpenSCAD-CGAL-exception",
        url:
          "https://raw.githubusercontent.com/openscad/openscad/openscad-2021.01/COPYING",
      },
      artifact: {
        fileName: "OpenSCAD-2021.01-x86_64.AppImage",
        url: "https://files.openscad.org/OpenSCAD-2021.01-x86_64.AppImage",
        size: 40_759_336,
        sha256:
          "f758528f2cd213f773c7a105fb63bf3b45bf754b0f586fbb7c9cd653ffcd0882",
      },
      companions: [
        {
          id: "libgpg-error0",
          fileName: "libgpg-error0_1.51-4_amd64.deb",
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
      requiredCommands: ["dpkg-deb"],
      extraction: { kind: "legacy-appimage", patchHeader: true },
      executable: "squashfs-root/usr/bin/openscad",
      libraryDirectories: [
        "squashfs-root/usr/lib",
        "local-deps/usr/lib/x86_64-linux-gnu",
      ],
    },
    {
      id: "darwin-arm64",
      platform: "darwin",
      architecture: "arm64",
      operatingSystems: [{ id: "macos", version: "15" }],
      version: "2026.06.12",
      installDirectory: ".tools/openscad-2026.06.12-darwin-arm64",
      releaseUrl: "https://openscad.org/downloads.html",
      source: {
        url: "https://github.com/openscad/openscad",
        revision: null,
        note:
          "The published snapshot does not identify a verified exact source revision.",
      },
      license: {
        id: "GPL-2.0-or-later WITH LicenseRef-OpenSCAD-CGAL-exception",
        url: "https://github.com/openscad/openscad/blob/master/COPYING",
      },
      artifact: {
        fileName: "OpenSCAD-2026.06.12.dmg",
        url:
          "https://files.openscad.org/snapshots/OpenSCAD-2026.06.12.dmg",
        size: 64_447_344,
        sha256:
          "555be2ed313e67657b3d8ba3e1de0acd6141b982fd458776c52d3eda748f57c4",
      },
      companions: [],
      requiredCommands: ["hdiutil"],
      extraction: { kind: "dmg", bundlePath: "OpenSCAD.app" },
      executable: "OpenSCAD.app/Contents/MacOS/OpenSCAD",
      libraryDirectories: [],
    },
    {
      id: "darwin-x64",
      platform: "darwin",
      architecture: "x64",
      operatingSystems: [{ id: "macos", version: "15" }],
      version: "2026.06.12",
      installDirectory: ".tools/openscad-2026.06.12-darwin-x64",
      releaseUrl: "https://openscad.org/downloads.html",
      source: {
        url: "https://github.com/openscad/openscad",
        revision: null,
        note:
          "The published snapshot does not identify a verified exact source revision.",
      },
      license: {
        id: "GPL-2.0-or-later WITH LicenseRef-OpenSCAD-CGAL-exception",
        url: "https://github.com/openscad/openscad/blob/master/COPYING",
      },
      artifact: {
        fileName: "OpenSCAD-2026.06.12.dmg",
        url:
          "https://files.openscad.org/snapshots/OpenSCAD-2026.06.12.dmg",
        size: 64_447_344,
        sha256:
          "555be2ed313e67657b3d8ba3e1de0acd6141b982fd458776c52d3eda748f57c4",
      },
      companions: [],
      requiredCommands: ["hdiutil"],
      extraction: { kind: "dmg", bundlePath: "OpenSCAD.app" },
      executable: "OpenSCAD.app/Contents/MacOS/OpenSCAD",
      libraryDirectories: [],
    },
  ],
});

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactStructure(
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      throw new Error(`${label} must contain ${expected.length} entries.`);
    }
    expected.forEach((entry, index) =>
      exactStructure(actual[index], entry, `${label}[${index}]`)
    );
    return;
  }
  if (expected && typeof expected === "object") {
    const actualObject = object(actual, label);
    const expectedObject = expected as Record<string, unknown>;
    const actualKeys = Object.keys(actualObject).sort();
    const expectedKeys = Object.keys(expectedObject).sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      throw new Error(`${label} fields do not match the pinned policy.`);
    }
    for (const key of expectedKeys) {
      exactStructure(
        actualObject[key],
        expectedObject[key],
        `${label}.${key}`,
      );
    }
    return;
  }
  if (actual !== expected) {
    throw new Error(
      `${label} must be ${JSON.stringify(expected)}.`,
    );
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

function secureHttpsUrl(value: string, label: string): void {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${label} must be a pinned HTTPS URL.`);
  }
}

function validateTargetPathsAndUrls(
  target: OpenScadTarget,
  index: number,
): void {
  const label = `targets[${index}]`;
  const installDirectory = safeRelativePath(
    target.installDirectory,
    `${label}.installDirectory`,
  );
  if (!installDirectory.startsWith(".tools/")) {
    throw new Error(`${label}.installDirectory must be under .tools.`);
  }
  safeRelativePath(target.executable, `${label}.executable`);
  target.libraryDirectories.forEach((entry, libraryIndex) =>
    safeRelativePath(
      entry,
      `${label}.libraryDirectories[${libraryIndex}]`,
    )
  );
  secureHttpsUrl(target.releaseUrl, `${label}.releaseUrl`);
  secureHttpsUrl(target.source.url, `${label}.source.url`);
  secureHttpsUrl(target.license.url, `${label}.license.url`);
  for (const [artifactIndex, artifact] of [
    target.artifact,
    ...target.companions,
  ].entries()) {
    if (
      !artifact.fileName ||
      artifact.fileName.includes("/") ||
      artifact.fileName.includes("\\")
    ) {
      throw new Error(
        `${label}.artifacts[${artifactIndex}].fileName must be one file name.`,
      );
    }
    secureHttpsUrl(
      artifact.url,
      `${label}.artifacts[${artifactIndex}].url`,
    );
  }
  for (const [companionIndex, companion] of target.companions.entries()) {
    secureHttpsUrl(
      companion.sourceUrl,
      `${label}.companions[${companionIndex}].sourceUrl`,
    );
    secureHttpsUrl(
      companion.packageInfoUrl,
      `${label}.companions[${companionIndex}].packageInfoUrl`,
    );
  }
  if (target.extraction.kind === "dmg") {
    safeRelativePath(
      target.extraction.bundlePath,
      `${label}.extraction.bundlePath`,
    );
  }
}

export function parseOpenScadDistribution(
  value: unknown,
): OpenScadDistribution {
  exactStructure(value, EXPECTED_MANIFEST, "OpenSCAD manifest");
  const manifest = value as OpenScadDistribution;
  manifest.targets.forEach(validateTargetPathsAndUrls);
  return manifest;
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

function readMacOsVersion(): string | undefined {
  try {
    const source = readFileSync(
      "/System/Library/CoreServices/SystemVersion.plist",
      "utf8",
    );
    return source.match(
      /<key>ProductVersion<\/key>\s*<string>([^<]+)<\/string>/,
    )?.[1];
  } catch {
    return undefined;
  }
}

export function detectOpenScadHost(): HostDescription {
  const diagnostic = report?.getReport?.() as
    | { header?: { glibcVersionRuntime?: string } }
    | undefined;
  let osRelease = "";
  try {
    osRelease = readFileSync("/etc/os-release", "utf8");
  } catch {
    // Host selection below produces one complete operator-facing error.
  }
  return {
    platform: process.platform,
    architecture: process.arch,
    osRelease,
    glibcVersion: diagnostic?.header?.glibcVersionRuntime,
    operatingSystemVersion:
      process.platform === "darwin" ? readMacOsVersion() : undefined,
  };
}

function targetSupportsHost(
  target: OpenScadTarget,
  host: HostDescription,
): boolean {
  if (
    host.platform !== target.platform ||
    host.architecture !== target.architecture
  ) {
    return false;
  }
  if (target.platform === "darwin") {
    const major = host.operatingSystemVersion?.split(".")[0];
    return target.operatingSystems.some(
      (system) => system.id === "macos" && system.version === major,
    );
  }
  const release = parseOsRelease(host.osRelease);
  return (
    target.operatingSystems.some(
      (system) =>
        release.ID === system.id &&
        release.VERSION_ID === system.version &&
        release.VERSION_CODENAME === system.codename,
    ) &&
    host.glibcVersion !== undefined &&
    target.minimumGlibc !== undefined &&
    versionAtLeast(host.glibcVersion, target.minimumGlibc)
  );
}

export function selectOpenScadTarget(
  manifest: OpenScadDistribution,
  host: HostDescription,
): OpenScadTarget | undefined {
  return manifest.targets.find((target) => targetSupportsHost(target, host));
}

export function isSupportedOpenScadHost(
  manifest: OpenScadDistribution,
  host: HostDescription,
): boolean {
  return selectOpenScadTarget(manifest, host) !== undefined;
}

export function assertSupportedOpenScadHost(
  manifest: OpenScadDistribution,
  host: HostDescription,
): OpenScadTarget {
  const target = selectOpenScadTarget(manifest, host);
  if (target) return target;
  const release = parseOsRelease(host.osRelease);
  const detectedSystem =
    host.platform === "darwin"
      ? `macOS ${host.operatingSystemVersion ?? "unknown"}`
      : release.PRETTY_NAME ?? "unknown operating system";
  throw new Error(
    "OpenSCAD automatic installation supports only Debian 13 (trixie) or " +
      "Ubuntu 24.04 (noble) x86-64 with glibc 2.38 or newer, or macOS 15 " +
      "on arm64 or x64. " +
      `Detected ${host.platform}/${host.architecture}, ${detectedSystem}, ` +
      `glibc ${host.glibcVersion ?? "not applicable"}.`,
  );
}

export function managedOpenScadDirectory(
  rootDirectory: string,
  target: OpenScadTarget,
): string {
  return resolve(
    rootDirectory,
    safeRelativePath(target.installDirectory, "target.installDirectory"),
  );
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function targetArtifacts(
  target: OpenScadTarget,
): ManagedOpenScadArtifactReceipt[] {
  return [target.artifact, ...target.companions].map(
    ({ fileName, sha256 }) => ({ fileName, sha256 }),
  );
}

function parseReceipt(
  value: unknown,
  target: OpenScadTarget,
): ManagedOpenScadReceipt {
  const receipt = object(value, "managed OpenSCAD receipt");
  const expected = createManagedOpenScadReceipt(target);
  exactStructure(receipt, expected, "managed OpenSCAD receipt");
  receipt.executable = safeRelativePath(
    receipt.executable,
    "receipt.executable",
  );
  (receipt.libraryDirectories as unknown[]).forEach((entry, index) =>
    safeRelativePath(entry, `receipt.libraryDirectories[${index}]`)
  );
  return receipt as unknown as ManagedOpenScadReceipt;
}

export function createManagedOpenScadReceipt(
  target: OpenScadTarget,
): ManagedOpenScadReceipt {
  return {
    schemaVersion: "2.0.0",
    target: target.id,
    version: target.version,
    detectedVersion: target.version,
    artifacts: targetArtifacts(target),
    executable: target.executable,
    libraryDirectories: [...target.libraryDirectories],
  };
}

export function resolveManagedOpenScadCommand(
  rootDirectory: string,
  manifest?: OpenScadDistribution,
  environment: NodeJS.ProcessEnv = process.env,
  host = detectOpenScadHost(),
): ManagedOpenScadCommand | undefined {
  try {
    const distribution =
      manifest ?? loadOpenScadDistribution(rootDirectory);
    const target = selectOpenScadTarget(distribution, host);
    if (!target) return undefined;
    const installation = managedOpenScadDirectory(rootDirectory, target);
    const receipt = parseReceipt(
      JSON.parse(
        readFileSync(
          resolve(installation, MANAGED_OPENSCAD_RECEIPT),
          "utf8",
        ),
      ),
      target,
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
      )
    );
    if (libraries.some((path) => !existsSync(path))) return undefined;
    const managedEnvironment = { ...environment };
    if (libraries.length > 0) {
      managedEnvironment.LD_LIBRARY_PATH = [
        ...libraries,
        environment.LD_LIBRARY_PATH,
      ]
        .filter(Boolean)
        .join(delimiter);
    }
    return {
      command,
      environment: managedEnvironment,
      targetId: target.id,
      expectedVersion: target.version,
    };
  } catch {
    return undefined;
  }
}
