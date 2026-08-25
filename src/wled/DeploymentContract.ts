import { sha256Text } from "../sculpture/GeneratedMechanics.ts";
import type { HardwareMappingContract } from "../../web/src/HardwareMapping.ts";
import firmwareReceipt from "../../firmware/build-receipt.json" with {
  type: "json",
};
import smokeConfig from "../../firmware/one-panel-smoke-cfg.json" with {
  type: "json",
};

const WLED_COMMIT = "d9b9a846561227351ad929e3109781daadb7bed2";
const EXPECTED_GPIOS = [16, 17, 18, 19];
const EXPECTED_STARTS = [0, 704, 1344, 1984];
const EXPECTED_LENGTHS = [704, 640, 640, 640];
const INSTALLATION_PATHS = {
  config: "wled/cfg.json",
  ledmap: "wled/ledmap.json",
  routeMapping: "wled/route-mapping-manifest.json",
  smokeConfig: "wled/one-panel-smoke-cfg.json",
  firmwareReceipt: "wled/firmware-build-receipt.json",
  manifest: "wled/deployment-manifest.json",
} as const;
const DIAGNOSTIC_PATHS = {
  ledmap: "wled/diagnostic/ledmap.diagnostic.json",
  routeMapping: "wled/diagnostic/route-mapping.diagnostic.json",
  manifest: "wled/diagnostic/deployment-manifest.diagnostic.json",
} as const;

export type WledDeploymentMode = "diagnostic" | "installation";

export interface WledDeploymentBundle {
  mode: WledDeploymentMode;
  files: ReadonlyMap<string, string>;
  manifestPath: string;
  manifestBytes: string;
  deploymentIdentity: string;
}

interface DeploymentFileEntry {
  path: string;
  byteLength: number;
  sha256: string;
}

