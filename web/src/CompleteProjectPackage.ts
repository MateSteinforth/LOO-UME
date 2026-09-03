import { unzipSync, zipSync } from "fflate";
import type { PanelAssemblyDefinition } from "../../src/sculpture/PanelAssembly.ts";
import { sha256Bytes } from "../../src/sculpture/GeneratedMechanics.ts";
import { createWledDeploymentBundle } from "../../src/wled/DeploymentContract.ts";
import type { VerifiedGeneratedMechanics } from "./GeneratedMechanicsAssets.ts";
import type { VerifiedGeneratedStructure } from "./GeneratedStructuralAssets.ts";
import type { HardwareMappingContract } from "./HardwareMapping.ts";
import { createMadMapperPackageFiles } from "./MadMapperPackage.ts";
import {
  createProjectPackageManifest,
  createProjectThumbnailSvg,
  PROJECT_PACKAGE_RENDERED_THUMBNAIL,
  type ProjectPackageThumbnail,
} from "./ProjectPackage.ts";
import {
  createPortableProjectFiles,
  portableProjectFolderName,
} from "./PortableProject.ts";
import {
  createTouchDesignerPackageFiles,
} from "./TouchDesignerPackage.ts";
import {
  createFabricationPackageZip,
} from "./FabricationPackage.ts";

const encoder = new TextEncoder();

export interface CompleteProjectPackageArtifacts {
  assemblyManualHtml: string;
  manufacturingManualPdf: Uint8Array;
  hardwareContract: HardwareMappingContract;
  wiringReview: unknown;
  mechanics?: Pick<VerifiedGeneratedMechanics, "boundary" | "parts">;
  structure?: Pick<VerifiedGeneratedStructure, "artifacts">;
  thumbnail?: ProjectPackageThumbnail;
}

export interface CompletePackageArtifactRecord {
  status: "included" | "unavailable";
  reason?: string;
}

export interface CompleteProjectPackageManifest {
  schemaVersion: "1.0.0";
  generator: "loo-ume-complete-project-package";
  sculptureId: string;
  mappingFingerprint: string;
  pixelCount: number;
  artifacts: {
    editableProject: CompletePackageArtifactRecord;
    fabrication: CompletePackageArtifactRecord & {
      mechanics: "included" | "unavailable";
      structure: "included" | "unavailable";
    };
    mapping: CompletePackageArtifactRecord;
    wled: CompletePackageArtifactRecord & {
      mode?: "diagnostic" | "installation";
      deploymentIdentity?: string;
    };
    madMapper: CompletePackageArtifactRecord;
    touchDesigner: CompletePackageArtifactRecord;
  };
  files: Array<{ path: string; byteLength: number; sha256: string }>;
}

function jsonBytes(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value, null, 2) + "\n");
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function addFile(
  files: Map<string, Uint8Array>,
  path: string,
  bytes: Uint8Array,
): void {
  if (files.has(path)) {
    throw new Error(`Complete project package contains duplicate path ${path}.`);
  }
  files.set(path, Uint8Array.from(bytes));
}

function addFiles(
  target: Map<string, Uint8Array>,
  prefix: string,
  additions: ReadonlyMap<string, Uint8Array> | Record<string, Uint8Array>,
): void {
  const entries = [...(additions instanceof Map
    ? additions.entries()
    : Object.entries(additions))];
  for (const [path] of entries) {
    if (target.has(`${prefix}${path}`)) {
      throw new Error(`Complete project package contains duplicate path ${prefix}${path}.`);
    }
  }
  for (const [path, bytes] of entries) {
    target.set(`${prefix}${path}`, Uint8Array.from(bytes));
  }
}

