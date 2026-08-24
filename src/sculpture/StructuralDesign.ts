import type { PanelHardwareProfile, PanelMountingHoleId } from "./Definition.ts";
import {
  assertProjectAssetReference,
  sha256Text,
} from "./GeneratedMechanics.ts";
import type {
  PanelAssemblyDefinition,
  PanelAssemblyProject,
  PanelOutlineCornerId,
  ProjectAssetReference,
} from "./PanelAssembly.ts";

export type StructuralAxis = "x" | "y" | "z";
export type StructuralVector = [number, number, number];

export interface StructuralDesignDefinition {
  schemaVersion: "1.0.0";
  material: {
    id: string;
    youngsModulusMpa: number;
    yieldStrengthMpa: number;
    densityKgPerCubicMeter: number;
  };
  panelMassKg: number;
  safetyFactor: number;
  maximumDisplacementMm: number;
  gravity: {
    installedDirection: StructuralVector;
    accelerationMetersPerSecondSquared: number;
    includeWorldAxisTransportCases: boolean;
  };
  fabrication: {
    minimumMemberDiameterMm: number;
    maximumMemberDiameterMm: number;
    memberDiameterIncrementMm: number;
    maximumUnsupportedCompressionLengthMm: number;
    bracketOffsetMm: number;
    cableClearanceMm: number;
  };
  connectorization?: StructuralConnectorizationDefinition;
  supports: StructuralSupportDefinition[];
  loads: StructuralLoadDefinition[];
}

export interface StructuralPanelPairOverride {
  panelIds: [string, string];
  action: "include" | "exclude";
}

export type StructuralConnectorSurfaceStyle =
  | "screw-shoe-ribbon"
  | "led-surface-bridge";

export interface StructuralConnectorizationDefinition {
  surfaceStyle?: StructuralConnectorSurfaceStyle;
  maximumNeighborDistanceMm: number;
  maximumAutomaticNeighborsPerPanel: number;
  minimumAnchorsPerPanelSide: number;
  printBedSizeMm: StructuralVector;
  printBedMarginMm: number;
  maximumStrutSegmentLengthMm: number;
  panelPairOverrides: StructuralPanelPairOverride[];
}

export type StructuralSupportDefinition = {
  id: string;
  constrainedTranslations: StructuralAxis[];
} & (
  | { kind: "panel"; panelId: string }
  | { kind: "anchor"; panelId: string; holeId: PanelMountingHoleId }
);

export type StructuralLoadDefinition = {
  id: string;
  panelId: string;
  forceNewtons: StructuralVector;
} & (
  | { kind: "panel-face-force" }
  | { kind: "panel-corner-force"; corner: PanelOutlineCornerId }
  | { kind: "cable-pull"; connector: "DIN" | "DOUT" }
);

export interface GeneratedStructuralManifest {
  schemaVersion: "1.0.0";
  generator: { id: string; version: string };
  sourceFingerprint: { algorithm: "sha256"; value: string };
  status: { generation: "complete"; validation: "passed" };
  artifacts: Array<ProjectAssetReference & {
    id: string;
    role: "part" | "preview" | "package" | "analysis" | "report";
    format: "stl" | "3mf" | "json" | "markdown";
  }>;
}

export type GeneratedStructuralState = "absent" | "current" | "stale";

export interface NormalizedStructuralAnchor {
  id: string;
  panelId: string;
  holeId: PanelMountingHoleId;
  localPositionMm: [number, number];
  positionMm: StructuralVector;
  outwardNormal: StructuralVector;
  printedPilotDiameterMm: number;
  screwLeadInDiameterMm: number;
  screwLeadInDepthMm: number;
  holeEdgeCorrectionMm: number;
  surfaceFlushCorrectionMm: number;
}

export interface NormalizedStructuralCableClearance {
  id: string;
  panelId: string;
  holeId: PanelMountingHoleId;
  blockedBy: "DIN" | "DOUT";
  positionMm: StructuralVector;
  outwardNormal: StructuralVector;
  diameterMm: number;
}

export interface NormalizedStructuralPanel {
  id: string;
  centerMm: StructuralVector;
  xAxis: StructuralVector;
  yAxis: StructuralVector;
  outwardNormal: StructuralVector;
  dimensionsMm: { width: number; height: number; thickness: number };
  emitterPlaneOffsetMm: number;
  massKg: number;
  corners: Record<PanelOutlineCornerId, StructuralVector>;
  anchorIds: string[];
}

export interface NormalizedStructuralSupport {
  id: string;
  anchorId: string;
  constrainedTranslations: StructuralAxis[];
  source: "authored-panel" | "authored-anchor" | "preview-reference-panel";
}

