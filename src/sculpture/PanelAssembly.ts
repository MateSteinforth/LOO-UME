import panelProfileJson from "../../catalog/panels/ws2812b-8x8-66x65.json" with {
  type: "json",
};
import {
  getWiringLifecycleStatus,
  panelBackViewPointToOutwardPoseLocal,
  panelEmitterLocalPositions,
  parsePanelHardwareProfile,
  type FactStatus,
  type PanelHardwareProfile,
  type PanelMountingHoleId,
  type WiringDefinition,
} from "./Definition.ts";
import type {
  LedMapping,
  LedMappingEntry,
  PanelDefinition,
  Vector3Data,
} from "../../web/src/LedMapping.ts";
import { GENERATED_CLOSURE_PLANARITY_MM } from "./PanelBoundaryTolerances.ts";
import { supportsRectangularPanelTools } from "./PanelCarrier.ts";

import {
  assertProjectAssetReference,
  isLowercaseSha256,
  portableProjectAssetCollisionKey,
} from "./GeneratedMechanics.ts";
import {
  generatedStructuralAssetReferences,
  normalizeStructuralDesign,
  validateGeneratedStructuralManifest,
  validateStructuralDesign,
  validateStructuralPanelReferences,
  type GeneratedStructuralManifest,
  type StructuralDesignDefinition,
} from "./StructuralDesign.ts";
export {
  createGeneratedMechanicsFingerprint,
  getGeneratedMechanicsState,
  type GeneratedMechanicsState,
} from "./GeneratedMechanics.ts";

export interface ProjectAssetReference {
  source: string;
  sha256: string;
}

export interface GeneratedMechanicsManifest {
  generator: {
    id: string;
    version: string;
  };
  sourceFingerprint: {
    algorithm: "sha256";
    value: string;
  };
  status: {
    generation: "complete";
    validation: "passed";
  };
  boundary: ProjectAssetReference & {
    kind: "closed-boundary-mesh";
    format: "stl";
  };
  /** Stable order used by viewer controls and portable export. */
  parts: Array<ProjectAssetReference & {
    id: string;
    format: "stl";
  }>;
}

export type PanelOutlineCornerId =
  | "bottom-left"
  | "bottom-right"
  | "top-right"
  | "top-left";

export interface InstalledAddressTransform {
  /** Assumed values keep simulation usable but cannot satisfy hardware readiness. */
  status: "assumed" | "measured";
  /** The panel is viewed from behind, with display-local Y increasing downward. */
  referenceView: "back";
  quarterTurnsClockwise: 0 | 1 | 2 | 3;
  mirrored: boolean;
  /** Missing in legacy projects means the orientation was selected manually. */
  selectionMethod?: "manual" | "route-optimized";
  /** Binds route-optimized values to the current profile, route, and poses. */
  optimizationFingerprint?: string;
}

/** Connectivity only: all referenced corner positions are derived from poses. */
export interface PanelBoundaryTopology {
  kind: "panel-outline-gap-cycles";
  gaps: Array<{
    id: string;
    vertices: Array<{
      panelId: string;
      corner: PanelOutlineCornerId;
    }>;
  }>;
}

export interface PanelAssemblyDefinition {
  schemaVersion: "2.0.0";
  id: string;
  name: string;
  units: "mm";
  status: "provisional" | "measured";
  panelProfile: {
    id: string;
    source: string;
  };
  designSurface?: ProjectAssetReference & {
    kind: "triangle-mesh";
    format: "glb";
    scaleToMillimeters: number;
    status: "watertight";
  };
  boundaryTopology?: PanelBoundaryTopology;
  generatedMechanics?: GeneratedMechanicsManifest;
  /** Optional structural inputs; all panel geometry still derives from poses/profile. */
  structuralDesign?: StructuralDesignDefinition;
  /** Derived structural assets. This is mutually exclusive with other CAD routes. */
  generatedStructure?: GeneratedStructuralManifest;
  panels: Array<{
    id: string;
    faceType?: "square-face" | "pentagon-centre";
    neighborPanelIds?: string[];
    rotationDegrees?: number | null;
    mirrored?: boolean | null;
    installedAddressTransform?: InstalledAddressTransform;
    mountFaceId?: string;
    connectorPolicy?: {
      allowSharedClosureAcrossAdjacentEdges: true;
      reason: string;
    };
    surfaceAttachment?: {
      surface?: "design-surface" | "mechanical-shell";
      triangleIndex: number;
      barycentric: [number, number, number];
      normalOffset: number;
    };
    pose: {
      position: [number, number, number];
      orientation: {
        xAxis: [number, number, number];
        yAxis: [number, number, number];
        normal: [number, number, number];
      };
    };
  }>;
  mechanicalShell?: {
    /** Stable, uncut JSON boundary used to regenerate edited mechanical topology. */
    authoringBoundary?: {
      vertices: Array<[number, number, number]>;
      faces: Array<{
        id: string;
        vertexIndices: number[];
        /** The complete boundary face becomes the panel opening when occupied. */
        panelPlacement?: "whole-face";
      }>;
      authoredPanels: Array<{
        id: string;
        mountFaceId: string;
        pose: PanelAssemblyDefinition["panels"][number]["pose"];
      }>;
    };
    kind: "explicit-planar-face-graph";
    derivationStatus?: "authored" | "requires-regeneration";
    vertices: Array<[number, number, number]>;
    faces: Array<{
      id: string;
      /** Coplanar regions with the same part ID are emitted as one flat part. */
      partId?: string;
      vertexIndices: number[];
      connectorPolicy?: { minimumPanelHoleConnectors: 2; reason: string };
    }>;
  };
  closures?: {
    faceIds: string[];
    generator: "panel-hole-tabs";
    holeSelection: "minimum-total-edge-distance";
    holePreferences?: Array<{
      closureVertexCount: number;
      panelHoleIds: PanelMountingHoleId[];
    }>;
    exteriorClipping: "polyhedron-interior";
    coverThickness: number;
    coverCornerRadius: number;
    flangeThickness: number;
    flangeOverlap: number;
    edgeLipDepth: number;
    screwTabWidth: number;
    screwTabEndMargin: number;
    connectorCornerClearance: number;
    panelEnvelopeClearance: number;
  };
  mapping: {
    projection: "equirectangular";
    logicalOrder: "north-to-south-then-longitude";
    notes?: string[];
  };
  wiring: WiringDefinition;
  calibration: {
    panelTransforms: "generated-provisional" | "measured";
    installedPanelOrientation: FactStatus;
    panelPixelOrder: "provisional" | "measured";
    physicalChains: "provisional" | "measured";
  };
  notes: string[];
}

export interface PanelAssemblyProject {
  sculpture: PanelAssemblyDefinition;
  panelProfile: PanelHardwareProfile;
  source: string;
}

const FNV64_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const FNV64_MASK = 0xffffffffffffffffn;
export const INSTALLED_ADDRESS_COORDINATE_CONTRACT =
  "pose-front-to-pcb-back-x-reflection-v2";

/**
 * Fingerprint the exact route inputs used by the installed-address optimizer.
 * Panel storage order does not matter; each panel ID remains bound to its pose.
 */
