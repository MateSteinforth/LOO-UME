import { createHash } from "node:crypto";
import type { HardwareMappingContract } from "../../web/src/HardwareMapping.ts";

const WLED_COMMIT = "d9b9a846561227351ad929e3109781daadb7bed2";
const EXPECTED_GPIOS = [16, 17, 18, 19];
const EXPECTED_STARTS = [0, 704, 1344, 1984];
const EXPECTED_LENGTHS = [704, 640, 640, 640];

export interface WledDeploymentBundle {
  configBytes: string;
  manifestBytes: string;
  deploymentIdentity: string;
}

export function sha256ExactBytes(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

export function createWledDeploymentBundle(
  contract: HardwareMappingContract,
  ledmapBytes: string,
  sculptureBytes: string,
): WledDeploymentBundle {
  if (contract.wiring.status !== "authored") {
    throw new Error("The assumed WLED contract requires the current authored route.");
  }
  if (contract.ledmap.map.length !== 2624) {
    throw new Error("The assumed WLED contract requires exactly 2,624 LEDs.");
  }
  if (contract.outputs.length !== 4) {
    throw new Error("The assumed WLED contract requires exactly four outputs.");
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
  const parsedLedmap = JSON.parse(ledmapBytes) as { map?: unknown };
  if (
    !Array.isArray(parsedLedmap.map) ||
    parsedLedmap.map.length !== contract.ledmap.map.length ||
    parsedLedmap.map.some((value, index) => value !== contract.ledmap.map[index])
  ) {
    throw new Error("The supplied ledmap bytes do not match the mapping contract.");
  }

  const buses = contract.outputs.map((output, index) => ({
    start: output.startIndex,
    len: output.pixelCount,
    pin: [output.gpio],
    order: 0,
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
  const configBytes = JSON.stringify({
    hw: { led: { total: 2624, maxpwr: 0, ins: buses } },
  }, null, 2) + "\n";
  const files = [
    {
      path: "wled/cfg.provisional.json",
      byteLength: Buffer.byteLength(configBytes),
      sha256: sha256ExactBytes(configBytes),
    },
    {
      path: "wled/ledmap.provisional.json",
      byteLength: Buffer.byteLength(ledmapBytes),
      sha256: sha256ExactBytes(ledmapBytes),
    },
  ];
  const manifestBytes = JSON.stringify({
    schemaVersion: "1.0.0",
    status: "assumed-review-only",
    target: {
      board: "ESP32-DevKitC V4",
      module: "ESP32-WROOM-32E-N4",
      platformioEnvironment: "esp32dev",
      wledCommit: WLED_COMMIT,
    },
    sourceProjectSha256: sha256ExactBytes(sculptureBytes),
    mappingFingerprint: contract.fingerprint,
    files,
  }, null, 2) + "\n";
  return {
    configBytes,
    manifestBytes,
    deploymentIdentity: sha256ExactBytes(manifestBytes),
  };
}

export function validateWledDeploymentBundle(
  manifestBytes: string,
  files: Record<string, string>,
  expectedDeploymentIdentity: string,
): void {
  const manifest = JSON.parse(manifestBytes) as {
    schemaVersion?: string;
    status?: string;
    target?: Record<string, unknown>;
    sourceProjectSha256?: string;
    mappingFingerprint?: string;
    files?: Array<{ path?: string; byteLength?: number; sha256?: string }>;
  };
  if (
    sha256ExactBytes(manifestBytes) !== expectedDeploymentIdentity ||
    manifest.schemaVersion !== "1.0.0" ||
    manifest.status !== "assumed-review-only" ||
    manifest.target?.board !== "ESP32-DevKitC V4" ||
    manifest.target?.module !== "ESP32-WROOM-32E-N4" ||
    manifest.target?.platformioEnvironment !== "esp32dev" ||
    manifest.target?.wledCommit !== WLED_COMMIT ||
    !/^[0-9a-f]{64}$/.test(manifest.sourceProjectSha256 ?? "") ||
    !/^[0-9a-f]{8}$/.test(manifest.mappingFingerprint ?? "") ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== 2
  ) {
    throw new Error("Invalid WLED deployment manifest or identity.");
  }
  for (const entry of manifest.files) {
    const bytes = typeof entry.path === "string" ? files[entry.path] : undefined;
    if (
      bytes === undefined ||
      Buffer.byteLength(bytes) !== entry.byteLength ||
      sha256ExactBytes(bytes) !== entry.sha256
    ) {
      throw new Error(`WLED deployment file ${entry.path ?? "unknown"} is missing or stale.`);
    }
  }
  const expectedPaths = [
    "wled/cfg.provisional.json",
    "wled/ledmap.provisional.json",
  ];
  if (manifest.files.some((entry, index) => entry.path !== expectedPaths[index])) {
    throw new Error("WLED deployment manifest paths or order are invalid.");
  }
  const config = JSON.parse(files[expectedPaths[0]!]!) as {
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
      bus.order !== 0 || bus.rev !== false || bus.skip !== 0 || bus.type !== 22 ||
      bus.ref !== false || bus.rgbwm !== 0 || bus.freq !== 0 ||
      bus.maxpwr !== 14000 || bus.ledma !== 60 || bus.drv !== 0 ||
      bus.text !== `Output ${index} / domain ${index < 2 ? "A" : "B"}`
    ) {
      throw new Error(`WLED deployment bus ${index} contradicts the prototype contract.`);
    }
  });
}
