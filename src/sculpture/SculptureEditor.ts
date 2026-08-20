import {
  parsePanelAssemblyDefinition,
  type PanelAssemblyDefinition,
} from "./PanelAssembly.ts";
import { preserveAuthoringBoundary } from "./MechanicalShellRegenerator.ts";
import {
  createMechanicalSurfaceOrientation,
} from "./DesignSurface.ts";

type Vector3Tuple = [number, number, number];
type Vector2Tuple = [number, number];

export interface AddPanelDimensions {
  width: number;
  height: number;
}

function add(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(value: Vector3Tuple, amount: number): Vector3Tuple {
  return [value[0] * amount, value[1] * amount, value[2] * amount];
}

function cross(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: Vector3Tuple, b: Vector3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(value: Vector3Tuple): Vector3Tuple {
  const length = Math.hypot(...value);
  if (length < 1e-10) {
    throw new Error("Cannot derive a panel pose from a degenerate face.");
  }
  return scale(value, 1 / length);
}

export function markGeneratedMechanicsStale(
  definition: PanelAssemblyDefinition,
): void {
  if (!definition.mechanicalShell) return;
  definition.mechanicalShell.derivationStatus = "requires-regeneration";
}

export function markManualMechanicsRequiresReview(
  definition: PanelAssemblyDefinition,
  _affectedPanelIds: readonly string[],
): void {
  if (definition.manualMechanics) {
    definition.manualMechanics.compatibilityStatus = "requires-review";
  }
}

export function markPanelEditConsequences(
  definition: PanelAssemblyDefinition,
  affectedPanelIds: readonly string[],
): void {
  if (definition.manualMechanics) {
    markManualMechanicsRequiresReview(definition, affectedPanelIds);
  } else {
    markGeneratedMechanicsStale(definition);
  }
  definition.status = "provisional";
  definition.wiring.status = "provisional";
  definition.wiring.controller.status = "provisional";
  definition.calibration.panelTransforms = "generated-provisional";
  definition.calibration.installedPanelOrientation = "provisional";
  definition.calibration.physicalChains = "provisional";
}

export function projectPanelOrientationOntoSurface(
  sourceXAxis: Vector3Tuple,
  surfaceNormal: Vector3Tuple,
): { xAxis: Vector3Tuple; yAxis: Vector3Tuple } {
  const normal = normalize(surfaceNormal);
  let xAxis = subtract(
    sourceXAxis,
    scale(normal, dot(sourceXAxis, normal)),
  );
  if (Math.hypot(...xAxis) < 1e-8) {
    xAxis = cross([0, 1, 0], normal);
    if (Math.hypot(...xAxis) < 1e-8) {
      xAxis = cross([1, 0, 0], normal);
    }
  }
  xAxis = normalize(xAxis);
  const yAxis = normalize(cross(normal, xAxis));
  return { xAxis, yAxis };
}

function mean(values: Vector3Tuple[]): Vector3Tuple {
  return scale(values.reduce(add), 1 / values.length);
}

function nextPanelId(definition: PanelAssemblyDefinition): string {
  const used = new Set(definition.panels.map((panel) => panel.id));
  for (let number = 1; ; number += 1) {
    const candidate = `P-${String(number).padStart(2, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
}

function containsConvexPolygon(
  polygon: Vector2Tuple[],
  points: Vector2Tuple[],
): boolean {
  return points.every((point) =>
    polygon.every((start, index) => {
      const end = polygon[(index + 1) % polygon.length]!;
      return (
        (end[0] - start[0]) * (point[1] - start[1]) -
          (end[1] - start[1]) * (point[0] - start[0]) >=
        -1e-6
      );
    })
  );
}

function fitPanelRectangle(
  polygon: Vector2Tuple[],
  width: number,
  height: number,
): { angle: number; corners: Vector2Tuple[] } | null {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const sourceCorners: Vector2Tuple[] = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ];
  for (let degrees = 0; degrees < 180; degrees += 1) {
    const angle = (degrees * Math.PI) / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const corners = sourceCorners.map<Vector2Tuple>(([x, y]) => [
      x * cosine - y * sine,
      x * sine + y * cosine,
    ]);
    if (containsConvexPolygon(polygon, corners)) return { angle, corners };
  }
  return null;
}

function partitionRing(
  outer: number[],
  inner: number[],
  anchorEdgeIndices: number[],
  vertices: Vector3Tuple[],
  normal: Vector3Tuple,
): number[][] {
  if (anchorEdgeIndices.length < 2) {
    throw new Error("An inset panel needs at least two populated neighboring faces.");
  }
  const anchors = [...anchorEdgeIndices].sort((a, b) => a - b);
  return anchors.map((outerStart, sectorIndex) => {
    const outerEnd = anchors[(sectorIndex + 1) % anchors.length]!;
    const outerEdgeCount = (outerEnd - outerStart + outer.length) % outer.length || outer.length;
    const sector = Array.from(
      { length: outerEdgeCount + 1 },
      (_, offset) => outer[(outerStart + offset) % outer.length]!,
    );
    const innerStart = Math.round((sectorIndex * inner.length) / anchors.length);
    const innerEnd = Math.round(((sectorIndex + 1) * inner.length) / anchors.length);
    for (let index = innerEnd; index >= innerStart; index -= 1) {
      sector.push(inner[index % inner.length]!);
    }
    const a = vertices[sector[0]!]!;
    const b = vertices[sector[1]!]!;
    const c = vertices[sector[2]!]!;
    if (dot(cross(subtract(b, a), subtract(c, b)), normal) < 0) {
      sector.reverse();
    }
    return sector;
  });
}

/**
 * Insets a PCB into a convex closure face and replaces the surrounding annulus
 * with closure sectors anchored between the new panel and populated neighbors.
 * When only three neighbors exist, one sector intentionally serves two holes.
 */
export function addPanelToClosureFace(
  source: PanelAssemblyDefinition,
  faceId: string,
  panelDimensions: AddPanelDimensions,
): PanelAssemblyDefinition {
  const definition = structuredClone(source);
  const mechanicalShell = definition.mechanicalShell;
  const closures = definition.closures;
  if (!mechanicalShell || !closures) {
    throw new Error("Adding to a closure face requires existing generated mechanics.");
  }
  const closureIndex = closures.faceIds.indexOf(faceId);
  preserveAuthoringBoundary(definition);
  if (closureIndex < 0) {
    throw new Error(`${faceId} is not an available closure face.`);
  }
  const faceIndex = mechanicalShell.faces.findIndex(
    (candidate) => candidate.id === faceId,
  );
  const face = mechanicalShell.faces[faceIndex];
  if (!face) throw new Error("Mechanical face " + faceId + " does not exist.");
  const originalVertices = face.vertexIndices.map(
    (vertexIndex) => mechanicalShell.vertices[vertexIndex]!,
  );
  const position = mean(originalVertices);
  const xAxis = normalize(subtract(originalVertices[1]!, originalVertices[0]!));
  let normal = normalize(
    cross(
      subtract(originalVertices[1]!, originalVertices[0]!),
      subtract(originalVertices[2]!, originalVertices[1]!),
    ),
  );
  if (dot(normal, position) < 0) normal = scale(normal, -1);
  const yAxis = normalize(cross(normal, xAxis));
  const panelFaceIds = new Set(
    definition.panels.map((panel) => panel.mountFaceId),
  );
  const panelAnchorEdges = () =>
    face.vertexIndices.flatMap((start, edgeIndex) => {
      const end = face.vertexIndices[(edgeIndex + 1) % face.vertexIndices.length]!;
      const neighbor = mechanicalShell.faces.find((candidate) =>
        candidate.id !== faceId && panelFaceIds.has(candidate.id) &&
        candidate.vertexIndices.some((value, candidateIndex) => {
          const next = candidate.vertexIndices[
            (candidateIndex + 1) % candidate.vertexIndices.length
          ]!;
          return (value === start && next === end) ||
            (value === end && next === start);
        })
      );
      if (!neighbor) return [];
      const neighborEdgeIndex = neighbor.vertexIndices.findIndex((value, index) => {
        const next = neighbor.vertexIndices[(index + 1) % neighbor.vertexIndices.length]!;
        return (value === start && next === end) ||
          (value === end && next === start);
      });
      return [{ edgeIndex, neighbor, neighborEdgeIndex }];
    });
  const anchors = panelAnchorEdges();
  const vertices = face.vertexIndices.map(
    (vertexIndex) => mechanicalShell.vertices[vertexIndex]!,
  );
  const localPolygon = vertices.map<Vector2Tuple>((vertex) => {
    const delta = subtract(vertex, position);
    return [dot(delta, xAxis), dot(delta, yAxis)];
  });
  const clearance = closures.panelEnvelopeClearance;
  const fit = fitPanelRectangle(
    localPolygon,
    panelDimensions.width + clearance * 2,
    panelDimensions.height + clearance * 2,
  );
  if (!fit) {
    throw new Error(
      `${faceId} cannot contain a ${panelDimensions.width} × ${panelDimensions.height} mm panel plus ${clearance} mm clearance.`,
    );
  }
  const cosine = Math.cos(fit.angle);
  const sine = Math.sin(fit.angle);
  const panelXAxis = add(scale(xAxis, cosine), scale(yAxis, sine));
  const panelYAxis = add(scale(xAxis, -sine), scale(yAxis, cosine));
  const innerIndices = fit.corners.map(([x, y]) => {
    const vertex = add(add(position, scale(xAxis, x)), scale(yAxis, y));
    mechanicalShell.vertices.push(vertex);
    return mechanicalShell.vertices.length - 1;
  });
  const anchorEdgeIndices = anchors.map((anchor) => anchor.edgeIndex);
  const ringSectors = partitionRing(
    face.vertexIndices,
    innerIndices,
    anchorEdgeIndices,
    mechanicalShell.vertices,
    normal,
  );
  const closureFaces = ringSectors.map((vertexIndices, index) => ({
    id: `${faceId}-C-${String(index + 1).padStart(2, "0")}`,
    vertexIndices,
    connectorPolicy: {
      minimumPanelHoleConnectors: 2 as const,
      reason: "Inset ring sectors are strip-like parts anchored to both the new panel and an existing neighboring panel.",
    },
  }));
  mechanicalShell.faces.splice(
    faceIndex,
    1,
    { id: faceId, vertexIndices: innerIndices },
    ...closureFaces,
  );
  closures.faceIds.splice(
    closureIndex,
    1,
    ...closureFaces.map((closure) => closure.id),
  );
  definition.panels.push({
    id: nextPanelId(definition),
    mountFaceId: faceId,
    connectorPolicy: anchors.length < 4
      ? {
          allowSharedClosureAcrossAdjacentEdges: true as const,
          reason: "Only three populated neighboring faces are available to anchor four eligible panel holes.",
        }
      : undefined,
    pose: {
      position,
      orientation: {
        xAxis: panelXAxis,
        yAxis: panelYAxis,
        normal,
      },
    },
  });

  const shortestOutput = definition.wiring.chainLengths.reduce(
    (bestIndex, length, index, lengths) =>
      length < lengths[bestIndex]! ? index : bestIndex,
    0,
  );
  definition.wiring.chainLengths[shortestOutput] =
    definition.wiring.chainLengths[shortestOutput]! + 1;
  definition.notes.push(
    `Panel ${definition.panels.at(-1)!.id} was inset into ${faceId} in the browser editor; print-fit verification remains required.`,
  );
  definition.status = "provisional";
  definition.calibration.panelTransforms = "generated-provisional";
  definition.calibration.installedPanelOrientation = "provisional";
  definition.calibration.physicalChains = "provisional";
  return definition;
}

export function movePanelOnDesignSurface(
  source: PanelAssemblyDefinition,
  panelId: string,
  placement: {
    position: Vector3Tuple;
    orientation: {
      xAxis: Vector3Tuple;
      yAxis: Vector3Tuple;
      normal: Vector3Tuple;
    };
    attachment: {
      surface?: "design-surface" | "mechanical-shell";
      triangleIndex: number;
      barycentric: Vector3Tuple;
      normalOffset: number;
    };
  },
): PanelAssemblyDefinition {
  if (
    placement.attachment.surface !== "mechanical-shell" &&
    !source.designSurface
  ) {
    throw new Error(
      "Load a GLB or use the sculpture JSON face graph before moving panels.",
    );
  }
  if (placement.attachment.surface === "mechanical-shell" && !source.mechanicalShell) {
    throw new Error("This project has no JSON mechanical-shell placement surface.");
  }
  const definition = structuredClone(source);
  if (!definition.manualMechanics) preserveAuthoringBoundary(definition);
  const panel = definition.panels.find((candidate) => candidate.id === panelId);
  if (!panel) throw new Error(`Unknown panel ${panelId}.`);
  panel.pose = {
    position: [...placement.position],
    orientation: {
      xAxis: [...placement.orientation.xAxis],
      yAxis: [...placement.orientation.yAxis],
      normal: [...placement.orientation.normal],
    },
  };
  panel.surfaceAttachment = {
    ...(placement.attachment.surface
      ? { surface: placement.attachment.surface }
      : {}),
    triangleIndex: placement.attachment.triangleIndex,
    barycentric: [...placement.attachment.barycentric],
    normalOffset: placement.attachment.normalOffset,
  };
  markPanelEditConsequences(definition, [panelId]);
  return definition;
}

/** Moves one panel center by explicit distances along its saved local X/Y axes. */
export function movePanelInLocalPlane(
  source: PanelAssemblyDefinition,
  panelId: string,
  deltaX: number,
  deltaY: number,
): PanelAssemblyDefinition {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
    throw new Error(`Panel ${panelId} local-plane movement must be finite.`);
  }
  const definition = structuredClone(source);
  if (!definition.manualMechanics) preserveAuthoringBoundary(definition);
  const panel = definition.panels.find((candidate) => candidate.id === panelId);
  if (!panel) throw new Error(`Unknown panel ${panelId}.`);
  const { xAxis, yAxis } = panel.pose.orientation;
  panel.pose.position = add(
    panel.pose.position,
    add(scale(xAxis, deltaX), scale(yAxis, deltaY)),
  );
  markPanelEditConsequences(definition, [panelId]);
  return definition;
}

/** Rotates one authoritative panel basis in its plane without moving it. */
export function rotatePanelAroundLocalZ(
  source: PanelAssemblyDefinition,
  panelId: string,
  degrees: number,
): PanelAssemblyDefinition {
  if (!Number.isFinite(degrees)) {
    throw new Error(`Panel ${panelId} rotation must be a finite angle in degrees.`);
  }
  const definition = structuredClone(source);
  if (!definition.manualMechanics) preserveAuthoringBoundary(definition);
  const panel = definition.panels.find((candidate) => candidate.id === panelId);
  if (!panel) throw new Error(`Unknown panel ${panelId}.`);

  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const { xAxis, yAxis, normal } = panel.pose.orientation;
  const normalUnit = normalize([...normal]);
  const rotatedX = add(scale(xAxis, cosine), scale(yAxis, sine));
  const planarX = normalize(
    subtract(rotatedX, scale(normalUnit, dot(rotatedX, normalUnit))),
  );
  const planarY = normalize(cross(normalUnit, planarX));
  panel.pose.orientation.xAxis = planarX;
  panel.pose.orientation.yAxis = planarY;

  markPanelEditConsequences(definition, [panelId]);
  return definition;
}

export interface DesignSurfacePlacement {
  position: Vector3Tuple;
  orientation: {
    xAxis: Vector3Tuple;
    yAxis: Vector3Tuple;
    normal: Vector3Tuple;
  };
  attachment: {
    surface?: "design-surface" | "mechanical-shell";
    triangleIndex: number;
    barycentric: Vector3Tuple;
    normalOffset: number;
  };
}

/** Adds one pose-authoritative panel without inventing stale shell topology. */
export function addPanelOnDesignSurface(
  source: PanelAssemblyDefinition,
  placement: DesignSurfacePlacement,
  metadata?: { faceType?: "square-face" | "pentagon-centre" },
): PanelAssemblyDefinition {
  if (
    placement.attachment.surface !== "mechanical-shell" &&
    !source.designSurface
  ) {
    throw new Error(
      "Load a GLB or use the sculpture JSON face graph before adding panels.",
    );
  }
  if (placement.attachment.surface === "mechanical-shell" && !source.mechanicalShell) {
    throw new Error("This project has no JSON mechanical-shell placement surface.");
  }
  if (source.manualMechanics && !metadata?.faceType) {
    throw new Error("Adding a panel to manual mechanics requires an explicit faceType.");
  }
  const definition = structuredClone(source);
  if (!definition.manualMechanics) preserveAuthoringBoundary(definition);
  const panelId = nextPanelId(definition);
  definition.panels.push({
    id: panelId,
    ...(metadata?.faceType
      ? { faceType: metadata.faceType, neighborPanelIds: [] }
      : {}),
    pose: {
      position: [...placement.position],
      orientation: {
        xAxis: [...placement.orientation.xAxis],
        yAxis: [...placement.orientation.yAxis],
        normal: [...placement.orientation.normal],
      },
    },
    surfaceAttachment: {
      ...(placement.attachment.surface
        ? { surface: placement.attachment.surface }
        : {}),
      triangleIndex: placement.attachment.triangleIndex,
      barycentric: [...placement.attachment.barycentric],
      normalOffset: placement.attachment.normalOffset,
    },
  });
  const shortestOutput = definition.wiring.chainLengths.reduce(
    (bestIndex, length, index, lengths) =>
      length < lengths[bestIndex]! ? index : bestIndex,
    0,
  );
  definition.wiring.chainLengths[shortestOutput] =
    definition.wiring.chainLengths[shortestOutput]! + 1;
  markPanelEditConsequences(definition, [panelId]);
  definition.notes.push(
    definition.mechanicalShell
      ? `Panel ${panelId} was placed manually on the design surface; mechanical shell regeneration remains required.`
      : `Panel ${panelId} was placed manually on the design surface; no printable mechanics exist yet.`,
  );
  return definition;
}

export interface AutomaticSurfaceMesh {
  positions: readonly number[];
  indices: readonly number[];
  normals?: readonly number[];
}
export interface AutomaticSurfacePlacementOptions {
  targetPanelCount: number;
  surface: "design-surface" | "mechanical-shell";
  normalOffset?: number;
}
export interface AutomaticSurfacePlacementResult {
  definition: PanelAssemblyDefinition;
  placedPanelIds: string[];
  triangleIndices: number[];
}
interface SurfaceCandidate {
  triangleIndex: number;
  position: Vector3Tuple;
  normal: Vector3Tuple;
  vertices: [Vector3Tuple, Vector3Tuple, Vector3Tuple];
  barycentric: Vector3Tuple;
}
function meshPoint(values: readonly number[], index: number): Vector3Tuple {
  return [values[index * 3]!, values[index * 3 + 1]!, values[index * 3 + 2]!];
}
function distanceSquared(a: Vector3Tuple, b: Vector3Tuple): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 +
    (a[2] - b[2]) ** 2;
}
function trianglePoint(
  vertices: [Vector3Tuple, Vector3Tuple, Vector3Tuple],
  barycentric: Vector3Tuple,
): Vector3Tuple {
  return add(add(
    scale(vertices[0], barycentric[0]),
    scale(vertices[1], barycentric[1]),
  ), scale(vertices[2], barycentric[2]));
}

function quantizedVertexKey(point: Vector3Tuple): string {
  return `${Math.round(point[0] * 1000)}:${Math.round(point[1] * 1000)}:${Math.round(point[2] * 1000)}`;
}

function triangleEdgeKey(
  first: Vector3Tuple,
  second: Vector3Tuple,
): string {
  const left = quantizedVertexKey(first);
  const right = quantizedVertexKey(second);
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

function closestPointOnTriangle(
  point: Vector3Tuple,
  vertices: [Vector3Tuple, Vector3Tuple, Vector3Tuple],
): { point: Vector3Tuple; barycentric: Vector3Tuple } {
  const [a, b, c] = vertices;
  const ab = subtract(b, a);
  const ac = subtract(c, a);
  const ap = subtract(point, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return { point: a, barycentric: [1, 0, 0] };
  const bp = subtract(point, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return { point: b, barycentric: [0, 1, 0] };
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return { point: add(a, scale(ab, v)), barycentric: [1 - v, v, 0] };
  }
  const cp = subtract(point, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return { point: c, barycentric: [0, 0, 1] };
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return { point: add(a, scale(ac, w)), barycentric: [1 - w, 0, w] };
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return {
      point: add(b, scale(subtract(c, b), w)),
      barycentric: [0, 1 - w, w],
    };
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return {
    point: add(add(a, scale(ab, v)), scale(ac, w)),
    barycentric: [1 - v - w, v, w],
  };
}

interface PreparedTriangle {
  triangleIndex: number;
  vertices: [Vector3Tuple, Vector3Tuple, Vector3Tuple];
  area: number;
  normal: Vector3Tuple;
  centroid: Vector3Tuple;
}

interface PlanarPatch {
  triangles: PreparedTriangle[];
  normal: Vector3Tuple;
  area: number;
  centroid: Vector3Tuple;
  home: PreparedTriangle;
  barycentric: Vector3Tuple;
}

function findRoot(parent: number[], index: number): number {
  while (parent[index] !== index) {
    parent[index] = parent[parent[index]!]!;
    index = parent[index]!;
  }
  return index;
}

function connectedPlanarPatches(
  triangles: PreparedTriangle[],
): PlanarPatch[] {
  const parent = triangles.map((_, index) => index);
  const edgeMap = new Map<string, number[]>();
  for (const [index, triangle] of triangles.entries()) {
    const edges = [
      triangleEdgeKey(triangle.vertices[0], triangle.vertices[1]),
      triangleEdgeKey(triangle.vertices[1], triangle.vertices[2]),
      triangleEdgeKey(triangle.vertices[2], triangle.vertices[0]),
    ];
    for (const edge of edges) {
      const users = edgeMap.get(edge) ?? [];
      users.push(index);
      edgeMap.set(edge, users);
    }
  }
  for (const users of edgeMap.values()) {
    for (let i = 0; i < users.length; i += 1) {
      for (let j = i + 1; j < users.length; j += 1) {
        const left = triangles[users[i]!]!;
        const right = triangles[users[j]!]!;
        if (dot(left.normal, right.normal) < 0.999999) continue;
        if (Math.abs(dot(subtract(right.centroid, left.centroid), left.normal)) >
          1e-3) continue;
        const leftRoot = findRoot(parent, users[i]!);
        const rightRoot = findRoot(parent, users[j]!);
        if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
      }
    }
  }
  const groups = new Map<number, PreparedTriangle[]>();
  for (const [index, triangle] of triangles.entries()) {
    const root = findRoot(parent, index);
    const group = groups.get(root) ?? [];
    group.push(triangle);
    groups.set(root, group);
  }
  return [...groups.values()].map((group) => {
    const area = group.reduce((sum, triangle) => sum + triangle.area, 0);
    const normal = normalize(group.reduce(
      (sum, triangle) => add(sum, scale(triangle.normal, triangle.area)),
      [0, 0, 0] as Vector3Tuple,
    ));
    const rawCentroid = scale(group.reduce(
      (sum, triangle) => add(sum, scale(triangle.centroid, triangle.area)),
      [0, 0, 0] as Vector3Tuple,
    ), 1 / area);
    let home = group[0]!;
    let snapped = closestPointOnTriangle(rawCentroid, home.vertices);
    for (const triangle of group.slice(1)) {
      const candidate = closestPointOnTriangle(rawCentroid, triangle.vertices);
      if (
        distanceSquared(candidate.point, rawCentroid) + 1e-12 <
          distanceSquared(snapped.point, rawCentroid) ||
        (
          Math.abs(
            distanceSquared(candidate.point, rawCentroid) -
              distanceSquared(snapped.point, rawCentroid),
          ) <= 1e-12 &&
          triangle.triangleIndex < home.triangleIndex
        )
      ) {
        home = triangle;
        snapped = candidate;
      }
    }
    return {
      triangles: group,
      normal,
      area,
      centroid: snapped.point,
      home,
      barycentric: snapped.barycentric,
    };
  }).sort((left, right) =>
    right.area - left.area ||
    left.home.triangleIndex - right.home.triangleIndex
  );
}

function patchSample(
  patch: PlanarPatch,
  index: number,
  count: number,
): SurfaceCandidate {
  if (count <= 1 || index === 0) {
    return {
      triangleIndex: patch.home.triangleIndex,
      position: patch.centroid,
      normal: patch.normal,
      vertices: patch.home.vertices,
      barycentric: patch.barycentric,
    };
  }
  const root = Math.sqrt((index + 0.5) / count);
  const across = ((index + 1) * 0.6180339887498949) % 1;
  const barycentric: Vector3Tuple = [
    1 - root,
    root * (1 - across),
    root * across,
  ];
  return {
    triangleIndex: patch.home.triangleIndex,
    position: trianglePoint(patch.home.vertices, barycentric),
    normal: patch.normal,
    vertices: patch.home.vertices,
    barycentric,
  };
}

function surfaceCandidates(
  mesh: AutomaticSurfaceMesh,
  requestedCount: number,
): SurfaceCandidate[] {
  if (
    mesh.positions.length < 9 || mesh.positions.length % 3 !== 0 ||
    mesh.positions.some((value) => !Number.isFinite(value)) ||
    mesh.indices.length < 3 || mesh.indices.length % 3 !== 0 ||
    mesh.indices.some((index) =>
      !Number.isInteger(index) || index < 0 ||
      index >= mesh.positions.length / 3
    )
  ) {
    throw new Error("The active placement surface needs finite indexed triangles.");
  }
  const triangles = Array.from(
    { length: mesh.indices.length / 3 },
    (_, triangleIndex) => {
      const indices = [0, 1, 2].map(
        (corner) => mesh.indices[triangleIndex * 3 + corner]!,
      ) as [number, number, number];
      const vertices = indices.map((index) =>
        meshPoint(mesh.positions, index)
      ) as [Vector3Tuple, Vector3Tuple, Vector3Tuple];
      const areaVector = cross(
        subtract(vertices[1], vertices[0]),
        subtract(vertices[2], vertices[0]),
      );
      const area = Math.hypot(...areaVector);
      if (area < 1e-10) {
        throw new Error(
          `The active placement surface has a degenerate triangle at index ${triangleIndex}.`,
        );
      }
      return {
        triangleIndex,
        vertices,
        area,
        normal: normalize(areaVector),
        centroid: trianglePoint(vertices, [1 / 3, 1 / 3, 1 / 3]),
      };
    },
  );
  const patches = connectedPlanarPatches(triangles);
  const totalArea = patches.reduce((sum, patch) => sum + patch.area, 0);
  const sampleCount = Math.min(8192, Math.max(requestedCount, patches.length));
  const allocations = patches.map((patch) => {
    const exact = patch.area / totalArea * sampleCount;
    return { patch, count: Math.floor(exact), remainder: exact % 1 };
  });
  let remainder = sampleCount -
    allocations.reduce((sum, item) => sum + item.count, 0);
  for (
    const item of [...allocations].sort((a, b) =>
      b.remainder - a.remainder ||
      a.patch.home.triangleIndex - b.patch.home.triangleIndex
    )
  ) {
    if (remainder-- <= 0) break;
    item.count += 1;
  }
  return allocations.flatMap(({ patch, count }) =>
    Array.from({ length: count }, (_, index) => patchSample(patch, index, count))
  );
}
/** Deterministically spreads new pose-authoritative panels over an authoring mesh. */
export function automaticallySeedPanelsOnSurface(
  source: PanelAssemblyDefinition,
  mesh: AutomaticSurfaceMesh,
  panelDimensions: AddPanelDimensions,
  options: AutomaticSurfacePlacementOptions,
): AutomaticSurfacePlacementResult {
  if (source.manualMechanics) {
    throw new Error(
      "Automatic surface placement is disabled for manualMechanics projects.",
    );
  }
  if (
    !Number.isInteger(options.targetPanelCount) ||
    options.targetPanelCount < source.panels.length
  ) {
    throw new Error(
      `Target panel count must be an integer at least ${source.panels.length}.`,
    );
  }
  if (options.surface === "design-surface" && !source.designSurface) {
    throw new Error("Load a GLB design surface before seeding panels on it.");
  }
  if (options.surface === "mechanical-shell" && !source.mechanicalShell) {
    throw new Error("This project has no JSON mechanical-shell placement surface.");
  }
  if (
    panelDimensions.width <= 0 || panelDimensions.height <= 0 ||
    !Number.isFinite(panelDimensions.width + panelDimensions.height)
  ) {
    throw new Error("Panel dimensions must be positive finite values.");
  }
  const definition = structuredClone(source);
  const newCount = options.targetPanelCount - definition.panels.length;
  if (newCount === 0) {
    return { definition, placedPanelIds: [], triangleIndices: [] };
  }
  preserveAuthoringBoundary(definition);
  const candidates = surfaceCandidates(mesh, newCount);
  if (candidates.length < newCount) {
    throw new Error(
      `The active placement surface supports at most ${candidates.length} deterministic samples.`,
    );
  }
  const available = [...candidates];
  const occupied = definition.panels.map((panel) => panel.pose.position);
  const center = mean(candidates.map((candidate) => candidate.position));
  const selected: SurfaceCandidate[] = [];
  while (selected.length < newCount) {
    let bestIndex = 0;
    let bestDistance = -Infinity;
    for (let index = 0; index < available.length; index += 1) {
      const point = available[index]!.position;
      const seeds = [...occupied, ...selected.map((item) => item.position)];
      const distance = seeds.length === 0
        ? -distanceSquared(point, center)
        : Math.min(...seeds.map((seed) => distanceSquared(point, seed)));
      if (distance > bestDistance + 1e-9) {
        bestIndex = index;
        bestDistance = distance;
      }
    }
    selected.push(available.splice(bestIndex, 1)[0]!);
  }
  const normalOffset = options.normalOffset ?? 0;
  const placedPanelIds: string[] = [];
  for (const candidate of selected) {
    const panelId = nextPanelId(definition);
    const orientation = createMechanicalSurfaceOrientation(
      candidate.normal,
      candidate.vertices,
    );
    definition.panels.push({
      id: panelId,
      pose: {
        position: add(candidate.position, scale(candidate.normal, normalOffset)),
        orientation,
      },
      surfaceAttachment: {
        surface: options.surface,
        triangleIndex: candidate.triangleIndex,
        barycentric: candidate.barycentric,
        normalOffset,
      },
    });
    const shortest = definition.wiring.chainLengths.reduce(
      (best, length, index, lengths) =>
        length < lengths[best]! ? index : best,
      0,
    );
    definition.wiring.chainLengths[shortest] =
      definition.wiring.chainLengths[shortest]! + 1;
    placedPanelIds.push(panelId);
  }
  markPanelEditConsequences(definition, placedPanelIds);
  definition.notes.push(
    `Automatically seeded ${placedPanelIds.length} panels across the ${
      options.surface === "design-surface" ? "GLB" : "JSON shell"
    } authoring surface; manually verify placement${
      definition.mechanicalShell ? " and regenerate mechanics separately" : ""
    }.`,
  );
  return {
    definition,
    placedPanelIds,
    triangleIndices: selected.map((candidate) => candidate.triangleIndex),
  };
}

export function deletePanel(
  source: PanelAssemblyDefinition,
  panelId: string,
): PanelAssemblyDefinition {
  const definition = structuredClone(source);
  if (!definition.manualMechanics) preserveAuthoringBoundary(definition);
  const panelIndex = definition.panels.findIndex(
    (candidate) => candidate.id === panelId,
  );
  if (panelIndex < 0) throw new Error(`Unknown panel ${panelId}.`);
  const [panel] = definition.panels.splice(panelIndex, 1);
  if (
    panel?.mountFaceId && definition.closures &&
    !definition.closures.faceIds.includes(panel.mountFaceId)
  ) {
    definition.closures.faceIds.push(panel.mountFaceId);
  }
  const changedNeighborPanelIds: string[] = [];
  for (const survivor of definition.panels) {
    if (!survivor.neighborPanelIds?.includes(panelId)) continue;
    survivor.neighborPanelIds = survivor.neighborPanelIds.filter(
      (neighborId) => neighborId !== panelId,
    );
    changedNeighborPanelIds.push(survivor.id);
  }
  const longestOutput = definition.wiring.chainLengths.reduce(
    (bestIndex, length, index, lengths) =>
      length > lengths[bestIndex]! ? index : bestIndex,
    0,
  );
  definition.wiring.chainLengths[longestOutput] =
    definition.wiring.chainLengths[longestOutput]! - 1;
  markPanelEditConsequences(definition, [panelId, ...changedNeighborPanelIds]);
  definition.notes.push(
    definition.mechanicalShell
      ? `Panel ${panelId} was deleted in the browser editor; mechanical shell regeneration remains required.`
      : `Panel ${panelId} was deleted in the browser editor; no printable mechanics exist yet.`,
  );
  return definition;
}

export function sculptureJson(definition: PanelAssemblyDefinition): string {
  parsePanelAssemblyDefinition(definition);
  return `${JSON.stringify(definition, null, 2)}\n`;
}
