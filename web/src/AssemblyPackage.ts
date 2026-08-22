import { zipSync } from "fflate";
import type { PanelAssemblyDefinition } from "../../src/sculpture/PanelAssembly.ts";
import type { HardwareMappingContract } from "./HardwareMapping.ts";
import {
  createPortableProjectFiles,
  portableProjectFolderName,
} from "./PortableProject.ts";
import type { WiringPreview } from "./WiringPreview.ts";

export interface AssemblyPackageArtifacts {
  assemblyManualHtml: string;
  ledmap: unknown;
  wiringReview: unknown;
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value, null, 2) + "\n");
}

export function createWiringReview(
  definition: PanelAssemblyDefinition,
  contract: HardwareMappingContract,
  preview: WiringPreview,
): Record<string, unknown> {
  return {
    schemaVersion: "1.0.0",
    sculptureId: definition.id,
    status: preview.status,
    routeSource: preview.routeSource,
    savedOutputPanelIds: preview.savedOutputPanelIds,
    fingerprint: contract.fingerprint,
    outputs: contract.outputs,
    wiring: preview,
    readiness: contract.readiness,
  };
}

export function createAssemblyPackageFiles(
  definition: PanelAssemblyDefinition,
  availableAssets: ReadonlyMap<string, Uint8Array>,
  artifacts: AssemblyPackageArtifacts,
): Map<string, Uint8Array> {
  const files = createPortableProjectFiles(definition, availableAssets);
  files.set(
    "assembly-manual.html",
    new TextEncoder().encode(artifacts.assemblyManualHtml),
  );
  files.set("ledmap.json", jsonBytes(artifacts.ledmap));
  files.set("wiring-review.json", jsonBytes(artifacts.wiringReview));
  return files;
}

export function createAssemblyPackageZip(
  definition: PanelAssemblyDefinition,
  availableAssets: ReadonlyMap<string, Uint8Array>,
  artifacts: AssemblyPackageArtifacts,
  folderName = portableProjectFolderName(definition),
): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, bytes] of createAssemblyPackageFiles(
    definition,
    availableAssets,
    artifacts,
  )) {
    entries[`${folderName}/${path}`] = Uint8Array.from(bytes);
  }
  return zipSync(entries, {
    level: 6,
    mtime: new Date("1980-01-01T00:00:00.000Z"),
  });
}