export function createCompleteProjectPackageFiles(
  definition: PanelAssemblyDefinition,
  availableAssets: ReadonlyMap<string, Uint8Array>,
  artifacts: CompleteProjectPackageArtifacts,
): Map<string, Uint8Array> {
  const files = createPortableProjectFiles(definition, availableAssets);
  const sculptureBytes = files.get("sculpture.json")!;
  const sculptureText = new TextDecoder().decode(sculptureBytes);
  const projectManifest = createProjectPackageManifest(definition, sculptureBytes);
  if (artifacts.thumbnail?.mediaType === "image/png") {
    projectManifest.thumbnail = PROJECT_PACKAGE_RENDERED_THUMBNAIL;
  }
  addFile(files, "manifest.json", jsonBytes(projectManifest));
  addFile(
    files,
    projectManifest.thumbnail,
    artifacts.thumbnail?.bytes ?? createProjectThumbnailSvg(definition),
  );
  addFile(files, "assembly-manual.html", encoder.encode(artifacts.assemblyManualHtml));
  addFile(files, "mapping/hardware-contract.json", jsonBytes({
    schemaVersion: "1.0.0",
    fingerprint: artifacts.hardwareContract.fingerprint,
    fingerprintVersion: artifacts.hardwareContract.fingerprintVersion,
    mapping: artifacts.hardwareContract.mapping,
    ledmap: artifacts.hardwareContract.ledmap,
    outputs: artifacts.hardwareContract.outputs,
    readiness: artifacts.hardwareContract.readiness,
  }));
  addFile(files, "mapping/wiring-review.json", jsonBytes(artifacts.wiringReview));

  const fabricationRecord: CompleteProjectPackageManifest["artifacts"]["fabrication"] = {
    status: "included",
    mechanics: artifacts.mechanics ? "included" : "unavailable",
    structure: artifacts.structure ? "included" : "unavailable",
  };
  try {
    addFiles(files, "fabrication/", unzipSync(createFabricationPackageZip(
      definition.panels.map((panel) => panel.id),
      {
        manufacturingManualPdf: artifacts.manufacturingManualPdf,
      },
    )));
  } catch (error) {
    fabricationRecord.status = "unavailable";
    fabricationRecord.reason = message(error);
  }

  const wledRecord: CompleteProjectPackageManifest["artifacts"]["wled"] = {
    status: "unavailable",
  };
  try {
    const deployment = createWledDeploymentBundle(
      artifacts.hardwareContract,
      sculptureText,
    );
    addFiles(files, "", new Map(
      [...deployment.files].map(([path, text]) => [path, encoder.encode(text)]),
    ));
    wledRecord.status = "included";
    wledRecord.mode = deployment.mode;
    wledRecord.deploymentIdentity = deployment.deploymentIdentity;
  } catch (error) {
    wledRecord.reason = message(error);
  }

  const madMapperRecord: CompletePackageArtifactRecord = {
    status: "unavailable",
  };
  try {
    addFiles(
      files,
      "madmapper/",
      createMadMapperPackageFiles(artifacts.hardwareContract, definition.id),
    );
    madMapperRecord.status = "included";
  } catch (error) {
    madMapperRecord.reason = message(error);
  }

  const touchDesignerRecord: CompletePackageArtifactRecord = {
    status: "unavailable",
  };
  try {
    addFiles(
      files,
      "touchdesigner/",
      createTouchDesignerPackageFiles(
        artifacts.hardwareContract,
        sculptureText,
      ),
    );
    touchDesignerRecord.status = "included";
  } catch (error) {
    touchDesignerRecord.reason = message(error);
  }

  const packageManifest: CompleteProjectPackageManifest = {
    schemaVersion: "1.0.0",
    generator: "loo-ume-complete-project-package",
    sculptureId: definition.id,
    mappingFingerprint: artifacts.hardwareContract.fingerprint,
    pixelCount: artifacts.hardwareContract.mapping.entries.length,
    artifacts: {
      editableProject: { status: "included" },
      fabrication: fabricationRecord,
      mapping: { status: "included" },
      wled: wledRecord,
      madMapper: madMapperRecord,
      touchDesigner: touchDesignerRecord,
    },
    files: [...files.entries()]
      .map(([path, bytes]) => ({
        path,
        byteLength: bytes.byteLength,
        sha256: sha256Bytes(bytes),
      }))
      .sort((first, second) => first.path < second.path ? -1 : 1),
  };
  addFile(files, "package-manifest.json", jsonBytes(packageManifest));
  return files;
}

export function createCompleteProjectPackageZip(
  definition: PanelAssemblyDefinition,
  availableAssets: ReadonlyMap<string, Uint8Array>,
  artifacts: CompleteProjectPackageArtifacts,
  folderName = portableProjectFolderName(definition),
): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, bytes] of createCompleteProjectPackageFiles(
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
