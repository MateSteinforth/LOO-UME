import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startLocalEditorServer } from "./local-editor-server.ts";
import {
  resolveManagedOpenScadCommand,
} from "../src/cad/OpenScadDistribution.ts";
import {
  createOpenScadRuntime,
  type OpenScadRuntime,
} from "../src/cad/OpenScadRuntime.ts";
import {
  parsePanelAssemblyDefinition,
} from "../src/sculpture/PanelAssembly.ts";

const rootDirectory = process.cwd();
const fixturePath = resolve(
  rootDirectory,
  "sculptures/panel-outline-prism/sculpture.json",
);
const originalOverride = process.env.OPENSCAD;
const originalPath = process.env.PATH;
let runtime: OpenScadRuntime | undefined;
let server: Awaited<ReturnType<typeof startLocalEditorServer>> | undefined;

try {
  delete process.env.OPENSCAD;
  process.env.PATH = "";

  const managed = resolveManagedOpenScadCommand(rootDirectory);
  if (!managed) {
    throw new Error(
      "The native receipt-backed OpenSCAD installation is unavailable. Run npm run setup:openscad.",
    );
  }
  const expectedTargetId = `${process.platform}-${process.arch}`;
  const configuredTargetId = process.env.EXPECTED_OPENSCAD_TARGET?.trim();
  if (configuredTargetId && configuredTargetId !== expectedTargetId) {
    throw new Error(
      `EXPECTED_OPENSCAD_TARGET is ${configuredTargetId}, but this native process is ${expectedTargetId}.`,
    );
  }
  if (managed.targetId !== expectedTargetId) {
    throw new Error(
      `Managed OpenSCAD selected ${managed.targetId}, but this native process requires ${expectedTargetId}.`,
    );
  }

  runtime = await createOpenScadRuntime(rootDirectory);
  if (
    !runtime.status.available ||
    runtime.status.detectedVersion !== managed.expectedVersion ||
    runtime.status.supportedVersion !== managed.expectedVersion
  ) {
    throw new Error(
      `Managed OpenSCAD verification failed: ${runtime.status.message}`,
    );
  }

  server = await startLocalEditorServer({
    rootDirectory,
    port: 0,
    openScadRuntime: runtime,
  });

  const page = await fetch(server.url);
  if (!page.ok || !(await page.text()).includes("WLED Orbital Lab")) {
    throw new Error(
      "The production local server did not serve WLED Orbital Lab.",
    );
  }

  const statusResponse = await fetch(`${server.url}api/generator-status`);
  const status = await statusResponse.json() as Record<string, unknown>;
  if (
    status.schemaVersion !== "1.0.0" ||
    status.message !==
      `OpenSCAD ${managed.expectedVersion} is ready for local generation.` ||
    Object.keys(status).sort().join(",") !==
      "available,detectedVersion,generator,message,schemaVersion,supportedVersion" ||
    !statusResponse.ok ||
    status.available !== true ||
    status.generator !== "openscad" ||
    status.supportedVersion !== managed.expectedVersion ||
    status.detectedVersion !== managed.expectedVersion
  ) {
    throw new Error(
      `The local server published an invalid generator status: ${JSON.stringify(status)}.`,
    );
  }

  const fixture = await readFile(fixturePath, "utf8");
  const origin = server.url.slice(0, -1);
  const generationResponse = await fetch(`${server.url}api/editor-pipeline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: fixture,
  });
  if (!generationResponse.ok) {
    throw new Error(
      `The production generation request failed (${generationResponse.status}): ${await generationResponse.text()}`,
    );
  }
  const result = await generationResponse.json() as {
    ok?: boolean;
    projectSource?: string;
    definition?: unknown;
  };
  if (result.ok !== true || typeof result.projectSource !== "string") {
    throw new Error("The production generation response is incomplete.");
  }

  const definition = parsePanelAssemblyDefinition(result.definition);
  const parts = definition.generatedMechanics?.parts ?? [];
  if (parts.length !== 2) {
    throw new Error(
      `Expected the canonical project to publish two STL parts; got ${parts.length}.`,
    );
  }
  const projectResponse = await fetch(new URL(result.projectSource, server.url));
  if (!projectResponse.ok) {
    throw new Error(
      "The production local server did not serve the generated project.",
    );
  }
  parsePanelAssemblyDefinition(await projectResponse.json());

  const projectDirectory = result.projectSource.slice(
    0,
    -"sculpture.json".length,
  );
  for (const part of parts) {
    const partResponse = await fetch(new URL(
      `${projectDirectory}${part.source}`,
      server.url,
    ));
    const bytes = await partResponse.arrayBuffer();
    if (!partResponse.ok || bytes.byteLength === 0) {
      throw new Error(
        `The production local server did not serve ${part.source}.`,
      );
    }
  }

  const servedUrl = server.url;
  await server.close();
  server = undefined;
  runtime = undefined;
  try {
    await fetch(servedUrl);
    throw new Error(
      "The production local server still accepts requests after shutdown.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "The production local server still accepts requests after shutdown."
    ) throw error;
  }

  console.log(
    `Verified ${managed.targetId} OpenSCAD ${managed.expectedVersion}: production status, two-STL generation, static serving, and clean shutdown passed.`,
  );
} finally {
  await server?.close();
  await runtime?.close();
  if (originalOverride === undefined) delete process.env.OPENSCAD;
  else process.env.OPENSCAD = originalOverride;
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
}