export type NormalizedStructuralLoadCase =
  | {
      id: string;
      kind: "gravity";
      direction: StructuralVector;
      accelerationMetersPerSecondSquared: number;
      source: "installed" | "transport";
    }
  | {
      id: string;
      kind: StructuralLoadDefinition["kind"];
      panelId: string;
      applicationPointMm: StructuralVector;
      forceNewtons: StructuralVector;
      sourceLoadId: string;
    };

export interface StructuralWarning {
  code:
    | "STRUCTURAL_PREVIEW_DEFAULTS"
    | "NO_REAL_SUPPORTS"
    | "ELECTRICAL_KEEPOUTS_UNMEASURED";
  message: string;
}

export interface NormalizedStructuralDesign {
  schemaVersion: "1.0.0";
  units: {
    length: "mm";
    force: "N";
    mass: "kg";
    stress: "MPa";
    density: "kg/m^3";
  };
  sourceFingerprint: { algorithm: "sha256"; value: string };
  inputSource: "authored" | "preview-defaults";
  referencePanelId: string | null;
  design: StructuralDesignDefinition;
  connectorization: StructuralConnectorizationDefinition;
  panels: NormalizedStructuralPanel[];
  anchors: NormalizedStructuralAnchor[];
  cableClearances: NormalizedStructuralCableClearance[];
  supports: NormalizedStructuralSupport[];
  loadCases: NormalizedStructuralLoadCase[];
  warnings: StructuralWarning[];
}

export const STRUCTURAL_CONNECTOR_DEFAULTS: StructuralConnectorizationDefinition = {
  surfaceStyle: "screw-shoe-ribbon",
  maximumNeighborDistanceMm: 200,
  maximumAutomaticNeighborsPerPanel: 2,
  minimumAnchorsPerPanelSide: 2,
  printBedSizeMm: [250, 250, 250],
  printBedMarginMm: 5,
  maximumStrutSegmentLengthMm: 220,
  panelPairOverrides: [],
};

export const STRUCTURAL_PREVIEW_DEFAULTS: StructuralDesignDefinition = {
  schemaVersion: "1.0.0",
  material: {
    id: "preview-pla-isotropic",
    youngsModulusMpa: 2500,
    yieldStrengthMpa: 40,
    densityKgPerCubicMeter: 1240,
  },
  panelMassKg: 0.1,
  safetyFactor: 2,
  maximumDisplacementMm: 2,
  gravity: {
    installedDirection: [0, 0, -1],
    accelerationMetersPerSecondSquared: 9.80665,
    includeWorldAxisTransportCases: true,
  },
  fabrication: {
    minimumMemberDiameterMm: 4,
    maximumMemberDiameterMm: 16,
    memberDiameterIncrementMm: 0.5,
    maximumUnsupportedCompressionLengthMm: 150,
    bracketOffsetMm: 8,
    cableClearanceMm: 12,
  },
  connectorization: structuredClone(STRUCTURAL_CONNECTOR_DEFAULTS),
  supports: [],
  loads: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positive(value: unknown, label: string, minimum = 0): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= minimum) {
    throw new Error(`${label} must be a finite number greater than ${minimum}.`);
  }
}

function nonEmptyText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected !== undefined) {
    throw new Error(`${label} contains unsupported field ${unexpected}.`);
  }
}

function finiteVector(value: unknown, label: string, nonzero = false): asserts value is StructuralVector {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((coordinate) => typeof coordinate !== "number" || !Number.isFinite(coordinate)) ||
    (nonzero && Math.hypot(...value) <= 1e-12)
  ) {
    throw new Error(`${label} must contain three finite${nonzero ? " and not all zero" : ""} values.`);
  }
}

function validateTranslations(value: unknown, label: string): void {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    new Set(value).size !== value.length ||
    value.some((axis) => axis !== "x" && axis !== "y" && axis !== "z")
  ) {
    throw new Error(`${label} must contain unique x, y, or z translations.`);
  }
}

const holeIds = new Set<PanelMountingHoleId>([
  "top-left", "middle-left", "bottom-left",
  "top-right", "middle-right", "bottom-right",
]);
const cornerIds = new Set<PanelOutlineCornerId>([
  "bottom-left", "bottom-right", "top-right", "top-left",
]);

