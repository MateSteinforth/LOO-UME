import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  readlink,
  rename,
  rmdir,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  relative,
  resolve,
} from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { inflateSync } from "fflate";
import {
  assertSupportedOpenScadHost,
  createManagedOpenScadReceipt,
  detectOpenScadHost,
  loadOpenScadDistribution,
  MANAGED_OPENSCAD_RECEIPT,
  managedOpenScadDirectory,
  type DownloadArtifact,
  type HostDescription,
  type OpenScadDistribution,
  type OpenScadTarget,
  resolveManagedOpenScadCommand,
  sha256Bytes,
} from "../src/cad/OpenScadDistribution.ts";

const MAX_REDIRECTS = 5;
const DOWNLOAD_TIMEOUT_MS = 60_000;

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; environment: NodeJS.ProcessEnv },
) => Promise<CommandResult>;

export type ArtifactDownloader = (
  artifact: DownloadArtifact,
  destination: string,
  fetchImplementation?: typeof globalThis.fetch,
) => Promise<void>;

export type RenamePath = (source: string, destination: string) => Promise<void>;
export type AccessPath = (path: string, mode?: number) => Promise<void>;

export interface InstallOpenScadOptions {
  rootDirectory?: string;
  manifest?: OpenScadDistribution;
  host?: HostDescription;
  fetch?: typeof globalThis.fetch;
  runCommand?: CommandRunner;
  downloadArtifact?: ArtifactDownloader;
  uniqueId?: () => string;
  renamePath?: RenamePath;
  accessPath?: AccessPath;
}

export interface InstallOpenScadResult {
  installationDirectory: string;
  command: string;
  reused: boolean;
}

