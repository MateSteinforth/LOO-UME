import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { generatePanelBoundaryParts } from "../src/cad/GeneratePanelBoundaryParts.ts";
import {
  probeManifoldGeneratorStatus,
  type ManifoldGeneratorStatus,
} from "../src/cad/ManifoldRuntime.ts";
import { createPanelAssemblyProject } from "../src/sculpture/PanelAssembly.ts";

const MAX_SCULPTURE_JSON_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_REQUEST_BYTES = 64 * 1024 * 1024;

interface ParsedEditorPipelineRequest {
  input: unknown;
  designSurfaceBytes?: Uint8Array;
}

class HttpError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

export interface EditorPipelineHandlerOptions {
  rootDirectory?: string;
  generatedPublicDirectory?: string;
}

export interface EditorPipelineHandler {
  readonly generatorStatus: ManifoldGeneratorStatus;
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

async function readRequestBytes(
  request: IncomingMessage,
  maximumBytes: number,
  limitMessage: string,
): Promise<Uint8Array> {
  const declaredLength = request.headers["content-length"];
  if (typeof declaredLength === "string" && /^\d+$/.test(declaredLength)) {
    const declaredBytes = Number(declaredLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maximumBytes) {
      request.resume();
      throw new HttpError(413, limitMessage);
    }
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBytes) {
      request.resume();
      throw new HttpError(413, limitMessage);
    }
    chunks.push(buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function parseJsonBytes(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new HttpError(400, "Sculpture field must contain valid JSON.");
  }
}

async function readEditorPipelineRequest(
  request: IncomingMessage,
): Promise<ParsedEditorPipelineRequest> {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string") {
    throw new HttpError(
      415,
      "Use Content-Type: application/json or multipart/form-data.",
    );
  }
  const normalizedType = contentType.toLowerCase();
  if (normalizedType.startsWith("application/json")) {
    const bytes = await readRequestBytes(
      request,
      MAX_SCULPTURE_JSON_BYTES,
      "Sculpture JSON exceeds 5 MB.",
    );
    return { input: parseJsonBytes(bytes) };
  }
  if (!normalizedType.startsWith("multipart/form-data")) {
    throw new HttpError(
      415,
      "Use Content-Type: application/json or multipart/form-data.",
    );
  }

  const bytes = await readRequestBytes(
    request,
    MAX_MULTIPART_REQUEST_BYTES,
    "Generation request exceeds 64 MB.",
  );
  let formData: FormData;
  try {
    formData = await new Response(new Blob([Uint8Array.from(bytes)]), {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new HttpError(400, "Generation request must be valid multipart form data.");
  }
  for (const [name] of formData) {
    if (name !== "sculpture" && name !== "designSurface") {
      throw new HttpError(400, `Generation request has unexpected field ${name}.`);
    }
  }
  const sculptureFields = formData.getAll("sculpture");
  if (sculptureFields.length !== 1) {
    throw new HttpError(400, "Generation request requires one sculpture field.");
  }
  const sculptureField = sculptureFields[0]!;
  const sculptureBytes = typeof sculptureField === "string"
    ? new TextEncoder().encode(sculptureField)
    : new Uint8Array(await sculptureField.arrayBuffer());
  if (sculptureBytes.byteLength > MAX_SCULPTURE_JSON_BYTES) {
    throw new HttpError(413, "Sculpture JSON exceeds 5 MB.");
  }

  const designFields = formData.getAll("designSurface");
  if (designFields.length > 1) {
    throw new HttpError(400, "Generation request accepts one designSurface field.");
  }
  if (typeof designFields[0] === "string") {
    throw new HttpError(400, "designSurface must be a binary file field.");
  }
  return {
    input: parseJsonBytes(sculptureBytes),
    ...(designFields[0]
      ? { designSurfaceBytes: new Uint8Array(await designFields[0].arrayBuffer()) }
      : {}),
  };
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

export async function createEditorPipelineHandler(
  options: EditorPipelineHandlerOptions = {},
): Promise<EditorPipelineHandler> {
  const rootDirectory = resolve(options.rootDirectory ?? process.cwd());
  const generatedPublicDirectory = resolve(
    options.generatedPublicDirectory ?? resolve(rootDirectory, "web/public"),
  );
  const generatorStatus: ManifoldGeneratorStatus =
    await probeManifoldGeneratorStatus();
  let pipelineRunning = false;
  let closing = false;

  return {
    generatorStatus,
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
          jsonResponse(response, 200, generatorStatus);
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
      if (!generatorStatus.available) {
        jsonResponse(response, 503, { error: generatorStatus.message });
        return true;
      }
      if (pipelineRunning) {
        jsonResponse(response, 409, { error: "Another 3D print generation is running." });
        return true;
      }
      pipelineRunning = true;
      try {
        const requestInput = await readEditorPipelineRequest(request);
        const definition = validateInput(requestInput.input);
        if (requestInput.designSurfaceBytes && definition.designSurface === undefined) {
          throw new HttpError(400, "designSurface bytes require a designSurface reference.");
        }
        const sourceId = definition.id as string;
        const profile = definition.panelProfile as Record<string, unknown>;
        const runId = `${sourceId.slice(0, 60)}-editor-preview`;
        const canDetectPanelBoundary =
          definition.boundaryTopology === undefined &&
          definition.manualMechanics === undefined &&
          definition.mechanicalShell === undefined &&
          Array.isArray(definition.panels) && definition.panels.length > 0;
        if (definition.boundaryTopology === undefined && !canDetectPanelBoundary) {
          throw new HttpError(
            400,
            "This generator uses Manifold for panel-outline parts. Projects without a panel-outline boundary are not generated here.",
          );
        }
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
          designSurfaceBytes: requestInput.designSurfaceBytes,
          panelProfileSource: `../../catalog/panels/${profile.id}.json`,
        });
        jsonResponse(response, 200, {
          ok: true,
          assetSculptureId: runId,
          definition: result.definition,
          projectSource: `./generated-projects/${runId}/sculpture.json`,
          log:
            `Generated and SHA-256 verified ${result.partAssets.length} exact printable STL files; boundary ${result.boundaryAsset.sha256.slice(0, 12)}… and manifest published atomically.`,
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
    async close() {
      closing = true;
    },
  };
}
