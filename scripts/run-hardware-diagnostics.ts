import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createPanelAssemblyMapping } from "../src/sculpture/PanelAssembly.ts";
import { loadPanelAssemblyProjectFromFile } from "../src/sculpture/LoadPanelAssemblyProject.ts";
import { sculptureJson } from "../src/sculpture/SculptureEditor.ts";
import {
  createWledDiagnosticPlan,
  sendWledDiagnosticRequest,
} from "../src/wled/DiagnosticFrames.ts";
import { createWledDeploymentBundle } from "../src/wled/DeploymentContract.ts";
import { createHardwareMappingContract } from "../web/src/HardwareMapping.ts";
import { createProvisionalWiringPreview } from "../web/src/WiringPreview.ts";

function flagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

function positiveInteger(flag: string, fallback: number): number {
  const value = flagValue(flag);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} requires a non-negative integer.`);
  }
  return parsed;
}

const rootDirectory = process.cwd();
const project = await loadPanelAssemblyProjectFromFile(
  "sculptures/rhombicosidodecahedron/sculpture.json",
  rootDirectory,
);
const geometry = createPanelAssemblyMapping(project);
const wiring = createProvisionalWiringPreview(
  geometry,
  project.sculpture,
  project.panelProfile,
);
const contract = createHardwareMappingContract(geometry, wiring, project.panelProfile);
const deployment = createWledDeploymentBundle(
  contract,
  sculptureJson(project.sculpture),
  "installation",
);
const plan = createWledDiagnosticPlan(contract, deployment.deploymentIdentity);
const output = resolve(
  rootDirectory,
  flagValue("--output") ?? "build/hardware-diagnostics/diagnostic-plan.json",
);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(plan, null, 2) + "\n", "utf8");
console.log(
  `Wrote ${plan.frames.length} one-pixel diagnostic frames with plan ` +
    `${plan.planFingerprint} to ${output}.`,
);

const host = flagValue("--host");
if (host !== undefined) {
  if (!process.argv.includes("--confirm-one-pixel-output")) {
    throw new Error(
      "Sending requires --confirm-one-pixel-output after the fused-panel smoke test passes.",
    );
  }
  const start = positiveInteger("--start", 0);
  const count = positiveInteger("--count", 1);
  if (start + count > plan.frames.length) {
    throw new Error("Requested diagnostic frame range is outside the plan.");
  }
  await sendWledDiagnosticRequest(plan.resetRequestBytes, { baseUrl: host });
  for (const frame of plan.frames.slice(start, start + count)) {
    await sendWledDiagnosticRequest(frame.requestBytes, { baseUrl: host });
    console.log(
      `Frame ${frame.sequence}: output ${frame.outputIndex + 1} GPIO ${frame.gpio}, ` +
        `${frame.panelId} (${frame.panelPixelX},${frame.panelPixelY}), logical ` +
        `${frame.logicalIndex}, physical ${frame.physicalIndex}, ${frame.rgbChannel}.`,
    );
  }
}