export function validateStructuralDesign(value: unknown): void {
  if (value === undefined) return;
  if (!isRecord(value) || value.schemaVersion !== "1.0.0") {
    throw new Error("Structural design must use schemaVersion 1.0.0.");
  }
  exactKeys(value, [
    "schemaVersion", "material", "panelMassKg", "safetyFactor",
    "maximumDisplacementMm", "gravity", "fabrication", "connectorization",
    "supports", "loads",
  ], "Structural design");
  if (!isRecord(value.material)) throw new Error("Structural material must be an object.");
  exactKeys(value.material, [
    "id", "youngsModulusMpa", "yieldStrengthMpa", "densityKgPerCubicMeter",
  ], "Structural material");
  nonEmptyText(value.material.id, "Structural material id");
  positive(value.material.youngsModulusMpa, "Young's modulus");
  positive(value.material.yieldStrengthMpa, "Yield strength");
  positive(value.material.densityKgPerCubicMeter, "Material density");
  positive(value.panelMassKg, "Panel mass");
  if (typeof value.safetyFactor !== "number" || !Number.isFinite(value.safetyFactor) || value.safetyFactor < 1) {
    throw new Error("Safety factor must be a finite number greater than or equal to 1.");
  }
  positive(value.maximumDisplacementMm, "Maximum displacement");

  if (!isRecord(value.gravity)) throw new Error("Structural gravity must be an object.");
  exactKeys(value.gravity, [
    "installedDirection", "accelerationMetersPerSecondSquared",
    "includeWorldAxisTransportCases",
  ], "Structural gravity");
  finiteVector(value.gravity.installedDirection, "Installed gravity direction", true);
  positive(value.gravity.accelerationMetersPerSecondSquared, "Gravity acceleration");
  if (typeof value.gravity.includeWorldAxisTransportCases !== "boolean") {
    throw new Error("Transport gravity selection must be boolean.");
  }

  if (!isRecord(value.fabrication)) {
    throw new Error("Structural fabrication limits must be an object.");
  }
  exactKeys(value.fabrication, [
    "minimumMemberDiameterMm", "maximumMemberDiameterMm",
    "memberDiameterIncrementMm", "maximumUnsupportedCompressionLengthMm",
    "bracketOffsetMm", "cableClearanceMm",
  ], "Structural fabrication limits");
  for (const [key, label] of [
    ["minimumMemberDiameterMm", "Minimum member diameter"],
    ["maximumMemberDiameterMm", "Maximum member diameter"],
    ["memberDiameterIncrementMm", "Member diameter increment"],
    ["maximumUnsupportedCompressionLengthMm", "Maximum unsupported compression length"],
    ["bracketOffsetMm", "Bracket offset"],
    ["cableClearanceMm", "Cable clearance"],
  ] as const) positive(value.fabrication[key], label);
  if (
    (value.fabrication.maximumMemberDiameterMm as number) <
      (value.fabrication.minimumMemberDiameterMm as number)
  ) {
    throw new Error("Maximum member diameter must not be smaller than the minimum.");
  }

  if (value.connectorization !== undefined) {
    if (!isRecord(value.connectorization)) {
      throw new Error("Structural connectorization must be an object.");
    }
    exactKeys(value.connectorization, [
      "surfaceStyle",
      "maximumNeighborDistanceMm", "maximumAutomaticNeighborsPerPanel",
      "minimumAnchorsPerPanelSide", "printBedSizeMm", "printBedMarginMm",
      "maximumStrutSegmentLengthMm", "panelPairOverrides",
    ], "Structural connectorization");
    if (
      value.connectorization.surfaceStyle !== undefined &&
      value.connectorization.surfaceStyle !== "screw-shoe-ribbon" &&
      value.connectorization.surfaceStyle !== "led-surface-bridge"
    ) {
      throw new Error(
        "Structural connector surface style must be screw-shoe-ribbon or led-surface-bridge.",
      );
    }
    positive(value.connectorization.maximumNeighborDistanceMm, "Maximum neighbor distance");
    positive(value.connectorization.maximumStrutSegmentLengthMm, "Maximum strut segment length");
    if ((value.connectorization.maximumStrutSegmentLengthMm as number) < 1) {
      throw new Error("Maximum strut segment length must be at least 1 mm.");
    }
    if (
      typeof value.connectorization.maximumAutomaticNeighborsPerPanel !== "number" ||
      !Number.isInteger(value.connectorization.maximumAutomaticNeighborsPerPanel) ||
      value.connectorization.maximumAutomaticNeighborsPerPanel < 1
    ) {
      throw new Error("Maximum automatic neighbors per panel must be a positive integer.");
    }
    if (
      typeof value.connectorization.minimumAnchorsPerPanelSide !== "number" ||
      !Number.isInteger(value.connectorization.minimumAnchorsPerPanelSide) ||
      value.connectorization.minimumAnchorsPerPanelSide < 2
    ) {
      throw new Error("Minimum anchors per panel side must be an integer of at least 2.");
    }
    finiteVector(value.connectorization.printBedSizeMm, "Print bed size");
    if (value.connectorization.printBedSizeMm.some((size) => size <= 0)) {
      throw new Error("Print bed size values must be greater than zero.");
    }
    if (
      typeof value.connectorization.printBedMarginMm !== "number" ||
      !Number.isFinite(value.connectorization.printBedMarginMm) ||
      value.connectorization.printBedMarginMm < 0
    ) {
      throw new Error("Print bed margin must be a finite non-negative number.");
    }
    const printBedMarginMm = value.connectorization.printBedMarginMm;
    if (value.connectorization.printBedSizeMm.some(
      (size) => size <= 2 * printBedMarginMm,
    )) {
      throw new Error("Print bed margin leaves no printable build envelope.");
    }
    const printableSpan = Math.max(...value.connectorization.printBedSizeMm) -
      2 * value.connectorization.printBedMarginMm;
    if (value.connectorization.maximumStrutSegmentLengthMm > printableSpan) {
      throw new Error("Maximum strut segment length must fit the print bed after margins.");
    }
    if (!Array.isArray(value.connectorization.panelPairOverrides)) {
      throw new Error("Panel-pair overrides must be an array.");
    }
    const pairActions = new Map<string, string>();
    for (const override of value.connectorization.panelPairOverrides) {
      if (!isRecord(override)) throw new Error("Each panel-pair override must be an object.");
      exactKeys(override, ["panelIds", "action"], "Panel-pair override");
      if (
        !Array.isArray(override.panelIds) || override.panelIds.length !== 2 ||
        override.panelIds.some((id) => typeof id !== "string" || id.length === 0) ||
        override.panelIds[0] === override.panelIds[1]
      ) {
        throw new Error("Panel-pair override requires two different panel IDs.");
      }
      if (override.action !== "include" && override.action !== "exclude") {
        throw new Error("Panel-pair override action must be include or exclude.");
      }
      const key = [...override.panelIds].sort(compareText).join("\u0000");
      if (pairActions.has(key)) {
        throw new Error(`Panel-pair override ${override.panelIds.join("--")} is duplicated or contradictory.`);
      }
      pairActions.set(key, override.action);
    }
  }

  if (!Array.isArray(value.supports)) throw new Error("Structural supports must be an array.");
  const supportIds = new Set<string>();
  for (const support of value.supports) {
    if (!isRecord(support)) throw new Error("Each structural support must be an object.");
    nonEmptyText(support.id, "Structural support id");
    nonEmptyText(support.panelId, `Structural support ${support.id} panelId`);
    if (supportIds.has(support.id)) throw new Error(`Structural support id ${support.id} is duplicated.`);
    supportIds.add(support.id);
    validateTranslations(support.constrainedTranslations, `Structural support ${support.id} translations`);
    if (support.kind === "anchor") {
      exactKeys(support, [
        "id", "kind", "panelId", "holeId", "constrainedTranslations",
      ], `Structural support ${support.id}`);
      if (!holeIds.has(support.holeId as PanelMountingHoleId)) {
        throw new Error(`Structural support ${support.id} requires a known panel hole.`);
      }
    } else if (support.kind === "panel") {
      exactKeys(support, [
        "id", "kind", "panelId", "constrainedTranslations",
      ], `Structural support ${support.id}`);
    } else {
      throw new Error(`Structural support ${support.id} requires panel or anchor kind.`);
    }
  }

  if (!Array.isArray(value.loads)) throw new Error("Structural loads must be an array.");
  const loadIds = new Set<string>();
  for (const load of value.loads) {
    if (!isRecord(load)) throw new Error("Each structural load must be an object.");
    nonEmptyText(load.id, "Structural load id");
    nonEmptyText(load.panelId, `Structural load ${load.id} panelId`);
    if (loadIds.has(load.id)) throw new Error(`Structural load id ${load.id} is duplicated.`);
    loadIds.add(load.id);
    finiteVector(load.forceNewtons, `Structural load ${load.id} force`);
    if (Math.hypot(...load.forceNewtons) <= 1e-12) {
      throw new Error(`Structural load ${load.id} force must not be zero.`);
    }
    if (load.kind === "panel-corner-force") {
      exactKeys(load, [
        "id", "kind", "panelId", "forceNewtons", "corner",
      ], `Structural load ${load.id}`);
      if (!cornerIds.has(load.corner as PanelOutlineCornerId)) {
        throw new Error(`Structural load ${load.id} requires a known panel corner.`);
      }
    } else if (load.kind === "cable-pull") {
      exactKeys(load, [
        "id", "kind", "panelId", "forceNewtons", "connector",
      ], `Structural load ${load.id}`);
      if (load.connector !== "DIN" && load.connector !== "DOUT") {
        throw new Error(`Structural load ${load.id} requires DIN or DOUT.`);
      }
    } else if (load.kind === "panel-face-force") {
      exactKeys(load, [
        "id", "kind", "panelId", "forceNewtons",
      ], `Structural load ${load.id}`);
    } else {
      throw new Error(`Structural load ${load.id} has an unsupported kind.`);
    }
  }
}

