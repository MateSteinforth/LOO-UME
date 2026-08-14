export interface GeneratorStatus {
  schemaVersion: "1.0.0";
  available: boolean;
  generator: "openscad";
  supportedVersion: "2021.01";
  detectedVersion?: string;
  message: string;
}

type FetchGeneratorStatus = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const UNAVAILABLE_PREFIX =
  "Printable STL generation is unavailable because";

function unavailable(message: string): GeneratorStatus {
  return {
    schemaVersion: "1.0.0",
    available: false,
    generator: "openscad",
    supportedVersion: "2021.01",
    message: `${UNAVAILABLE_PREFIX} ${message}`,
  };
}

function parseGeneratorStatus(input: unknown): GeneratorStatus {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("the response must be a JSON object.");
  }
  const value = input as Record<string, unknown>;
  if (value.schemaVersion !== "1.0.0") {
    throw new Error("schemaVersion must be 1.0.0.");
  }
  if (typeof value.available !== "boolean") {
    throw new Error("available must be a boolean.");
  }
  if (value.generator !== "openscad") {
    throw new Error("generator must be openscad.");
  }
  if (value.supportedVersion !== "2021.01") {
    throw new Error("supportedVersion must be 2021.01.");
  }
  if (typeof value.message !== "string" || value.message.trim() === "") {
    throw new Error("message must be a non-empty string.");
  }
  if (
    value.detectedVersion !== undefined &&
    (typeof value.detectedVersion !== "string" ||
      value.detectedVersion.trim() === "")
  ) {
    throw new Error("detectedVersion must be a non-empty string when present.");
  }
  return {
    schemaVersion: "1.0.0",
    available: value.available,
    generator: "openscad",
    supportedVersion: "2021.01",
    ...(value.detectedVersion === undefined
      ? {}
      : { detectedVersion: value.detectedVersion as string }),
    message: value.message,
  };
}

export async function loadGeneratorStatus(
  fetchStatus: FetchGeneratorStatus = fetch,
): Promise<GeneratorStatus> {
  try {
    const response = await fetchStatus("./api/generator-status", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      return unavailable(
        `the local generator status request failed with HTTP ${response.status}.`,
      );
    }
    try {
      return parseGeneratorStatus(await response.json());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return unavailable(
        `the local generator status response is invalid: ${message}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return unavailable(
      `the local generator status could not be read: ${message}.`,
    );
  }
}
