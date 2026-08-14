import { spawn, type ChildProcess } from "node:child_process";
import { resolve, win32 } from "node:path";
import {
  detectOpenScadHost,
  loadOpenScadDistribution,
  resolveManagedOpenScadCommand,
  selectOpenScadTarget,
  type OpenScadTarget,
} from "./OpenScadDistribution.ts";

/** The supported version on the retained Linux x86-64 target. */
export const SUPPORTED_OPENSCAD_VERSION = "2021.01";

export interface OpenScadGeneratorStatus {
  schemaVersion: "1.0.0";
  available: boolean;
  generator: "openscad";
  supportedVersion: OpenScadTarget["version"];
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
  expectedVersion: OpenScadTarget["version"];
  targetId?: OpenScadTarget["id"];
}

function failureMessage(detail: string): string {
  return `${detail} Run npm run setup:openscad on a supported host, or set OPENSCAD to a supported executable. Restart WLED Orbital Lab after setup or configuration.`;
}

export function parseOpenScadVersion(output: string): string | undefined {
  return output.match(/OpenSCAD(?:\s+version)?\s+(\d{4}\.\d{2}(?:\.\d+)?)/i)?.[1];
}

export function resolveOpenScadCommand(
  rootDirectory: string,
  executable = process.env.OPENSCAD,
): OpenScadCommand {
  let expectedVersion: OpenScadTarget["version"] = SUPPORTED_OPENSCAD_VERSION;
  const host = detectOpenScadHost();
  let targetId: OpenScadTarget["id"] | undefined;
  try {
    const target = selectOpenScadTarget(
      loadOpenScadDistribution(rootDirectory),
      host,
    );
    if (target) {
      expectedVersion = target.version;
      targetId = target.id;
    }
  } catch {
    // Keep the legacy version if the target manifest cannot be loaded.
  }
  return {
    command: executable?.trim() || (host.platform === "win32" ? "openscad.com" : "openscad"),
    environment: process.env,
    expectedVersion,
    targetId,
  };
}

function openScadCandidates(
  rootDirectory: string,
  executable: string | undefined,
): OpenScadCommand[] {
  const system = resolveOpenScadCommand(rootDirectory, undefined);
  if (executable?.trim()) return [resolveOpenScadCommand(rootDirectory, executable)];
  const managed = resolveManagedOpenScadCommand(rootDirectory);
  return managed ? [managed, system] : [system];
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
    shell: false,
    windowsHide: true,
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
      if (detectedVersion !== command.expectedVersion) {
        mismatch ??= {
          command,
          status: {
            schemaVersion: "1.0.0",
            available: false,
            generator: "openscad",
            supportedVersion: command.expectedVersion,
            detectedVersion,
            message: failureMessage(
              `OpenSCAD ${detectedVersion} is installed, but this target supports ${command.expectedVersion}.`,
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
          supportedVersion: command.expectedVersion,
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
      supportedVersion: candidates[0]!.expectedVersion,
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

export type WindowsProcessTreeTerminator = (
  pid: number,
  force: boolean,
  timeoutMs: number,
) => Promise<void>;

function windowsTaskkillPath(environment: NodeJS.ProcessEnv): string {
  const root = environment.SystemRoot?.trim();
  if (
    !root ||
    !/^[a-z]:[\\/]/i.test(root) ||
    root.split(/[\\/]/).includes("..") ||
    root.includes("\0")
  ) {
    throw new Error("SystemRoot must be an absolute local Windows path.");
  }
  return win32.join(root, "System32", "taskkill.exe");
}

function bounded<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolvePromise, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    }, Math.max(1, timeoutMs));
    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolvePromise(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function terminateWindowsProcessTree(
  pid: number,
  force: boolean,
  timeoutMs = 5_000,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error("The Windows process identifier is invalid.");
  }
  const args = ["/PID", String(pid), "/T"];
  if (force) args.push("/F");
  const taskkill = spawn(windowsTaskkillPath(environment), args, {
    stdio: "ignore",
    shell: false,
    windowsHide: true,
  });
  try {
    await bounded(
      new Promise<void>((resolvePromise, reject) => {
        taskkill.once("error", reject);
        taskkill.once("close", (code) => {
          if (code === 0) resolvePromise();
          else reject(new Error(
            `taskkill exited with code ${code ?? "unknown"}.`,
          ));
        });
      }),
      timeoutMs,
      `taskkill did not respond within ${timeoutMs} ms.`,
    );
  } catch (error) {
    if (taskkill.exitCode === null) taskkill.kill("SIGKILL");
    throw error;
  }
}

export async function stopOpenScadChildren(
  children: Set<ChildProcess>,
  gracePeriodMs: number,
  platform = process.platform,
  terminateWindowsTree: WindowsProcessTreeTerminator =
    terminateWindowsProcessTree,
): Promise<void> {
  const active = [...children].filter((child) => child.exitCode === null);
  if (active.length === 0) return;
  const timeoutMs = Math.max(1, gracePeriodMs);
  const stop = async (child: ChildProcess, force: boolean): Promise<void> => {
    if (platform === "win32" && child.pid !== undefined) {
      await bounded(
        terminateWindowsTree(child.pid, force, timeoutMs),
        timeoutMs,
        `Windows process-tree stop timed out for PID ${child.pid}.`,
      );
      return;
    }
    child.kill(force ? "SIGKILL" : "SIGTERM");
  };
  const deadline = Date.now() + timeoutMs;
  await Promise.allSettled(active.map((child) => stop(child, false)));
  const closed = Promise.all(active.map((child) => new Promise<void>((resolvePromise) => {
    if (child.exitCode !== null) resolvePromise();
    else child.once("close", () => resolvePromise());
  })));
  const remainingGraceMs = Math.max(0, deadline - Date.now());
  if (remainingGraceMs > 0) {
    await bounded(
      closed,
      remainingGraceMs,
      "OpenSCAD did not exit during the graceful stop.",
    ).catch(() => undefined);
  }
  const forced = await Promise.allSettled(
    active
      .filter((child) => child.exitCode === null)
      .map((child) => stop(child, true)),
  );
  const failures = forced
    .filter((result): result is PromiseRejectedResult =>
      result.status === "rejected"
    )
    .map((result) => result.reason);
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      "OpenSCAD process-tree termination failed.",
    );
  }
  if (active.some((child) => child.exitCode === null)) {
    await bounded(
      closed,
      timeoutMs,
      "OpenSCAD did not exit after forced stop.",
    );
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
      await stopOpenScadChildren(children, gracePeriodMs);
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