export function createInstalledAddressOptimizationFingerprint(
  definition: Pick<PanelAssemblyDefinition, "panelProfile" | "wiring" | "panels">,
  panelProfile: Pick<
    PanelHardwareProfile,
    "id" | "dimensions" | "pixelGrid" | "dataConnectors"
  >,
): string {
  const source = JSON.stringify({
    coordinateContract: INSTALLED_ADDRESS_COORDINATE_CONTRACT,
    panelProfileReference: definition.panelProfile,
    panelProfile: {
      id: panelProfile.id,
      dimensions: {
        width: panelProfile.dimensions.width,
        height: panelProfile.dimensions.height,
      },
      pixelGrid: {
        columns: panelProfile.pixelGrid.columns,
        rows: panelProfile.pixelGrid.rows,
        localEmitterPositions: panelProfile.pixelGrid.localEmitterPositions,
      },
      dataConnectors: {
        referenceView: panelProfile.dataConnectors.referenceView,
        dinCorner: panelProfile.dataConnectors.dinCorner,
        doutCorner: panelProfile.dataConnectors.doutCorner,
        localPositions: panelProfile.dataConnectors.localPositions,
      },
    },
    outputs: definition.wiring.outputs.map((output, index) => ({
      index,
      outputIndex: output.outputIndex,
      panelIds: output.panelIds ?? null,
    })),
    panels: [...definition.panels]
      .sort((first, second) => first.id.localeCompare(second.id))
      .map((panel) => ({ id: panel.id, pose: panel.pose })),
  });
  let hash = FNV64_OFFSET_BASIS;
  for (const byte of new TextEncoder().encode(source)) {
    hash = ((hash ^ BigInt(byte)) * FNV64_PRIME) & FNV64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

export interface CompiledMountingHole {
  id: PanelMountingHoleId;
  localPosition: [number, number];
  position: Vector3Data;
  mechanicalUse: "eligible" | "blocked";
  blockedBy: "DIN" | "DOUT" | null;
  assignedClosureId: string | null;
}

export interface CompiledPanelPlacement {
  id: string;
  faceId: string;
  rotationDegrees: number;
  position: Vector3Data;
  normal: Vector3Data;
  xAxis: Vector3Data;
  yAxis: Vector3Data;
  width: number;
  height: number;
  mountingHoles: CompiledMountingHole[];
  neighborPanelIds: string[];
}

export interface CompiledClosureConnector {
  panelId: string;
  panelFaceId: string;
  panelEdgeIndex: number;
  panelHoleId: CompiledMountingHole["id"];
  holePosition: Vector3Data;
  pilotPosition: Vector3Data;
  edgeVertices: [Vector3Data, Vector3Data];
  edgeVertexIndices: [number, number];
  edgeAxis: Vector3Data;
  panelInwardAxis: Vector3Data;
  panelInwardNormal: Vector3Data;
}

export interface CompiledAssemblyFace {
  id: string;
  partId: string;
  role: "panel" | "closure";
  vertexIndices: number[];
  vertices: Vector3Data[];
  localVertices: Array<[number, number]>;
  center: Vector3Data;
  normal: Vector3Data;
  xAxis: Vector3Data;
  yAxis: Vector3Data;
  adjacentFaceIds: string[];
  panelId: string | null;
  connectors: CompiledClosureConnector[];
}

export interface CompiledAssemblyEdge {
  id: string;
  vertexIndices: [number, number];
  vertices: [Vector3Data, Vector3Data];
  faceIds: [string, string];
  faceNormalAngleDegrees: number;
  interiorDihedralDegrees: number;
}

export interface CompiledPanelAssembly {
  schemaVersion: "1.0.0";
  sculptureId: string;
  source: string;
  vertices: Vector3Data[];
  faces: CompiledAssemblyFace[];
  edges: CompiledAssemblyEdge[];
  panels: CompiledPanelPlacement[];
  counts: {
    vertices: number;
    edges: number;
    faces: number;
    panels: number;
    closures: number;
    closureConnectors: number;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(
  parent: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = parent[key];
  if (!isRecord(value)) throw new Error(`${key} must be an object.`);
  return value;
}

function positive(parent: Record<string, unknown>, key: string): number {
  const value = parent[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${key} must be a positive finite number.`);
  }
  return value;
}

function nonNegative(parent: Record<string, unknown>, key: string): number {
  const value = parent[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${key} must be a non-negative finite number.`);
  }
  return value;
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected !== undefined) {
    throw new Error(`${label} contains unsupported field ${unexpected}.`);
  }
}

function validateStringArray(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
}

function validateMappingDefinition(value: unknown): void {
  if (!isRecord(value)) throw new Error("mapping must be an object.");
  assertOnlyKeys(value, ["projection", "logicalOrder", "notes"], "Mapping");
  if (
    value.projection !== "equirectangular" ||
    value.logicalOrder !== "north-to-south-then-longitude"
  ) {
    throw new Error("Mapping requires the supported projection and logical order.");
  }
  if (value.notes !== undefined) validateStringArray(value.notes, "Mapping notes");
}

function validateCalibration(value: unknown): void {
  if (!isRecord(value)) throw new Error("calibration must be an object.");
  assertOnlyKeys(
    value,
    [
      "panelTransforms",
      "installedPanelOrientation",
      "panelPixelOrder",
      "physicalChains",
    ],
    "Calibration",
  );
  if (
    (value.panelTransforms !== "generated-provisional" &&
      value.panelTransforms !== "measured") ||
    (value.installedPanelOrientation !== "unknown" &&
      value.installedPanelOrientation !== "provisional" &&
      value.installedPanelOrientation !== "measured") ||
    (value.panelPixelOrder !== "provisional" &&
      value.panelPixelOrder !== "measured") ||
    (value.physicalChains !== "provisional" &&
      value.physicalChains !== "measured")
  ) {
    throw new Error("Calibration contains an unsupported lifecycle value.");
  }
}

function isFiniteVector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(
    (coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate),
  );
}

function isValidPanelPose(value: unknown): boolean {
  if (!isRecord(value) || !isFiniteVector3(value.position)) return false;
  const orientation = value.orientation;
  if (!isRecord(orientation)) return false;
  const xAxis = orientation.xAxis;
  const yAxis = orientation.yAxis;
  const normal = orientation.normal;
  if (
    !isFiniteVector3(xAxis) ||
    !isFiniteVector3(yAxis) ||
    !isFiniteVector3(normal)
  ) return false;
  const orthonormalError = Math.max(
    Math.abs(Math.hypot(...xAxis) - 1),
    Math.abs(Math.hypot(...yAxis) - 1),
    Math.abs(Math.hypot(...normal) - 1),
    Math.abs(xAxis[0] * yAxis[0] + xAxis[1] * yAxis[1] + xAxis[2] * yAxis[2]),
    Math.abs(xAxis[0] * normal[0] + xAxis[1] * normal[1] + xAxis[2] * normal[2]),
    Math.abs(yAxis[0] * normal[0] + yAxis[1] * normal[1] + yAxis[2] * normal[2]),
    Math.hypot(
      xAxis[1] * yAxis[2] - xAxis[2] * yAxis[1] - normal[0],
      xAxis[2] * yAxis[0] - xAxis[0] * yAxis[2] - normal[1],
      xAxis[0] * yAxis[1] - xAxis[1] * yAxis[0] - normal[2],
    ),
  );
  return orthonormalError <= 1e-6;
}

function validateAuthoringBoundary(value: unknown): void {
  if (value === undefined) return;
  if (!isRecord(value)) throw new Error("Authoring boundary must be an object.");
  assertOnlyKeys(value, ["vertices", "faces", "authoredPanels"], "Authoring boundary");
  if (
    !Array.isArray(value.vertices) ||
    value.vertices.length < 4 ||
    value.vertices.some((vertex) => !isFiniteVector3(vertex))
  ) {
    throw new Error("Authoring boundary requires at least four finite vertices.");
  }
  const vertices = value.vertices;
  if (!Array.isArray(value.faces) || value.faces.length < 4) {
    throw new Error("Authoring boundary requires at least four faces.");
  }
  const faceIds = new Set<string>();
  for (const face of value.faces) {
    if (!isRecord(face)) throw new Error("Authoring boundary faces must be objects.");
    assertOnlyKeys(face, ["id", "vertexIndices", "panelPlacement"], "Authoring boundary face");
    if (
      typeof face.id !== "string" ||
      face.id.length === 0 ||
      faceIds.has(face.id) ||
      (face.panelPlacement !== undefined && face.panelPlacement !== "whole-face") ||
      !Array.isArray(face.vertexIndices) ||
      face.vertexIndices.length < 3 ||
      face.vertexIndices.some((index) =>
        !Number.isInteger(index) ||
        (index as number) < 0 ||
        (index as number) >= vertices.length
      )
    ) {
      throw new Error("Authoring boundary faces require unique IDs and valid vertex indices.");
    }
    faceIds.add(face.id);
  }
  if (!Array.isArray(value.authoredPanels)) {
    throw new Error("Authoring boundary authoredPanels must be an array.");
  }
  const panelIds = new Set<string>();
  for (const panel of value.authoredPanels) {
    if (!isRecord(panel)) throw new Error("Authoring boundary panels must be objects.");
    assertOnlyKeys(panel, ["id", "mountFaceId", "pose"], "Authoring boundary panel");
    if (
      typeof panel.id !== "string" ||
      panel.id.length === 0 ||
      panelIds.has(panel.id) ||
      typeof panel.mountFaceId !== "string" ||
      !faceIds.has(panel.mountFaceId) ||
      !isValidPanelPose(panel.pose)
    ) {
      throw new Error("Authoring boundary panels require unique IDs, known faces, and valid poses.");
    }
    panelIds.add(panel.id);
  }
}

function validateGeneratedMechanics(value: unknown): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    throw new Error("Generated mechanics must be a manifest object.");
  }
  assertOnlyKeys(
    value,
    ["generator", "sourceFingerprint", "status", "boundary", "parts"],
    "Generated mechanics",
  );
  const generator = record(value, "generator");
  const sourceFingerprint = record(value, "sourceFingerprint");
  const status = record(value, "status");
  const boundary = record(value, "boundary");
  assertOnlyKeys(generator, ["id", "version"], "Generated mechanics generator");
  assertOnlyKeys(sourceFingerprint, ["algorithm", "value"], "Generated mechanics fingerprint");
  assertOnlyKeys(status, ["generation", "validation"], "Generated mechanics status");
  assertOnlyKeys(boundary, ["kind", "format", "source", "sha256"], "Generated boundary");
  if (
    typeof generator.id !== "string" ||
    generator.id.length === 0 ||
    typeof generator.version !== "string" ||
    generator.version.length === 0
  ) {
    throw new Error("Generated mechanics require generator identity and version.");
  }
  if (
    sourceFingerprint.algorithm !== "sha256" ||
    !isLowercaseSha256(sourceFingerprint.value)
  ) {
    throw new Error("Generated mechanics require a lowercase SHA-256 source fingerprint.");
  }
  if (status.generation !== "complete" || status.validation !== "passed") {
    throw new Error(
      "A generated-mechanics manifest must describe a complete, validated asset set.",
    );
  }
  if (
    boundary.kind !== "closed-boundary-mesh" ||
    boundary.format !== "stl"
  ) {
    throw new Error("Generated mechanics require one closed-boundary STL asset.");
  }
  assertProjectAssetReference(boundary, "Generated boundary");
  if (!Array.isArray(value.parts) || value.parts.length === 0) {
    throw new Error("Generated mechanics require an ordered, non-empty STL part list.");
  }
  const partIds = new Set<string>();
  for (const part of value.parts) {
    if (
      !isRecord(part) ||
      typeof part.id !== "string" ||
      part.id.length === 0 ||
      part.format !== "stl" ||
      partIds.has(part.id)
    ) {
      throw new Error("Generated STL parts require unique, non-empty stable IDs.");
    }
    assertOnlyKeys(part, ["id", "format", "source", "sha256"], `Generated part ${part.id}`);
    assertProjectAssetReference(part, `Generated part ${part.id}`);
    partIds.add(part.id);
  }
}

