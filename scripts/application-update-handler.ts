import { execFile } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { isLoopbackHost } from "./editor-pipeline-handler.ts";

const APPROVED_ORIGIN = "https://github.com/MateSteinforth/LOO-UME.git";
const GIT = "/usr/bin/git";
const SHELL = "/bin/sh";

export interface ApplicationUpdateStatus {
  schemaVersion: "1.0.0";
  currentCommit: string | null;
  availableCommit: string | null;
  updateAvailable: boolean;
  canApply: boolean;
  localChanges: boolean;
  downloadUrl?: string | null;
  message: string;
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

export type ApplicationUpdateCommand = (
  command: string,
  args: readonly string[],
  cwd: string,
) => Promise<CommandResult>;

export interface ApplicationUpdateHandler {
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
  status(): Promise<ApplicationUpdateStatus>;
}

interface ApplicationUpdateHandlerOptions {
  rootDirectory: string;
  command?: ApplicationUpdateCommand;
  onUpdateApplied?: () => void;
}

function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<CommandResult> {
  return new Promise((resolvePromise, reject) => {
    execFile(command, [...args], {
      cwd,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr).trim() || error.message));
        return;
      }
      resolvePromise({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

function requestOriginIsLocal(request: IncomingMessage): boolean {
  const host = request.headers.host;
  const origin = request.headers.origin;
  return typeof host === "string" && origin === `http://${host}`;
}

function conciseError(error: unknown): string {
  return error instanceof Error
    ? error.message.split("\n")[0]!.slice(0, 300)
    : "Application update check failed.";
}

export function createApplicationUpdateHandler(
  options: ApplicationUpdateHandlerOptions,
): ApplicationUpdateHandler {
  const rootDirectory = resolve(options.rootDirectory);
  const command = options.command ?? runCommand;
  const git = (...args: string[]) => command(GIT, args, rootDirectory);
  let applying = false;

  const status = async (): Promise<ApplicationUpdateStatus> => {
    try {
      const branch = (await git("branch", "--show-current")).stdout.trim();
      if (branch !== "main") {
        throw new Error("Application updates require the main branch.");
      }
      const origin = (await git("remote", "get-url", "origin")).stdout.trim();
      if (origin !== APPROVED_ORIGIN) {
        throw new Error("Application updates require the approved LOO/UME origin.");
      }
      await git("fetch", "--prune", "origin", "main");
      await git("merge-base", "--is-ancestor", "HEAD", "origin/main");
      const [head, remote, workingTree] = await Promise.all([
        git("rev-parse", "--verify", "HEAD"),
        git("rev-parse", "--verify", "origin/main"),
        git("status", "--porcelain", "--untracked-files=normal"),
      ]);
      const currentCommit = head.stdout.trim();
      const availableCommit = remote.stdout.trim();
      const updateAvailable = currentCommit !== availableCommit;
      return {
        schemaVersion: "1.0.0",
        currentCommit,
        availableCommit,
        updateAvailable,
        canApply: updateAvailable && options.onUpdateApplied !== undefined,
        localChanges: workingTree.stdout.trim().length > 0,
        message: updateAvailable
          ? "A new LOO/UME version is available. Local project files will be preserved."
          : "LOO/UME is current.",
      };
    } catch (error) {
      return {
        schemaVersion: "1.0.0",
        currentCommit: null,
        availableCommit: null,
        updateAvailable: false,
        canApply: false,
        localChanges: false,
        message: conciseError(error),
      };
    }
  };

  return {
    status,
    async handle(request, response) {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (pathname !== "/api/application-update") return false;
      if (!isLoopbackHost(request.headers.host)) {
        sendJson(response, 403, { error: "Application updates are loopback-only." });
        return true;
      }
      if (request.method === "GET" || request.method === "HEAD") {
        const value = await status();
        if (request.method === "HEAD") {
          response.statusCode = 200;
          response.setHeader("Cache-Control", "no-store");
          response.end();
        } else sendJson(response, 200, value);
        return true;
      }
      if (request.method !== "POST") {
        response.setHeader("Allow", "GET, HEAD, POST");
        sendJson(response, 405, { error: "Use GET, HEAD, or POST." });
        return true;
      }
      if (!requestOriginIsLocal(request)) {
        sendJson(response, 403, { error: "Application update origin is not allowed." });
        return true;
      }
      if (applying) {
        sendJson(response, 409, { error: "A LOO/UME update is already running." });
        return true;
      }
      const current = await status();
      if (!current.canApply) {
        sendJson(response, 409, { error: current.message });
        return true;
      }
      if (applying) {
        sendJson(response, 409, { error: "A LOO/UME update is already running." });
        return true;
      }
      applying = true;
      try {
        await command(
          SHELL,
          [resolve(rootDirectory, "scripts/bootstrap-update-apply.sh")],
          rootDirectory,
        );
      } catch (error) {
        applying = false;
        sendJson(response, 409, { error: conciseError(error) });
        return true;
      }
      applying = false;
      sendJson(response, 200, {
        ok: true,
        message: "LOO/UME updated. The local application is restarting.",
      });
      setTimeout(() => options.onUpdateApplied?.(), 100);
      return true;
    },
  };
}