export function validateStructuralPanelReferences(
  value: StructuralDesignDefinition | undefined,
  panelIds: ReadonlySet<string>,
): void {
  if (!value) return;
  for (const support of value.supports) {
    if (!panelIds.has(support.panelId)) {
      throw new Error(`Structural support ${support.id} references unknown panel ${support.panelId}.`);
    }
  }
  for (const load of value.loads) {
    if (!panelIds.has(load.panelId)) {
      throw new Error(`Structural load ${load.id} references unknown panel ${load.panelId}.`);
    }
  }
  for (const override of value.connectorization?.panelPairOverrides ?? []) {
    for (const panelId of override.panelIds) {
      if (!panelIds.has(panelId)) {
        throw new Error(`Structural panel-pair override references unknown panel ${panelId}.`);
      }
    }
  }
}

export function validateGeneratedStructuralManifest(value: unknown): void {
  if (value === undefined) return;
  if (!isRecord(value) || value.schemaVersion !== "1.0.0") {
    throw new Error("Generated structure must be a schemaVersion 1.0.0 manifest.");
  }
  exactKeys(value, [
    "schemaVersion", "generator", "sourceFingerprint", "status", "artifacts",
  ], "Generated structure");
  if (!isRecord(value.generator)) throw new Error("Generated structure requires generator identity.");
  exactKeys(value.generator, ["id", "version"], "Generated structure generator");
  nonEmptyText(value.generator.id, "Generated structure generator id");
  nonEmptyText(value.generator.version, "Generated structure generator version");
  if (
    !isRecord(value.sourceFingerprint) ||
    value.sourceFingerprint.algorithm !== "sha256" ||
    typeof value.sourceFingerprint.value !== "string" ||
    !/^[0-9a-f]{64}$/.test(value.sourceFingerprint.value)
  ) {
    throw new Error("Generated structure requires a lowercase SHA-256 source fingerprint.");
  }
  exactKeys(value.sourceFingerprint, ["algorithm", "value"], "Generated structure fingerprint");
  if (
    !isRecord(value.status) ||
    value.status.generation !== "complete" ||
    value.status.validation !== "passed"
  ) {
    throw new Error("Generated structure must describe a complete validated asset set.");
  }
  exactKeys(value.status, ["generation", "validation"], "Generated structure status");
  if (!Array.isArray(value.artifacts) || value.artifacts.length < 5) {
    throw new Error("Generated structure requires part, preview, package, analysis, and report artifacts.");
  }
  const ids = new Set<string>();
  const roles = new Set<string>();
  const expectedFormat = new Map([
    ["part", "stl"], ["preview", "stl"], ["package", "3mf"],
    ["analysis", "json"], ["report", "markdown"],
  ]);
  for (const artifact of value.artifacts) {
    if (!isRecord(artifact)) throw new Error("Generated structural artifacts must be objects.");
    nonEmptyText(artifact.id, "Generated structural artifact id");
    exactKeys(artifact, [
      "id", "role", "format", "source", "sha256",
    ], `Generated structural artifact ${artifact.id}`);
    if (ids.has(artifact.id)) throw new Error(`Generated structural artifact id ${artifact.id} is duplicated.`);
    const format = expectedFormat.get(String(artifact.role));
    if (format === undefined || artifact.format !== format) {
      throw new Error(`Generated structural artifact ${artifact.id} has an invalid role or format.`);
    }
    assertProjectAssetReference(artifact, `Generated structural artifact ${artifact.id}`);
    ids.add(artifact.id);
    roles.add(String(artifact.role));
  }
  for (const role of expectedFormat.keys()) {
    if (!roles.has(role)) throw new Error(`Generated structure requires a ${role} artifact.`);
  }
}