function validateUniqueProjectAssetSources(input: Record<string, unknown>): void {
  const sources = new Set<string>();
  const add = (value: unknown, label: string): void => {
    if (!isRecord(value) || typeof value.source !== "string") return;
    const collisionKey = portableProjectAssetCollisionKey(value.source);
    if (sources.has(collisionKey)) {
      throw new Error(
        `${label} duplicates project asset source ${value.source}; every referenced file path must be unique.`,
      );
    }
    sources.add(collisionKey);
  };
  add(input.designSurface, "Design surface");
  if (isRecord(input.generatedMechanics)) {
    add(input.generatedMechanics.boundary, "Generated boundary");
    if (Array.isArray(input.generatedMechanics.parts)) {
      for (const part of input.generatedMechanics.parts) {
        add(part, isRecord(part) && typeof part.id === "string"
          ? `Generated part ${part.id}`
          : "Generated part");
      }
    }
  }
  for (const { reference, label } of generatedStructuralAssetReferences(
    input.generatedStructure,
  )) {
    add(reference, label);
  }
}

function validateWiring(
  wiring: Record<string, unknown>,
  panelCount: number,
  knownPanelIds: ReadonlySet<string>,
): void {
  const controller = record(wiring, "controller");
  if (
    controller.placement !== "near-top" ||
    (controller.status !== "provisional" && controller.status !== "measured") ||
    (controller.position !== undefined && !isFiniteVector3(controller.position))
  ) {
    throw new Error(
      "Panel assemblies require a near-top controller, an optional finite XYZ position, and a known lifecycle state.",
    );
  }
  if (
    (wiring.status !== "provisional" &&
      wiring.status !== "draft" &&
      wiring.status !== "authored" &&
      wiring.status !== "requires-review" &&
      wiring.status !== "measured" &&
      wiring.status !== "hardware-verified") ||
    (wiring.routeStrategy !== "face-adjacency-nearest-neighbor" &&
      wiring.routeStrategy !== "longitude-sectors-nearest-neighbor" &&
      wiring.routeStrategy !== "balanced-oriented-cable-optimizer" &&
      wiring.routeStrategy !== "manual-authored-route") ||
    !Array.isArray(wiring.chainLengths) ||
    !Array.isArray(wiring.outputs)
  ) {
    throw new Error("Panel assemblies require a supported wiring lifecycle and route strategy.");
  }
  if (
    wiring.outputs.length === 0 ||
    wiring.chainLengths.length !== wiring.outputs.length ||
    wiring.chainLengths.some(
      (length) => !Number.isInteger(length) || (length as number) < 0,
    ) ||
    wiring.chainLengths.reduce(
      (total, length) => total + (length as number),
      0,
    ) !== panelCount
  ) {
    throw new Error(`Wiring must cover all ${panelCount} panels exactly once.`);
  }
  const connector = record(wiring, "connector");
  nonNegative(connector, "edgeInset");
  positive(connector, "surfaceOffset");

  const outputs = wiring.outputs.map((output) => {
    if (!isRecord(output)) throw new Error("Each wiring output must be an object.");
    return output;
  });
  const outputIndices = new Set<number>();
  for (let index = 0; index < outputs.length; index += 1) {
    const output = outputs[index]!;
    if (
      !Number.isInteger(output.outputIndex) ||
      (output.outputIndex as number) < 0 ||
      output.outputIndex !== index ||
      outputIndices.has(output.outputIndex as number) ||
      typeof output.label !== "string" ||
      output.label.length === 0 ||
      (output.gpio !== null &&
        (!Number.isInteger(output.gpio) || (output.gpio as number) < 0)) ||
      typeof output.color !== "string" ||
      !/^#[0-9a-fA-F]{6}$/.test(output.color)
    ) {
      throw new Error(
        "Wiring outputs require array-ordered non-negative indices, labels, optional GPIOs, and #RRGGBB colors.",
      );
    }
    outputIndices.add(output.outputIndex as number);
  }

  const hasRoute = outputs.some((output) => output.panelIds !== undefined);
  if (
    wiring.routeRevision !== undefined &&
    (!Number.isInteger(wiring.routeRevision) ||
      (wiring.routeRevision as number) < 1)
  ) {
    throw new Error("Wiring route revision must be an integer of at least 1.");
  }
  const lifecycle = getWiringLifecycleStatus(
    wiring as unknown as WiringDefinition,
  );
  if (lifecycle === "draft") {
    if (
      hasRoute ||
      wiring.routeRevision !== undefined ||
      wiring.hardwareProof !== undefined
    ) {
      throw new Error(
        "Draft wiring cannot contain an authored route, route revision, or proof.",
      );
    }
    return;
  }
  if (!hasRoute || outputs.some((output) => !Array.isArray(output.panelIds))) {
    throw new Error(
      "Non-draft wiring routes must provide ordered panelIds for every output.",
    );
  }

  const routedPanelIds = new Set<string>();
  let routesMatchCurrentPanels = true;
  for (let index = 0; index < outputs.length; index += 1) {
    const output = outputs[index]!;
    const route = output.panelIds as unknown[];
    if (route.some((panelId) => typeof panelId !== "string")) {
      throw new Error("Authored wiring routes must contain only panel IDs.");
    }
    if (route.length !== wiring.chainLengths[index]) {
      routesMatchCurrentPanels = false;
    }
    for (const panelId of route as string[]) {
      if (routedPanelIds.has(panelId)) {
        throw new Error("Authored wiring routes cannot repeat a panel ID.");
      }
      routedPanelIds.add(panelId);
      if (!knownPanelIds.has(panelId)) routesMatchCurrentPanels = false;
    }
  }
  if (routedPanelIds.size !== panelCount) {
    routesMatchCurrentPanels = false;
  }
  if (lifecycle !== "requires-review" && !routesMatchCurrentPanels) {
    throw new Error(
      "Authored wiring routes must match chain lengths and cover each known panel exactly once.",
    );
  }
  if (
    (lifecycle === "measured" || lifecycle === "hardware-verified") &&
    controller.status !== "measured"
  ) {
    throw new Error("Measured wiring requires a measured controller.");
  }
  const proof = wiring.hardwareProof;
  if (
    proof !== undefined &&
    (!isRecord(proof) ||
      proof.kind !== "proof-010-hardware-verification" ||
      proof.taskId !== "PROOF-010" ||
      proof.status !== "passed" ||
      !isLowercaseSha256(proof.deploymentIdentity) ||
      !isLowercaseSha256(proof.deviceReadbackSha256) ||
      !isLowercaseSha256(proof.asBuiltRecordSha256) ||
      !isLowercaseSha256(proof.parityProofSha256))
  ) {
    throw new Error("Wiring proof records must be passed PROOF-010 evidence.");
  }
  if (lifecycle === "hardware-verified") {
    if (
      proof === undefined ||
      controller.status !== "measured"
    ) {
      throw new Error(
        "Hardware-verified wiring requires a passed PROOF-010 evidence record and a measured controller.",
      );
    }
    throw new Error(
      "Hardware-verified wiring cannot activate before accepted PROOF-010 validation exists.",
    );
  } else if (proof !== undefined && lifecycle !== "requires-review") {
    throw new Error(
      "Only hardware-verified wiring can contain PROOF-010 evidence; stale proof records use requires-review.",
    );
  }
}

function validateInstalledAddressOptimizationFingerprintShape(
  definition: PanelAssemblyDefinition,
): void {
  const routeOptimized = definition.panels.filter(
    (panel) => panel.installedAddressTransform?.selectionMethod === "route-optimized",
  );
  const transformsWithFingerprint = definition.panels.filter(
    (panel) => panel.installedAddressTransform?.optimizationFingerprint !== undefined,
  );
  if (routeOptimized.length === 0 && transformsWithFingerprint.length === 0) return;

  for (const panel of definition.panels) {
    const transform = panel.installedAddressTransform;
    if (!transform) continue;
    if (
      transform.selectionMethod === "route-optimized" &&
      transform.optimizationFingerprint === undefined
    ) {
      throw new Error(
        "Route-optimized installed transforms require an optimization fingerprint.",
      );
    }
    if (
      transform.selectionMethod !== "route-optimized" &&
      transform.optimizationFingerprint !== undefined
    ) {
      throw new Error(
        "Only route-optimized installed transforms can contain an optimization fingerprint.",
      );
    }
  }
}

