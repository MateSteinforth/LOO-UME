import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, relative, resolve, sep } from "node:path";
import { readProjectPackageSummary } from "../web/src/ProjectPackage.ts";
import { PORTABLE_ZIP_RESOURCE_LIMITS } from "../web/src/ZipResourceLimits.ts";
import { isLoopbackHost } from "./editor-pipeline-handler.ts";

const PACKAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}\.loo\.zip$/;

type ProjectLocation = "demo" | "local";

interface CachedProject {
  stamp: string;
  bytes: Uint8Array;
  revision: string;
  id: string;
  name: string;
  panelCount: number;
  thumbnailBytes: Uint8Array;
  thumbnailMediaType: string;
}

class ProjectLibraryError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface ProjectLibraryHandlerOptions {
  rootDirectory?: string;
  demoDirectory?: string;
  localDirectory?: string;
  manifestPath?: string;
}

export interface ProjectLibraryHandler {
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
}

async function readRequestBytes(
  request: IncomingMessage,
  maximumBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number(request.headers["content-length"] ?? "0");
  if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
    throw new ProjectLibraryError(400, "Request Content-Length is invalid.");
  }
  if (declaredLength > maximumBytes) {
    throw new ProjectLibraryError(413, "Project package is too large.");
  }
  const chunks: Buffer[] = [];
  let byteLength = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += bytes.byteLength;
    if (byteLength > maximumBytes) {
      throw new ProjectLibraryError(413, "Project package is too large.");
    }
    chunks.push(bytes);
  }
  return new Uint8Array(Buffer.concat(chunks, byteLength));
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`));
}

function apiPath(kind: "package" | "thumbnail", key: string): string {
  return `./api/project-library/${kind}/${key}`;
}

export function createProjectLibraryHandler(
  options: ProjectLibraryHandlerOptions = {},
): ProjectLibraryHandler {
  const rootDirectory = resolve(options.rootDirectory ?? process.cwd());
  const directories: Readonly<Record<ProjectLocation, string>> = {
    demo: resolve(options.demoDirectory ?? resolve(rootDirectory, "projects/demos")),
    local: resolve(options.localDirectory ?? resolve(rootDirectory, "projects/local")),
  };
  const manifestPath = resolve(
    options.manifestPath ?? resolve(rootDirectory, "projects/manifest.json"),
  );
  const cache = new Map<string, CachedProject>();
  let mutationQueue = Promise.resolve();

  const serializeMutation = async <T>(operation: () => Promise<T>): Promise<T> => {
    const result = mutationQueue.then(operation, operation);
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  };

  const load = async (
    location: ProjectLocation,
    filename: string,
  ): Promise<CachedProject> => {
    if (!PACKAGE_NAME.test(filename)) {
      throw new Error("Project package name is invalid.");
    }
    const directory = directories[location];
    const [canonicalDirectory, canonicalFile] = await Promise.all([
      realpath(directory),
      realpath(resolve(directory, filename)),
    ]);
    if (!isInside(canonicalDirectory, canonicalFile)) {
      throw new Error("Project package path leaves its library directory.");
    }
    const metadata = await stat(canonicalFile);
    if (!metadata.isFile()) throw new Error("Project package is not a regular file.");
    if (metadata.size > PORTABLE_ZIP_RESOURCE_LIMITS.maximumArchiveBytes) {
      throw new Error(
        `Project package exceeds the ${PORTABLE_ZIP_RESOURCE_LIMITS.maximumArchiveBytes}-byte archive limit.`,
      );
    }
    const stamp = `${metadata.size}:${metadata.mtimeMs}:${metadata.ctimeMs}:${metadata.ino}`;
    const key = `${location}/${filename}`;
    const cached = cache.get(key);
    if (cached?.stamp === stamp) return cached;
    const bytes = new Uint8Array(await readFile(canonicalFile));
    const summary = readProjectPackageSummary(bytes);
    const project: CachedProject = {
      stamp,
      bytes,
      revision: createHash("sha256").update(bytes).digest("hex"),
      id: summary.manifest.id,
      name: summary.manifest.name,
      panelCount: summary.manifest.panelCount,
      thumbnailBytes: summary.thumbnailBytes,
      thumbnailMediaType: summary.thumbnailMediaType,
    };
    cache.set(key, project);
    return project;
  };

  const names = async (location: ProjectLocation): Promise<string[]> => {
    try {
      return (await readdir(directories[location], { withFileTypes: true }))
        .filter((entry) => entry.isFile() && PACKAGE_NAME.test(entry.name))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
      throw error;
    }
  };

  const defaultDemoFilename = async (): Promise<string | undefined> => {
    try {
      const input = JSON.parse(await readFile(manifestPath, "utf8")) as {
        defaultSource?: unknown;
      };
      return typeof input.defaultSource === "string"
        ? basename(input.defaultSource)
        : undefined;
    } catch {
      return undefined;
    }
  };

  const requireRevision = async (
    request: IncomingMessage,
    filename: string,
  ): Promise<CachedProject | undefined> => {
    const ifMatch = request.headers["if-match"];
    const ifNoneMatch = request.headers["if-none-match"];
    if (ifMatch === undefined && ifNoneMatch !== "*") {
      throw new ProjectLibraryError(
        428,
        "Use If-Match to change an existing project or If-None-Match: * to create one.",
      );
    }
    let existing: CachedProject | undefined;
    try {
      existing = await load("local", filename);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
    if (ifNoneMatch === "*") {
      if (existing) throw new ProjectLibraryError(412, "A project with this filename already exists.");
      return undefined;
    }
    if (!existing) throw new ProjectLibraryError(412, "The project no longer exists.");
    if (ifMatch !== `"${existing.revision}"`) {
      throw new ProjectLibraryError(412, "The project changed after it was opened. Reload it before saving.");
    }
    return existing;
  };

  const atomicWrite = async (filename: string, bytes: Uint8Array): Promise<void> => {
    await mkdir(directories.local, { recursive: true });
    const temporaryPath = resolve(
      directories.local,
      `.${filename}.${randomUUID()}.tmp`,
    );
    const destinationPath = resolve(directories.local, filename);
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      await rename(temporaryPath, destinationPath);
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
    cache.delete(`local/${filename}`);
  };

  return {
    async handle(request, response) {
      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      if (
        pathname !== "/api/project-library" &&
        !pathname.startsWith("/api/project-library/")
      ) return false;
      if (!isLoopbackHost(request.headers.host)) {
        sendJson(response, 403, { error: "Project library accepts only a loopback Host." });
        return true;
      }
      if (pathname === "/api/project-library") {
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.setHeader("Allow", "GET, HEAD");
          sendJson(response, 405, { error: "Use GET or HEAD." });
          return true;
        }
        const projects: Array<Record<string, unknown>> = [];
        const invalidPackages: Array<{ source: string; error: string }> = [];
        for (const location of ["demo", "local"] as const) {
          for (const filename of await names(location)) {
            const key = `${location}/${filename}`;
            try {
              const project = await load(location, filename);
              projects.push({
                id: project.id,
                name: project.name,
                panelCount: project.panelCount,
                source: apiPath("package", key),
                thumbnailSource: apiPath("thumbnail", key),
                revision: project.revision,
                filename,
                location,
                readOnly: location === "demo",
              });
            } catch (error) {
              invalidPackages.push({
                source: key,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
        const preferred = await defaultDemoFilename();
        const defaultProject = projects.find((project) =>
          typeof project.source === "string" && project.source.endsWith(`/demo/${preferred}`)
        ) ?? projects[0];
        const body = JSON.stringify({
          schemaVersion: "1.0.0",
          writable: true,
          defaultSource: defaultProject?.source ?? "",
          projects,
          invalidPackages,
        });
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Length", String(Buffer.byteLength(body)));
        if (request.method === "HEAD") response.end();
        else response.end(body);
        return true;
      }
      const match = /^\/api\/project-library\/(package|thumbnail)\/(demo|local)\/([^/]+)$/.exec(pathname);
      if (!match) {
        sendJson(response, 404, { error: "Project library endpoint was not found." });
        return true;
      }
      const kind = match[1] as "package" | "thumbnail";
      const location = match[2] as ProjectLocation;
      const filename = match[3]!;
      try {
        if (kind === "package" && location === "local" && request.method === "PUT") {
          if (request.headers["content-type"]?.split(";", 1)[0] !== "application/zip") {
            throw new ProjectLibraryError(415, "Save a project as application/zip.");
          }
          if (!PACKAGE_NAME.test(filename)) {
            throw new ProjectLibraryError(400, "Project package name is invalid.");
          }
          const bytes = await readRequestBytes(
            request,
            PORTABLE_ZIP_RESOURCE_LIMITS.maximumArchiveBytes,
          );
          readProjectPackageSummary(bytes);
          const saved = await serializeMutation(async () => {
            await requireRevision(request, filename);
            await atomicWrite(filename, bytes);
            return load("local", filename);
          });
          sendJson(response, 200, { revision: saved.revision, filename });
          return true;
        }
        if (kind === "package" && location === "local" && request.method === "PATCH") {
          const body = await readRequestBytes(request, 1_024);
          let destination: unknown;
          try {
            destination = (JSON.parse(new TextDecoder().decode(body)) as { filename?: unknown }).filename;
          } catch {
            throw new ProjectLibraryError(400, "Rename request JSON is invalid.");
          }
          if (typeof destination !== "string" || !PACKAGE_NAME.test(destination)) {
            throw new ProjectLibraryError(400, "Project package name is invalid.");
          }
          const renamed = await serializeMutation(async () => {
            const current = await requireRevision(request, filename);
            if (!current) throw new ProjectLibraryError(412, "The project no longer exists.");
            await mkdir(directories.local, { recursive: true });
            try {
              await stat(resolve(directories.local, destination));
              throw new ProjectLibraryError(412, "A project with this filename already exists.");
            } catch (error) {
              if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
            }
            await rename(
              resolve(directories.local, filename),
              resolve(directories.local, destination),
            );
            cache.delete(`local/${filename}`);
            cache.delete(`local/${destination}`);
            return load("local", destination);
          });
          sendJson(response, 200, { revision: renamed.revision, filename: destination });
          return true;
        }
        if (kind === "package" && location === "local" && request.method === "DELETE") {
          await serializeMutation(async () => {
            await requireRevision(request, filename);
            await unlink(resolve(directories.local, filename));
            cache.delete(`local/${filename}`);
          });
          response.statusCode = 204;
          response.end();
          return true;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.setHeader("Allow", kind === "package" && location === "local"
            ? "GET, HEAD, PUT, PATCH, DELETE"
            : "GET, HEAD");
          sendJson(response, 405, { error: "This project library method is not available." });
          return true;
        }
        const project = await load(location, filename);
        const bytes = kind === "package" ? project.bytes : project.thumbnailBytes;
        response.statusCode = 200;
        response.setHeader(
          "Content-Type",
          kind === "package" ? "application/zip" : project.thumbnailMediaType,
        );
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Length", String(bytes.byteLength));
        response.setHeader("ETag", `"${project.revision}"`);
        response.setHeader("X-Content-Type-Options", "nosniff");
        if (request.method === "HEAD") response.end();
        else response.end(bytes);
      } catch (error) {
        const status = error instanceof ProjectLibraryError
          ? error.status
          : error instanceof Error && "code" in error && error.code === "ENOENT"
            ? 404
            : 400;
        sendJson(response, status, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    },
  };
}