function jsonBytes(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function assertFirmwareReceipt(): void {
  if (
    firmwareReceipt.schemaVersion !== "1.0.0" ||
    firmwareReceipt.status !== "built-not-flashed" ||
    firmwareReceipt.target.board !== "ESP32-DevKitC V4" ||
    firmwareReceipt.target.module !== "ESP32-WROOM-32E-N4" ||
    firmwareReceipt.target.platformioEnvironment !== "orbital_esp32dev" ||
    firmwareReceipt.target.upstreamEnvironment !== "esp32dev" ||
    firmwareReceipt.target.wledCommit !== WLED_COMMIT ||
    firmwareReceipt.target.platformioVersion !== "6.1.18" ||
    firmwareReceipt.artifact.name !== "wled-orbital-esp32dev.bin" ||
    !Number.isInteger(firmwareReceipt.artifact.byteLength) ||
    firmwareReceipt.artifact.byteLength <= 0 ||
    !/^[0-9a-f]{64}$/.test(firmwareReceipt.artifact.sha256)
  ) {
    throw new Error("The pinned WLED firmware build receipt is invalid.");
  }
}

export function sha256ExactBytes(bytes: string): string {
  return sha256Text(bytes);
}

function assertInstallationContract(contract: HardwareMappingContract): void {
  if (!contract.readiness.mappingReady) {
    throw new Error(
      "An installation bundle requires a current mapping-ready address contract.",
    );
  }
  if (
    contract.wiring.status !== "authored" &&
    contract.wiring.status !== "measured"
  ) {
    throw new Error("An installation bundle requires the current saved route.");
  }
  if (contract.ledmap.map.length !== 2624) {
    throw new Error("The selected installation target requires exactly 2,624 LEDs.");
  }
  if (contract.outputs.length !== 4) {
    throw new Error("The selected installation target requires exactly four outputs.");
  }
  contract.outputs.forEach((output, index) => {
    if (
      output.outputIndex !== index ||
      output.gpio !== EXPECTED_GPIOS[index] ||
      output.startIndex !== EXPECTED_STARTS[index] ||
      output.pixelCount !== EXPECTED_LENGTHS[index]
    ) {
      throw new Error(`Output ${index} contradicts the selected prototype bus contract.`);
    }
  });
}

function createConfigBytes(contract: HardwareMappingContract): string {
  const buses = contract.outputs.map((output, index) => ({
    start: output.startIndex,
    len: output.pixelCount,
    pin: [output.gpio],
    order: 1,
    rev: false,
    skip: 0,
    type: 22,
    ref: false,
    rgbwm: 0,
    freq: 0,
    maxpwr: 14000,
    ledma: 60,
    drv: 0,
    text: `Output ${index} / domain ${index < 2 ? "A" : "B"}`,
  }));
  return jsonBytes({
    hw: { led: { total: contract.ledmap.map.length, maxpwr: 0, ins: buses } },
  });
}

function createRouteMappingBytes(contract: HardwareMappingContract): string {
  return jsonBytes({
    schemaVersion: "1.0.0",
    status: contract.wiring.status,
    routeSource: contract.wiring.routeSource,
    mappingFingerprint: contract.fingerprint,
    mappingFingerprintVersion: contract.fingerprintVersion,
    ledCount: contract.ledmap.map.length,
    outputs: contract.outputs,
    readiness: contract.readiness,
  });
}

function fileEntry(path: string, bytes: string): DeploymentFileEntry {
  return {
    path,
    byteLength: utf8ByteLength(bytes),
    sha256: sha256ExactBytes(bytes),
  };
}

export function createWledDeploymentBundle(
  contract: HardwareMappingContract,
  sculptureBytes: string,
  requestedMode: WledDeploymentMode = contract.readiness.mappingReady
    ? "installation"
    : "diagnostic",
): WledDeploymentBundle {
  if (requestedMode === "installation") assertInstallationContract(contract);
  if (requestedMode === "installation") assertFirmwareReceipt();

  const files = new Map<string, string>();
  const ledmapBytes = JSON.stringify(contract.ledmap) + "\n";
  const routeMappingBytes = createRouteMappingBytes(contract);
  const smokeConfigBytes = jsonBytes(smokeConfig);
  const firmwareReceiptBytes = jsonBytes(firmwareReceipt);
  const manifestPath = requestedMode === "installation"
    ? INSTALLATION_PATHS.manifest
    : DIAGNOSTIC_PATHS.manifest;

  if (requestedMode === "installation") {
    files.set(INSTALLATION_PATHS.config, createConfigBytes(contract));
    files.set(INSTALLATION_PATHS.ledmap, ledmapBytes);
    files.set(INSTALLATION_PATHS.routeMapping, routeMappingBytes);
    files.set(INSTALLATION_PATHS.smokeConfig, smokeConfigBytes);
    files.set(INSTALLATION_PATHS.firmwareReceipt, firmwareReceiptBytes);
  } else {
    files.set(DIAGNOSTIC_PATHS.ledmap, ledmapBytes);
    files.set(DIAGNOSTIC_PATHS.routeMapping, routeMappingBytes);
  }

  const manifestBytes = jsonBytes({
    schemaVersion: "1.0.0",
    status: requestedMode === "installation"
      ? "mapping-ready-installation"
      : "diagnostic-only",
    target: {
      board: "ESP32-DevKitC V4",
      module: "ESP32-WROOM-32E-N4",
      platformioEnvironment: requestedMode === "installation"
        ? "orbital_esp32dev"
        : "esp32dev",
      ...(requestedMode === "installation"
        ? { upstreamEnvironment: "esp32dev" }
        : {}),
      wledCommit: WLED_COMMIT,
    },
    ...(requestedMode === "installation"
      ? {
        firmware: {
          receiptPath: INSTALLATION_PATHS.firmwareReceipt,
          receiptSha256: sha256ExactBytes(firmwareReceiptBytes),
          artifact: firmwareReceipt.artifact,
        },
      }
      : {}),
    sourceProject: {
      path: "sculpture.json",
      byteLength: utf8ByteLength(sculptureBytes),
      sha256: sha256ExactBytes(sculptureBytes),
    },
    mappingFingerprint: contract.fingerprint,
    mappingFingerprintVersion: contract.fingerprintVersion,
    files: [...files].map(([path, bytes]) => fileEntry(path, bytes)),
  });
  files.set(manifestPath, manifestBytes);
  return {
    mode: requestedMode,
    files,
    manifestPath,
    manifestBytes,
    deploymentIdentity: sha256ExactBytes(manifestBytes),
  };
}

export function validateWledDeploymentBundle(
  manifestBytes: string,
  files: Readonly<Record<string, string>>,
  expectedDeploymentIdentity: string,
): void {
  const manifest = JSON.parse(manifestBytes) as {
    schemaVersion?: string;
    status?: string;
    target?: Record<string, unknown>;
    firmware?: {
      receiptPath?: string;
      receiptSha256?: string;
      artifact?: { name?: string; byteLength?: number; sha256?: string };
    };
    sourceProject?: { path?: string; byteLength?: number; sha256?: string };
    mappingFingerprint?: string;
    mappingFingerprintVersion?: string;
    files?: DeploymentFileEntry[];
  };
  const installation = manifest.status === "mapping-ready-installation";
  const expectedPaths = installation
    ? [
      INSTALLATION_PATHS.config,
      INSTALLATION_PATHS.ledmap,
      INSTALLATION_PATHS.routeMapping,
      INSTALLATION_PATHS.smokeConfig,
      INSTALLATION_PATHS.firmwareReceipt,
    ]
    : [DIAGNOSTIC_PATHS.ledmap, DIAGNOSTIC_PATHS.routeMapping];
  if (
    sha256ExactBytes(manifestBytes) !== expectedDeploymentIdentity ||
    manifest.schemaVersion !== "1.0.0" ||
    (!installation && manifest.status !== "diagnostic-only") ||
    manifest.target?.board !== "ESP32-DevKitC V4" ||
    manifest.target?.module !== "ESP32-WROOM-32E-N4" ||
    manifest.target?.platformioEnvironment !== (
      installation ? "orbital_esp32dev" : "esp32dev"
    ) ||
    (installation
      ? manifest.target?.upstreamEnvironment !== "esp32dev"
      : manifest.target?.upstreamEnvironment !== undefined) ||
    manifest.target?.wledCommit !== WLED_COMMIT ||
    (installation && (
      manifest.firmware?.receiptPath !== INSTALLATION_PATHS.firmwareReceipt ||
      !/^[0-9a-f]{64}$/.test(manifest.firmware.receiptSha256 ?? "") ||
      manifest.firmware.artifact?.name !== firmwareReceipt.artifact.name ||
      manifest.firmware.artifact?.byteLength !== firmwareReceipt.artifact.byteLength ||
      manifest.firmware.artifact?.sha256 !== firmwareReceipt.artifact.sha256
    )) ||
    manifest.sourceProject?.path !== "sculpture.json" ||
    !Number.isInteger(manifest.sourceProject.byteLength) ||
    !/^[0-9a-f]{64}$/.test(manifest.sourceProject.sha256 ?? "") ||
    !/^[0-9a-f]{8}$/.test(manifest.mappingFingerprint ?? "") ||
    manifest.mappingFingerprintVersion !== "fnv1a32-u32le-v2" ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== expectedPaths.length
  ) {
    throw new Error("Invalid WLED deployment manifest or identity.");
  }
  const sourceBytes = files[manifest.sourceProject.path];
  if (
    sourceBytes === undefined ||
    utf8ByteLength(sourceBytes) !== manifest.sourceProject.byteLength ||
    sha256ExactBytes(sourceBytes) !== manifest.sourceProject.sha256
  ) {
    throw new Error("The deployment source sculpture.json is missing or stale.");
  }
  for (const [index, entry] of manifest.files.entries()) {
    const bytes = typeof entry.path === "string" ? files[entry.path] : undefined;
    if (
      entry.path !== expectedPaths[index] ||
      bytes === undefined ||
      utf8ByteLength(bytes) !== entry.byteLength ||
      sha256ExactBytes(bytes) !== entry.sha256
    ) {
      throw new Error(`WLED deployment file ${entry.path ?? "unknown"} is missing or stale.`);
    }
  }
  if (!installation) return;

  const receiptBytes = files[INSTALLATION_PATHS.firmwareReceipt]!;
  if (
    sha256ExactBytes(receiptBytes) !== manifest.firmware!.receiptSha256 ||
    receiptBytes !== jsonBytes(firmwareReceipt)
  ) {
    throw new Error("The WLED firmware build receipt is missing or stale.");
  }

  const smokeBytes = files[INSTALLATION_PATHS.smokeConfig]!;
  if (smokeBytes !== jsonBytes(smokeConfig)) {
    throw new Error("The one-panel smoke configuration is missing or stale.");
  }
  const onePanel = JSON.parse(smokeBytes) as {
    hw?: { led?: { total?: number; maxpwr?: number; ins?: Array<Record<string, unknown>> } };
  };
  const smokeLed = onePanel.hw?.led;
  if (
    smokeLed?.total !== 64 || smokeLed.maxpwr !== 1000 ||
    !Array.isArray(smokeLed.ins) || smokeLed.ins.length !== 1 ||
    smokeLed.ins[0]?.start !== 0 || smokeLed.ins[0]?.len !== 64 ||
    !Array.isArray(smokeLed.ins[0]?.pin) || smokeLed.ins[0]?.pin[0] !== 16 ||
    smokeLed.ins[0]?.maxpwr !== 1000
  ) {
    throw new Error("The one-panel smoke configuration contradicts FIRM-011.");
  }

  const config = JSON.parse(files[INSTALLATION_PATHS.config]!) as {
    hw?: { led?: { total?: number; maxpwr?: number; ins?: Array<Record<string, unknown>> } };
  };
  const led = config.hw?.led;
  if (led?.total !== 2624 || led.maxpwr !== 0 || !Array.isArray(led.ins) || led.ins.length !== 4) {
    throw new Error("WLED deployment config contradicts the prototype global bus contract.");
  }
  led.ins.forEach((bus, index) => {
    if (
      bus.start !== EXPECTED_STARTS[index] ||
      bus.len !== EXPECTED_LENGTHS[index] ||
      !Array.isArray(bus.pin) || bus.pin.length !== 1 || bus.pin[0] !== EXPECTED_GPIOS[index] ||
      bus.order !== 1 || bus.rev !== false || bus.skip !== 0 || bus.type !== 22 ||
      bus.ref !== false || bus.rgbwm !== 0 || bus.freq !== 0 ||
      bus.maxpwr !== 14000 || bus.ledma !== 60 || bus.drv !== 0 ||
      bus.text !== `Output ${index} / domain ${index < 2 ? "A" : "B"}`
    ) {
      throw new Error(`WLED deployment bus ${index} contradicts the prototype contract.`);
    }
  });
}