function validateInstalledAddressOptimizationFingerprint(
  definition: PanelAssemblyDefinition,
  panelProfile: PanelHardwareProfile,
): void {
  const routeOptimized = definition.panels.filter(
    (panel) => panel.installedAddressTransform?.selectionMethod === "route-optimized",
  );
  if (routeOptimized.length === 0) return;
  const expected = createInstalledAddressOptimizationFingerprint(
    definition,
    panelProfile,
  );
  if (routeOptimized.some(
    (panel) => panel.installedAddressTransform!.optimizationFingerprint !== expected,
  )) {
    throw new Error(
      "Route-optimized installed transforms require the current optimization fingerprint.",
    );
  }
}

export function parsePanelAssemblyDefinition(
  input: unknown,
): PanelAssemblyDefinition {
  if (!isRecord(input)) throw new Error("Panel assembly must be an object.");
  if (input.manualMechanics !== undefined) {
    throw new Error(
      "manualMechanics is retired. Use panel outlines and Manifold-generated mechanics.",
    );
  }
  if (
    input.schemaVersion !== "2.0.0" ||
    input.units !== "mm" ||
    (input.status !== "provisional" && input.status !== "measured") ||
    typeof input.id !== "string" ||
    input.id.length === 0 ||
    typeof input.name !== "string" ||
    input.name.length === 0
  ) {
    throw new Error("Unsupported panel-assembly header.");
  }
  const panelProfile = record(input, "panelProfile");
  assertOnlyKeys(panelProfile, ["id", "source"], "Panel profile");
  if (
    typeof panelProfile.id !== "string" ||
    panelProfile.id.length === 0 ||
    typeof panelProfile.source !== "string" ||
    panelProfile.source.length === 0
  ) {
    throw new Error("Panel profile requires non-empty id and source strings.");
  }
  const designSurface = input.designSurface;
  if (designSurface !== undefined) {
    if (
      !isRecord(designSurface) ||
      designSurface.kind !== "triangle-mesh" ||
      designSurface.format !== "glb" ||
      typeof designSurface.scaleToMillimeters !== "number" ||
      !Number.isFinite(designSurface.scaleToMillimeters) ||
      designSurface.scaleToMillimeters <= 0 ||
      designSurface.status !== "watertight"
    ) {
      throw new Error("Design surface must reference a validated GLB and SHA-256 hash.");
    }
    assertOnlyKeys(
      designSurface,
      ["kind", "format", "source", "sha256", "scaleToMillimeters", "status"],
      "Design surface",
    );
    assertProjectAssetReference(designSurface, "Design surface");
  }
  validateMappingDefinition(input.mapping);
  validateCalibration(input.calibration);
  validateStringArray(input.notes, "Notes");
  validateGeneratedMechanics(input.generatedMechanics);
  validateStructuralDesign(input.structuralDesign);
  validateGeneratedStructuralManifest(input.generatedStructure);
  validateUniqueProjectAssetSources(input);
  const hasMechanicalShell = input.mechanicalShell !== undefined;
  const hasClosures = input.closures !== undefined;
  const usesGeneratedMechanics = hasMechanicalShell && hasClosures;
  if (
    input.generatedStructure !== undefined &&
    (input.generatedMechanics !== undefined || hasMechanicalShell || hasClosures)
  ) {
    throw new Error(
      "Generated structural assets cannot be combined with planar mechanics.",
    );
  }
  if (
    input.boundaryTopology !== undefined &&
    (hasMechanicalShell || hasClosures)
  ) {
    throw new Error(
      "Panel-outline gap topology is a pose-first boundary input and cannot be combined with existing planar-shell mechanics.",
    );
  }
  if (hasMechanicalShell !== hasClosures) {
    throw new Error("Generated mechanics require both a mechanical shell and closure policy.");
  }
  const geometry = usesGeneratedMechanics
    ? record(input, "mechanicalShell")
    : undefined;
  validateAuthoringBoundary(geometry?.authoringBoundary);
  if (geometry && (
    (geometry.derivationStatus !== undefined &&
      geometry.derivationStatus !== "authored" &&
      geometry.derivationStatus !== "requires-regeneration") ||
    geometry.kind !== "explicit-planar-face-graph" ||
    !Array.isArray(geometry.vertices) ||
    !Array.isArray(geometry.faces)
  )) {
    throw new Error("Mechanical shell must be an explicit planar face graph.");
  }
  const sourceVertices = (geometry?.vertices ?? []) as unknown[];
  const sourceFaces = (geometry?.faces ?? []) as unknown[];
  for (const vertex of sourceVertices) {
    if (
      !Array.isArray(vertex) ||
      vertex.length !== 3 ||
      vertex.some((coordinate) =>
        typeof coordinate !== "number" || !Number.isFinite(coordinate)
      )
    ) {
      throw new Error("Every geometry vertex must contain three finite numbers.");
    }
  }
  const faceIds = new Set<string>();
  for (const face of sourceFaces) {
    const connectorPolicy = isRecord(face) ? face.connectorPolicy : undefined;
    const connectorPolicyIsValid = connectorPolicy === undefined ||
      (isRecord(connectorPolicy) &&
        connectorPolicy.minimumPanelHoleConnectors === 2 &&
        typeof connectorPolicy.reason === "string" &&
        connectorPolicy.reason.length > 0);
    if (
      !connectorPolicyIsValid ||
      !isRecord(face) ||
      typeof face.id !== "string" ||
      faceIds.has(face.id) ||
      (face.partId !== undefined &&
        (typeof face.partId !== "string" || face.partId.length === 0)) ||
      !Array.isArray(face.vertexIndices) ||
      face.vertexIndices.length < 3 ||
      face.vertexIndices.some(
        (index) =>
          !Number.isInteger(index) ||
          (index as number) < 0 ||
          (index as number) >= sourceVertices.length,
      )
    ) {
      throw new Error("Geometry faces require unique IDs and valid vertex indices.");
    }
    faceIds.add(face.id);
  }
  if (
    !Array.isArray(input.panels) ||
    (input.panels.length === 0 && usesGeneratedMechanics &&
      (geometry?.derivationStatus !== "requires-regeneration" ||
        !isRecord(geometry.authoringBoundary)))
  ) {
    throw new Error(
      "An empty panel assembly must be an authoring project with a stable boundary awaiting regeneration.",
    );
  }
  const panelIds = new Set<string>();
  const panelFaceIds = new Set<string>();
  for (const panel of input.panels) {
    const surfaceAttachment = isRecord(panel) ? panel.surfaceAttachment : undefined;
    const attachmentBarycentric = isRecord(surfaceAttachment)
      ? surfaceAttachment.barycentric
      : undefined;
    const surfaceAttachmentIsValid = surfaceAttachment === undefined ||
      (isRecord(surfaceAttachment) &&
        ((surfaceAttachment.surface === "mechanical-shell" &&
            usesGeneratedMechanics) ||
          ((surfaceAttachment.surface === undefined ||
            surfaceAttachment.surface === "design-surface") &&
            designSurface !== undefined)) &&
        Number.isInteger(surfaceAttachment.triangleIndex) &&
        (surfaceAttachment.triangleIndex as number) >= 0 &&
        Array.isArray(attachmentBarycentric) &&
        attachmentBarycentric.length === 3 &&
        attachmentBarycentric.every((value) =>
          typeof value === "number" && Number.isFinite(value) && value >= -1e-6
        ) &&
        Math.abs(attachmentBarycentric.reduce(
          (sum, value) => sum + (value as number),
          0,
        ) - 1) <= 1e-5 &&
        typeof surfaceAttachment.normalOffset === "number" &&
        Number.isFinite(surfaceAttachment.normalOffset) &&
        surfaceAttachment.normalOffset >= 0);
    const connectorPolicy = isRecord(panel) ? panel.connectorPolicy : undefined;
    const connectorPolicyIsValid = connectorPolicy === undefined ||
      (isRecord(connectorPolicy) &&
        connectorPolicy.allowSharedClosureAcrossAdjacentEdges === true &&
        typeof connectorPolicy.reason === "string" &&
        connectorPolicy.reason.length > 0);
    const installedAddressTransform = isRecord(panel)
      ? panel.installedAddressTransform
      : undefined;
    const installedAddressTransformIsValid = installedAddressTransform === undefined ||
      (isRecord(installedAddressTransform) &&
        (installedAddressTransform.status === "assumed" ||
          installedAddressTransform.status === "measured") &&
        installedAddressTransform.referenceView === "back" &&
        Number.isInteger(installedAddressTransform.quarterTurnsClockwise) &&
        (installedAddressTransform.quarterTurnsClockwise as number) >= 0 &&
        (installedAddressTransform.quarterTurnsClockwise as number) <= 3 &&
        typeof installedAddressTransform.mirrored === "boolean" &&
        (installedAddressTransform.selectionMethod === undefined ||
          installedAddressTransform.selectionMethod === "manual" ||
          installedAddressTransform.selectionMethod === "route-optimized") &&
        (installedAddressTransform.optimizationFingerprint === undefined ||
          (typeof installedAddressTransform.optimizationFingerprint === "string" &&
            /^[0-9a-f]{16}$/.test(installedAddressTransform.optimizationFingerprint))));
    const poseIsValid = isRecord(panel) && isValidPanelPose(panel.pose);
    if (
      !isRecord(panel) ||
      !connectorPolicyIsValid ||
      !installedAddressTransformIsValid ||
      !surfaceAttachmentIsValid ||
      typeof panel.id !== "string" ||
      panelIds.has(panel.id) ||
      (panel.faceType !== undefined &&
        panel.faceType !== "square-face" &&
        panel.faceType !== "pentagon-centre") ||
      (panel.neighborPanelIds !== undefined &&
        (!Array.isArray(panel.neighborPanelIds) ||
          panel.neighborPanelIds.some((id) =>
            typeof id !== "string" || id.length === 0
          ) ||
          new Set(panel.neighborPanelIds).size !== panel.neighborPanelIds.length)) ||
      (panel.rotationDegrees !== undefined &&
        panel.rotationDegrees !== null &&
        (typeof panel.rotationDegrees !== "number" || !Number.isFinite(panel.rotationDegrees))) ||
      (panel.mirrored !== undefined &&
        panel.mirrored !== null &&
        typeof panel.mirrored !== "boolean") ||
      (panel.mountFaceId === undefined
        ? usesGeneratedMechanics &&
          (surfaceAttachment === undefined ||
            geometry?.derivationStatus !== "requires-regeneration")
        : typeof panel.mountFaceId !== "string" ||
          panelFaceIds.has(panel.mountFaceId) ||
          !faceIds.has(panel.mountFaceId)) ||
      !poseIsValid
    ) {
      throw new Error(
        "Panels require unique IDs, valid optional mechanical associations, finite positions, and right-handed orthonormal orientations.",
      );
    }
    panelIds.add(panel.id);
    if (panel.mountFaceId !== undefined) panelFaceIds.add(panel.mountFaceId as string);
  }
  for (const panel of input.panels) {
    if (
      isRecord(panel) &&
      Array.isArray(panel.neighborPanelIds) &&
      panel.neighborPanelIds.some((id) => !panelIds.has(id as string))
    ) {
      throw new Error("Panel neighbor IDs must reference known panels.");
    }
  }
  if (
    input.panels.length === 0 &&
    (input.structuralDesign !== undefined || input.generatedStructure !== undefined)
  ) {
    throw new Error(
      "Structural design and generated structural assets require at least one panel pose.",
    );
  }
  const calibration = record(input, "calibration");
  validateStructuralPanelReferences(
    input.structuralDesign as StructuralDesignDefinition | undefined,
    panelIds,
  );
  if (
    calibration.installedPanelOrientation === "measured" &&
    input.panels.some((panel) =>
      !isRecord(panel.installedAddressTransform) ||
      panel.installedAddressTransform.status !== "measured"
    )
  ) {
    throw new Error(
      "Measured installed-panel orientation requires an explicit measured address transform for every panel.",
    );
  }
  if (
    calibration.installedPanelOrientation !== "measured" &&
    input.panels.some((panel) =>
      isRecord(panel.installedAddressTransform) &&
      panel.installedAddressTransform.status === "measured"
    )
  ) {
    throw new Error(
      "A measured panel address transform requires measured installed-panel orientation calibration.",
    );
  }
  if (input.boundaryTopology !== undefined) {
    const topology = input.boundaryTopology;
    const validCorners = new Set<PanelOutlineCornerId>([
      "bottom-left",
      "bottom-right",
      "top-right",
      "top-left",
    ]);
    if (
      !isRecord(topology) ||
      topology.kind !== "panel-outline-gap-cycles" ||
      !Array.isArray(topology.gaps) ||
      topology.gaps.length === 0
    ) {
      throw new Error(
        "Boundary topology must contain one or more panel-outline gap cycles.",
      );
    }
    const gapIds = new Set<string>();
    for (const gap of topology.gaps) {
      const cornerReferences = isRecord(gap) && Array.isArray(gap.vertices)
        ? gap.vertices.flatMap((vertex) =>
          isRecord(vertex) &&
            typeof vertex.panelId === "string" &&
            typeof vertex.corner === "string"
            ? [`${vertex.panelId}:${vertex.corner}`]
            : []
        )
        : [];
      if (
        isRecord(gap) &&
        Array.isArray(gap.vertices) &&
        cornerReferences.length === gap.vertices.length &&
        new Set(cornerReferences).size !== cornerReferences.length
      ) {
        throw new Error("Boundary gaps cannot repeat a panel-corner reference.");
      }
      if (
        !isRecord(gap) ||
        typeof gap.id !== "string" ||
        gap.id.length === 0 ||
        gapIds.has(gap.id) ||
        !Array.isArray(gap.vertices) ||
        gap.vertices.length < 3 ||
        gap.vertices.some((vertex) =>
          !isRecord(vertex) ||
          typeof vertex.panelId !== "string" ||
          !panelIds.has(vertex.panelId) ||
          !validCorners.has(vertex.corner as PanelOutlineCornerId)
        )
      ) {
        throw new Error(
          "Boundary gaps require unique IDs and at least three known panel-corner references.",
        );
      }
      gapIds.add(gap.id);
    }
  }
  if (!usesGeneratedMechanics) {
    validateWiring(record(input, "wiring"), input.panels.length, panelIds);
    validateInstalledAddressOptimizationFingerprintShape(
      input as unknown as PanelAssemblyDefinition,
    );
    return input as unknown as PanelAssemblyDefinition;
  }
  const closures = record(input, "closures");
  if (
    closures.generator !== "panel-hole-tabs" ||
    closures.holeSelection !== "minimum-total-edge-distance" ||
    closures.exteriorClipping !== "polyhedron-interior" ||
    !Array.isArray(closures.faceIds) ||
    closures.faceIds.length === 0
  ) {
    throw new Error("Closures must use panel-hole-tabs on assigned faces.");
  }
  const validHoleIds: PanelMountingHoleId[] = [
    "top-left",
    "middle-left",
    "bottom-left",
    "top-right",
    "middle-right",
    "bottom-right",
  ];
  if (closures.holePreferences !== undefined) {
    if (!Array.isArray(closures.holePreferences)) {
      throw new Error("Closure hole preferences must be an array.");
    }
    const preferredVertexCounts = new Set<number>();
    for (const preference of closures.holePreferences) {
      if (
        !isRecord(preference) ||
        !Number.isInteger(preference.closureVertexCount) ||
        (preference.closureVertexCount as number) < 3 ||
        preferredVertexCounts.has(preference.closureVertexCount as number) ||
        !Array.isArray(preference.panelHoleIds) ||
        preference.panelHoleIds.length === 0 ||
        new Set(preference.panelHoleIds).size !== preference.panelHoleIds.length ||
        preference.panelHoleIds.some(
          (id) => typeof id !== "string" || !validHoleIds.includes(id as PanelMountingHoleId),
        )
      ) {
        throw new Error(
          "Closure hole preferences require one unique hole set per face vertex count.",
        );
      }
      preferredVertexCounts.add(preference.closureVertexCount as number);
    }
  }
  const closureFaceIds = new Set<string>();
  for (const faceId of closures.faceIds) {
    if (
      typeof faceId !== "string" ||
      !faceIds.has(faceId) ||
      panelFaceIds.has(faceId) ||
      closureFaceIds.has(faceId)
    ) {
      throw new Error("Closure faces must be unique, known, and not panel faces.");
    }
    closureFaceIds.add(faceId);
  }
  if (panelFaceIds.size + closureFaceIds.size !== faceIds.size) {
    throw new Error("Every face must be assigned to exactly one panel or closure.");
  }
  for (const key of [
    "coverThickness",
    "flangeThickness",
    "flangeOverlap",
    "edgeLipDepth",
    "screwTabWidth",
    "screwTabEndMargin",
  ]) {
    positive(closures, key);
  }
  for (const key of [
    "coverCornerRadius",
    "connectorCornerClearance",
    "panelEnvelopeClearance",
  ]) {
    nonNegative(closures, key);
  }
  validateWiring(record(input, "wiring"), input.panels.length, panelIds);
  validateInstalledAddressOptimizationFingerprintShape(
    input as unknown as PanelAssemblyDefinition,
  );
  return input as unknown as PanelAssemblyDefinition;
}

