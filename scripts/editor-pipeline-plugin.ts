import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";
import {
  createOpenScadRenderer,
  generatePanelBoundaryParts,
} from "../src/cad/GeneratePanelBoundaryParts.ts";
import { createPanelAssemblyProject } from "../src/sculpture/PanelAssembly.ts";
import { regenerateMechanicalShell } from "../src/sculpture/MechanicalShellRegenerator.ts";

const MAX_REQUEST_BYTES = 5 * 1024 * 1024;

async function readJsonRequest(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) throw new Error("Sculpture JSON exceeds 5 MB.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function run(command: string, args: string[], rootDirectory: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: rootDirectory,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise(output);
      else reject(new Error(output || `${command} exited with ${code}.`));
    });
  });
}

/** Local-only Vite endpoint used by the editor.s explicit 3D print generation button. */
export function editorPipelinePlugin(): Plugin {
  let pipelineRunning = false;
  return {
    name: "editor-sculpture-pipeline",
    configureServer(server) {
      server.middlewares.use("/api/editor-pipeline", async (request, response) => {
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end(JSON.stringify({ error: "Use POST." }));
          return;
        }
        if (pipelineRunning) {
          response.statusCode = 409;
          response.end(JSON.stringify({ error: "Another 3D print generation is running." }));
          return;
        }
        pipelineRunning = true;
        try {
          const input = await readJsonRequest(request);
          if (typeof input !== "object" || input === null || Array.isArray(input)) {
            throw new Error("Sculpture JSON must be an object.");
          }
          let definition = structuredClone(input) as Record<string, unknown>;
          const sourceId = definition.id;
          const profile = definition.panelProfile;
          if (
            typeof sourceId !== "string" ||
            !/^[a-z0-9][a-z0-9-]{0,80}$/.test(sourceId) ||
            typeof profile !== "object" ||
            profile === null ||
            Array.isArray(profile) ||
            typeof (profile as Record<string, unknown>).id !== "string" ||
            !/^[a-z0-9][a-z0-9-]{0,80}$/.test(
              (profile as Record<string, unknown>).id as string,
            )
          ) {
            throw new Error("Sculpture and panel-profile IDs must be lowercase URL-safe slugs.");
          }
          const rootDirectory = process.cwd();
          const runId = `${sourceId.slice(0, 60)}-editor-preview`;
          const canDetectPanelBoundary =
            definition.boundaryTopology === undefined &&
            definition.manualMechanics === undefined &&
            definition.mechanicalShell === undefined &&
            Array.isArray(definition.panels) && definition.panels.length > 0;
          if (
            definition.boundaryTopology !== undefined || canDetectPanelBoundary
          ) {
            const project = createPanelAssemblyProject(
              definition,
              "editor-request.json",
            );
            const result = await generatePanelBoundaryParts(project, {
              rootDirectory,
              outputDirectory: `web/public/generated-projects/${runId}`,
              panelProfileSource:
                `../../catalog/panels/${(profile as Record<string, unknown>).id}.json`,
              renderScad: createOpenScadRenderer(rootDirectory),
            });
            response.statusCode = 200;
            response.end(JSON.stringify({
              ok: true,
              assetSculptureId: runId,
              definition: result.definition,
              projectSource:
                `./generated-projects/${runId}/sculpture.json`,
              log:
                `Generated and SHA-256 verified ${result.partAssets.length} exact printable STL files; boundary ${result.boundaryAsset.sha256.slice(0, 12)}… and manifest published atomically.`,
            }));
            return;
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
            `../../../catalog/panels/${(profile as Record<string, unknown>).id}.json`;

          const relativeSource = `build/editor-projects/${runId}/sculpture.json`;
          const absoluteSource = resolve(rootDirectory, relativeSource);
          await mkdir(dirname(absoluteSource), { recursive: true });
          await writeFile(absoluteSource, `${JSON.stringify(definition, null, 2)}\n`, "utf8");

          const npm = process.platform === "win32" ? "npm.cmd" : "npm";
          const generationLog = await run(
            npm,
            ["run", "generate:sculpture", "--", "--sculpture", relativeSource],
            rootDirectory,
          );
          const renderLog = await run(
            npm,
            [
              "run",
              "verify:sculpture",
              "--",
              "--sculpture",
              relativeSource,
              "--ephemeral",
            ],
            rootDirectory,
          );
          response.statusCode = 200;
          response.end(JSON.stringify({
            ok: true,
            assetSculptureId: runId,
            definition: regeneratedDefinition,
            source: relativeSource,
            log: `${generationLog}${renderLog}`.trim(),
          }));
        } catch (error) {
          response.statusCode = 400;
          response.end(JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }));
        } finally {
          pipelineRunning = false;
        }
      });
    },
  };
}
