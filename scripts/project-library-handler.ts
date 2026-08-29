import { createHash } from "node:crypto";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
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
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        sendJson(response, 405, { error: "Use GET or HEAD." });
        return true;
      }
      if (pathname === "/api/project-library") {
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
        const status = error instanceof Error && "code" in error && error.code === "ENOENT"
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
