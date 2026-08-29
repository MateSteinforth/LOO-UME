import { closeSync, createReadStream, mkdirSync, openSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { extname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createEditorPipelineHandler,
  isLoopbackHost,
  type EditorPipelineHandler,
} from "./editor-pipeline-handler.ts";
import {
  createEsp32DeviceHandler,
  type Esp32DeviceHandler,
} from "./esp32-device-handler.ts";
import {
  createEsp32FirmwareHandler,
  type Esp32FirmwareHandler,
} from "./esp32-firmware-handler.ts";
import {
  createProjectLibraryHandler,
  type ProjectLibraryHandler,
} from "./project-library-handler.ts";
import {
  createArtNetPreviewHandler,
  type ArtNetPreviewHandler,
} from "./artnet-preview-handler.ts";
import {
  createApplicationUpdateHandler,
  type ApplicationUpdateHandler,
} from "./application-update-handler.ts";

const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".stl": "model/stl",
  ".wasm": "application/wasm",
});

const GENERATED_PREFIXES = [
  "/generated-projects/",
  "/generated-cad/",
  "/generated-previews/",
] as const;

export interface LocalEditorServerOptions {
  rootDirectory?: string;
  distDirectory?: string;
  generatedPublicDirectory?: string;
  host?: "127.0.0.1";
  port?: number;
  pipelineHandler?: EditorPipelineHandler;
  firmwareHandler?: Esp32FirmwareHandler;
  deviceHandler?: Esp32DeviceHandler;
  projectLibraryHandler?: ProjectLibraryHandler;
  artNetPreviewHandler?: ArtNetPreviewHandler;
  applicationUpdateHandler?: ApplicationUpdateHandler;
  onApplicationUpdateApplied?: () => void;
}

export interface LocalEditorServer {
  readonly server: Server;
  readonly host: string;
  readonly port: number;
  readonly url: string;
  readonly pipelineHandler: EditorPipelineHandler;
  readonly projectLibraryHandler: ProjectLibraryHandler;
  readonly applicationUpdateHandler: ApplicationUpdateHandler;
  close(gracePeriodMs?: number): Promise<void>;
}

function sendText(response: ServerResponse, statusCode: number, text: string): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(text);
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`));
}

async function findStaticFile(
  requestPath: string,
  distDirectory: string,
  generatedPublicDirectory: string,
): Promise<{ path: string; generated: boolean } | undefined> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    throw new Error("Malformed URL encoding.");
  }
  if (decoded.includes("\0") || decoded.includes("\\")) {
    throw new Error("Unsafe static path.");
  }
  const generatedPrefix = GENERATED_PREFIXES.find((prefix) =>
    decoded.startsWith(prefix)
  );
  const root = generatedPrefix ? generatedPublicDirectory : distDirectory;
  const relativePath = decoded === "/"
    ? "index.html"
    : decoded.replace(/^\/+/, "");
  const candidate = resolve(root, relativePath);
  if (!isInside(root, candidate)) throw new Error("Unsafe static path.");
  try {
    const [canonicalRoot, canonicalCandidate] = await Promise.all([
      realpath(root),
      realpath(candidate),
    ]);
    if (!isInside(canonicalRoot, canonicalCandidate)) {
      throw new Error("Unsafe static path.");
    }
    const metadata = await stat(canonicalCandidate);
    if (!metadata.isFile()) return undefined;
    return { path: canonicalCandidate, generated: generatedPrefix !== undefined };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function serveStatic(
  request: IncomingMessage,
  response: ServerResponse,
  distDirectory: string,
  generatedPublicDirectory: string,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendText(response, 405, "Use GET or HEAD.");
    return;
  }
  let file: Awaited<ReturnType<typeof findStaticFile>>;
  try {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    file = await findStaticFile(pathname, distDirectory, generatedPublicDirectory);
  } catch {
    sendText(response, 400, "Invalid static path.");
    return;
  }
  if (!file) {
    sendText(response, 404, "Not found.");
    return;
  }
  response.statusCode = 200;
  response.setHeader(
    "Content-Type",
    CONTENT_TYPES[extname(file.path).toLowerCase()] ?? "application/octet-stream",
  );
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", file.generated ? "no-store" : "no-cache");
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(file.path).on("error", () => response.destroy()).pipe(response);
}

function listen(server: Server, port: number, host: string): Promise<AddressInfo> {
  return new Promise((resolvePromise, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolvePromise(server.address() as AddressInfo);
    });
  });
}

export async function startLocalEditorServer(
  options: LocalEditorServerOptions = {},
): Promise<LocalEditorServer> {
  const rootDirectory = resolve(options.rootDirectory ?? process.cwd());
  const distDirectory = resolve(options.distDirectory ?? resolve(rootDirectory, "dist"));
  const generatedPublicDirectory = resolve(
    options.generatedPublicDirectory ?? resolve(rootDirectory, "web/public"),
  );
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4173;
  await stat(resolve(distDirectory, "index.html")).catch(() => {
    throw new Error("The production UI is missing. Run the desktop build command first.");
  });
  const pipelineHandler = options.pipelineHandler ??
    await createEditorPipelineHandler({
      rootDirectory,
      generatedPublicDirectory,
    });
  const firmwareHandler = options.firmwareHandler ??
    createEsp32FirmwareHandler({ rootDirectory });
  const deviceHandler = options.deviceHandler ?? createEsp32DeviceHandler();
  const projectLibraryHandler = options.projectLibraryHandler ??
    createProjectLibraryHandler({ rootDirectory });
  const artNetPreviewHandler = options.artNetPreviewHandler ??
    createArtNetPreviewHandler();
  const applicationUpdateHandler = options.applicationUpdateHandler ??
    createApplicationUpdateHandler({
      rootDirectory,
      onUpdateApplied: options.onApplicationUpdateApplied,
    });
  const sockets = new Set<Socket>();
  const server = createServer((request, response) => {
    void (async () => {
      if (!isLoopbackHost(request.headers.host)) {
        sendText(response, 403, "The local server accepts only loopback Host values.");
        return;
      }
      if (await projectLibraryHandler.handle(request, response)) return;
      if (await firmwareHandler.handle(request, response)) return;
      if (await deviceHandler.handle(request, response)) return;
      if (await artNetPreviewHandler.handle(request, response)) return;
      if (await applicationUpdateHandler.handle(request, response)) return;
      if (await pipelineHandler.handle(request, response)) return;
      await serveStatic(request, response, distDirectory, generatedPublicDirectory);
    })().catch((error) => {
      if (!response.headersSent) {
        sendText(
          response,
          500,
          error instanceof Error ? error.message : "Internal server error.",
        );
      } else {
        response.destroy();
      }
    });
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 10 * 60_000;
  server.keepAliveTimeout = 5_000;
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  const address = await listen(server, port, host);
  let closing: Promise<void> | undefined;
  return {
    server,
    host,
    port: address.port,
    url: `http://${host}:${address.port}/`,
    pipelineHandler,
    projectLibraryHandler,
    applicationUpdateHandler,
    close(gracePeriodMs = 2_000) {
      if (closing) return closing;
      closing = (async () => {
        const closed = new Promise<void>((resolvePromise) => {
          server.close(() => resolvePromise());
          server.closeIdleConnections?.();
        });
        await pipelineHandler.close(gracePeriodMs);
        await artNetPreviewHandler.close();
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          closed,
          new Promise<void>((resolvePromise) => {
            timer = setTimeout(resolvePromise, gracePeriodMs);
          }),
        ]);
        if (timer) clearTimeout(timer);
        for (const socket of sockets) socket.destroy();
        server.closeAllConnections?.();
      })();
      return closing;
    },
  };
}