export function assertMechanicalShellReady(
  project: PanelAssemblyProject,
): void {
  if (!project.sculpture.mechanicalShell || !project.sculpture.closures) {
    throw new Error(
      "Generic 3D-part generation is unavailable until generation input exists. Add a supported mechanical boundary, or wait for panel-outline boundary generation.",
    );
  }
  if (project.sculpture.mechanicalShell.derivationStatus === "requires-regeneration") {
    throw new Error(
      "Mechanical shell is out of date with design-surface panel poses; regenerate connector topology before producing CAD.",
    );
  }
}

function createValidatedPanelAssemblyProject(
  sculpture: PanelAssemblyDefinition,
  source: string,
  panelProfileInput: unknown,
): PanelAssemblyProject {
  const panelProfile = parsePanelHardwareProfile(panelProfileInput);
  if (sculpture.panelProfile.id !== panelProfile.id) {
    throw new Error(
      `Assembly requests ${sculpture.panelProfile.id}; loaded ${panelProfile.id}.`,
    );
  }
  validateInstalledAddressOptimizationFingerprint(sculpture, panelProfile);
  const project = { sculpture, panelProfile, source };
  if (sculpture.structuralDesign && sculpture.panels.length > 0) {
    normalizeStructuralDesign(project);
  }
  return project;
}

