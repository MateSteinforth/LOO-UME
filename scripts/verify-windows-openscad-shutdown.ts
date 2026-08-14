import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { resolveManagedOpenScadCommand } from "../src/cad/OpenScadDistribution.ts";
import {
  createOpenScadRuntime,
  type OpenScadRuntime,
} from "../src/cad/OpenScadRuntime.ts";

const execFileAsync = promisify(execFile);
const rootDirectory = process.cwd();
const expectedTarget = "win32-x64";
const outputDirectory = resolve(rootDirectory, "build/verify windows openscad shutdown");
const inputScad = join(outputDirectory, "slow bounded render.scad");
const outputStl = join(outputDirectory, "slow bounded render.stl");
const systemRoot = process.env.SystemRoot;
const originalOverride = process.env.OPENSCAD;
const originalPath = process.env.PATH;
let runtime: OpenScadRuntime | undefined;

if (process.platform !== "win32") {
  throw new Error("The active OpenSCAD shutdown proof runs only on Windows.");
}
if (process.env.EXPECTED_OPENSCAD_TARGET !== expectedTarget) {
  throw new Error(`EXPECTED_OPENSCAD_TARGET must be ${expectedTarget} for this proof.`);
}
if (!systemRoot) {
  throw new Error("SystemRoot is required to run the standard Windows task list tool.");
}

const tasklist = join(systemRoot, "System32", "tasklist.exe");

async function listOpenScadProcesses(): Promise<string[]> {
  const names = ["openscad.com", "openscad.exe"];
  const active: string[] = [];
  for (const name of names) {
    const { stdout } = await execFileAsync(
      tasklist,
      ["/FI", `IMAGENAME eq ${name}`, "/FO", "CSV", "/NH"],
      { encoding: "utf8", windowsHide: true },
    );
    if (stdout.toLowerCase().includes(`"${name}"`)) active.push(name);
  }
  return active;
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
}

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolvePromise, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function waitForActiveRender(
  renderSettled: () => boolean,
  timeoutMs: number,
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (renderSettled()) {
      throw new Error("The bounded render finished before shutdown could be proved.");
    }
    const active = await listOpenScadProcesses();
    if (active.includes("openscad.exe")) {
      await wait(300);
      const confirmed = await listOpenScadProcesses();
      if (confirmed.includes("openscad.exe") && !renderSettled()) return confirmed;
    }
    await wait(100);
  }
  throw new Error("A real OpenSCAD render did not stay active within 10 seconds.");
}

async function waitForNoOpenScadProcesses(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await listOpenScadProcesses()).length === 0) return;
    await wait(100);
  }
  const active = await listOpenScadProcesses();
  throw new Error(`OpenSCAD processes remained after close: ${active.join(", ")}.`);
}

try {
  delete process.env.OPENSCAD;
  process.env.PATH = "";

  const managed = resolveManagedOpenScadCommand(rootDirectory);
  if (!managed || managed.targetId !== expectedTarget) {
    throw new Error(`A valid receipt-backed ${expectedTarget} OpenSCAD install is required.`);
  }
  const before = await listOpenScadProcesses();
  if (before.length > 0) {
    throw new Error(`OpenSCAD was already active before the proof: ${before.join(", ")}.`);
  }

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    inputScad,
    `$fn = 48;\nrender(convexity = 10) union() {\n  for (x = [0:27], y = [0:27], z = [0:3])\n    translate([x * 3, y * 3, z * 3]) sphere(r = 1.2);\n}\n`,
    "utf8",
  );

  runtime = await createOpenScadRuntime(rootDirectory);
  if (!runtime.status.available || runtime.status.detectedVersion !== managed.expectedVersion) {
    throw new Error(`Managed OpenSCAD is not ready: ${runtime.status.message}`);
  }

  let renderSettled = false;
  const renderResult = runtime.render(inputScad, outputStl).then(
    () => {
      renderSettled = true;
      return { rejected: false };
    },
    () => {
      renderSettled = true;
      return { rejected: true };
    },
  );

  const active = await waitForActiveRender(() => renderSettled, 10_000);
  await withTimeout(
    runtime.close(1_000),
    10_000,
    "OpenSCAD runtime close did not finish within 10 seconds.",
  );
  const result = await withTimeout(
    renderResult,
    5_000,
    "The active render promise did not settle after runtime close.",
  );
  if (!result.rejected) {
    throw new Error("The active render resolved after runtime close; rejection was required.");
  }
  await waitForNoOpenScadProcesses(10_000);

  console.log(
    `Verified ${managed.targetId} active-render shutdown: ${active.join(", ")} was active, close rejected the render, and no OpenSCAD process remained.`,
  );
} finally {
  await runtime?.close(250);
  await rm(outputDirectory, { recursive: true, force: true });
  if (originalOverride === undefined) delete process.env.OPENSCAD;
  else process.env.OPENSCAD = originalOverride;
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
}
