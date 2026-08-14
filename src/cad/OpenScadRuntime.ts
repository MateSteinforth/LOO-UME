import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, resolve } from "node:path";

export const SUPPORTED_OPENSCAD_VERSION = "2021.01";

export interface OpenScadGeneratorStatus {
  schemaVersion: "1.0.0";
  available: boolean;
  generator: "openscad";
  supportedVersion: typeof SUPPORTED_OPENSCAD_VERSION;
  detectedVersion?: string;
  message: string;
}

export interface OpenScadRuntime {
  readonly status: OpenScadGeneratorStatus;
  render(inputScad: string, outputStl: string): Promise<void>;
  close(gracePeriodMs?: number): Promise<void>;
}

export interface OpenScadCommand {
  command: string;
  environment: NodeJS.ProcessEnv;
}

function failureMessage(detail: string): string {
  return `${detail} Install OpenSCAD ${SUPPORTED_OPENSCAD_VERSION} and put openscad on PATH, or set OPENSCAD to its executable. Restart WLED Orbital Lab after you install or configure OpenSCAD.`;
}

export function parseOpenScadVersion(output: string): string | undefined {
  return output.match(/OpenSCAD(?:\s+version)?\s+(\d{4}\.\d{2}(?:\.\d+)?)/i)?.[1];
}

export function resolveOpenScadCommand(
  _rootDirectory: string,
  executable = process.env.OPENSCAD,
): OpenScadCommand {
  return {
    command: executable ?? "openscad",
    environment: process.env,
  };
}

function openScadCandidates(
  rootDirectory: string,
  executable: string | undefined,
): OpenScadCommand[] {
  const primary = resolveOpenScadCommand(rootDirectory, executable);
  if (executable) return [primary];
  const local = resolve(
    rootDirectory,
    ".tools/openscad-2021.01/squashfs-root/AppRun",
  );
  if (!existsSync(local)) return [primary];
  const localDependencies = resolve(
    rootDirectory,
    ".tools/openscad-2021.01/local-deps/usr/lib/x86_64-linux-gnu",
  );
  const localEnvironment = {
    ...process.env,
    LD_LIBRARY_PATH: [
      existsSync(localDependencies) ? localDependencies : undefined,
      process.env.LD_LIBRARY_PATH,
    ].filter(Boolean).join(delimiter),
  };
  return [primary, { command: local, environment: localEnvironment }];
}

interface CollectedProcess {
  child: ChildProcess;
  completion: Promise<string>;
}

function collectProcess(
  command: string,
  args: string[],
  rootDirectory: string,
  environment: NodeJS.ProcessEnv,
  timeoutMs?: number,
): CollectedProcess {
  const child = spawn(command, args, {
    cwd: rootDirectory,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk) => { output += String(chunk); });
  child.stderr?.on("data", (chunk) => { output += String(chunk); });
  const completion = new Promise<string>((resolvePromise, reject) => {
    let settled = false;
    const timer = timeoutMs === undefined ? undefined : setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`OpenSCAD did not respond within ${timeoutMs} ms.`));
    }, timeoutMs);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (code === 0) resolvePromise(output);
      else {
        reject(new Error(
          output || `${command} exited with ${code ?? `signal ${signal ?? "unknown"}`}.`,
        ));
      }
    });
  });
  return { child, completion };
}

interface OpenScadDiscovery {
  status: OpenScadGeneratorStatus;
  command: OpenScadCommand;
}

async function discoverOpenScad(
  rootDirectory: string,
  executable = process.env.OPENSCAD,
): Promise<OpenScadDiscovery> {
  const root = resolve(rootDirectory);
  const candidates = openScadCandidates(root, executable);
  let lastFailure: string | undefined;
  let mismatch: OpenScadDiscovery | undefined;
  for (const command of candidates) {
    try {
      const process = collectProcess(
        command.command,
        ["--version"],
        root,
        command.environment,
        5_000,
      );
      const output = await process.completion;
      const detectedVersion = parseOpenScadVersion(output);
      if (!detectedVersion) {
        lastFailure = "The OpenSCAD version could not be read.";
        continue;
      }
      if (detectedVersion !== SUPPORTED_OPENSCAD_VERSION) {
        mismatch ??= {
          command,
          status: {
            schemaVersion: "1.0.0",
            available: false,
            generator: "openscad",
            supportedVersion: SUPPORTED_OPENSCAD_VERSION,
            detectedVersion,
            message: failureMessage(
              `OpenSCAD ${detectedVersion} is installed, but this project supports ${SUPPORTED_OPENSCAD_VERSION}.`,
            ),
          },
        };
        continue;
      }
      return {
        command,
        status: {
          schemaVersion: "1.0.0",
          available: true,
          generator: "openscad",
          supportedVersion: SUPPORTED_OPENSCAD_VERSION,
          detectedVersion,
          message: `OpenSCAD ${detectedVersion} is ready for local generation.`,
        },
      };
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        lastFailure = `OpenSCAD could not start: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  }
  if (mismatch) return mismatch;
  return {
    command: candidates[0]!,
    status: {
      schemaVersion: "1.0.0",
      available: false,
      generator: "openscad",
      supportedVersion: SUPPORTED_OPENSCAD_VERSION,
      message: failureMessage(lastFailure ?? "OpenSCAD was not found."),
    },
  };
}

export async function probeOpenScad(
  rootDirectory: string,
  executable = process.env.OPENSCAD,
): Promise<OpenScadGeneratorStatus> {
  return (await discoverOpenScad(rootDirectory, executable)).status;
}

async function stopChildren(
  children: Set<ChildProcess>,
  gracePeriodMs: number,
): Promise<void> {
  const active = [...children].filter((child) => child.exitCode === null);
  for (const child of active) child.kill("SIGTERM");
  if (active.length === 0) return;
  const closed = Promise.all(active.map((child) => new Promise<void>((resolvePromise) => {
    if (child.exitCode !== null) resolvePromise();
    else child.once("close", () => resolvePromise());
  })));
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    closed,
    new Promise<void>((resolvePromise) => {
      timer = setTimeout(resolvePromise, gracePeriodMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
  for (const child of active) {
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

export async function createOpenScadRuntime(
  rootDirectory: string,
  executable = process.env.OPENSCAD,
): Promise<OpenScadRuntime> {
  const root = resolve(rootDirectory);
  const { command: resolved, status } = await discoverOpenScad(root, executable);
  const children = new Set<ChildProcess>();
  let closing = false;
  return {
    status,
    async render(inputScad, outputStl) {
      if (!status.available) throw new Error(status.message);
      if (closing) throw new Error("The local generation service is shutting down.");
      const process = collectProcess(
        resolved.command,
        ["--hardwarnings", "-o", outputStl, inputScad],
        root,
        resolved.environment,
      );
      children.add(process.child);
      try {
        await process.completion;
      } finally {
        children.delete(process.child);
      }
    },
    async close(gracePeriodMs = 2_000) {
      closing = true;
      await stopChildren(children, gracePeriodMs);
    },
  };
}

export function createUnprobedOpenScadRenderer(
  rootDirectory: string,
  executable = process.env.OPENSCAD,
): (inputScad: string, outputStl: string) => Promise<void> {
  const root = resolve(rootDirectory);
  return async (inputScad, outputStl) => {
    let lastError: unknown;
    for (const candidate of openScadCandidates(root, executable)) {
      try {
        await collectProcess(
          candidate.command,
          ["--hardwarnings", "-o", outputStl, inputScad],
          root,
          candidate.environment,
        ).completion;
        return;
      } catch (error) {
        lastError = error;
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
          throw error;
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("OpenSCAD was not found.");
  };
}