export function createPanelAssemblyProject(
  sculptureInput: unknown,
  source: string,
  panelProfileInput: unknown = panelProfileJson,
): PanelAssemblyProject {
  return createValidatedPanelAssemblyProject(
    parsePanelAssemblyDefinition(sculptureInput),
    source,
    panelProfileInput,
  );
}

export async function loadPanelAssemblyProject(
  sculptureInput: unknown,
  source: string,
  loadPanelProfile: (
    reference: PanelAssemblyDefinition["panelProfile"],
    sculptureSource: string,
  ) => Promise<unknown>,
): Promise<PanelAssemblyProject> {
  const sculpture = parsePanelAssemblyDefinition(sculptureInput);
  const panelProfileInput = await loadPanelProfile(
    sculpture.panelProfile,
    source,
  );
  return createValidatedPanelAssemblyProject(sculpture, source, panelProfileInput);
}

function vector(x: number, y: number, z: number): Vector3Data {
  return { x, y, z };
}

function add(a: Vector3Data, b: Vector3Data): Vector3Data {
  return vector(a.x + b.x, a.y + b.y, a.z + b.z);
}

function subtract(a: Vector3Data, b: Vector3Data): Vector3Data {
  return vector(a.x - b.x, a.y - b.y, a.z - b.z);
}

function scale(value: Vector3Data, amount: number): Vector3Data {
  return vector(value.x * amount, value.y * amount, value.z * amount);
}

function dot(a: Vector3Data, b: Vector3Data): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vector3Data, b: Vector3Data): Vector3Data {
  return vector(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  );
}

function normalize(value: Vector3Data): Vector3Data {
  const length = Math.hypot(value.x, value.y, value.z);
  if (length < 1e-10) throw new Error("Cannot normalize a zero vector.");
  return scale(value, 1 / length);
}

function mean(values: Vector3Data[]): Vector3Data {
  return scale(values.reduce(add, vector(0, 0, 0)), 1 / values.length);
}

function polygonNormal(values: Vector3Data[]): Vector3Data {
  const normal = vector(0, 0, 0);
  for (let index = 0; index < values.length; index += 1) {
    const current = values[index]!;
    const next = values[(index + 1) % values.length]!;
    normal.x += (current.y - next.y) * (current.z + next.z);
    normal.y += (current.z - next.z) * (current.x + next.x);
    normal.z += (current.x - next.x) * (current.y + next.y);
  }
  return normal;
}

function distanceSquared(a: Vector3Data, b: Vector3Data): number {
  return (
    (a.x - b.x) ** 2 +
    (a.y - b.y) ** 2 +
    (a.z - b.z) ** 2
  );
}

function panelHoles(
  panel: Omit<CompiledPanelPlacement, "mountingHoles" | "neighborPanelIds">,
  profile: PanelHardwareProfile,
): CompiledMountingHole[] {
  return profile.mounting.holes.map(
    ({ id, localPosition: profileLocalPosition, mechanicalUse, blockedBy }) => {
      const localPosition = panelBackViewPointToOutwardPoseLocal(
        profileLocalPosition,
      );
      return {
        id,
        localPosition,
        position: add(
          add(panel.position, scale(panel.xAxis, localPosition[0])),
          scale(panel.yAxis, localPosition[1]),
        ),
        mechanicalUse,
        blockedBy: blockedBy ?? null,
        assignedClosureId: null,
      };
    },
  );
}

/**
 * Prefers the hole nearest the middle of a cap edge so each panel side gets
 * one screw instead of a corner hole tying two adjacent edges.
 */
function holeToCapEdgeEvennessCost(
  point: Vector3Data,
  start: Vector3Data,
  end: Vector3Data,
): number {
  const segment = subtract(end, start);
  const lengthSquared = dot(segment, segment);
  const midpoint = add(start, scale(segment, 0.5));
  const t = lengthSquared === 0
    ? 0.5
    : Math.max(
      0,
      Math.min(1, dot(subtract(point, start), segment) / lengthSquared),
    );
  return distanceSquared(point, midpoint) +
    0.25 * (t - 0.5) * (t - 0.5) * lengthSquared;
}

