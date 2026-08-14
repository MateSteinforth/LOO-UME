import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import {
  createOpenScadRuntime,
  type OpenScadRuntime,
} from "../src/cad/OpenScadRuntime.ts";
import { generatePanelBoundaryParts } from "../src/cad/GeneratePanelBoundaryParts.ts";
import { createPanelAssemblyProject } from "../src/sculpture/PanelAssembly.ts";
import { regenerateMechanicalShell } from "../src/sculpture/MechanicalShellRegenerator.ts";

const MAX_REQUEST_BYTES = 5 * 1024 * 1024;

class HttpError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

export interface EditorPipelineHandlerOptions {
  rootDirectory?: string;
  generatedPublicDirectory?: string;
  openScadRuntime?: OpenScadRuntime;
}

export interface EditorPipelineHandler {
  readonly openScadRuntime: OpenScadRuntime;
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
  close(gracePeriodMs?: number): Promise<void>;
}

function jsonResponse(
  response: ServerResponse,
  statusCode: number,
  value: unknown,
): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  try {
    const parsed = new URL(`http://${host}`);
    return parsed.username === "" && parsed.password === "" &&
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" ||
        parsed.hostname === "[::1]" || parsed.hostname === "::1");
  } catch {
    return false;
  }
}

export function isSameOriginRequest(request: IncomingMessage): boolean {
  const host = request.headers.host;
  const origin = request.headers.origin;
  if (!host || !origin || !isLoopbackHost(host)) return false;
  try {
    const parsed = new URL(origin);
    const protocol = "encrypted" in request.socket && request.socket.encrypted
      ? "https:"
      : "http:";
    return parsed.protocol === protocol &&
      parsed.host === host && isLoopbackHost(parsed.host);
  } catch {
    return false;
  }
}

async function readJsonRequest(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" ||
    !contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Use Content-Type: application/json.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      request.resume();
      throw new HttpError(413, "Sculpture JSON exceeds 5 MB.");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

function validateInput(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new HttpError(400, "Sculpture JSON must be an object.");
  }
  const definition = structuredClone(input) as Record<string, unknown>;
  const sourceId = definition.id;
  const profile = definition.panelProfile;
  if (
    typeof sourceId !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,80}$/.test(sourceId) ||
    typeof profile !== "object" || profile === null || Array.isArray(profile) ||
    typeof (profile as Record<string, unknown>).id !== "string" ||
    !/^[a-z0-9][a-z0-9-]{0,80}$/.test(
      (profile as Record<string, unknown>).id as string,
    )
  ) {
    throw new HttpError(
      400,
      "Sculpture and panel-profile IDs must be lowercase URL-safe slugs.",
    );
  }
  return definition;
}

function runChild(
  command: string,
  args: string[],
  rootDirectory: string,
  children: Set<ChildProcess>,
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: rootDirectory,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.add(child);
    let output = "";
    child.stdout?.on("data", (chunk) => { output += String(chunk); });
    child.stderr?.on("data", (chunk) => { output += String(chunk); });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      children.delete(child);
      if (code === 0) resolvePromise(output);
      else reject(new Error(
        output || `${command} exited with ${code ?? `signal ${signal ?? "unknown"}`}.`,
      ));
    });
  });
}

