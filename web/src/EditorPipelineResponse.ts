import { ManifoldRuntimeUnavailableError } from "../../src/cad/ManifoldRuntime.ts";

export interface EditorPipelineResult {
  ok?: boolean;
  assetSculptureId?: string;
  log?: string;
  definition?: unknown;
  projectSource?: string;
  error?: string;
}

export function shouldUseEditorPipelineFallback(error: unknown): boolean {
  return error instanceof ManifoldRuntimeUnavailableError;
}

function invalidContract(response: Response, detail: string): Error {
  return new Error(
    `Local generation fallback returned an invalid JSON contract ` +
      `(HTTP ${response.status}): ${detail}.`,
  );
}

/** Reads the optional local generator response without exposing raw HTML parse errors. */
export async function readEditorPipelineResult(
  response: Response,
): Promise<EditorPipelineResult> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      `Local generation fallback returned ${contentType || "an unknown content type"} ` +
        `instead of JSON (HTTP ${response.status}).`,
    );
  }

  let input: unknown;
  try {
    input = await response.json();
  } catch {
    throw new Error(
      `Local generation fallback returned invalid JSON (HTTP ${response.status}).`,
    );
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(
      `Local generation fallback returned a non-object JSON value (HTTP ${response.status}).`,
    );
  }
  const result = input as Record<string, unknown>;
  const optionalStrings = [
    "assetSculptureId",
    "log",
    "projectSource",
    "error",
  ] as const;
  if (result.ok !== undefined && typeof result.ok !== "boolean") {
    throw invalidContract(response, "ok must be a boolean when present");
  }
  for (const field of optionalStrings) {
    if (result[field] !== undefined && typeof result[field] !== "string") {
      throw invalidContract(response, `${field} must be a string when present`);
    }
  }
  if (
    result.definition !== undefined &&
    (typeof result.definition !== "object" ||
      result.definition === null ||
      Array.isArray(result.definition))
  ) {
    throw invalidContract(response, "definition must be an object when present");
  }
  if (response.ok) {
    if (result.ok !== true) {
      throw invalidContract(response, "a successful response must set ok to true");
    }
    if (
      typeof result.assetSculptureId !== "string" ||
      result.assetSculptureId.trim() === "" ||
      result.definition === undefined
    ) {
      throw invalidContract(
        response,
        "a successful response requires assetSculptureId and definition",
      );
    }
  } else if (typeof result.error !== "string" || result.error.trim() === "") {
    throw invalidContract(response, "an error response requires error text");
  }
  return result as EditorPipelineResult;
}
