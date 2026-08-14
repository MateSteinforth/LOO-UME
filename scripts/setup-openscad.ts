import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { delimiter, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  assertSupportedOpenScadHost,
  createManagedOpenScadReceipt,
  detectOpenScadHost,
  loadOpenScadDistribution,
  MANAGED_OPENSCAD_DIRECTORY,
  MANAGED_OPENSCAD_RECEIPT,
  type DownloadArtifact,
  type HostDescription,
  type OpenScadDistribution,
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

async function probeInstalledCommand(
  runner: CommandRunner,
  command: string,
  cwd: string,
  environment: NodeJS.ProcessEnv,
): Promise<boolean> {
  try {
    const result = await runner(command, ["--version"], {
      cwd,
      environment,
    });
    return (
      result.code === 0 &&
      /OpenSCAD(?:\s+version)?\s+2021\.01\b/i.test(
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
  assertSupportedOpenScadHost(manifest, host);

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
    ))
  ) {
    return {
      installationDirectory: resolve(
        rootDirectory,
        MANAGED_OPENSCAD_DIRECTORY,
      ),
      command: existing.command,
      reused: true,
    };
  }

  await requireCommand(
    runner,
    manifest.target.requiredCommand,
    rootDirectory,
  );
  const toolsDirectory = resolve(rootDirectory, ".tools");
  const id = (options.uniqueId ?? randomUUID)().replace(
    /[^a-zA-Z0-9-]/g,
    "",
  );
  const staging = resolve(
    toolsDirectory,
    `.openscad-2021.01.staging-${id}`,
  );
  const backup = resolve(
    toolsDirectory,
    `.openscad-2021.01.previous-${id}`,
  );
  const finalDirectory = resolve(
    rootDirectory,
    MANAGED_OPENSCAD_DIRECTORY,
  );

  await mkdir(toolsDirectory, { recursive: true });
  await mkdir(staging, { recursive: false });
  try {
    const appImage = resolve(
      staging,
      manifest.target.artifact.fileName,
    );
    const companion = resolve(
      staging,
      manifest.target.companions[0].fileName,
    );
    await downloader(
      manifest.target.artifact,
      appImage,
      options.fetch,
    );
    await downloader(
      manifest.target.companions[0],
      companion,
      options.fetch,
    );

    await chmod(appImage, 0o755);
    await patchLegacyAppImageHeader(appImage);
    const extraction = await runner(
      appImage,
      ["--appimage-extract"],
      { cwd: staging, environment: process.env },
    );
    if (extraction.code !== 0) {
      throw commandError("OpenSCAD AppImage extraction", extraction);
    }

    const localDependencies = resolve(staging, "local-deps");
    await mkdir(localDependencies, { recursive: true });
    const dependencyExtraction = await runner(
      manifest.target.requiredCommand,
      ["-x", companion, localDependencies],
      { cwd: staging, environment: process.env },
    );
    if (dependencyExtraction.code !== 0) {
      throw commandError(
        "libgpg-error0 extraction",
        dependencyExtraction,
      );
    }

    const executable = resolve(staging, manifest.target.executable);
    await chmod(executable, 0o755);
    const libraryDirectories =
      manifest.target.libraryDirectories.map((entry) =>
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
    if (
      !(await probeInstalledCommand(
        runner,
        executable,
        staging,
        environment,
      ))
    ) {
      throw new Error(
        "The extracted OpenSCAD command did not report version 2021.01.",
      );
    }

    await rm(appImage, { force: true });
    await rm(companion, { force: true });
    await writeFile(
      resolve(staging, MANAGED_OPENSCAD_RECEIPT),
      `${JSON.stringify(createManagedOpenScadReceipt(manifest), null, 2)}\n`,
      { encoding: "utf8", flag: "wx" },
    );

    await publishAtomically(staging, finalDirectory, backup, renamePath);
    return {
      installationDirectory: finalDirectory,
      command: resolve(finalDirectory, manifest.target.executable),
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
      ? `OpenSCAD 2021.01 is already installed at ${installed.command}.`
      : `OpenSCAD 2021.01 was installed at ${installed.command}.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