export function compilePanelAssembly(
  project: PanelAssemblyProject,
): CompiledPanelAssembly {
  const definition = project.sculpture;
  const mechanicalShell = definition.mechanicalShell;
  const closures = definition.closures;
  if (!mechanicalShell || !closures) {
    throw new Error(
      "Projects without generated mechanics do not compile generic closure topology.",
    );
  }
  const vertices = mechanicalShell.vertices.map(([x, y, z]) =>
    vector(x, y, z),
  );
  const panelByFace = new Map(
    definition.panels.flatMap((panel) =>
      panel.mountFaceId === undefined ? [] : [[panel.mountFaceId, panel] as const]
    ),
  );
  const closureFaceIds = new Set(closures.faceIds);
  const faces: CompiledAssemblyFace[] = mechanicalShell.faces.map((source) => {
    const faceVertices = source.vertexIndices.map((index) => vertices[index]!);
    const panel = panelByFace.get(source.id);
    const role = panel ? "panel" : "closure";
    if (!panel && !closureFaceIds.has(source.id)) {
      throw new Error(`Face ${source.id} has no panel or closure assignment.`);
    }
    const center = mean(faceVertices);
    const firstEdge = subtract(faceVertices[1]!, faceVertices[0]!);
    const strictRawNormal = cross(
      firstEdge,
      subtract(faceVertices[2]!, faceVertices[1]!),
    );
    const strictNormal = normalize(strictRawNormal);
    const strictPlanarity = Math.max(...faceVertices.map((vertex) =>
      Math.abs(dot(subtract(vertex, center), strictNormal))
    ));
    const usesBoundedClosureProjection =
      role === "closure" && strictPlanarity > 1e-6;
    const rawNormal = usesBoundedClosureProjection
      ? polygonNormal(faceVertices)
      : strictRawNormal;
    const normal = normalize(rawNormal);
    if (dot(normal, center) <= 0) {
      throw new Error(`Face ${source.id} winding does not point away from the origin.`);
    }
    const planarityTolerance = role === "closure"
      ? GENERATED_CLOSURE_PLANARITY_MM
      : 1e-6;
    for (const vertex of faceVertices) {
      if (Math.abs(dot(subtract(vertex, center), normal)) > planarityTolerance) {
        throw new Error(`Face ${source.id} is not planar.`);
      }
    }
    const xAxis = normalize(usesBoundedClosureProjection
      ? subtract(firstEdge, scale(normal, dot(firstEdge, normal)))
      : firstEdge);
    const yAxis = normalize(cross(normal, xAxis));
    return {
      id: source.id,
      partId: source.partId ?? source.id,
      role,
      vertexIndices: [...source.vertexIndices],
      vertices: faceVertices,
      localVertices: faceVertices.map((vertex) => {
        const delta = subtract(vertex, center);
        return [dot(delta, xAxis), dot(delta, yAxis)];
      }),
      center,
      normal,
      xAxis,
      yAxis,
      adjacentFaceIds: [],
      panelId: panel?.id ?? null,
      connectors: [],
    };
  });
  const faceById = new Map(faces.map((face) => [face.id, face]));
  const panels: CompiledPanelPlacement[] = definition.panels.map((source) => {
    if (source.mountFaceId === undefined) {
      throw new Error(`Panel ${source.id} needs regenerated mechanical topology.`);
    }
    const face = faceById.get(source.mountFaceId)!;
    const axes = {
      xAxis: vector(...source.pose.orientation.xAxis),
      yAxis: vector(...source.pose.orientation.yAxis),
      normal: vector(...source.pose.orientation.normal),
    };
    const rawRotationDegrees =
      (Math.atan2(
        dot(axes.xAxis, face.yAxis),
        dot(axes.xAxis, face.xAxis),
      ) *
        180) /
      Math.PI;
    const rotationDegrees =
      Math.round(((rawRotationDegrees + 360) % 360) * 1e9) / 1e9;
    const base = {
      id: source.id,
      faceId: source.mountFaceId,
      rotationDegrees,
      position: vector(...source.pose.position),
      normal: axes.normal,
      xAxis: axes.xAxis,
      yAxis: axes.yAxis,
      width: project.panelProfile.dimensions.width,
      height: project.panelProfile.dimensions.height,
    };
    return {
      ...base,
      mountingHoles: panelHoles(base, project.panelProfile),
      neighborPanelIds: [],
    };
  });
  const panelById = new Map(panels.map((panel) => [panel.id, panel]));

  const edgeUses = new Map<
    string,
    Array<{
      face: CompiledAssemblyFace;
      edgeIndex: number;
      orderedVertices: [number, number];
    }>
  >();
  for (const face of faces) {
    for (let edgeIndex = 0; edgeIndex < face.vertexIndices.length; edgeIndex += 1) {
      const first = face.vertexIndices[edgeIndex]!;
      const second = face.vertexIndices[(edgeIndex + 1) % face.vertexIndices.length]!;
      const orderedVertices: [number, number] =
        first < second ? [first, second] : [second, first];
      const key = `${orderedVertices[0]}:${orderedVertices[1]}`;
      const uses = edgeUses.get(key) ?? [];
      uses.push({ face, edgeIndex, orderedVertices });
      edgeUses.set(key, uses);
    }
  }

  const pendingInterfaces: Array<{
    panel: CompiledPanelPlacement;
    panelEdgeIndex: number;
    closure: CompiledAssemblyFace;
    edgeStartIndex: number;
    edgeEndIndex: number;
    edgeStart: Vector3Data;
    edgeEnd: Vector3Data;
  }> = [];
  const edges: CompiledAssemblyEdge[] = [];
  for (const uses of [...edgeUses.values()].sort((first, second) => {
    const a = first[0]!.orderedVertices;
    const b = second[0]!.orderedVertices;
    return a[0] - b[0] || a[1] - b[1];
  })) {
    if (uses.length !== 2) throw new Error("Face graph must be a closed two-manifold.");
    const first = uses[0]!;
    const second = uses[1]!;
    first.face.adjacentFaceIds.push(second.face.id);
    second.face.adjacentFaceIds.push(first.face.id);
    const normalAngle =
      (Math.acos(
        Math.max(-1, Math.min(1, dot(first.face.normal, second.face.normal))),
      ) *
        180) /
      Math.PI;
    edges.push({
      id: `E-${String(edges.length + 1).padStart(2, "0")}`,
      vertexIndices: first.orderedVertices,
      vertices: [
        vertices[first.orderedVertices[0]]!,
        vertices[first.orderedVertices[1]]!,
      ],
      faceIds: [first.face.id, second.face.id],
      faceNormalAngleDegrees: normalAngle,
      interiorDihedralDegrees: 180 - normalAngle,
    });

    const panelUse = first.face.role === "panel" ? first : second.face.role === "panel" ? second : null;
    const closureUse = first.face.role === "closure" ? first : second.face.role === "closure" ? second : null;
    if (!panelUse && first.face.role === "closure" && second.face.role === "closure") {
      continue;
    }
    if (!closureUse && first.face.role === "panel" && second.face.role === "panel") {
      continue;
    }
    if (!panelUse || !closureUse) {
      throw new Error("Panel faces may border only generated closure faces.");
    }
    const panel = panelById.get(panelUse.face.panelId!)!;
    const edgeStartIndex = panelUse.face.vertexIndices[panelUse.edgeIndex]!;
    const edgeEndIndex =
      panelUse.face.vertexIndices[
        (panelUse.edgeIndex + 1) % panelUse.face.vertexIndices.length
      ]!;
    pendingInterfaces.push({
      panel,
      panelEdgeIndex: panelUse.edgeIndex,
      closure: closureUse.face,
      edgeStartIndex,
      edgeEndIndex,
      edgeStart: vertices[edgeStartIndex]!,
      edgeEnd: vertices[edgeEndIndex]!,
    });
  }

  for (const panel of panels) {
    const interfaces = pendingInterfaces
      .filter((candidate) => candidate.panel.id === panel.id)
      .sort(
        (a, b) =>
          a.panelEdgeIndex - b.panelEdgeIndex ||
          a.closure.id.localeCompare(b.closure.id),
      );
    const eligibleHoles = panel.mountingHoles.filter(
      (hole) => hole.mechanicalUse === "eligible",
    );
    if (interfaces.length > eligibleHoles.length) {
      throw new Error(
        `Panel ${panel.id} has ${interfaces.length} cap interfaces but only ${eligibleHoles.length} eligible mounting holes.`,
      );
    }
    const sourcePanel = definition.panels.find((source) => source.id === panel.id)!;
    if (
      !sourcePanel.connectorPolicy?.allowSharedClosureAcrossAdjacentEdges &&
      new Set(interfaces.map((candidate) => candidate.closure.id)).size !==
        interfaces.length
    ) {
      throw new Error(
        `Panel ${panel.id} cannot connect different caps to every screw hole.`,
      );
    }
    const allowsSharedClosure =
      sourcePanel.connectorPolicy?.allowSharedClosureAcrossAdjacentEdges === true;

    let bestScore = Number.POSITIVE_INFINITY;
    let bestAssignment: number[] | null = null;
    const assign = (
      holeIndex: number,
      assignment: number[],
      interfaceCounts: number[],
      score: number,
    ): void => {
      if (holeIndex === eligibleHoles.length) {
        if (
          interfaceCounts.every((count) => count > 0) &&
          score < bestScore
        ) {
          bestScore = score;
          bestAssignment = [...assignment];
        }
        return;
      }
      const hole = eligibleHoles[holeIndex]!;
      for (let interfaceIndex = 0; interfaceIndex < interfaces.length; interfaceIndex += 1) {
        if (!allowsSharedClosure && interfaceCounts[interfaceIndex]! > 0) continue;
        const panelInterface = interfaces[interfaceIndex]!;
        const preference = closures.holePreferences?.find(
          (candidate) =>
            candidate.closureVertexCount ===
            panelInterface.closure.vertexIndices.length,
        );
        const preferencePenalty =
          preference && !preference.panelHoleIds.includes(hole.id) ? 1e12 : 0;
        const candidateScore =
          score +
          preferencePenalty +
          holeToCapEdgeEvennessCost(
            hole.position,
            panelInterface.edgeStart,
            panelInterface.edgeEnd,
          );
        if (candidateScore >= bestScore) continue;
        const nextCounts = [...interfaceCounts];
        nextCounts[interfaceIndex] = nextCounts[interfaceIndex]! + 1;
        assign(
          holeIndex + 1,
          [...assignment, interfaceIndex],
          nextCounts,
          candidateScore,
        );
      }
    };
    assign(0, [], interfaces.map(() => 0), 0);
    if (!bestAssignment) {
      throw new Error(`Panel ${panel.id} has no valid cap-to-hole assignment.`);
    }

    eligibleHoles.forEach((hole, holeIndex) => {
      const panelInterface = interfaces[bestAssignment![holeIndex]!]!;
      hole.assignedClosureId = panelInterface.closure.partId;
      const edgeMidpoint = scale(
        add(panelInterface.edgeStart, panelInterface.edgeEnd),
        0.5,
      );
      const panelInwardAxis = normalize(
        subtract(panel.position, edgeMidpoint),
      );
      panelInterface.closure.connectors.push({
        panelId: panel.id,
        panelFaceId: panel.faceId,
        panelEdgeIndex: panelInterface.panelEdgeIndex,
        panelHoleId: hole.id,
        holePosition: hole.position,
        pilotPosition: add(
          hole.position,
          scale(
            panelInwardAxis,
            project.panelProfile.mounting.physicalCorrections.holeEdge,
          ),
        ),
        edgeVertices: [panelInterface.edgeStart, panelInterface.edgeEnd],
        edgeVertexIndices: [
          panelInterface.edgeStartIndex,
          panelInterface.edgeEndIndex,
        ],
        edgeAxis: normalize(
          subtract(panelInterface.edgeEnd, panelInterface.edgeStart),
        ),
        panelInwardAxis,
        panelInwardNormal: scale(panel.normal, -1),
      });
    });
  }

  const closureParts = new Map<string, CompiledAssemblyFace[]>();
  for (const closure of faces.filter((face) => face.role === "closure")) {
    closureParts.set(closure.partId, [
      ...(closureParts.get(closure.partId) ?? []),
      closure,
    ]);
  }
  for (const [partId, regions] of closureParts) {
    const connectors = regions.flatMap((region) => region.connectors);
    const minimumConnectors = Math.max(...regions.map((region) => {
      const sourceFace = mechanicalShell.faces.find(
        (face) => face.id === region.id,
      )!;
      return sourceFace.connectorPolicy?.minimumPanelHoleConnectors ?? 3;
    }));
    if (connectors.length < minimumConnectors) {
      throw new Error(
        "Printable part " + partId + " needs at least " + minimumConnectors + " panel-hole connectors; found " + connectors.length + ".",
      );
    }
    const normals = regions.map((region) => region.normal);
    if (normals.some((normal) => dot(normal, normals[0]!) < 1 - 1e-6)) {
      throw new Error(`Printable part ${partId} contains non-coplanar regions and cannot print flat.`);
    }
    const adjacentPanels = connectors.map((connector) => connector.panelId);
    for (const panelId of adjacentPanels) {
      const panel = panelById.get(panelId)!;
      panel.neighborPanelIds.push(
        ...adjacentPanels.filter(
          (candidate) =>
            candidate !== panelId && !panel.neighborPanelIds.includes(candidate),
        ),
      );
    }
  }
  for (const panel of panels) {
    const eligibleHoles = panel.mountingHoles.filter(
      (hole) => hole.mechanicalUse === "eligible",
    );
    const assignedHoles = eligibleHoles.filter(
      (hole) => hole.assignedClosureId !== null,
    );
    if (
      closures.holeSelection === "minimum-total-edge-distance" &&
      assignedHoles.length !== eligibleHoles.length
    ) {
      throw new Error(
        `Panel ${panel.id} does not use all four eligible mounting holes.`,
      );
    }
    const sourcePanel = definition.panels.find((source) => source.id === panel.id)!;
    if (
      !sourcePanel.connectorPolicy?.allowSharedClosureAcrossAdjacentEdges &&
      new Set(assignedHoles.map((hole) => hole.assignedClosureId)).size !==
        assignedHoles.length
    ) {
      throw new Error(
        `Panel ${panel.id} assigns more than one screw hole to the same cap.`,
      );
    }
    if (
      panel.mountingHoles.some(
        (hole) =>
          hole.mechanicalUse === "blocked" && hole.assignedClosureId !== null,
      )
    ) {
      throw new Error(
        `Panel ${panel.id} assigns a cap to a DIN/DOUT-blocked hole.`,
      );
    }
    panel.neighborPanelIds.sort();
  }
  const counts = {
    vertices: vertices.length,
    edges: edges.length,
    faces: faces.length,
    panels: panels.length,
    closures: faces.filter((face) => face.role === "closure").length,
    closureConnectors: faces
      .filter((face) => face.role === "closure")
      .reduce((total, face) => total + face.connectors.length, 0),
  };
  return {
    schemaVersion: "1.0.0",
    sculptureId: definition.id,
    source: project.source,
    vertices,
    faces,
    edges,
    panels,
    counts,
  };
}