function parsePort(value: string | undefined): number {
  if (value === undefined) return 4173;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("ORBITAL_LAB_PORT must be an integer from 1 through 65535.");
  }
  return port;
}

export function localBrowserCommand(
  platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
): readonly string[] | undefined {
  if (platform === "darwin") return ["/usr/bin/open"];
  if (
    platform === "linux" &&
    (environment.DISPLAY || environment.WAYLAND_DISPLAY)
  ) return ["/usr/bin/xdg-open"];
  return undefined;
}

export async function openLocalEditorBrowser(url: string): Promise<boolean> {
  const command = localBrowserCommand();
  if (!command) return false;
  return await new Promise<boolean>((resolvePromise) => {
    const child = spawn(command[0]!, [...command.slice(1), url], {
      stdio: "ignore",
    });
    child.once("error", () => resolvePromise(false));
    child.once("close", (code) => resolvePromise(code === 0));
  });
}

async function main(): Promise<void> {
  const argumentsList = process.argv.slice(2);
  const openBrowser = argumentsList.length === 1 &&
    argumentsList[0] === "--open-browser";
  if (argumentsList.length > (openBrowser ? 1 : 0)) {
    throw new Error("Use scripts/local-editor-server.ts [--open-browser].");
  }
  let localServer: LocalEditorServer;
  const restartAfterUpdate = (): void => {
    void localServer.close().then(() => {
      const toolsDirectory = resolve(process.cwd(), ".tools");
      mkdirSync(toolsDirectory, { recursive: true, mode: 0o700 });
      const log = openSync(resolve(toolsDirectory, "application-update.log"), "a", 0o600);
      const child = spawn(
        "/bin/sh",
        [resolve(process.cwd(), "bootstrap.sh"), "launch"],
        { cwd: process.cwd(), detached: true, stdio: ["ignore", log, log] },
      );
      child.unref();
      closeSync(log);
    });
  };
  localServer = await startLocalEditorServer({
    port: parsePort(process.env.ORBITAL_LAB_PORT),
    onApplicationUpdateApplied: restartAfterUpdate,
  });
  console.log(`LOO/UME is available at ${localServer.url}`);
  if (openBrowser) {
    const opened = await openLocalEditorBrowser(localServer.url);
    if (opened) {
      console.log("Opened LOO/UME in the local browser.");
    } else {
      console.log(`Open ${localServer.url} in a browser on this computer.`);
    }
  }
  const status = localServer.pipelineHandler.generatorStatus;
  const writeStatus = status.available ? console.log : console.warn;
  writeStatus(status.message);
  let stopping = false;
  const stop = (signal: NodeJS.Signals): void => {
    if (stopping) {
      process.exitCode = 1;
      localServer.server.closeAllConnections?.();
      return;
    }
    stopping = true;
    console.log(`Received ${signal}. Stopping the local server.`);
    void localServer.close().then(() => {
      process.exitCode = 0;
    });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

const entrypoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (entrypoint === import.meta.url) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
