import panelProfileJson from "../../catalog/panels/ws2812b-8x8-66x65.json" with {
  type: "json",
};
import {
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
  designSurface?: {
    kind: "triangle-mesh";
    format: "glb";
    source: string;
    sha256: string;
    scaleToMillimeters: number;
    status: "watertight";
  };
  panels: Array<{
    id: string;
    faceType?: "square-face" | "pentagon-centre";
    neighborPanelIds?: string[];
    rotationDegrees?: number | null;
    mirrored?: boolean | null;
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
  mechanicalShell: {
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
  closures: {
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
  manualMechanics?: {
    kind: "manually-authored-parts";
    generator: "verified-scad-wrappers";
    centerPanelMount: Record<string, unknown>;
    openings: Record<string, unknown>;
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

function validateWiring(
  wiring: Record<string, unknown>,
  panelCount: number,
): void {
  const controller = record(wiring, "controller");
  if (
    controller.placement !== "near-top" ||
    controller.status !== "provisional"
  ) {
    throw new Error("Panel assemblies require a provisional near-top controller.");
  }
  if (
    wiring.status !== "provisional" ||
    (wiring.routeStrategy !== "face-adjacency-nearest-neighbor" &&
      wiring.routeStrategy !== "longitude-sectors-nearest-neighbor") ||
    !Array.isArray(wiring.chainLengths) ||
    !Array.isArray(wiring.outputs)
  ) {
    throw new Error("Panel assemblies require provisional adjacency wiring.");
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
}

export function parsePanelAssemblyDefinition(
  input: unknown,
): PanelAssemblyDefinition {
  if (!isRecord(input)) throw new Error("Panel assembly must be an object.");
  if (
    input.schemaVersion !== "2.0.0" ||
    input.units !== "mm" ||
    (input.status !== "provisional" && input.status !== "measured") ||
    typeof input.id !== "string" ||
    typeof input.name !== "string"
  ) {
    throw new Error("Unsupported panel-assembly header.");
  }
  const panelProfile = record(input, "panelProfile");
  if (
    typeof panelProfile.id !== "string" ||
    panelProfile.id.length === 0 ||
    typeof panelProfile.source !== "string" ||
    panelProfile.source.length === 0
  ) {
    throw new Error("Panel profile requires non-empty id and source strings.");
  }
  const designSurface = input.designSurface;
  if (
    designSurface !== undefined &&
    (!isRecord(designSurface) ||
      designSurface.kind !== "triangle-mesh" ||
      designSurface.format !== "glb" ||
      typeof designSurface.source !== "string" ||
      designSurface.source.length === 0 ||
      typeof designSurface.sha256 !== "string" ||
      designSurface.sha256.length !== 64 ||
      [...designSurface.sha256.toLowerCase()].some(
        (character) => !"0123456789abcdef".includes(character),
      ) ||
      typeof designSurface.scaleToMillimeters !== "number" ||
      !Number.isFinite(designSurface.scaleToMillimeters) ||
      designSurface.scaleToMillimeters <= 0 ||
      designSurface.status !== "watertight")
  ) {
    throw new Error("Design surface must reference a validated GLB and SHA-256 hash.");
  }
  const manualMechanics = input.manualMechanics;
  const usesManualMechanics = manualMechanics !== undefined;
  if (
    usesManualMechanics &&
    (!isRecord(manualMechanics) ||
      manualMechanics.kind !== "manually-authored-parts" ||
      manualMechanics.generator !== "verified-scad-wrappers" ||
      !isRecord(manualMechanics.centerPanelMount) ||
      !isRecord(manualMechanics.openings))
  ) {
    throw new Error("Manual mechanics must reference the verified authored-part contract.");
  }
  if (usesManualMechanics && (input.mechanicalShell !== undefined || input.closures !== undefined)) {
    throw new Error("Manual mechanics cannot also request generated closure topology.");
  }
  if (!usesManualMechanics && (input.mechanicalShell === undefined || input.closures === undefined)) {
    throw new Error("Generated mechanics require a mechanical shell and closure policy.");
  }
  const geometry = usesManualMechanics
    ? { kind: "explicit-planar-face-graph", vertices: [], faces: [] }
    : record(input, "mechanicalShell");
  if (
    (geometry.derivationStatus !== undefined &&
      geometry.derivationStatus !== "authored" &&
      geometry.derivationStatus !== "requires-regeneration") ||
    geometry.kind !== "explicit-planar-face-graph" ||
    !Array.isArray(geometry.vertices) ||
    !Array.isArray(geometry.faces)
  ) {
    throw new Error("Mechanical shell must be an explicit planar face graph.");
  }
  const sourceVertices = geometry.vertices;
  const sourceFaces = geometry.faces;
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
    (input.panels.length === 0 &&
      (geometry.derivationStatus !== "requires-regeneration" ||
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
        (surfaceAttachment.surface === "mechanical-shell" ||
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
    const pose = isRecord(panel) && isRecord(panel.pose) ? panel.pose : null;
    const position = pose?.position;
    const orientation =
      pose && isRecord(pose.orientation) ? pose.orientation : null;
    const xAxis = orientation?.xAxis;
    const yAxis = orientation?.yAxis;
    const normal = orientation?.normal;
    const isFiniteAxis = (axis: unknown): axis is number[] =>
      Array.isArray(axis) &&
      axis.length === 3 &&
      axis.every(
        (coordinate) =>
          typeof coordinate === "number" && Number.isFinite(coordinate),
      );
    const orientationIsFinite =
      isFiniteAxis(xAxis) && isFiniteAxis(yAxis) && isFiniteAxis(normal);
    const orthonormalError = orientationIsFinite
      ? Math.max(
          Math.abs(Math.hypot(...xAxis) - 1),
          Math.abs(Math.hypot(...yAxis) - 1),
          Math.abs(Math.hypot(...normal) - 1),
          Math.abs(
            xAxis[0]! * yAxis[0]! +
              xAxis[1]! * yAxis[1]! +
              xAxis[2]! * yAxis[2]!,
          ),
          Math.abs(
            xAxis[0]! * normal[0]! +
              xAxis[1]! * normal[1]! +
              xAxis[2]! * normal[2]!,
          ),
          Math.abs(
            yAxis[0]! * normal[0]! +
              yAxis[1]! * normal[1]! +
              yAxis[2]! * normal[2]!,
          ),
          Math.hypot(
            xAxis[1]! * yAxis[2]! - xAxis[2]! * yAxis[1]! - normal[0]!,
            xAxis[2]! * yAxis[0]! - xAxis[0]! * yAxis[2]! - normal[1]!,
            xAxis[0]! * yAxis[1]! - xAxis[1]! * yAxis[0]! - normal[2]!,
          ),
        )
      : Number.POSITIVE_INFINITY;
    if (
      !isRecord(panel) ||
      !connectorPolicyIsValid ||
      !surfaceAttachmentIsValid ||
      typeof panel.id !== "string" ||
      panelIds.has(panel.id) ||
      (panel.faceType !== undefined &&
        panel.faceType !== "square-face" &&
        panel.faceType !== "pentagon-centre") ||
      (panel.neighborPanelIds !== undefined &&
        (!Array.isArray(panel.neighborPanelIds) ||
          panel.neighborPanelIds.some((id) => typeof id !== "string"))) ||
      (panel.rotationDegrees !== undefined &&
        panel.rotationDegrees !== null &&
        (typeof panel.rotationDegrees !== "number" || !Number.isFinite(panel.rotationDegrees))) ||
      (panel.mirrored !== undefined &&
        panel.mirrored !== null &&
        typeof panel.mirrored !== "boolean") ||
      (panel.mountFaceId === undefined
        ? !usesManualMechanics &&
          (surfaceAttachment === undefined ||
            geometry.derivationStatus !== "requires-regeneration")
        : typeof panel.mountFaceId !== "string" ||
          panelFaceIds.has(panel.mountFaceId) ||
          !faceIds.has(panel.mountFaceId)) ||
      !Array.isArray(position) ||
      position.length !== 3 ||
      position.some(
        (coordinate) =>
          typeof coordinate !== "number" || !Number.isFinite(coordinate),
      ) ||
      !orientationIsFinite ||
      orthonormalError > 1e-6
    ) {
      throw new Error(
        "Panels require unique IDs, valid mechanical associations (or a surface attachment while regeneration is required), finite positions, and right-handed orthonormal orientations.",
      );
    }
    panelIds.add(panel.id);
    if (panel.mountFaceId !== undefined) panelFaceIds.add(panel.mountFaceId as string);
  }
  if (usesManualMechanics) {
    for (const panel of input.panels) {
      if (
        !isRecord(panel) ||
        panel.faceType === undefined ||
        !Array.isArray(panel.neighborPanelIds) ||
        panel.neighborPanelIds.some((id) => !panelIds.has(id as string))
      ) {
        throw new Error(
          "Manual-mechanics panels require a face type and known neighbor panel IDs.",
        );
      }
    }
    validateWiring(record(input, "wiring"), input.panels.length);
    if (!Array.isArray(input.notes)) throw new Error("Notes must be an array.");
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
  validateWiring(record(input, "wiring"), input.panels.length);
  if (!Array.isArray(input.notes)) throw new Error("Notes must be an array.");
  return input as unknown as PanelAssemblyDefinition;
}

export function assertMechanicalShellReady(
  project: PanelAssemblyProject,
): void {
  if (project.sculpture.manualMechanics) {
    throw new Error(
      "This sculpture uses manually authored printable parts; generic closure CAD generation is intentionally unavailable.",
    );
  }
  if (project.sculpture.mechanicalShell!.derivationStatus === "requires-regeneration") {
    throw new Error(
      "Mechanical shell is out of date with design-surface panel poses; regenerate connector topology before producing CAD.",
    );
  }
}

export function createPanelAssemblyProject(
  sculptureInput: unknown,
  source: string,
  panelProfileInput: unknown = panelProfileJson,
): PanelAssemblyProject {
  const sculpture = parsePanelAssemblyDefinition(sculptureInput);
  const panelProfile = parsePanelHardwareProfile(panelProfileInput);
  if (sculpture.panelProfile.id !== panelProfile.id) {
    throw new Error(
      `Assembly requests ${sculpture.panelProfile.id}; loaded ${panelProfile.id}.`,
    );
  }
  return { sculpture, panelProfile, source };
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
  return createPanelAssemblyProject(sculpture, source, panelProfileInput);
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
    ({ id, localPosition, mechanicalUse, blockedBy }) => ({
      id,
      localPosition: [...localPosition],
      position: add(
        add(panel.position, scale(panel.xAxis, localPosition[0])),
        scale(panel.yAxis, localPosition[1]),
      ),
      mechanicalUse,
      blockedBy: blockedBy ?? null,
      assignedClosureId: null,
    }),
  );
}

function pointToSegmentDistanceSquared(
  point: Vector3Data,
  start: Vector3Data,
  end: Vector3Data,
): number {
  const segment = subtract(end, start);
  const lengthSquared = dot(segment, segment);
  const projection =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, dot(subtract(point, start), segment) / lengthSquared),
        );
  return distanceSquared(point, add(start, scale(segment, projection)));
}

export function compilePanelAssembly(
  project: PanelAssemblyProject,
): CompiledPanelAssembly {
  const definition = project.sculpture;
  if (definition.manualMechanics || !definition.mechanicalShell || !definition.closures) {
    throw new Error(
      "Manual authored-part sculptures do not compile generic closure topology.",
    );
  }
  const vertices = definition.mechanicalShell.vertices.map(([x, y, z]) =>
    vector(x, y, z),
  );
  const panelByFace = new Map(
    definition.panels.flatMap((panel) =>
      panel.mountFaceId === undefined ? [] : [[panel.mountFaceId, panel] as const]
    ),
  );
  const closureFaceIds = new Set(definition.closures.faceIds);
  const faces: CompiledAssemblyFace[] = definition.mechanicalShell.faces.map((source) => {
    const faceVertices = source.vertexIndices.map((index) => vertices[index]!);
    const center = mean(faceVertices);
    const firstEdge = subtract(faceVertices[1]!, faceVertices[0]!);
    const rawNormal = cross(firstEdge, subtract(faceVertices[2]!, faceVertices[1]!));
    const normal = normalize(rawNormal);
    if (dot(normal, center) <= 0) {
      throw new Error(`Face ${source.id} winding does not point away from the origin.`);
    }
    for (const vertex of faceVertices) {
      if (Math.abs(dot(subtract(vertex, center), normal)) > 1e-6) {
        throw new Error(`Face ${source.id} is not planar.`);
      }
    }
    const xAxis = normalize(firstEdge);
    const yAxis = normalize(cross(normal, xAxis));
    const panel = panelByFace.get(source.id);
    const role = panel ? "panel" : "closure";
    if (!panel && !closureFaceIds.has(source.id)) {
      throw new Error(`Face ${source.id} has no panel or closure assignment.`);
    }
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

    let bestScore = Number.POSITIVE_INFINITY;
    let bestAssignment: CompiledMountingHole[] | null = null;
    const assign = (
      interfaceIndex: number,
      remainingHoles: CompiledMountingHole[],
      assignment: CompiledMountingHole[],
      score: number,
    ): void => {
      if (interfaceIndex === interfaces.length) {
        if (score < bestScore) {
          bestScore = score;
          bestAssignment = [...assignment];
        }
        return;
      }
      const panelInterface = interfaces[interfaceIndex]!;
      const preference = definition.closures.holePreferences?.find(
        (candidate) =>
          candidate.closureVertexCount ===
          panelInterface.closure.vertexIndices.length,
      );
      for (let holeIndex = 0; holeIndex < remainingHoles.length; holeIndex += 1) {
        const hole = remainingHoles[holeIndex]!;
        const preferencePenalty =
          preference && !preference.panelHoleIds.includes(hole.id) ? 1e12 : 0;
        const candidateScore =
          score +
          preferencePenalty +
          pointToSegmentDistanceSquared(
            hole.position,
            panelInterface.edgeStart,
            panelInterface.edgeEnd,
          );
        if (candidateScore >= bestScore) continue;
        assign(
          interfaceIndex + 1,
          remainingHoles.filter((_, index) => index !== holeIndex),
          [...assignment, hole],
          candidateScore,
        );
      }
    };
    assign(0, eligibleHoles, [], 0);
    if (!bestAssignment) {
      throw new Error(`Panel ${panel.id} has no valid cap-to-hole assignment.`);
    }

    interfaces.forEach((panelInterface, index) => {
      const hole = bestAssignment![index]!;
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
      const sourceFace = definition.mechanicalShell.faces.find(
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
      definition.closures.holeSelection === "minimum-total-edge-distance" &&
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
    (project.sculpture.manualMechanics ||
        project.sculpture.mechanicalShell?.derivationStatus === "requires-regeneration"
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
  for (let panelIndex = 0; panelIndex < panels.length; panelIndex += 1) {
    const panel = panels[panelIndex]!;
    const pitchX = panel.previewWidth / (columns + 1);
    const pitchY = panel.previewHeight / (rows + 1);
    for (let pixelY = 0; pixelY < rows; pixelY += 1) {
      for (let pixelX = 0; pixelX < columns; pixelX += 1) {
        const physicalIndex =
          panelIndex * ledsPerPanel + pixelY * columns + pixelX;
        const position = add(
          add(
            panel.position,
            scale(panel.xAxis, (pixelX - (columns - 1) / 2) * pitchX),
          ),
          add(
            scale(panel.yAxis, ((rows - 1) / 2 - pixelY) * pitchY),
            scale(panel.normal, project.panelProfile.pixelGrid.emitterOffset),
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
      project.sculpture.manualMechanics
        ? "Panel transforms compile directly from explicit poses; printable mechanics remain in the manually authored SCAD parts."
        : "Panel transforms compile directly from explicit poses in sculpture.json; the mechanical shell supplies closure faces.",
      resolvedAssembly
        ? "Each closure connector targets a real, uniquely assigned PCB mounting hole."
        : project.sculpture.manualMechanics
          ? "Generic closure and mechanical-mount preview layers are intentionally omitted."
          : "Mechanical previews are omitted until the design-surface poses receive regenerated shell topology.",
      resolvedAssembly
        ? `${resolvedAssembly.edges.filter((edge) => edge.faceIds.every((faceId) => resolvedAssembly.faces.find((face) => face.id === faceId)?.role === "closure")).length} closure-to-closure edges are clean butt seams without PCB-hole tabs.`
        : "Printable closure and mechanical-mount layers are intentionally unavailable.",
      "Wiring endpoints and internal pixel order remain provisional.",
    ],
    entries,
  };
}
