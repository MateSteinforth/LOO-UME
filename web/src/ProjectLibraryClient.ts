export interface ProjectLibraryMutationResult {
  filename: string;
  revision: string;
}

async function mutationResponse(
  response: Response,
): Promise<ProjectLibraryMutationResult> {
  if (!response.ok) {
    let message = `Project library request failed: HTTP ${response.status}.`;
    try {
      const body = await response.json() as { error?: unknown };
      if (typeof body.error === "string") message = body.error;
    } catch {
      // Keep the bounded HTTP error when a static host returns HTML.
    }
    throw new Error(message);
  }
  const value = await response.json() as Partial<ProjectLibraryMutationResult>;
  if (
    typeof value.filename !== "string" ||
    typeof value.revision !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.revision)
  ) throw new Error("Project library save response is invalid.");
  return value as ProjectLibraryMutationResult;
}

export type ProjectLibraryLocation = "demo" | "local";

function projectSource(location: ProjectLibraryLocation, filename: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,179}\.loo\.zip$/.test(filename)) {
    throw new Error("Use a project filename made from letters, numbers, dots, dashes, or underscores.");
  }
  return `./api/project-library/package/${location}/${encodeURIComponent(filename)}`;
}

export async function saveLocalProjectPackage(
  filename: string,
  bytes: Uint8Array,
  revision?: string,
): Promise<ProjectLibraryMutationResult> {
  return mutationResponse(await fetch(projectSource("local", filename), {
    method: "PUT",
    headers: {
      "Content-Type": "application/zip",
      ...(revision ? { "If-Match": `"${revision}"` } : { "If-None-Match": "*" }),
    },
    body: Uint8Array.from(bytes),
  }));
}

export async function replaceProjectLibraryPackage(
  location: ProjectLibraryLocation,
  filename: string,
  bytes: Uint8Array,
  revision: string,
): Promise<ProjectLibraryMutationResult> {
  return mutationResponse(await fetch(projectSource(location, filename), {
    method: "PUT",
    headers: {
      "Content-Type": "application/zip",
      "If-Match": `"${revision}"`,
    },
    body: Uint8Array.from(bytes),
  }));
}

export async function renameLocalProjectPackage(
  filename: string,
  destinationFilename: string,
  revision: string,
): Promise<ProjectLibraryMutationResult> {
  return mutationResponse(await fetch(projectSource("local", filename), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "If-Match": `"${revision}"`,
    },
    body: JSON.stringify({ filename: destinationFilename }),
  }));
}

export async function renameProjectLibraryPackage(
  location: ProjectLibraryLocation,
  filename: string,
  destinationFilename: string,
  revision: string,
): Promise<ProjectLibraryMutationResult> {
  return mutationResponse(await fetch(projectSource(location, filename), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "If-Match": `"${revision}"`,
    },
    body: JSON.stringify({ filename: destinationFilename }),
  }));
}

export async function deleteLocalProjectPackage(
  filename: string,
  revision: string,
): Promise<void> {
  const response = await fetch(projectSource("local", filename), {
    method: "DELETE",
    headers: { "If-Match": `"${revision}"` },
  });
  if (!response.ok) {
    let message = `Project library delete failed: HTTP ${response.status}.`;
    try {
      const body = await response.json() as { error?: unknown };
      if (typeof body.error === "string") message = body.error;
    } catch {
      // Keep the HTTP error.
    }
    throw new Error(message);
  }
}

export async function deleteProjectLibraryPackage(
  location: ProjectLibraryLocation,
  filename: string,
  revision: string,
): Promise<void> {
  const response = await fetch(projectSource(location, filename), {
    method: "DELETE",
    headers: { "If-Match": `"${revision}"` },
  });
  if (!response.ok) {
    let message = `Project library delete failed: HTTP ${response.status}.`;
    try {
      const body = await response.json() as { error?: unknown };
      if (typeof body.error === "string") message = body.error;
    } catch {
      // Keep the HTTP error.
    }
    throw new Error(message);
  }
}