function equirectangularUv(position: Vector3Data): { u: number; v: number } {
  const direction = normalize(position);
  return {
    u: (Math.atan2(direction.z, direction.x) / (2 * Math.PI) + 1) % 1,
    v: Math.acos(Math.max(-1, Math.min(1, direction.y))) / Math.PI,
  };
}

export function createPanelAssemblyMapping(
  project: PanelAssemblyProject,
  assembly?: CompiledPanelAssembly,
): LedMapping {
  const resolvedAssembly = assembly ??
    (!supportsRectangularPanelTools(project.panelProfile) ||
        !project.sculpture.mechanicalShell ||
        !project.sculpture.closures ||
        project.sculpture.mechanicalShell.derivationStatus === "requires-regeneration"
      ? null
      : compilePanelAssembly(project));
  const columns = project.panelProfile.pixelGrid.columns;
  const rows = project.panelProfile.pixelGrid.rows;
  const ledsPerPanel = columns * rows;
  const panelSources = resolvedAssembly?.panels ?? project.sculpture.panels.map(
    (source) => ({
      id: source.id,
      position: vector(...source.pose.position),
      normal: vector(...source.pose.orientation.normal),
      xAxis: vector(...source.pose.orientation.xAxis),
      yAxis: vector(...source.pose.orientation.yAxis),
      width: project.panelProfile.dimensions.width,
      height: project.panelProfile.dimensions.height,
      neighborPanelIds: source.neighborPanelIds ?? [],
      rotationDegrees: source.rotationDegrees ?? null,
    }),
  );
  const panels: PanelDefinition[] = panelSources.map((source) => {
    const sourcePanel = project.sculpture.panels.find((panel) => panel.id === source.id);
    return {
    id: source.id,
    faceType:
      sourcePanel?.faceType ??
      "square-face",
    transformStatus: project.sculpture.calibration.panelTransforms,
    position: source.position,
    normal: source.normal,
    xAxis: source.xAxis,
    yAxis: source.yAxis,
    previewWidth: source.width,
    previewHeight: source.height,
    neighborPanelIds: source.neighborPanelIds,
    ledIndices: [],
    rotationDegrees: source.rotationDegrees,
    mirrored: sourcePanel?.mirrored === undefined ? false : sourcePanel.mirrored,
    installedAddressTransform: sourcePanel?.installedAddressTransform ?? {
      status: "assumed",
      referenceView: "back",
      quarterTurnsClockwise: 0,
      mirrored: false,
    },
    pixelOrder: {
      status: project.panelProfile.pixelGrid.provisionalOrder.status,
      pixelZeroCorner:
        project.panelProfile.pixelGrid.provisionalOrder.pixelZeroCorner,
      traversalAxis:
        project.panelProfile.pixelGrid.provisionalOrder.traversalAxis,
      lineProgression:
        project.panelProfile.pixelGrid.provisionalOrder.lineProgression,
      serpentine: project.panelProfile.pixelGrid.provisionalOrder.serpentine,
      firstLineDirection:
        project.panelProfile.pixelGrid.provisionalOrder.firstLineDirection,
    },
    wiring: {
      status: "unassigned",
      output: null,
      chainPosition: null,
      previousPanelId: null,
      nextPanelId: null,
    },
    };
  });
  const entries: LedMappingEntry[] = [];
  const localEmitterPositions = panelEmitterLocalPositions(project.panelProfile);
  for (let panelIndex = 0; panelIndex < panels.length; panelIndex += 1) {
    const panel = panels[panelIndex]!;
    for (let pixelY = 0; pixelY < rows; pixelY += 1) {
      for (let pixelX = 0; pixelX < columns; pixelX += 1) {
        const physicalIndex =
          panelIndex * ledsPerPanel + pixelY * columns + pixelX;
        const [localX, localY, localZ] =
          localEmitterPositions[pixelY * columns + pixelX]!;
        const position = add(
          add(
            panel.position,
            scale(panel.xAxis, localX),
          ),
          add(
            scale(panel.yAxis, localY),
            scale(panel.normal, localZ),
          ),
        );
        entries.push({
          physicalIndex,
          logicalIndex: 0,
          panelId: panel.id,
          panelPixelX: pixelX,
          panelPixelY: pixelY,
          ...equirectangularUv(position),
          ...position,
        });
        panel.ledIndices.push(physicalIndex);
      }
    }
  }
  [...entries]
    .sort(
      (a, b) =>
        a.v - b.v || a.u - b.u || a.physicalIndex - b.physicalIndex,
    )
    .forEach((entry, logicalIndex) => {
      entry.logicalIndex = logicalIndex;
    });
  const closurePartMap = new Map<string, CompiledAssemblyFace[]>();
  for (const face of resolvedAssembly?.faces.filter(
    (candidate) => candidate.role === "closure",
  ) ?? []) {
    closurePartMap.set(face.partId, [
      ...(closurePartMap.get(face.partId) ?? []),
      face,
    ]);
  }
  return {
    id: project.sculpture.id,
    status: project.sculpture.status,
    topology: "panelized-sculpture",
    panelPixelGrid: { columns, rows },
    panels,
    mechanicalMounts: resolvedAssembly?.faces
      .filter((face) => face.role === "closure")
      .flatMap((face) =>
        face.connectors.map((connector) => ({
          closureFaceId: face.partId,
          panelId: connector.panelId,
          holeId: connector.panelHoleId,
          edgeMidpoint: scale(
            add(connector.edgeVertices[0], connector.edgeVertices[1]),
            0.5,
          ),
          holePosition: connector.holePosition,
          pilotPosition: connector.pilotPosition,
        })),
      ),
    printableClosures: resolvedAssembly?.faces
      .filter((face) => face.role === "closure")
      .filter((face, index, faces) =>
        faces.findIndex((candidate) => candidate.partId === face.partId) === index
      )
      .map((face) => ({
        id: face.partId,
        vertices: face.vertices,
        normal: face.normal,
        coverThickness: project.sculpture.closures!.coverThickness,
        exteriorClipping: project.sculpture.closures!.exteriorClipping,
        cadMeshAsset:
          `./generated-cad/${project.sculpture.id}/closure-${face.partId.toLowerCase()}.stl`,
        frame: {
          origin: face.center,
          xAxis: face.xAxis,
          yAxis: face.yAxis,
          inwardAxis: scale(face.normal, -1),
        },
        connectors: closurePartMap.get(face.partId)!
          .flatMap((region) => region.connectors).map((connector) => ({
          panelId: connector.panelId,
          holeId: connector.panelHoleId,
          pilotPosition: connector.pilotPosition,
          panelInwardNormal: connector.panelInwardNormal,
          panelMountOffset:
            project.panelProfile.dimensions.thickness +
            project.panelProfile.mounting.physicalCorrections.surfaceFlush,
          flangeThickness: project.sculpture.closures!.flangeThickness,
          screwTabWidth: project.sculpture.closures!.screwTabWidth,
          pilotDiameter: project.panelProfile.mounting.printedPilotDiameter,
        })),
      })),
    surfaceFaces: resolvedAssembly?.faces.map((face) => ({
      id: face.id,
      role: face.role === "panel" ? "panel" : "filler",
      vertices: face.vertices,
      normal: face.normal,
    })),
    notes: project.sculpture.mapping.notes ?? [
      project.sculpture.mechanicalShell
          ? "Panel transforms compile directly from explicit poses in sculpture.json; the mechanical shell supplies closure faces."
          : "Panel transforms compile directly from explicit poses in sculpture.json; no printable mechanics exist yet.",
      resolvedAssembly
        ? "Each closure connector targets a real, uniquely assigned PCB mounting hole."
        : project.sculpture.mechanicalShell
            ? "Mechanical previews are omitted until the design-surface poses receive regenerated shell topology."
            : "Mechanical previews are omitted because this project has no mechanics.",
      resolvedAssembly
        ? `${resolvedAssembly.edges.filter((edge) => edge.faceIds.every((faceId) => resolvedAssembly.faces.find((face) => face.id === faceId)?.role === "closure")).length} closure-to-closure edges are clean butt seams without PCB-hole tabs.`
        : "Printable closure and mechanical-mount layers are intentionally unavailable.",
      "Wiring endpoints and internal pixel order remain provisional.",
    ],
    entries,
  };
}
