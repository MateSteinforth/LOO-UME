import { randomUUID } from "node:crypto";
import {
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

export interface InstallOpenScadOptions {
  rootDirectory?: string;
  manifest?: OpenScadDistribution;
  host?: HostDescription;
  fetch?: typeof globalThis.fetch;
  runCommand?: CommandRunner;
  downloadArtifact?: ArtifactDownloader;
  uniqueId?: () => string;
  renamePath?: RenamePath;
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

  for (const [command, args] of [
    [MACOS_HDIUTIL, ["help"]],
    [MACOS_DITTO, ["-h"]],
  ] as const) {
    let result: CommandResult;
    try {
      result = await runner(command, [...args], options);
    } catch (error) {
      throw new Error(
        `${command} is required to install the managed OpenSCAD build: ${errorMessage(error)}`,
      );
    }
    if (result.code !== 0) {
      throw new Error(
        `${command} is required to install the managed OpenSCAD build.`,
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
    await requireMacOsNativeHost(runner, rootDirectory, target);
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