async function defaultRunCommand(
  command: string,
  args: string[],
  options: { cwd: string; environment: NodeJS.ProcessEnv },
): Promise<CommandResult> {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  return await new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

async function requireCommand(
  runner: CommandRunner,
  command: string,
  rootDirectory: string,
): Promise<void> {
  let result: CommandResult;
  try {
    result = await runner(command, ["--version"], {
      cwd: rootDirectory,
      environment: process.env,
    });
  } catch (error) {
    throw new Error(
      `${command} is required to install the managed OpenSCAD build: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (result.code !== 0) {
    throw new Error(
      `${command} is required to install the managed OpenSCAD build.`,
    );
  }
}

function validateRedirect(current: URL, location: string): URL {
  const next = new URL(location, current);
  if (
    next.protocol !== "https:" ||
    next.username ||
    next.password ||
    next.port ||
    next.origin !== current.origin
  ) {
    throw new Error(`Unsafe download redirect to ${next.href}.`);
  }
  return next;
}

async function fetchWithRedirects(
  initialUrl: string,
  fetchImplementation: typeof globalThis.fetch,
  signal: AbortSignal,
): Promise<Response> {
  let url = new URL(initialUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetchImplementation(url, {
      redirect: "manual",
      signal,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error(
          `Download redirect from ${url.href} has no location.`,
        );
      }
      if (redirects === MAX_REDIRECTS) {
        throw new Error("The download has too many redirects.");
      }
      url = validateRedirect(url, location);
      continue;
    }
    if (!response.ok) {
      throw new Error(
        `Download failed with HTTP ${response.status} for ${url.href}.`,
      );
    }
    return response;
  }
  throw new Error("The download has too many redirects.");
}

export async function downloadVerifiedArtifact(
  artifact: DownloadArtifact,
  destination: string,
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetchWithRedirects(
      artifact.url,
      fetchImplementation,
      controller.signal,
    );
    const declaredLength = response.headers.get("content-length");
    if (
      declaredLength !== null &&
      Number(declaredLength) !== artifact.size
    ) {
      throw new Error(
        `${artifact.fileName} has HTTP size ${declaredLength}; expected ${artifact.size}.`,
      );
    }
    if (!response.body) {
      throw new Error(`${artifact.fileName} has no response body.`);
    }

    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > artifact.size) {
        await reader.cancel();
        throw new Error(
          `${artifact.fileName} exceeds its pinned size ${artifact.size}.`,
        );
      }
      chunks.push(value);
    }
    if (size !== artifact.size) {
      throw new Error(
        `${artifact.fileName} has size ${size}; expected ${artifact.size}.`,
      );
    }

    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const digest = sha256Bytes(bytes);
    if (digest !== artifact.sha256) {
      throw new Error(
        `${artifact.fileName} failed SHA-256 verification: ${digest} != ${artifact.sha256}.`,
      );
    }
    await writeFile(destination, bytes, { flag: "wx" });
  } finally {
    clearTimeout(timer);
  }
}

async function patchLegacyAppImageHeader(path: string): Promise<void> {
  const handle = await open(path, "r+");
  try {
    const signature = Buffer.alloc(2);
    const { bytesRead } = await handle.read(signature, 0, 2, 8);
    if (
      bytesRead !== 2 ||
      signature[0] !== 0x41 ||
      signature[1] !== 0x49
    ) {
      throw new Error(
        "The verified AppImage does not contain the expected legacy AI header.",
      );
    }
    await handle.write(Buffer.from([0]), 0, 1, 8);
  } finally {
    await handle.close();
  }
}

function commandError(command: string, result: CommandResult): Error {
  return new Error(
    (
      `${command} failed with exit code ${result.code ?? "unknown"}.\n` +
      (result.stderr || result.stdout)
    ).trim(),
  );
}

function regexEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function probeInstalledCommand(
  runner: CommandRunner,
  command: string,
  cwd: string,
  environment: NodeJS.ProcessEnv,
  expectedVersion: string,
): Promise<boolean> {
  try {
    const result = await runner(command, ["--version"], {
      cwd,
      environment,
    });
    return (
      result.code === 0 &&
      new RegExp(
        `OpenSCAD(?:\\s+version)?\\s+${regexEscape(expectedVersion)}\\b`,
        "i",
      ).test(
        `${result.stdout}\n${result.stderr}`,
      )
    );
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const MACOS_HDIUTIL = "/usr/bin/hdiutil";
const MACOS_DITTO = "/usr/bin/ditto";
const MACOS_SYSCTL = "/usr/sbin/sysctl";
const MACOS_UNAME = "/usr/bin/uname";

async function requireMacOsNativeHost(
  runner: CommandRunner,
  rootDirectory: string,
  target: OpenScadTarget,
  accessPath: AccessPath,
): Promise<void> {
  const options = { cwd: rootDirectory, environment: process.env };
  let translated: CommandResult;
  try {
    translated = await runner(
      MACOS_SYSCTL,
      ["-in", "sysctl.proc_translated"],
      options,
    );
  } catch (error) {
    throw new Error(
      `${MACOS_SYSCTL} is required to check for Rosetta: ${errorMessage(error)}`,
    );
  }
  if (translated.code === 0 && translated.stdout.trim() === "1") {
    throw new Error(
      "OpenSCAD automatic installation does not run through Rosetta. Start a native terminal and try again.",
    );
  }

  const machine = await runner(MACOS_UNAME, ["-m"], options);
  const expectedMachine =
    target.architecture === "arm64" ? "arm64" : "x86_64";
  if (machine.code !== 0 || machine.stdout.trim() !== expectedMachine) {
    throw new Error(
      `OpenSCAD automatic installation requires a native ${expectedMachine} macOS process.`,
    );
  }

  for (const command of [MACOS_HDIUTIL, MACOS_DITTO]) {
    try {
      await accessPath(command, constants.X_OK);
    } catch (error) {
      throw new Error(
        `${command} is required to install the managed OpenSCAD build: ${errorMessage(error)}`,
      );
    }
  }
}

function isContainedPath(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

export async function validateMacOsAppTree(
  bundlePath: string,
): Promise<void> {
  const root = resolve(bundlePath);
  async function visit(path: string): Promise<void> {
    const entry = await lstat(path);
    if (entry.isSymbolicLink()) {
      const destination = await readlink(path);
      if (isAbsolute(destination)) {
        throw new Error(
          `OpenSCAD.app contains an absolute symbolic link: ${path}.`,
        );
      }
      const target = resolve(dirname(path), destination);
      if (!isContainedPath(root, target)) {
        throw new Error(
          `OpenSCAD.app contains an escaping symbolic link: ${path}.`,
        );
      }
      return;
    }
    if (entry.isFile()) return;
    if (!entry.isDirectory()) {
      throw new Error(
        `OpenSCAD.app contains a special file: ${path}.`,
      );
    }
    const children = await readdir(path);
    await Promise.all(
      children.map((child) => visit(resolve(path, child))),
    );
  }

  const rootEntry = await lstat(root);
  if (!rootEntry.isDirectory() || rootEntry.isSymbolicLink()) {
    throw new Error("The mounted OpenSCAD.app is not a directory.");
  }
  const children = await readdir(root);
  await Promise.all(
    children.map((child) => visit(resolve(root, child))),
  );
}

const CPU_TYPE_X86_64 = 0x01000007;
const CPU_TYPE_ARM64 = 0x0100000c;

export function machOArchitectures(bytes: Uint8Array): Set<number> {
  const data = Buffer.from(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  if (data.length < 8) {
    throw new Error("The OpenSCAD executable is not a Mach-O file.");
  }
  const signature = data.subarray(0, 4).toString("hex");
  if (signature === "cffaedfe" || signature === "cefaedfe") {
    return new Set([data.readUInt32LE(4)]);
  }
  if (signature === "feedfacf" || signature === "feedface") {
    return new Set([data.readUInt32BE(4)]);
  }

  const formats: Record<
    string,
    { littleEndian: boolean; entrySize: number }
  > = {
    cafebabe: { littleEndian: false, entrySize: 20 },
    bebafeca: { littleEndian: true, entrySize: 20 },
    cafebabf: { littleEndian: false, entrySize: 32 },
    bfbafeca: { littleEndian: true, entrySize: 32 },
  };
  const format = formats[signature];
  if (!format) {
    throw new Error("The OpenSCAD executable is not a Mach-O file.");
  }
  const read32 = format.littleEndian
    ? (offset: number) => data.readUInt32LE(offset)
    : (offset: number) => data.readUInt32BE(offset);
  const count = read32(4);
  if (
    count === 0 ||
    count > 64 ||
    8 + count * format.entrySize > data.length
  ) {
    throw new Error(
      "The OpenSCAD executable has an invalid universal Mach-O header.",
    );
  }
  const result = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    result.add(read32(8 + index * format.entrySize));
  }
  return result;
}

export async function validateNativeMachO(
  executable: string,
  architecture: string,
): Promise<void> {
  const expected =
    architecture === "arm64" ? CPU_TYPE_ARM64 : CPU_TYPE_X86_64;
  const architectures = machOArchitectures(
    await readFile(executable),
  );
  if (!architectures.has(expected)) {
    throw new Error(
      `The OpenSCAD executable has no native ${architecture} Mach-O slice.`,
    );
  }
}

interface InstalledPayload {
  executable: string;
  environment: NodeJS.ProcessEnv;
}

interface ValidatedZipEntry {
  name: string;
  relativePath: string;
  directory: boolean;
  compressedData: Uint8Array;
  compressionMethod: 0 | 8;
  expandedSize: number;
  crc32: number;
  localStart: number;
  localEnd: number;
}

const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const WINDOWS_ZIP_MAX_ENTRIES = 221;
const WINDOWS_ZIP_MAX_EXPANDED_SIZE = 49_579_491;
const ZIP_MAX_COMMENT = 0xffff;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_DIRECTORY_MODE = 0o040000;
const ZIP_REGULAR_MODE = 0o100000;
const ZIP_TYPE_MASK = 0o170000;

function zipError(message: string): Error {
  return new Error("Unsafe OpenSCAD ZIP archive: " + message);
}

function findZipEnd(data: Buffer): number {
  const minimum = Math.max(0, data.length - 22 - ZIP_MAX_COMMENT);
  for (let offset = data.length - 22; offset >= minimum; offset -= 1) {
    if (
      data.readUInt32LE(offset) === ZIP_END_SIGNATURE &&
      offset + 22 + data.readUInt16LE(offset + 20) === data.length
    ) {
      return offset;
    }
  }
  throw zipError("the end-of-central-directory record is missing.");
}

function checkedZipSlice(
  data: Buffer,
  start: number,
  length: number,
  label: string,
): Buffer {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(length) ||
    start < 0 ||
    length < 0 ||
    start + length > data.length
  ) {
    throw zipError(label + " is outside the archive.");
  }
  return data.subarray(start, start + length);
}

function decodeZipName(bytes: Buffer): string {
  let name: string;
  try {
    name = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw zipError("an entry name is not valid UTF-8.");
  }
  if (name.length === 0) throw zipError("an entry name is empty.");
  if (/[\u0000-\u001f\u007f]/u.test(name)) {
    throw zipError("entry " + JSON.stringify(name) + " has a control character.");
  }
  if (/[<>"|?*]/u.test(name)) {
    throw zipError(
      "entry " + JSON.stringify(name) + " uses an invalid Windows character.",
    );
  }
  if (name.includes("\\")) {
    throw zipError("entry " + JSON.stringify(name) + " uses a backslash.");
  }
  if (name.startsWith("/")) {
    throw zipError("entry " + JSON.stringify(name) + " is absolute or UNC.");
  }
  if (name.includes(":")) {
    throw zipError("entry " + JSON.stringify(name) + " uses a drive or ADS colon.");
  }
  return name;
}

function windowsPathKey(value: string): string {
  return value.normalize("NFC").toLocaleUpperCase("en-US");
}

function validateWindowsSegment(segment: string, name: string): void {
  if (segment === "" || segment === "." || segment === "..") {
    throw zipError(
      "entry " + JSON.stringify(name) + " has an empty or dot segment.",
    );
  }
  if (/[. ]$/u.test(segment)) {
    throw zipError(
      "entry " + JSON.stringify(name) + " has a trailing dot or space.",
    );
  }
  const device = segment.split(".", 1)[0]!.toLocaleUpperCase("en-US");
  if (
    /^(?:CON|PRN|AUX|NUL|COM[1-9\u00b9\u00b2\u00b3]|LPT[1-9\u00b9\u00b2\u00b3])$/u.test(
      device,
    )
  ) {
    throw zipError(
      "entry " + JSON.stringify(name) +
        " uses a reserved Windows device name.",
    );
  }
}

function validateZipExtra(extra: Buffer, label: string): void {
  let cursor = 0;
  while (cursor < extra.length) {
    if (cursor + 4 > extra.length) {
      throw zipError(label + " has a malformed extra field.");
    }
    const id = extra.readUInt16LE(cursor);
    const size = extra.readUInt16LE(cursor + 2);
    if (id === 0x0001) throw zipError(label + " uses ZIP64.");
    cursor += 4;
    if (cursor + size > extra.length) {
      throw zipError(label + " has a malformed extra field.");
    }
    cursor += size;
  }
}

function expandZipEntry(entry: ValidatedZipEntry): Uint8Array {
  if (entry.compressionMethod === 0) return entry.compressedData;
  const expanded = inflateSync(entry.compressedData, {
    out: new Uint8Array(entry.expandedSize + 1),
  });
  if (expanded.byteLength !== entry.expandedSize) {
    throw zipError(
      "entry " + JSON.stringify(entry.name) +
        " expands beyond or below its declared size.",
    );
  }
  return expanded;
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

export function validateOpenScadWindowsZip(
  bytes: Uint8Array,
  extraction: Extract<OpenScadTarget["extraction"], { kind: "zip" }>,
): ValidatedZipEntry[] {
  if (
    !Number.isSafeInteger(extraction.entryCount) ||
    extraction.entryCount < 1 ||
    extraction.entryCount > WINDOWS_ZIP_MAX_ENTRIES ||
    !Number.isSafeInteger(extraction.expandedSize) ||
    extraction.expandedSize < 0 ||
    extraction.expandedSize > WINDOWS_ZIP_MAX_EXPANDED_SIZE
  ) {
    throw zipError(
      "the manifest entry-count or expanded-size bound is invalid.",
    );
  }
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findZipEnd(data);
  if (
    (end >= 20 &&
      data.readUInt32LE(end - 20) === ZIP64_LOCATOR_SIGNATURE)
  ) {
    throw zipError("ZIP64 is not supported.");
  }
  const disk = data.readUInt16LE(end + 4);
  const centralDisk = data.readUInt16LE(end + 6);
  const diskEntries = data.readUInt16LE(end + 8);
  const entryCount = data.readUInt16LE(end + 10);
  const centralSize = data.readUInt32LE(end + 12);
  const centralOffset = data.readUInt32LE(end + 16);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount) {
    throw zipError("multi-disk archives are not supported.");
  }
  if (
    entryCount === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    throw zipError("ZIP64 is not supported.");
  }
  if (entryCount !== extraction.entryCount) {
    throw zipError(
      "entry count " + entryCount + " does not equal " +
        extraction.entryCount + ".",
    );
  }
  if (centralOffset + centralSize !== end) {
    throw zipError("the central-directory bounds are inconsistent.");
  }

  const root = extraction.rootDirectory;
  validateWindowsSegment(root, root);
  if (root.includes("/") || root.includes(":")) {
    throw zipError("the manifest root directory is invalid.");
  }
  const approvedKeys = new Set<string>();
  const approved = extraction.allowedEntryPrefixes.map((entry) => {
    if (
      entry.startsWith("/") ||
      entry.includes("\\") ||
      entry.includes(":")
    ) {
      throw zipError("the manifest allowlist is invalid.");
    }
    const directory = entry.endsWith("/");
    const parts = entry.split("/");
    if (directory) parts.pop();
    for (const part of parts) validateWindowsSegment(part!, entry);
    const key = windowsPathKey(entry.replace(/\/$/u, ""));
    if (approvedKeys.has(key)) {
      throw zipError("the manifest allowlist has a duplicate.");
    }
    approvedKeys.add(key);
    return { value: entry, directory };
  });

  const entries: ValidatedZipEntry[] = [];
  const pathTypes = new Map<string, boolean>();
  let expandedSize = 0;
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    const header = checkedZipSlice(data, cursor, 46, "a central header");
    if (header.readUInt32LE(0) !== ZIP_CENTRAL_SIGNATURE) {
      throw zipError("a central-directory header is invalid.");
    }
    const createdBy = header.readUInt16LE(4);
    const flags = header.readUInt16LE(8);
    const method = header.readUInt16LE(10);
    const modifiedTime = header.readUInt16LE(12);
    const modifiedDate = header.readUInt16LE(14);
    const expectedCrc = header.readUInt32LE(16);
    const compressedSize = header.readUInt32LE(20);
    const uncompressedSize = header.readUInt32LE(24);
    const nameLength = header.readUInt16LE(28);
    const extraLength = header.readUInt16LE(30);
    const commentLength = header.readUInt16LE(32);
    const entryDisk = header.readUInt16LE(34);
    const externalAttributes = header.readUInt32LE(38);
    const localOffset = header.readUInt32LE(42);
    if (entryDisk !== 0) throw zipError("an entry is on another disk.");
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      throw zipError("an entry uses ZIP64.");
    }
    if ((flags & 1) !== 0) throw zipError("an entry is encrypted.");
    if ((flags & ~ZIP_UTF8_FLAG) !== 0) {
      throw zipError("an entry uses unsupported general-purpose flags.");
    }
    if (method !== 0 && method !== 8) {
      throw zipError("compression method " + method + " is not supported.");
    }
    if (method === 0 && compressedSize !== uncompressedSize) {
      throw zipError("a stored entry has inconsistent sizes.");
    }

    const nameBytes = checkedZipSlice(
      data,
      cursor + 46,
      nameLength,
      "a central entry name",
    );
    const name = decodeZipName(nameBytes);
    const centralExtra = checkedZipSlice(
      data,
      cursor + 46 + nameLength,
      extraLength,
      "central entry " + JSON.stringify(name) + " extra data",
    );
    validateZipExtra(
      centralExtra,
      "central entry " + JSON.stringify(name),
    );
    cursor += 46 + nameLength + extraLength + commentLength;
    if (cursor > end) {
      throw zipError("a central entry exceeds its directory.");
    }

    const directory = name.endsWith("/");
    const parts = name.split("/");
    if (directory) parts.pop();
    for (const part of parts) validateWindowsSegment(part!, name);
    const rootEntry = name === root + "/";
    if (!rootEntry && !name.startsWith(root + "/")) {
      throw zipError(
        "entry " + JSON.stringify(name) + " is outside the approved root.",
      );
    }
    const relativeToRoot = rootEntry ? "" : name.slice(root.length + 1);
    if (!rootEntry) {
      const allowed = approved.some(
        ({ value, directory: prefixDirectory }) =>
          prefixDirectory
            ? relativeToRoot.startsWith(value)
            : relativeToRoot === value,
      );
      if (!allowed) {
        throw zipError(
          "entry " + JSON.stringify(name) + " is not allowlisted.",
        );
      }
    }

    const creatorSystem = createdBy >>> 8;
    if (creatorSystem !== 3) {
      throw zipError(
        "entry " + JSON.stringify(name) +
          " does not declare the required Unix creator system.",
      );
    }
    const unixType = (externalAttributes >>> 16) & ZIP_TYPE_MASK;
    const expectedType = directory ? ZIP_DIRECTORY_MODE : ZIP_REGULAR_MODE;
    if (unixType !== expectedType) {
      throw zipError(
        "entry " + JSON.stringify(name) +
          " has an unsafe or inconsistent Unix file type.",
      );
    }
    const dosDirectory = (externalAttributes & 0x10) !== 0;
    if (dosDirectory !== directory) {
      throw zipError(
        "entry " + JSON.stringify(name) +
          " has an inconsistent DOS directory type.",
      );
    }
    if (directory && (compressedSize !== 0 || uncompressedSize !== 0)) {
      throw zipError(
        "directory " + JSON.stringify(name) + " contains file data.",
      );
    }

    const key = windowsPathKey(name.replace(/\/$/u, ""));
    if (pathTypes.has(key)) {
      throw zipError(
        "entry " + JSON.stringify(name) +
          " is a case-insensitive duplicate.",
      );
    }
    const keyParts = key.split("/");
    for (let part = 1; part < keyParts.length; part += 1) {
      if (pathTypes.get(keyParts.slice(0, part).join("/")) === false) {
        throw zipError("entry " + JSON.stringify(name) + " is below a file.");
      }
    }
    if (!directory) {
      for (const existing of pathTypes.keys()) {
        if (existing.startsWith(key + "/")) {
          throw zipError(
            "file " + JSON.stringify(name) + " collides with a directory.",
          );
        }
      }
    }
    pathTypes.set(key, directory);

    const local = checkedZipSlice(data, localOffset, 30, "a local header");
    if (local.readUInt32LE(0) !== ZIP_LOCAL_SIGNATURE) {
      throw zipError(
        "entry " + JSON.stringify(name) + " has an invalid local header.",
      );
    }
    const localNameLength = local.readUInt16LE(26);
    const localExtraLength = local.readUInt16LE(28);
    const localName = checkedZipSlice(
      data,
      localOffset + 30,
      localNameLength,
      "a local entry name",
    );
    if (
      local.readUInt16LE(6) !== flags ||
      local.readUInt16LE(8) !== method ||
      local.readUInt16LE(10) !== modifiedTime ||
      local.readUInt16LE(12) !== modifiedDate ||
      local.readUInt32LE(14) !== expectedCrc ||
      local.readUInt32LE(18) !== compressedSize ||
      local.readUInt16LE(4) !== header.readUInt16LE(6) ||
      local.readUInt32LE(22) !== uncompressedSize ||
      !localName.equals(nameBytes)
    ) {
      throw zipError(
        "entry " + JSON.stringify(name) +
          " has different local and central headers.",
      );
    }
    const localExtra = checkedZipSlice(
      data,
      localOffset + 30 + localNameLength,
      localExtraLength,
      "local entry " + JSON.stringify(name) + " extra data",
    );
    validateZipExtra(localExtra, "local entry " + JSON.stringify(name));
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressedData = checkedZipSlice(
      data,
      dataStart,
      compressedSize,
      "entry " + JSON.stringify(name) + " data",
    );
    if (dataStart + compressedSize > centralOffset) {
      throw zipError(
        "entry " + JSON.stringify(name) +
          " overlaps the central directory.",
      );
    }
    expandedSize += uncompressedSize;
    if (expandedSize > extraction.expandedSize) {
      throw zipError(
        "expanded data exceeds " + extraction.expandedSize + " bytes.",
      );
    }
    entries.push({
      name,
      relativePath: name,
      directory,
      compressedData,
      compressionMethod: method,
      expandedSize: uncompressedSize,
      crc32: expectedCrc,
      localStart: localOffset,
      localEnd: dataStart + compressedSize,
    });
  }
  if (cursor !== end) {
    throw zipError("the central-directory size is inconsistent.");
  }
  if (expandedSize !== extraction.expandedSize) {
    throw zipError(
      "expanded size " + expandedSize + " does not equal " +
        extraction.expandedSize + ".",
    );
  }
  if (pathTypes.get(windowsPathKey(root)) !== true) {
    throw zipError(
      "the exact approved root directory entry is missing.",
    );
  }
  const ranges = entries
    .map(({ localStart, localEnd }) => ({ localStart, localEnd }))
    .sort((left, right) => left.localStart - right.localStart);
  if (ranges[0]!.localStart !== 0) {
    throw zipError("the archive has unreferenced leading data.");
  }
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index]!.localStart !== ranges[index - 1]!.localEnd) {
      throw zipError("local entries overlap or have unreferenced gaps.");
    }
  }
  if (ranges.at(-1)!.localEnd !== centralOffset) {
    throw zipError("the archive has unreferenced data before its directory.");
  }

  for (const entry of entries) {
    if (entry.directory) continue;
    let expanded: Uint8Array;
    try {
      expanded = expandZipEntry(entry);
    } catch {
      throw zipError(
        "entry " + JSON.stringify(entry.name) + " cannot be inflated.",
      );
    }
    if (
      expanded.byteLength !== entry.expandedSize ||
      crc32(expanded) !== entry.crc32
    ) {
      throw zipError(
        "entry " + JSON.stringify(entry.name) +
          " failed size or CRC validation.",
      );
    }
  }
  return entries;
}

async function installWindowsPayload(
  target: OpenScadTarget,
  staging: string,
  downloader: ArtifactDownloader,
  fetchImplementation: typeof globalThis.fetch | undefined,
): Promise<InstalledPayload> {
  if (target.extraction.kind !== "zip") {
    throw new Error("The Windows OpenSCAD extraction policy is invalid.");
  }
  const archive = resolve(staging, target.artifact.fileName);
  await downloader(target.artifact, archive, fetchImplementation);
  const entries = validateOpenScadWindowsZip(
    await readFile(archive),
    target.extraction,
  );
  for (const entry of entries) {
    const destination = resolve(staging, entry.relativePath);
    if (!isContainedPath(staging, destination)) {
      throw zipError(
        "entry " + JSON.stringify(entry.name) +
          " escapes the staging directory.",
      );
    }
    if (entry.directory) {
      await mkdir(destination, { recursive: true });
      continue;
    }
    await mkdir(dirname(destination), { recursive: true });
    const expanded = expandZipEntry(entry);
    await writeFile(destination, expanded, { flag: "wx" });
  }
  await rm(archive, { force: true });
  return {
    executable: resolve(staging, target.executable),
    environment: { ...process.env },
  };
}

async function installLinuxPayload(
  target: OpenScadTarget,
  staging: string,
  runner: CommandRunner,
  downloader: ArtifactDownloader,
  fetchImplementation: typeof globalThis.fetch | undefined,
): Promise<InstalledPayload> {
  if (
    target.extraction.kind !== "legacy-appimage" ||
    !target.extraction.patchHeader ||
    target.companions.length !== 1
  ) {
    throw new Error("The Linux OpenSCAD extraction policy is invalid.");
  }
  const appImage = resolve(staging, target.artifact.fileName);
  const companion = resolve(staging, target.companions[0]!.fileName);
  await downloader(target.artifact, appImage, fetchImplementation);
  await downloader(target.companions[0]!, companion, fetchImplementation);

  await chmod(appImage, 0o755);
  await patchLegacyAppImageHeader(appImage);
  const extraction = await runner(appImage, ["--appimage-extract"], {
    cwd: staging,
    environment: process.env,
  });
  if (extraction.code !== 0) {
    throw commandError("OpenSCAD AppImage extraction", extraction);
  }

  const localDependencies = resolve(staging, "local-deps");
  await mkdir(localDependencies, { recursive: true });
  const dependencyExtraction = await runner(
    target.requiredCommands[0]!,
    ["-x", companion, localDependencies],
    { cwd: staging, environment: process.env },
  );
  if (dependencyExtraction.code !== 0) {
    throw commandError(
      "libgpg-error0 extraction",
      dependencyExtraction,
    );
  }

  const executable = resolve(staging, target.executable);
  await chmod(executable, 0o755);
  const libraryDirectories = target.libraryDirectories.map((entry) =>
    resolve(staging, entry)
  );
  const environment = {
    ...process.env,
    LD_LIBRARY_PATH: [
      ...libraryDirectories,
      process.env.LD_LIBRARY_PATH,
    ]
      .filter(Boolean)
      .join(delimiter),
  };
  await rm(appImage, { force: true });
  await rm(companion, { force: true });
  return { executable, environment };
}

async function detachMacOsImage(
  runner: CommandRunner,
  staging: string,
  mountDirectory: string,
  force = false,
): Promise<void> {
  const detached = await runner(
    MACOS_HDIUTIL,
    ["detach", ...(force ? ["-force"] : []), mountDirectory],
    { cwd: staging, environment: process.env },
  );
  if (detached.code !== 0) {
    throw commandError(
      force
        ? "OpenSCAD disk image force detach"
        : "OpenSCAD disk image detach",
      detached,
    );
  }
}

async function installMacOsPayload(
  target: OpenScadTarget,
  staging: string,
  mountDirectory: string,
  runner: CommandRunner,
  downloader: ArtifactDownloader,
  fetchImplementation: typeof globalThis.fetch | undefined,
): Promise<InstalledPayload> {
  if (target.extraction.kind !== "dmg") {
    throw new Error("The macOS OpenSCAD extraction policy is invalid.");
  }
  const diskImage = resolve(staging, target.artifact.fileName);
  await downloader(target.artifact, diskImage, fetchImplementation);
  await mkdir(mountDirectory, { recursive: false });

  let attachAttempted = false;
  let operationError: unknown;
  try {
    attachAttempted = true;
    const attachment = await runner(
      MACOS_HDIUTIL,
      [
        "attach",
        diskImage,
        "-readonly",
        "-nobrowse",
        "-noautoopen",
        "-mountpoint",
        mountDirectory,
      ],
      { cwd: staging, environment: process.env },
    );
    if (attachment.code !== 0) {
      throw commandError("OpenSCAD disk image attach", attachment);
    }

    const mountedBundle = resolve(
      mountDirectory,
      target.extraction.bundlePath,
    );
    const installedBundle = resolve(
      staging,
      target.extraction.bundlePath,
    );
    const copied = await runner(
      MACOS_DITTO,
      [mountedBundle, installedBundle],
      { cwd: staging, environment: process.env },
    );
    if (copied.code !== 0) {
      throw commandError("OpenSCAD application copy", copied);
    }
    await validateMacOsAppTree(installedBundle);
  } catch (error) {
    operationError = error;
  } finally {
    const detachFailures: unknown[] = [];
    if (attachAttempted) {
      try {
        await detachMacOsImage(runner, staging, mountDirectory);
      } catch (detachError) {
        detachFailures.push(detachError);
        try {
          await detachMacOsImage(
            runner,
            staging,
            mountDirectory,
            true,
          );
        } catch (forceDetachError) {
          detachFailures.push(forceDetachError);
        }
      }
    }

    let mountRemovalError: unknown;
    try {
      await rmdir(mountDirectory);
    } catch (error) {
      if (
        !(
          error instanceof Error && "code" in error && error.code === "ENOENT"
        )
      ) {
        mountRemovalError = error;
      }
    }
    if (mountRemovalError !== undefined) {
      const cleanupError = detachFailures.length === 0
        ? mountRemovalError
        : new AggregateError(
          [...detachFailures, mountRemovalError],
          "Normal detach, forced detach, and mount cleanup failed.",
        );
      operationError = operationError === undefined
        ? cleanupError
        : new AggregateError(
          [operationError, cleanupError],
          "OpenSCAD installation and disk image cleanup both failed.",
        );
    }
  }
  if (operationError !== undefined) throw operationError;

  const executable = resolve(staging, target.executable);
  await validateNativeMachO(executable, target.architecture);
  await rm(diskImage, { force: true });
  return { executable, environment: { ...process.env } };
}
async function publishAtomically(
  staging: string,
  finalDirectory: string,
  backup: string,
  renamePath: RenamePath,
): Promise<void> {
  let movedPrevious = false;
  try {
    try {
      await renamePath(finalDirectory, backup);
      movedPrevious = true;
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        )
      ) {
        throw error;
      }
    }
    await renamePath(staging, finalDirectory);
  } catch (publishError) {
    if (movedPrevious) {
      try {
        await renamePath(backup, finalDirectory);
      } catch (restoreError) {
        throw new AggregateError(
          [publishError, restoreError],
          `OpenSCAD publication failed: ${errorMessage(publishError)} The prior installation remains at ${backup} because restore failed: ${errorMessage(restoreError)}`,
        );
      }
    }
    throw publishError;
  }
  if (movedPrevious) {
    await rm(backup, { recursive: true, force: true }).catch(() => undefined);
  }
}


export async function installOpenScad(
  options: InstallOpenScadOptions = {},
): Promise<InstallOpenScadResult> {
  const rootDirectory = resolve(options.rootDirectory ?? process.cwd());
  const manifest =
    options.manifest ?? loadOpenScadDistribution(rootDirectory);
  const host = options.host ?? detectOpenScadHost();
  const runner = options.runCommand ?? defaultRunCommand;
  const downloader =
    options.downloadArtifact ?? downloadVerifiedArtifact;

  const renamePath = options.renamePath ?? rename;
  const target = assertSupportedOpenScadHost(manifest, host);
  if (target.platform === "darwin") {
    await requireMacOsNativeHost(
      runner,
      rootDirectory,
      target,
      options.accessPath ?? access,
    );
  }

  const existing = resolveManagedOpenScadCommand(
    rootDirectory,
    manifest,
    process.env,
    host,
  );
  if (
    existing &&
    (await probeInstalledCommand(
      runner,
      existing.command,
      rootDirectory,
      existing.environment,
      target.version,
    ))
  ) {
    return {
      installationDirectory: managedOpenScadDirectory(rootDirectory, target),
      command: existing.command,
      reused: true,
    };
  }

  if (target.platform === "linux") {
    for (const command of target.requiredCommands) {
      await requireCommand(runner, command, rootDirectory);
    }
  }
  const toolsDirectory = resolve(rootDirectory, ".tools");
  const id = (options.uniqueId ?? randomUUID)().replace(
    /[^a-zA-Z0-9-]/g,
    "",
  );
  if (!id) {
    throw new Error("The OpenSCAD staging identifier is empty.");
  }
  const installationName = basename(target.installDirectory);
  const staging = resolve(
    toolsDirectory,
    `.${installationName}.staging-${id}`,
  );
  const backup = resolve(
    toolsDirectory,
    `.${installationName}.previous-${id}`,
  );
  const mountDirectory = resolve(
    toolsDirectory,
    `.${installationName}.mount-${id}`,
  );
  const finalDirectory = managedOpenScadDirectory(rootDirectory, target);

  await mkdir(toolsDirectory, { recursive: true });
  await mkdir(staging, { recursive: false });
  try {
    const payload = target.platform === "darwin"
      ? await installMacOsPayload(
        target,
        staging,
        mountDirectory,
        runner,
        downloader,
        options.fetch,
      )
      : target.platform === "win32"
        ? await installWindowsPayload(
          target,
          staging,
          downloader,
          options.fetch,
        )
        : await installLinuxPayload(
          target,
          staging,
          runner,
          downloader,
          options.fetch,
        );
    if (
      !(await probeInstalledCommand(
        runner,
        payload.executable,
        staging,
        payload.environment,
        target.version,
      ))
    ) {
      throw new Error(
        `The extracted OpenSCAD command did not report version ${target.version}.`,
      );
    }
    await writeFile(
      resolve(staging, MANAGED_OPENSCAD_RECEIPT),
      `${JSON.stringify(createManagedOpenScadReceipt(target), null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );

    await publishAtomically(staging, finalDirectory, backup, renamePath);
    return {
      installationDirectory: finalDirectory,
      command: resolve(finalDirectory, target.executable),
      reused: false,
    };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function main(): Promise<void> {
  const installed = await installOpenScad();
  console.log(
    installed.reused
      ? `OpenSCAD is already installed at ${installed.command}.`
      : `OpenSCAD was installed at ${installed.command}.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