export function generatedStructuralAssetReferences(
  value: unknown,
): Array<{ reference: ProjectAssetReference; label: string }> {
  if (!isRecord(value) || !Array.isArray(value.artifacts)) return [];
  return value.artifacts.flatMap((artifact) =>
    isRecord(artifact) && typeof artifact.id === "string"
      ? [{ reference: artifact as unknown as ProjectAssetReference, label: `Generated structural artifact ${artifact.id}` }]
      : []
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function normalizedDirection(value: StructuralVector): StructuralVector {
  const length = Math.hypot(...value);
  return [value[0] / length, value[1] / length, value[2] / length];
}

function add(left: StructuralVector, right: StructuralVector): StructuralVector {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function scale(value: StructuralVector, amount: number): StructuralVector {
  return [value[0] * amount, value[1] * amount, value[2] * amount];
}

function panelPoint(
  center: StructuralVector,
  xAxis: StructuralVector,
  yAxis: StructuralVector,
  localX: number,
  localY: number,
): StructuralVector {
  return add(add(center, scale(xAxis, localX)), scale(yAxis, localY));
}

function panelCorners(
  center: StructuralVector,
  xAxis: StructuralVector,
  yAxis: StructuralVector,
  width: number,
  height: number,
): Record<PanelOutlineCornerId, StructuralVector> {
  return {
    "bottom-left": panelPoint(center, xAxis, yAxis, -width / 2, -height / 2),
    "bottom-right": panelPoint(center, xAxis, yAxis, width / 2, -height / 2),
    "top-right": panelPoint(center, xAxis, yAxis, width / 2, height / 2),
    "top-left": panelPoint(center, xAxis, yAxis, -width / 2, height / 2),
  };
}

function effectiveDesign(definition: PanelAssemblyDefinition): {
  design: StructuralDesignDefinition;
  source: NormalizedStructuralDesign["inputSource"];
} {
  if (definition.structuralDesign) {
    const design = structuredClone(definition.structuralDesign);
    const { connectorization: _designConnectorization, ...designInputs } = design;
    const { connectorization: _previewConnectorization, ...previewInputs } =
      STRUCTURAL_PREVIEW_DEFAULTS;
    const source = JSON.stringify(canonicalize(designInputs)) ===
        JSON.stringify(canonicalize(previewInputs))
      ? "preview-defaults"
      : "authored";
    return { design, source };
  }
  return { design: structuredClone(STRUCTURAL_PREVIEW_DEFAULTS), source: "preview-defaults" };
}

function fingerprintDesign(design: StructuralDesignDefinition): StructuralDesignDefinition {
  return {
    ...design,
    connectorization: {
      ...structuredClone(STRUCTURAL_CONNECTOR_DEFAULTS),
      ...structuredClone(design.connectorization ?? {}),
      panelPairOverrides: [...(design.connectorization?.panelPairOverrides ?? [])]
        .map((override) => ({
          ...override,
          panelIds: [...override.panelIds].sort(compareText) as [string, string],
        }))
        .sort((left, right) =>
          compareText(left.panelIds.join("\u0000"), right.panelIds.join("\u0000"))
        ),
    },
    supports: design.supports
      .map((support) => ({
        ...support,
        constrainedTranslations: [...support.constrainedTranslations].sort(compareText),
      }))
      .sort((left, right) => compareText(left.id, right.id)),
    loads: [...design.loads].sort((left, right) => compareText(left.id, right.id)),
  };
}

export function createStructuralFingerprint(
  definition: PanelAssemblyDefinition,
  profile: PanelHardwareProfile,
): string {
  const { design } = effectiveDesign(definition);
  const input = {
    panels: definition.panels
      .map(({ id, pose }) => ({ id, pose }))
      .sort((left, right) => compareText(left.id, right.id)),
    structuralDesign: fingerprintDesign(design),
    panelProfile: {
      schemaVersion: profile.schemaVersion,
      id: profile.id,
      units: profile.units,
      dimensions: profile.dimensions,
      pixelGrid: { emitterOffset: profile.pixelGrid.emitterOffset },
      mounting: {
        printedPilotDiameter: profile.mounting.printedPilotDiameter,
        screwLeadIn: profile.mounting.screwLeadIn,
        holes: [...profile.mounting.holes].sort((left, right) => compareText(left.id, right.id)),
        physicalCorrections: {
          holeEdge: profile.mounting.physicalCorrections.holeEdge,
          surfaceFlush: profile.mounting.physicalCorrections.surfaceFlush,
          status: profile.mounting.physicalCorrections.status,
        },
      },
      dataConnectors: {
        referenceView: profile.dataConnectors.referenceView,
        orientationReference: profile.dataConnectors.orientationReference,
        cornerAssignmentStatus: profile.dataConnectors.cornerAssignmentStatus,
        dinCorner: profile.dataConnectors.dinCorner,
        doutCorner: profile.dataConnectors.doutCorner,
        padPositionStatus: profile.dataConnectors.padPositionStatus,
      },
      electricalKeepouts: {
        status: profile.electricalKeepouts.status,
        regions: profile.electricalKeepouts.regions,
      },
    },
  };
  return sha256Text(JSON.stringify(canonicalize(input)));
}

export function getGeneratedStructuralState(
  definition: PanelAssemblyDefinition,
  profile: PanelHardwareProfile,
): GeneratedStructuralState {
  if (!definition.generatedStructure) return "absent";
  return definition.generatedStructure.sourceFingerprint.value ===
      createStructuralFingerprint(definition, profile)
    ? "current"
    : "stale";
}

export function normalizeStructuralDesign(
  project: PanelAssemblyProject,
): NormalizedStructuralDesign {
  const definition = project.sculpture;
  const profile = project.panelProfile;
  if (definition.panels.length === 0) {
    throw new Error("Structural normalization requires at least one panel pose.");
  }
  const { design, source } = effectiveDesign(definition);
  validateStructuralDesign(design);
  const connectorization: StructuralConnectorizationDefinition = {
    ...structuredClone(STRUCTURAL_CONNECTOR_DEFAULTS),
    ...structuredClone(design.connectorization ?? {}),
    panelPairOverrides: [...(design.connectorization?.panelPairOverrides ?? [])]
      .map((override) => ({
        ...override,
        panelIds: [...override.panelIds].sort(compareText) as [string, string],
      }))
      .sort((left, right) =>
        compareText(left.panelIds.join("\u0000"), right.panelIds.join("\u0000"))
      ),
  };
  const panels: NormalizedStructuralPanel[] = [];
  const anchors: NormalizedStructuralAnchor[] = [];
  const cableClearances: NormalizedStructuralCableClearance[] = [];
  const anchorByPanelAndHole = new Map<string, NormalizedStructuralAnchor>();
  for (const panel of [...definition.panels].sort((left, right) => compareText(left.id, right.id))) {
    const center = [...panel.pose.position] as StructuralVector;
    const xAxis = [...panel.pose.orientation.xAxis] as StructuralVector;
    const yAxis = [...panel.pose.orientation.yAxis] as StructuralVector;
    const normal = [...panel.pose.orientation.normal] as StructuralVector;
    const panelAnchors = profile.mounting.holes
      .filter((hole) => hole.mechanicalUse === "eligible")
      .sort((left, right) => compareText(left.id, right.id))
      .map((hole): NormalizedStructuralAnchor => ({
        id: `${panel.id}:${hole.id}`,
        panelId: panel.id,
        holeId: hole.id,
        localPositionMm: [...hole.localPosition],
        positionMm: panelPoint(center, xAxis, yAxis, hole.localPosition[0], hole.localPosition[1]),
        outwardNormal: normal,
        printedPilotDiameterMm: profile.mounting.printedPilotDiameter,
        screwLeadInDiameterMm: profile.mounting.screwLeadIn.diameter,
        screwLeadInDepthMm: profile.mounting.screwLeadIn.depth,
        holeEdgeCorrectionMm: profile.mounting.physicalCorrections.holeEdge,
        surfaceFlushCorrectionMm: profile.mounting.physicalCorrections.surfaceFlush,
      }));
    if (panelAnchors.length === 0) {
      throw new Error(`Panel ${panel.id} profile has no eligible structural mounting holes.`);
    }
    for (const anchor of panelAnchors) {
      anchors.push(anchor);
      anchorByPanelAndHole.set(`${anchor.panelId}\u0000${anchor.holeId}`, anchor);
    }
    for (const hole of profile.mounting.holes
      .filter((candidate) => candidate.mechanicalUse === "blocked")
      .sort((left, right) => compareText(left.id, right.id))) {
      if (!hole.blockedBy) {
        throw new Error(`Blocked mounting hole ${hole.id} requires a connector reason.`);
      }
      cableClearances.push({
        id: `${panel.id}:cable-clearance:${hole.blockedBy.toLowerCase()}`,
        panelId: panel.id,
        holeId: hole.id,
        blockedBy: hole.blockedBy,
        positionMm: panelPoint(
          center,
          xAxis,
          yAxis,
          hole.localPosition[0],
          hole.localPosition[1],
        ),
        outwardNormal: normal,
        diameterMm: design.fabrication.cableClearanceMm,
      });
    }
    panels.push({
      id: panel.id,
      centerMm: center,
      xAxis,
      yAxis,
      outwardNormal: normal,
      dimensionsMm: { ...profile.dimensions },
      emitterPlaneOffsetMm: profile.pixelGrid.emitterOffset,
      massKg: design.panelMassKg,
      corners: panelCorners(center, xAxis, yAxis, profile.dimensions.width, profile.dimensions.height),
      anchorIds: panelAnchors.map((anchor) => anchor.id),
    });
  }
  const panelById = new Map(panels.map((panel) => [panel.id, panel]));
  const supportDefinitions = design.supports.length > 0
    ? design.supports
    : [{
        id: "preview-reference-panel",
        kind: "panel" as const,
        panelId: panels[0]!.id,
        constrainedTranslations: ["x", "y", "z"] as StructuralAxis[],
      }];
  const supportMap = new Map<string, NormalizedStructuralSupport>();
  for (const support of [...supportDefinitions].sort((left, right) => compareText(left.id, right.id))) {
    const panel = panelById.get(support.panelId);
    if (!panel) throw new Error(`Structural support ${support.id} references unknown panel ${support.panelId}.`);
    const anchorIds = support.kind === "panel"
      ? panel.anchorIds
      : [anchorByPanelAndHole.get(`${support.panelId}\u0000${support.holeId}`)?.id];
    if (anchorIds.some((id) => id === undefined)) {
      throw new Error(
        `Structural support ${support.id} references blocked or unknown anchor ${support.panelId}:${support.kind === "anchor" ? support.holeId : ""}.`,
      );
    }
    for (const anchorId of anchorIds as string[]) {
      const existing = supportMap.get(anchorId);
      const constrainedTranslations = [...new Set([
        ...(existing?.constrainedTranslations ?? []),
        ...support.constrainedTranslations,
      ])].sort(compareText);
      supportMap.set(anchorId, {
        id: support.kind === "panel" ? `${support.id}:${anchorId}` : support.id,
        anchorId,
        constrainedTranslations,
        source: design.supports.length === 0
          ? "preview-reference-panel"
          : support.kind === "panel" ? "authored-panel" : "authored-anchor",
      });
    }
  }
  const loadCases: NormalizedStructuralLoadCase[] = [{
    id: "installed-gravity",
    kind: "gravity",
    direction: normalizedDirection(design.gravity.installedDirection),
    accelerationMetersPerSecondSquared: design.gravity.accelerationMetersPerSecondSquared,
    source: "installed",
  }];
  if (design.gravity.includeWorldAxisTransportCases) {
    for (const [id, direction] of [
      ["transport-positive-x", [1, 0, 0]], ["transport-negative-x", [-1, 0, 0]],
      ["transport-positive-y", [0, 1, 0]], ["transport-negative-y", [0, -1, 0]],
      ["transport-positive-z", [0, 0, 1]], ["transport-negative-z", [0, 0, -1]],
    ] as Array<[string, StructuralVector]>) {
      loadCases.push({
        id,
        kind: "gravity",
        direction,
        accelerationMetersPerSecondSquared: design.gravity.accelerationMetersPerSecondSquared,
        source: "transport",
      });
    }
  }
  for (const load of [...design.loads].sort((left, right) => compareText(left.id, right.id))) {
    const panel = panelById.get(load.panelId);
    if (!panel) throw new Error(`Structural load ${load.id} references unknown panel ${load.panelId}.`);
    const applicationPoint = load.kind === "panel-face-force"
      ? panel.centerMm
      : load.kind === "panel-corner-force"
        ? panel.corners[load.corner]
        : panel.corners[
            load.connector === "DIN"
              ? profile.dataConnectors.dinCorner
              : profile.dataConnectors.doutCorner
          ];
    loadCases.push({
      id: `force:${load.id}`,
      kind: load.kind,
      panelId: load.panelId,
      applicationPointMm: [...applicationPoint],
      forceNewtons: [...load.forceNewtons],
      sourceLoadId: load.id,
    });
  }
  const warnings: StructuralWarning[] = [];
  if (source === "preview-defaults") {
    warnings.push({
      code: "STRUCTURAL_PREVIEW_DEFAULTS",
      message: "Structural material, panel mass, safety factor, gravity, displacement, and fabrication values are preview defaults and require real project values.",
    });
  }
  if (design.supports.length === 0) {
    warnings.push({
      code: "NO_REAL_SUPPORTS",
      message: `No structural support is authored. Panel ${panels[0]!.id}, the first panel in stable ID order, is fixed for preview only. Analysis requires real mounting conditions.`,
    });
  }
  if (
    profile.electricalKeepouts.status !== "measured" ||
    profile.dataConnectors.padPositionStatus !== "measured"
  ) {
    warnings.push({
      code: "ELECTRICAL_KEEPOUTS_UNMEASURED",
      message: "Exact connector pad and keep-out geometry is not fully measured. Cable loads use known connector corners and printable geometry must keep a conservative clearance.",
    });
  }
  return {
    schemaVersion: "1.0.0",
    units: { length: "mm", force: "N", mass: "kg", stress: "MPa", density: "kg/m^3" },
    sourceFingerprint: { algorithm: "sha256", value: createStructuralFingerprint(definition, profile) },
    inputSource: source,
    referencePanelId: design.supports.length === 0 ? panels[0]!.id : null,
    design,
    connectorization,
    panels,
    anchors,
    cableClearances,
    supports: [...supportMap.values()].sort((left, right) => compareText(left.id, right.id)),
    loadCases,
    warnings,
  };
}