async function stopChildren(
  children: Set<ChildProcess>,
  gracePeriodMs: number,
): Promise<void> {
  const active = [...children].filter((child) => child.exitCode === null);
  for (const child of active) child.kill("SIGTERM");
  if (active.length === 0) return;
  await Promise.race([
    Promise.all(active.map((child) => new Promise<void>((resolvePromise) => {
      if (child.exitCode !== null) resolvePromise();
      else child.once("close", () => resolvePromise());
    }))),
    new Promise<void>((resolvePromise) => setTimeout(resolvePromise, gracePeriodMs)),
  ]);
  for (const child of active) {
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

export async function createEditorPipelineHandler(
  options: EditorPipelineHandlerOptions = {},
): Promise<EditorPipelineHandler> {
  const rootDirectory = resolve(options.rootDirectory ?? process.cwd());
  const generatedPublicDirectory = resolve(
    options.generatedPublicDirectory ?? resolve(rootDirectory, "web/public"),
  );
  const openScadRuntime = options.openScadRuntime ??
    await createOpenScadRuntime(rootDirectory);
  const children = new Set<ChildProcess>();
  let pipelineRunning = false;
  let closing = false;

  return {
    openScadRuntime,
    async handle(request, response) {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (pathname !== "/api/generator-status" &&
        pathname !== "/api/editor-pipeline") return false;
      if (!isLoopbackHost(request.headers.host)) {
        jsonResponse(response, 403, { error: "The local service accepts only loopback Host values." });
        return true;
      }
      if (pathname === "/api/generator-status") {
        if (request.method !== "GET") {
          response.setHeader("Allow", "GET");
          jsonResponse(response, 405, { error: "Use GET." });
        } else {
          jsonResponse(response, 200, openScadRuntime.status);
        }
        return true;
      }
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        jsonResponse(response, 405, { error: "Use POST." });
        return true;
      }
      if (!isSameOriginRequest(request)) {
        jsonResponse(response, 403, { error: "Generation requires a same-origin request." });
        return true;
      }
      if (closing) {
        jsonResponse(response, 503, { error: "The local generation service is shutting down." });
        return true;
      }
      if (!openScadRuntime.status.available) {
        jsonResponse(response, 503, { error: openScadRuntime.status.message });
        return true;
      }
      if (pipelineRunning) {
        jsonResponse(response, 409, { error: "Another 3D print generation is running." });
        return true;
      }
      pipelineRunning = true;
      try {
        const input = await readJsonRequest(request);
        let definition = validateInput(input);
        const sourceId = definition.id as string;
        const profile = definition.panelProfile as Record<string, unknown>;
        const runId = `${sourceId.slice(0, 60)}-editor-preview`;
        const canDetectPanelBoundary =
          definition.boundaryTopology === undefined &&
          definition.manualMechanics === undefined &&
          definition.mechanicalShell === undefined &&
          Array.isArray(definition.panels) && definition.panels.length > 0;
        if (definition.boundaryTopology !== undefined || canDetectPanelBoundary) {
          const project = createPanelAssemblyProject(
            definition,
            "editor-request.json",
          );
          const result = await generatePanelBoundaryParts(project, {
            rootDirectory,
            outputDirectory: resolve(
              generatedPublicDirectory,
              "generated-projects",
              runId,
            ),
            panelProfileSource: `../../catalog/panels/${profile.id}.json`,
            renderScad: openScadRuntime.render.bind(openScadRuntime),
          });
          jsonResponse(response, 200, {
            ok: true,
            assetSculptureId: runId,
            definition: result.definition,
            projectSource: `./generated-projects/${runId}/sculpture.json`,
            log:
              `Generated and SHA-256 verified ${result.partAssets.length} exact printable STL files; boundary ${result.boundaryAsset.sha256.slice(0, 12)}… and manifest published atomically.`,
          });
          return true;
        }
        const shell = definition.mechanicalShell;
        if (
          typeof shell === "object" && shell !== null && !Array.isArray(shell) &&
          (shell as Record<string, unknown>).derivationStatus === "requires-regeneration"
        ) {
          definition = regenerateMechanicalShell(
            createPanelAssemblyProject(definition, "editor-request.json"),
          ) as unknown as Record<string, unknown>;
        }
        const regeneratedDefinition = structuredClone(definition);
        definition.id = runId;
        (definition.panelProfile as Record<string, unknown>).source =
          `../../../catalog/panels/${profile.id}.json`;
        const relativeSource = `build/editor-projects/${runId}/sculpture.json`;
        const absoluteSource = resolve(rootDirectory, relativeSource);
        await mkdir(dirname(absoluteSource), { recursive: true });
        await writeFile(
          absoluteSource,
          `${JSON.stringify(definition, null, 2)}\n`,
          "utf8",
        );
        const npm = process.platform === "win32" ? "npm.cmd" : "npm";
        const generationLog = await runChild(
          npm,
          ["run", "generate:sculpture", "--", "--sculpture", relativeSource],
          rootDirectory,
          children,
        );
        const renderLog = await runChild(
          npm,
          [
            "run", "verify:sculpture", "--", "--sculpture", relativeSource,
            "--ephemeral",
          ],
          rootDirectory,
          children,
        );
        jsonResponse(response, 200, {
          ok: true,
          assetSculptureId: runId,
          definition: regeneratedDefinition,
          source: relativeSource,
          log: `${generationLog}${renderLog}`.trim(),
        });
      } catch (error) {
        const statusCode = error instanceof HttpError ? error.statusCode : 400;
        jsonResponse(response, statusCode, {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        pipelineRunning = false;
      }
      return true;
    },
    async close(gracePeriodMs = 2_000) {
      closing = true;
      await Promise.all([
        stopChildren(children, gracePeriodMs),
        openScadRuntime.close(gracePeriodMs),
      ]);
    },
  };
}
