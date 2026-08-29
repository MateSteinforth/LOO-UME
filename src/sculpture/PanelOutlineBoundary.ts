import type { PanelHardwareProfile } from "./Definition.ts";
import {
  createGeneratedMechanicsFingerprint,
  sha256Text,
} from "./GeneratedMechanics.ts";
import type {
  PanelAssemblyDefinition,
  PanelBoundaryTopology,
  PanelOutlineCornerId,
} from "./PanelAssembly.ts";
import { triangulatePolygon, type Point2 } from "../cad/TriangulatePolygon.ts";
import { GENERATED_CLOSURE_PLANARITY_MM } from "./PanelBoundaryTolerances.ts";
import { assertRectangularPanelTools } from "./PanelCarrier.ts";

export type Vector3Tuple = [number, number, number];

export const PANEL_BOUNDARY_TOLERANCES = Object.freeze({
  /**
   * Maximum distance between panel corners treated as one boundary vertex.
   * 1.5 mm covers a 66 x 65 mm panel sitting on a 66 mm cuboctahedron square
   * (about 1.28 mm of 65 mm-axis slack plus placement offset).
   */
  vertexWeldMm: 1.5,
  /**
   * Maximum signed distance of a cap vertex from its centroid-referenced
   * polygon plane. This covers the 0.061419 mm deterministic pentagon warp
   * from 66 x 65 mm PCBs on the 66 mm rhombicosidodecahedron faces.
   */
  capCoplanarityMm: GENERATED_CLOSURE_PLANARITY_MM,
  /** Minimum permitted boundary edge length. */
  minimumEdgeLengthMm: 0.001,
  /** Minimum permitted polygon area. */
  minimumAreaSquareMm: 0.001,
  /** Clearance used to distinguish contact from a real intersection. */
  intersectionMm: 0.00001,
  /** Minimum clipped span in both panel-local axes for PCB interior overlap. */
  pcbInteriorOverlapMm: 0.01,
});

export type PanelBoundaryToleranceName =
  keyof typeof PANEL_BOUNDARY_TOLERANCES;

export type PanelBoundaryErrorCode =
  | "missing-topology"
  | "ambiguous-topology"
  | "invalid-gap"
  | "non-planar"
  | "degenerate"
  | "self-intersecting"
  | "inconsistent-winding"
  | "pcb-intersection"
  | "cap-intersection"
  | "open-boundary"
  | "non-manifold"
  | "disconnected";

export class PanelBoundaryGenerationError extends Error {
  constructor(
    readonly code: PanelBoundaryErrorCode,
    message: string,
    readonly gapId?: string,
  ) {
    super(message);
    this.name = "PanelBoundaryGenerationError";
  }
}

export interface PanelBoundaryFace {
  id: string;
  role: "panel-outline" | "cap";
  panelId?: string;
  gapId?: string;
  vertexIndices: number[];
  triangleIndices: number[][];
  normal: Vector3Tuple;
  areaSquareMm: number;
}

export interface ClosedPanelBoundary {
  schemaVersion: "1.0.0";
  kind: "closed-panel-outline-boundary";
  units: "mm";
  vertices: Vector3Tuple[];
  triangles: Array<[number, number, number]>;
  faces: PanelBoundaryFace[];
  metadata: {
    generator: {
      id: "wled-orbital-lab/panel-outline-boundary";
      version: "0.1.0";
    };
    sourceFingerprint: {
      algorithm: "sha256";
      value: string;
    };
    meshFingerprint: {
      algorithm: "sha256";
      value: string;
    };
    status: {
      generation: "complete";
      validation: "passed";
    };
    tolerances: typeof PANEL_BOUNDARY_TOLERANCES;
    counts: {
      vertices: number;
      edges: number;
      faces: number;
      panelOutlines: number;
      caps: number;
      triangles: number;
      connectedComponents: 1;
    };
  };
}

interface WorkingFace extends Omit<PanelBoundaryFace, "triangleIndices"> {
  triangleIndices: Array<[number, number, number]>;
}

interface TriangleUse {
  face: WorkingFace;
  indices: [number, number, number];
}

const CORNER_LOCAL_COORDINATES: Record<
  PanelOutlineCornerId,
  readonly [number, number]
> = {
  "bottom-left": [-1, -1],
  "bottom-right": [1, -1],
  "top-right": [1, 1],
  "top-left": [-1, 1],
};

const PANEL_CORNER_ORDER: PanelOutlineCornerId[] = [
  "bottom-left",
  "bottom-right",
  "top-right",
  "top-left",
];

function add(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(vector: Vector3Tuple, amount: number): Vector3Tuple {
  return [vector[0] * amount, vector[1] * amount, vector[2] * amount];
}

function dot(a: Vector3Tuple, b: Vector3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function length(vector: Vector3Tuple): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize(vector: Vector3Tuple): Vector3Tuple {
  const magnitude = length(vector);
  if (magnitude <= Number.EPSILON) return [0, 0, 0];
  return scale(vector, 1 / magnitude);
}

function distance(a: Vector3Tuple, b: Vector3Tuple): number {
  return length(subtract(a, b));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pointKey(panelId: string, corner: PanelOutlineCornerId): string {
  return `${panelId}\u0000${corner}`;
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function polygonNormal(points: Vector3Tuple[]): Vector3Tuple {
  const normal: Vector3Tuple = [0, 0, 0];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    normal[0] += (current[1] - next[1]) * (current[2] + next[2]);
    normal[1] += (current[2] - next[2]) * (current[0] + next[0]);
    normal[2] += (current[0] - next[0]) * (current[1] + next[1]);
  }
  return normal;
}

function projectionAxes(normal: Vector3Tuple): readonly [number, number] {
  const absolute = normal.map(Math.abs);
  const dropped = absolute[0]! >= absolute[1]! && absolute[0]! >= absolute[2]!
    ? 0
    : absolute[1]! >= absolute[2]!
      ? 1
      : 2;
  return dropped === 0 ? [1, 2] : dropped === 1 ? [0, 2] : [0, 1];
}

function projectPoints(
  points: Vector3Tuple[],
  normal: Vector3Tuple,
): Point2[] {
  const [first, second] = projectionAxes(normal);
  return points.map((point) => [point[first]!, point[second]!] as const);
}

function orientation2(a: Point2, b: Point2, c: Point2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) -
    (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment2(point: Point2, a: Point2, b: Point2): boolean {
  const epsilon = PANEL_BOUNDARY_TOLERANCES.intersectionMm;
  return Math.abs(orientation2(a, b, point)) <= epsilon &&
    point[0] >= Math.min(a[0], b[0]) - epsilon &&
    point[0] <= Math.max(a[0], b[0]) + epsilon &&
    point[1] >= Math.min(a[1], b[1]) - epsilon &&
    point[1] <= Math.max(a[1], b[1]) + epsilon;
}

function segmentsIntersect2(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const epsilon = PANEL_BOUNDARY_TOLERANCES.intersectionMm;
  const abC = orientation2(a, b, c);
  const abD = orientation2(a, b, d);
  const cdA = orientation2(c, d, a);
  const cdB = orientation2(c, d, b);
  if (
    ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon)) &&
    ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))
  ) return true;
  return (Math.abs(abC) <= epsilon && pointOnSegment2(c, a, b)) ||
    (Math.abs(abD) <= epsilon && pointOnSegment2(d, a, b)) ||
    (Math.abs(cdA) <= epsilon && pointOnSegment2(a, c, d)) ||
    (Math.abs(cdB) <= epsilon && pointOnSegment2(b, c, d));
}

function validateSimplePolygon(gapId: string, points: Vector3Tuple[]): {
  normal: Vector3Tuple;
  projected: Point2[];
  area: number;
} {
  const rawNormal = polygonNormal(points);
  const rawNormalLength = length(rawNormal);
  const area = rawNormalLength / 2;
  if (area < PANEL_BOUNDARY_TOLERANCES.minimumAreaSquareMm) {
    throw new PanelBoundaryGenerationError(
      "degenerate",
      `Gap ${gapId} area ${area.toFixed(6)} mm² is below named tolerance minimumAreaSquareMm (${PANEL_BOUNDARY_TOLERANCES.minimumAreaSquareMm} mm²).`,
      gapId,
    );
  }
  const normal = scale(rawNormal, 1 / rawNormalLength);
  const origin = vertexCentroid(points);
  const maximumPlaneDistance = Math.max(
    ...points.map((point) => Math.abs(dot(subtract(point, origin), normal))),
  );
  if (maximumPlaneDistance > PANEL_BOUNDARY_TOLERANCES.capCoplanarityMm) {
    throw new PanelBoundaryGenerationError(
      "non-planar",
      `Gap ${gapId} is non-planar by ${maximumPlaneDistance.toFixed(6)} mm; named tolerance capCoplanarityMm is ${PANEL_BOUNDARY_TOLERANCES.capCoplanarityMm} mm.`,
      gapId,
    );
  }
  for (let index = 0; index < points.length; index += 1) {
    const edgeLength = distance(points[index]!, points[(index + 1) % points.length]!);
    if (edgeLength < PANEL_BOUNDARY_TOLERANCES.minimumEdgeLengthMm) {
      throw new PanelBoundaryGenerationError(
        "degenerate",
        `Gap ${gapId} edge ${index} is ${edgeLength.toFixed(6)} mm; named tolerance minimumEdgeLengthMm is ${PANEL_BOUNDARY_TOLERANCES.minimumEdgeLengthMm} mm.`,
        gapId,
      );
    }
  }
  const projected = projectPoints(points, normal);
  for (let first = 0; first < projected.length; first += 1) {
    const firstNext = (first + 1) % projected.length;
    for (let second = first + 1; second < projected.length; second += 1) {
      const secondNext = (second + 1) % projected.length;
      if (
        first === second || firstNext === second || secondNext === first
      ) continue;
      if (segmentsIntersect2(
        projected[first]!, projected[firstNext]!,
        projected[second]!, projected[secondNext]!,
      )) {
        throw new PanelBoundaryGenerationError(
          "self-intersecting",
          `Gap ${gapId} is not a simple polygon: edges ${first} and ${second} intersect.`,
          gapId,
        );
      }
    }
  }
  return { normal, projected, area };
}

function clipPolygonToAxis(
  polygon: Vector3Tuple[],
  axis: number,
  limit: number,
  keepLess: boolean,
): Vector3Tuple[] {
  if (polygon.length === 0) return polygon;
  const result: Vector3Tuple[] = [];
  const inside = (point: Vector3Tuple): boolean =>
    keepLess ? point[axis]! <= limit : point[axis]! >= limit;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const previous = polygon[(index - 1 + polygon.length) % polygon.length]!;
    const currentInside = inside(current);
    const previousInside = inside(previous);
    if (currentInside !== previousInside) {
      const denominator = current[axis]! - previous[axis]!;
      const amount = denominator === 0 ? 0 : (limit - previous[axis]!) / denominator;
      result.push(add(previous, scale(subtract(current, previous), amount)));
    }
    if (currentInside) result.push(current);
  }
  return result;
}

function triangleIntersectsOpenPanelEnvelope(
  triangle: Vector3Tuple[],
  panel: PanelAssemblyDefinition["panels"][number],
  profile: PanelHardwareProfile,
): boolean {
  const { position, orientation } = panel.pose;
  const origin = position as Vector3Tuple;
  const axes = [orientation.xAxis, orientation.yAxis, orientation.normal] as const;
  let polygon = triangle.map((point) => {
    const relative = subtract(point, origin);
    return axes.map((axis) => dot(relative, axis as Vector3Tuple)) as Vector3Tuple;
  });
  const epsilon = PANEL_BOUNDARY_TOLERANCES.intersectionMm;
  const halfExtents = [
    profile.dimensions.width / 2 - epsilon,
    profile.dimensions.height / 2 - epsilon,
    profile.dimensions.thickness / 2 - epsilon,
  ];
  for (let axis = 0; axis < 3; axis += 1) {
    const extent = halfExtents[axis]!;
    polygon = clipPolygonToAxis(polygon, axis, extent, true);
    polygon = clipPolygonToAxis(polygon, axis, -extent, false);
  }
  if (polygon.length === 0) return false;
  const spanX = Math.max(...polygon.map((point) => point[0]!)) -
    Math.min(...polygon.map((point) => point[0]!));
  const spanY = Math.max(...polygon.map((point) => point[1]!)) -
    Math.min(...polygon.map((point) => point[1]!));
  return Math.min(spanX, spanY) >
    PANEL_BOUNDARY_TOLERANCES.pcbInteriorOverlapMm;
}

function pointInTriangle2(point: Point2, triangle: Point2[], strict: boolean): boolean {
  const epsilon = PANEL_BOUNDARY_TOLERANCES.intersectionMm;
  const signs = triangle.map((vertex, index) =>
    orientation2(vertex, triangle[(index + 1) % 3]!, point)
  );
  const hasPositive = signs.some((value) => value > epsilon);
  const hasNegative = signs.some((value) => value < -epsilon);
  if (hasPositive && hasNegative) return false;
  return !strict || signs.every((value) => Math.abs(value) > epsilon);
}

function pointIsAllowedSharedContact(
  point: Vector3Tuple,
  sharedIndices: number[],
  vertices: Vector3Tuple[],
): boolean {
  const epsilon = PANEL_BOUNDARY_TOLERANCES.intersectionMm * 2;
  if (sharedIndices.some((index) => distance(point, vertices[index]!) <= epsilon)) {
    return true;
  }
  if (sharedIndices.length === 2) {
    const start = vertices[sharedIndices[0]!]!;
    const end = vertices[sharedIndices[1]!]!;
    return Math.abs(distance(start, point) + distance(point, end) - distance(start, end)) <= epsilon;
  }
  return false;
}

function segmentPlaneIntersection(
  start: Vector3Tuple,
  end: Vector3Tuple,
  planePoint: Vector3Tuple,
  planeNormal: Vector3Tuple,
): Vector3Tuple | null {
  const startDistance = dot(subtract(start, planePoint), planeNormal);
  const endDistance = dot(subtract(end, planePoint), planeNormal);
  const epsilon = PANEL_BOUNDARY_TOLERANCES.intersectionMm;
  if (
    (startDistance > epsilon && endDistance > epsilon) ||
    (startDistance < -epsilon && endDistance < -epsilon)
  ) return null;
  const denominator = startDistance - endDistance;
  if (Math.abs(denominator) <= epsilon) return null;
  const amount = startDistance / denominator;
  if (amount < -epsilon || amount > 1 + epsilon) return null;
  return add(start, scale(subtract(end, start), amount));
}

function pointInTriangle3(point: Vector3Tuple, triangle: Vector3Tuple[]): boolean {
  const normal = polygonNormal(triangle);
  const projected = projectPoints([...triangle, point], normal);
  return pointInTriangle2(projected[3]!, projected.slice(0, 3), false);
}

function coplanarTrianglesIntersectImproperly(
  left: TriangleUse,
  right: TriangleUse,
  vertices: Vector3Tuple[],
  shared: number[],
): boolean {
  const normal = polygonNormal(left.indices.map((index) => vertices[index]!));
  const axes = projectionAxes(normal);
  const to2 = (index: number): Point2 => [
    vertices[index]![axes[0]]!, vertices[index]![axes[1]]!,
  ];
  const left2 = left.indices.map(to2);
  const right2 = right.indices.map(to2);
  for (let leftEdge = 0; leftEdge < 3; leftEdge += 1) {
    const leftStartIndex = left.indices[leftEdge]!;
    const leftEndIndex = left.indices[(leftEdge + 1) % 3]!;
    for (let rightEdge = 0; rightEdge < 3; rightEdge += 1) {
      const rightStartIndex = right.indices[rightEdge]!;
      const rightEndIndex = right.indices[(rightEdge + 1) % 3]!;
      if (!segmentsIntersect2(
        to2(leftStartIndex), to2(leftEndIndex),
        to2(rightStartIndex), to2(rightEndIndex),
      )) continue;
      const sharedEdge = shared.includes(leftStartIndex) &&
        shared.includes(leftEndIndex) &&
        shared.includes(rightStartIndex) && shared.includes(rightEndIndex);
      const sharedEndpoint = [leftStartIndex, leftEndIndex]
        .some((index) => index === rightStartIndex || index === rightEndIndex);
      if (!sharedEdge && !sharedEndpoint) return true;
    }
  }
  for (const index of left.indices) {
    if (!shared.includes(index) && pointInTriangle2(to2(index), right2, true)) return true;
  }
  for (const index of right.indices) {
    if (!shared.includes(index) && pointInTriangle2(to2(index), left2, true)) return true;
  }
  const leftCenter: Point2 = [
    left2.reduce((sum, point) => sum + point[0], 0) / 3,
    left2.reduce((sum, point) => sum + point[1], 0) / 3,
  ];
  return pointInTriangle2(leftCenter, right2, true);
}

function trianglesIntersectImproperly(
  left: TriangleUse,
  right: TriangleUse,
  vertices: Vector3Tuple[],
): boolean {
  const leftPoints = left.indices.map((index) => vertices[index]!);
  const rightPoints = right.indices.map((index) => vertices[index]!);
  const shared = left.indices.filter((index) => right.indices.includes(index));
  const leftNormal = normalize(polygonNormal(leftPoints));
  const rightNormal = normalize(polygonNormal(rightPoints));
  const parallel = length(cross(leftNormal, rightNormal)) <=
    PANEL_BOUNDARY_TOLERANCES.intersectionMm;
  const coplanar = parallel && rightPoints.every((point) =>
    Math.abs(dot(subtract(point, leftPoints[0]!), leftNormal)) <=
      PANEL_BOUNDARY_TOLERANCES.intersectionMm
  );
  if (coplanar) {
    return coplanarTrianglesIntersectImproperly(left, right, vertices, shared);
  }
  for (const [source, target, targetNormal] of [
    [leftPoints, rightPoints, rightNormal],
    [rightPoints, leftPoints, leftNormal],
  ] as const) {
    for (let edge = 0; edge < 3; edge += 1) {
      const point = segmentPlaneIntersection(
        source[edge]!, source[(edge + 1) % 3]!, target[0]!, targetNormal,
      );
      if (
        point && pointInTriangle3(point, [...target]) &&
        !pointIsAllowedSharedContact(point, shared, vertices)
      ) return true;
    }
  }
  return false;
}

function faceLabel(face: WorkingFace): string {
  return face.gapId ? `gap ${face.gapId}` : `panel ${face.panelId}`;
}

function validateCombinedBoundary(
  faces: WorkingFace[],
  vertices: Vector3Tuple[],
): { edgeCount: number; connectedComponents: 1 } {
  const edgeUses = new Map<string, Array<{
    face: WorkingFace;
    start: number;
    end: number;
  }>>();
  for (const face of faces) {
    face.vertexIndices.forEach((start, index) => {
      const end = face.vertexIndices[(index + 1) % face.vertexIndices.length]!;
      const key = edgeKey(start, end);
      edgeUses.set(key, [...(edgeUses.get(key) ?? []), { face, start, end }]);
    });
  }
  for (const [key, uses] of edgeUses) {
    if (uses.length === 1) {
      const use = uses[0]!;
      throw new PanelBoundaryGenerationError(
        "open-boundary",
        `Boundary edge ${key} is open and belongs only to ${faceLabel(use.face)}.`,
        use.face.gapId,
      );
    }
    if (uses.length !== 2) {
      const gap = uses.find((use) => use.face.gapId)?.face.gapId;
      throw new PanelBoundaryGenerationError(
        "non-manifold",
        `Boundary edge ${key} belongs to ${uses.length} faces (${uses.map((use) => faceLabel(use.face)).join(", ")}); exactly two are required.`,
        gap,
      );
    }
    if (uses[0]!.start !== uses[1]!.end || uses[0]!.end !== uses[1]!.start) {
      const gap = uses.find((use) => use.face.gapId)?.face.gapId;
      throw new PanelBoundaryGenerationError(
        "inconsistent-winding",
        `Boundary edge ${key} has the same direction in ${faceLabel(uses[0]!.face)} and ${faceLabel(uses[1]!.face)}. Reverse the offending gap winding.`,
        gap,
      );
    }
  }

  const neighbors = new Map<string, Set<string>>(
    faces.map((face) => [face.id, new Set<string>()]),
  );
  for (const uses of edgeUses.values()) {
    const [first, second] = uses;
    neighbors.get(first!.face.id)!.add(second!.face.id);
    neighbors.get(second!.face.id)!.add(first!.face.id);
  }
  const visited = new Set<string>();
  const pending = [faces[0]!.id];
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...neighbors.get(id)!);
  }
  if (visited.size !== faces.length) {
    throw new PanelBoundaryGenerationError(
      "disconnected",
      `Boundary has disconnected face components; ${faces.length - visited.size} of ${faces.length} faces are outside the first component.`,
    );
  }

  for (let vertexIndex = 0; vertexIndex < vertices.length; vertexIndex += 1) {
    const incidentFaces = faces.filter((face) => face.vertexIndices.includes(vertexIndex));
    const link = new Map<string, Set<string>>(
      incidentFaces.map((face) => [face.id, new Set<string>()]),
    );
    for (const uses of edgeUses.values()) {
      if (
        uses[0]!.start !== vertexIndex && uses[0]!.end !== vertexIndex
      ) continue;
      link.get(uses[0]!.face.id)?.add(uses[1]!.face.id);
      link.get(uses[1]!.face.id)?.add(uses[0]!.face.id);
    }
    const invalidDegree = [...link.entries()].find(([, adjacent]) => adjacent.size !== 2);
    if (invalidDegree) {
      const face = faces.find((candidate) => candidate.id === invalidDegree[0])!;
      throw new PanelBoundaryGenerationError(
        "non-manifold",
        `Boundary vertex ${vertexIndex} has a non-manifold face link at ${faceLabel(face)}.`,
        face.gapId,
      );
    }
    const linkVisited = new Set<string>();
    const linkPending = incidentFaces.length > 0 ? [incidentFaces[0]!.id] : [];
    while (linkPending.length > 0) {
      const id = linkPending.pop()!;
      if (linkVisited.has(id)) continue;
      linkVisited.add(id);
      linkPending.push(...link.get(id)!);
    }
    if (linkVisited.size !== incidentFaces.length) {
      throw new PanelBoundaryGenerationError(
        "non-manifold",
        `Boundary vertex ${vertexIndex} joins multiple face fans and is non-manifold.`,
      );
    }
  }
  return { edgeCount: edgeUses.size, connectedComponents: 1 };
}

interface ClusteredPanelCorner {
  panelId: string;
  corner: PanelOutlineCornerId;
  point: Vector3Tuple;
  planePoint: Vector3Tuple;
  planeNormal: Vector3Tuple;
}

interface WeldedPanelCorners {
  vertices: Vector3Tuple[];
  cornerIndex: Map<string, number>;
}

function intersectPlanes(
  pointA: Vector3Tuple,
  normalA: Vector3Tuple,
  pointB: Vector3Tuple,
  normalB: Vector3Tuple,
): { point: Vector3Tuple; direction: Vector3Tuple } | null {
  const direction = cross(normalA, normalB);
  const directionLength = length(direction);
  if (directionLength < 1e-9) return null;
  const dir2 = directionLength * directionLength;
  const dA = dot(normalA, pointA);
  const dB = dot(normalB, pointB);
  return {
    point: scale(
      add(scale(cross(normalB, direction), dA), scale(cross(direction, normalA), dB)),
      1 / dir2,
    ),
    direction: scale(direction, 1 / directionLength),
  };
}

function closestPointOnLine(
  origin: Vector3Tuple,
  direction: Vector3Tuple,
  point: Vector3Tuple,
): Vector3Tuple {
  return add(origin, scale(direction, dot(subtract(point, origin), direction)));
}

function weldPointForCluster(members: ClusteredPanelCorner[]): Vector3Tuple {
  const spread = Math.max(
    ...members.map((member) => distance(member.point, members[0]!.point)),
  );
  if (spread <= 1e-9) return [...members[0]!.point] as Vector3Tuple;
  const planes = [...new Map(members.map((member) => [member.panelId, member]))
    .values()].map((member) => ({
      point: member.planePoint,
      normal: normalize(member.planeNormal),
    }));
  const centroid = vertexCentroid(members.map((member) => member.point));
  if (
    planes.length >= 2 &&
    length(cross(planes[0]!.normal, planes[1]!.normal)) > 1e-9
  ) {
    const intersection = intersectPlanes(
      planes[0]!.point,
      planes[0]!.normal,
      planes[1]!.point,
      planes[1]!.normal,
    );
    if (intersection) {
      let point = closestPointOnLine(
        intersection.point,
        intersection.direction,
        centroid,
      );
      if (planes.length >= 3) {
        const normal = planes[2]!.normal;
        const denom = dot(normal, intersection.direction);
        if (Math.abs(denom) > 1e-9) {
          point = add(
            point,
            scale(
              intersection.direction,
              dot(subtract(planes[2]!.point, point), normal) / denom,
            ),
          );
        }
      }
      return point;
    }
  }
  return centroid;
}

function collectPanelCorners(
  panels: PanelAssemblyDefinition["panels"],
  profile: PanelHardwareProfile,
): ClusteredPanelCorner[] {
  return panels.flatMap((panel) =>
    PANEL_CORNER_ORDER.map((corner) => ({
      panelId: panel.id,
      corner,
      point: panelCorner(panel, corner, profile),
      planePoint: panel.pose.position as Vector3Tuple,
      planeNormal: panel.pose.orientation.normal as Vector3Tuple,
    }))
  );
}

function weldPanelCorners(
  corners: ClusteredPanelCorner[],
  weldMm: number,
): WeldedPanelCorners {
  const parent = corners.map((_, index) => index);
  const find = (index: number): number => {
    let current = index;
    while (parent[current] !== current) current = parent[current]!;
    let walk = index;
    while (walk !== current) {
      const next = parent[walk]!;
      parent[walk] = current;
      walk = next;
    }
    return current;
  };
  for (let first = 0; first < corners.length; first += 1) {
    for (let second = first + 1; second < corners.length; second += 1) {
      if (distance(corners[first]!.point, corners[second]!.point) <= weldMm) {
        const left = find(first);
        const right = find(second);
        if (left !== right) parent[right] = left;
      }
    }
  }
  const groups = new Map<number, number[]>();
  corners.forEach((_, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), index]);
  });
  const vertices: Vector3Tuple[] = [];
  const rootToVertex = new Map<number, number>();
  const cornerIndex = new Map<string, number>();
  corners.forEach((corner, index) => {
    const root = find(index);
    let vertexIndex = rootToVertex.get(root);
    if (vertexIndex === undefined) {
      vertexIndex = vertices.length;
      vertices.push(weldPointForCluster(
        (groups.get(root) ?? [index]).map((member) => corners[member]!),
      ));
      rootToVertex.set(root, vertexIndex);
    }
    cornerIndex.set(pointKey(corner.panelId, corner.corner), vertexIndex);
  });
  return { vertices, cornerIndex };
}

function panelCorner(
  panel: PanelAssemblyDefinition["panels"][number],
  corner: PanelOutlineCornerId,
  profile: PanelHardwareProfile,
): Vector3Tuple {
  const [xSign, ySign] = CORNER_LOCAL_COORDINATES[corner];
  const { position, orientation } = panel.pose;
  return add(
    add(
      position as Vector3Tuple,
      scale(orientation.xAxis as Vector3Tuple, xSign * profile.dimensions.width / 2),
    ),
    scale(orientation.yAxis as Vector3Tuple, ySign * profile.dimensions.height / 2),
  );
}

interface DetectedCornerReference {
  panelId: string;
  corner: PanelOutlineCornerId;
}

interface DetectedPanelEdgeUse {
  panelId: string;
  start: number;
  end: number;
  startCorner: PanelOutlineCornerId;
  endCorner: PanelOutlineCornerId;
}

interface DetectedCapEdge {
  start: number;
  end: number;
}

function compareDetectedCornerReferences(
  left: DetectedCornerReference,
  right: DetectedCornerReference,
): number {
  const panelComparison = compareText(left.panelId, right.panelId);
  if (panelComparison !== 0) return panelComparison;
  return PANEL_CORNER_ORDER.indexOf(left.corner) -
    PANEL_CORNER_ORDER.indexOf(right.corner);
}

function detectedCornerKey(reference: DetectedCornerReference): string {
  return `${reference.panelId}.${reference.corner}`;
}

function describeDetectedPanelEdge(use: DetectedPanelEdgeUse): string {
  return `${use.panelId}.${use.startCorner}->${use.panelId}.${use.endCorner}`;
}

function halfEdgeKey(edge: DetectedCapEdge): string {
  return `${edge.start}>${edge.end}`;
}

function compareHalfEdges(left: DetectedCapEdge, right: DetectedCapEdge): number {
  return left.start - right.start || left.end - right.end;
}

function vertexCentroid(points: Vector3Tuple[]): Vector3Tuple {
  const sum: Vector3Tuple = [0, 0, 0];
  for (const point of points) {
    sum[0] += point[0];
    sum[1] += point[1];
    sum[2] += point[2];
  }
  return scale(sum, 1 / points.length);
}

function incidentPanelIds(
  vertex: number,
  cornerReferences: Map<number, DetectedCornerReference[]>,
): string[] {
  return [...new Set((cornerReferences.get(vertex) ?? []).map((item) => item.panelId))]
    .sort(compareText);
}

function panelsAreCoplanar(
  panelIds: string[],
  panelsById: Map<string, PanelAssemblyDefinition["panels"][number]>,
): boolean {
  if (panelIds.length < 2) return true;
  const first = normalize(
    panelsById.get(panelIds[0]!)!.pose.orientation.normal as Vector3Tuple,
  );
  return panelIds.every((id) =>
    Math.abs(
      Math.abs(dot(
        first,
        normalize(panelsById.get(id)!.pose.orientation.normal as Vector3Tuple),
      )) - 1,
    ) <= 1e-6
  );
}

function vertexCycleIsPanelOutline(
  vertexIndices: number[],
  panelOutlines: number[][],
): boolean {
  if (vertexIndices.length !== 4) return false;
  const key = [...vertexIndices].sort((left, right) => left - right).join(",");
  return panelOutlines.some((outline) =>
    [...outline].sort((left, right) => left - right).join(",") === key
  );
}

function orientVertexCycleOutward(
  vertexIndices: number[],
  vertices: Vector3Tuple[],
  centroid: Vector3Tuple,
): number[] {
  const points = vertexIndices.map((index) => vertices[index]!);
  const normal = normalize(polygonNormal(points));
  if (dot(normal, subtract(vertexCentroid(points), centroid)) < 0) {
    return [vertexIndices[0]!, ...vertexIndices.slice(1).reverse()];
  }
  return vertexIndices;
}

function radialOutgoingSort(
  vertex: number,
  outgoing: DetectedCapEdge[],
  vertices: Vector3Tuple[],
  cornerReferences: Map<number, DetectedCornerReference[]>,
  panelsById: Map<string, PanelAssemblyDefinition["panels"][number]>,
  centroid: Vector3Tuple,
): DetectedCapEdge[] {
  const incident = incidentPanelIds(vertex, cornerReferences);
  const axisFromPanels = normalize(
    incident.reduce((sum, id) => add(
      sum,
      normalize(panelsById.get(id)!.pose.orientation.normal as Vector3Tuple),
    ), [0, 0, 0] as Vector3Tuple),
  );
  const axis = length(axisFromPanels) > 1e-9
    ? axisFromPanels
    : normalize(subtract(vertices[vertex]!, centroid));
  let reference: Vector3Tuple | null = null;
  for (const edge of outgoing) {
    const direction = subtract(vertices[edge.end]!, vertices[vertex]!);
    const projected = subtract(direction, scale(axis, dot(direction, axis)));
    if (length(projected) > 1e-9) {
      reference = normalize(projected);
      break;
    }
  }
  if (!reference) return [...outgoing].sort(compareHalfEdges);
  const yAxis = cross(axis, reference);
  return [...outgoing].map((edge) => {
    const direction = subtract(vertices[edge.end]!, vertices[vertex]!);
    const projected = normalize(
      subtract(direction, scale(axis, dot(direction, axis))),
    );
    return {
      edge,
      angle: Math.atan2(dot(projected, yAxis), dot(projected, reference!)),
    };
  }).sort((left, right) =>
    left.angle - right.angle || compareHalfEdges(left.edge, right.edge)
  ).map((item) => item.edge);
}

function traceExposedFaces(
  exposedEdges: DetectedCapEdge[],
  vertices: Vector3Tuple[],
  cornerReferences: Map<number, DetectedCornerReference[]>,
  panelsById: Map<string, PanelAssemblyDefinition["panels"][number]>,
): number[][] {
  const halfEdges: DetectedCapEdge[] = [];
  for (const edge of exposedEdges) {
    halfEdges.push({ start: edge.start, end: edge.end });
    halfEdges.push({ start: edge.end, end: edge.start });
  }
  const outgoing = new Map<number, DetectedCapEdge[]>();
  for (const edge of halfEdges) {
    outgoing.set(edge.start, [...(outgoing.get(edge.start) ?? []), edge]);
  }
  const centroid = vertexCentroid(vertices);
  const nextByKey = new Map<string, DetectedCapEdge>();
  for (const [vertex, outs] of outgoing) {
    const sorted = radialOutgoingSort(
      vertex,
      outs,
      vertices,
      cornerReferences,
      panelsById,
      centroid,
    );
    sorted.forEach((twinOutgoing, index) => {
      const next = sorted[(index + 1) % sorted.length]!;
      nextByKey.set(
        halfEdgeKey({ start: twinOutgoing.end, end: twinOutgoing.start }),
        next,
      );
    });
  }
  const remaining = new Set(halfEdges.map(halfEdgeKey));
  const cycles: number[][] = [];
  while (remaining.size > 0) {
    const startKey = [...remaining].sort(compareText)[0]!;
    remaining.delete(startKey);
    const [start, firstEnd] = startKey.split(">").map(Number);
    const vertexIndices = [start!];
    let current: DetectedCapEdge = { start: start!, end: firstEnd! };
    while (true) {
      const next = nextByKey.get(halfEdgeKey(current));
      if (!next) {
        throw new PanelBoundaryGenerationError(
          "open-boundary",
          `Exposed panel-edge traversal starting at welded vertex ${start} did not close; it stopped at vertex ${current.end}.`,
        );
      }
      remaining.delete(halfEdgeKey(next));
      current = next;
      if (current.start === start && current.end === firstEnd) break;
      vertexIndices.push(current.start);
      if (vertexIndices.length > halfEdges.length) {
        throw new PanelBoundaryGenerationError(
          "open-boundary",
          `Exposed panel-edge traversal starting at welded vertex ${start} exceeded the available edge count without closing.`,
        );
      }
    }
    if (vertexIndices.length < 3) {
      throw new PanelBoundaryGenerationError(
        "degenerate",
        `Detected gap at welded vertex ${start} has only ${vertexIndices.length} boundary edges; at least three are required.`,
      );
    }
    cycles.push(vertexIndices);
  }
  return cycles;
}

function canonicalizeDetectedGap(
  vertexIndices: number[],
  cornerReferences: Map<number, DetectedCornerReference[]>,
): { key: string; vertices: DetectedCornerReference[] } {
  const references = vertexIndices.map((index) => {
    const reference = cornerReferences.get(index)?.[0];
    if (!reference) {
      throw new PanelBoundaryGenerationError(
        "open-boundary",
        `Detected gap reaches welded vertex ${index}, but that vertex has no panel-corner reference.`,
      );
    }
    return reference;
  });
  const rotations = references.map((_, offset) => {
    const vertices = references.map(
      (__, index) => references[(index + offset) % references.length]!,
    );
    return {
      key: vertices.map(detectedCornerKey).join("|"),
      vertices,
    };
  });
  rotations.sort((left, right) => compareText(left.key, right.key));
  return rotations[0]!;
}

/**
 * Detects cap connectivity from welded panel-outline edges. Shared, oppositely
 * wound panel edges are removed. Isolated 2-regular loops keep the unique
 * reverse-edge walk. When neighbouring panels meet only at a vertex, a radial
 * face walk around the welded vertex finds the holes, including the eight
 * cuboctahedron triangles after six square panels. Cycles that retrace a panel
 * outline are not caps.
 */
export function detectPanelBoundaryTopology(
  definition: PanelAssemblyDefinition,
  profile: PanelHardwareProfile,
): PanelBoundaryTopology {
  const sortedPanels = [...definition.panels].sort((left, right) =>
    compareText(left.id, right.id)
  );
  const panelsById = new Map(sortedPanels.map((panel) => [panel.id, panel]));
  const welded = weldPanelCorners(
    collectPanelCorners(sortedPanels, profile),
    PANEL_BOUNDARY_TOLERANCES.vertexWeldMm,
  );
  const vertices = welded.vertices;
  const cornerReferences = new Map<number, DetectedCornerReference[]>();
  const edgeUses = new Map<string, DetectedPanelEdgeUse[]>();
  const panelOutlines: number[][] = [];

  for (const panel of sortedPanels) {
    const indices = PANEL_CORNER_ORDER.map((corner) => {
      const index = welded.cornerIndex.get(pointKey(panel.id, corner));
      if (index === undefined) {
        throw new PanelBoundaryGenerationError(
          "open-boundary",
          `Panel ${panel.id} corner ${corner} was not welded into the boundary graph.`,
        );
      }
      cornerReferences.set(index, [
        ...(cornerReferences.get(index) ?? []),
        { panelId: panel.id, corner },
      ]);
      return index;
    });
    if (new Set(indices).size !== PANEL_CORNER_ORDER.length) {
      throw new PanelBoundaryGenerationError(
        "degenerate",
        `Panel ${panel.id} outline collapses within named tolerance vertexWeldMm (${PANEL_BOUNDARY_TOLERANCES.vertexWeldMm} mm).`,
      );
    }
    panelOutlines.push(indices);
    indices.forEach((start, index) => {
      const end = indices[(index + 1) % indices.length]!;
      const use: DetectedPanelEdgeUse = {
        panelId: panel.id,
        start,
        end,
        startCorner: PANEL_CORNER_ORDER[index]!,
        endCorner: PANEL_CORNER_ORDER[(index + 1) % indices.length]!,
      };
      const key = edgeKey(start, end);
      edgeUses.set(key, [...(edgeUses.get(key) ?? []), use]);
    });
  }
  for (const references of cornerReferences.values()) {
    references.sort(compareDetectedCornerReferences);
  }

  const sortedEdgeEntries = [...edgeUses.entries()].sort(([left], [right]) =>
    compareText(left, right)
  );
  const nonManifold = sortedEdgeEntries.find(([, uses]) => uses.length > 2);
  if (nonManifold) {
    const [key, uses] = nonManifold;
    throw new PanelBoundaryGenerationError(
      "non-manifold",
      `Welded panel edge ${key} is used by ${uses.length} panel outlines (${uses.map(describeDetectedPanelEdge).join(", ")}); at most two are permitted.`,
    );
  }

  const exposedEdges: DetectedCapEdge[] = [];
  for (const [key, uses] of sortedEdgeEntries) {
    if (uses.length === 2) {
      const [first, second] = uses;
      if (first!.start !== second!.end || first!.end !== second!.start) {
        throw new PanelBoundaryGenerationError(
          "inconsistent-winding",
          `Welded panel edge ${key} is shared with matching direction (${uses.map(describeDetectedPanelEdge).join(", ")}); adjacent panel outlines must traverse a shared edge in opposite directions.`,
        );
      }
      continue;
    }
    const panelUse = uses[0]!;
    exposedEdges.push({ start: panelUse.end, end: panelUse.start });
  }

  if (exposedEdges.length === 0) {
    throw new PanelBoundaryGenerationError(
      "missing-topology",
      "Automatic gap detection found no exposed panel-outline edges to close.",
    );
  }

  const outgoing = new Map<number, DetectedCapEdge[]>();
  const incoming = new Map<number, DetectedCapEdge[]>();
  for (const edge of exposedEdges) {
    outgoing.set(edge.start, [...(outgoing.get(edge.start) ?? []), edge]);
    incoming.set(edge.end, [...(incoming.get(edge.end) ?? []), edge]);
  }
  const exposedVertices = [...new Set(
    exposedEdges.flatMap(({ start, end }) => [start, end]),
  )].sort((left, right) => left - right);
  let needsFaceWalk = false;
  for (const vertex of exposedVertices) {
    const next = outgoing.get(vertex) ?? [];
    const previous = incoming.get(vertex) ?? [];
    const references = (cornerReferences.get(vertex) ?? [])
      .map(detectedCornerKey)
      .join(", ");
    if (next.length === 0 || previous.length === 0) {
      throw new PanelBoundaryGenerationError(
        "open-boundary",
        `Exposed panel-edge graph is open at welded vertex ${vertex} (${references}): ${previous.length} incoming and ${next.length} outgoing cap edges were found.`,
      );
    }
    if (next.length === 1 && previous.length === 1) continue;
    const incident = incidentPanelIds(vertex, cornerReferences);
    if (panelsAreCoplanar(incident, panelsById)) {
      throw new PanelBoundaryGenerationError(
        "ambiguous-topology",
        `Automatic gap detection is ambiguous at welded vertex ${vertex} (${references}): ${previous.length} incoming and ${next.length} outgoing cap edges meet there. Separate the touching gaps or author a correction.`,
      );
    }
    needsFaceWalk = true;
  }

  const vertexCycles: number[][] = [];
  if (needsFaceWalk) {
    const centroid = vertexCentroid(vertices);
    for (const cycle of traceExposedFaces(
      exposedEdges,
      vertices,
      cornerReferences,
      panelsById,
    )) {
      if (vertexCycleIsPanelOutline(cycle, panelOutlines)) continue;
      vertexCycles.push(orientVertexCycleOutward(cycle, vertices, centroid));
    }
  } else {
    const remaining = new Set(exposedEdges);
    while (remaining.size > 0) {
      const startEdge = [...remaining].sort((left, right) =>
        left.start - right.start || left.end - right.end
      )[0]!;
      const startVertex = startEdge.start;
      const vertexIndices: number[] = [];
      let current = startVertex;
      while (true) {
        vertexIndices.push(current);
        const edge = outgoing.get(current)?.[0];
        if (!edge || !remaining.delete(edge)) {
          throw new PanelBoundaryGenerationError(
            "open-boundary",
            `Exposed panel-edge traversal starting at welded vertex ${startVertex} did not close; it stopped at vertex ${current}.`,
          );
        }
        current = edge.end;
        if (current === startVertex) break;
        if (vertexIndices.length > exposedEdges.length) {
          throw new PanelBoundaryGenerationError(
            "open-boundary",
            `Exposed panel-edge traversal starting at welded vertex ${startVertex} exceeded the available edge count without closing.`,
          );
        }
      }
      if (vertexIndices.length < 3) {
        throw new PanelBoundaryGenerationError(
          "degenerate",
          `Detected gap at welded vertex ${startVertex} has only ${vertexIndices.length} boundary edges; at least three are required.`,
        );
      }
      if (vertexCycleIsPanelOutline(vertexIndices, panelOutlines)) continue;
      vertexCycles.push(vertexIndices);
    }
  }

  if (vertexCycles.length === 0) {
    throw new PanelBoundaryGenerationError(
      "missing-topology",
      "Automatic gap detection found only panel outlines. Move neighbouring outline corners within vertexWeldMm so the holes between panels can close.",
    );
  }

  const cycles = vertexCycles.map((vertexIndices) =>
    canonicalizeDetectedGap(vertexIndices, cornerReferences)
  );

  const gaps = cycles.map(({ key, vertices: cycleVertices }) => ({
    id: `gap-${sha256Text(key).slice(0, 12)}`,
    vertices: cycleVertices,
  })).sort((left, right) => compareText(left.id, right.id));
  return { kind: "panel-outline-gap-cycles", gaps };
}

function triangulateFace(
  indices: number[],
  projected: Point2[],
): Array<[number, number, number]> {
  return triangulatePolygon(indices, projected).map((triangle) => {
    if (triangle.length !== 3) throw new Error("Triangulation returned a non-triangle.");
    return [triangle[0]!, triangle[1]!, triangle[2]!];
  });
}

function validateTopologyPresence(
  topology: PanelBoundaryTopology | undefined,
): asserts topology is PanelBoundaryTopology {
  if (!topology || topology.gaps.length === 0) {
    throw new PanelBoundaryGenerationError(
      "missing-topology",
      "Panel-outline boundary generation requires at least one accepted gap topology. Gap topology may reference panel IDs and named corners, but must not store coordinates or poses.",
    );
  }
}

/**
 * Generates a zero-thickness, closed boundary from authoritative panel poses.
 * The accepted topology supplies connectivity only; it never supplies geometry.
 */
export function generateClosedPanelBoundary(
  definition: PanelAssemblyDefinition,
  profile: PanelHardwareProfile,
  topology: PanelBoundaryTopology | undefined = definition.boundaryTopology,
): ClosedPanelBoundary {
  assertRectangularPanelTools(profile, "Panel boundary generation");
  validateTopologyPresence(topology);
  const sortedPanels = [...definition.panels].sort((left, right) =>
    compareText(left.id, right.id)
  );
  const welded = weldPanelCorners(
    collectPanelCorners(sortedPanels, profile),
    PANEL_BOUNDARY_TOLERANCES.vertexWeldMm,
  );
  const vertices = welded.vertices;
  const cornerIndices = welded.cornerIndex;
  const faces: WorkingFace[] = [];
  for (const panel of sortedPanels) {
    const indices = PANEL_CORNER_ORDER.map((corner) => {
      const index = cornerIndices.get(pointKey(panel.id, corner));
      if (index === undefined) {
        throw new PanelBoundaryGenerationError(
          "open-boundary",
          `Panel ${panel.id} corner ${corner} was not welded into the boundary graph.`,
        );
      }
      return index;
    });
    if (new Set(indices).size !== 4) {
      throw new PanelBoundaryGenerationError(
        "degenerate",
        `Panel ${panel.id} outline collapses within named tolerance vertexWeldMm (${PANEL_BOUNDARY_TOLERANCES.vertexWeldMm} mm).`,
      );
    }
    const points = indices.map((index) => vertices[index]!);
    const rawNormal = polygonNormal(points);
    const normal = normalize(rawNormal);
    const projected = projectPoints(points, normal);
    faces.push({
      id: `panel:${panel.id}`,
      role: "panel-outline",
      panelId: panel.id,
      vertexIndices: indices,
      triangleIndices: triangulateFace(indices, projected),
      normal,
      areaSquareMm: length(rawNormal) / 2,
    });
  }

  const sortedGaps = [...topology.gaps].sort((left, right) =>
    compareText(left.id, right.id)
  );
  for (const gap of sortedGaps) {
    const indices = gap.vertices.map(({ panelId, corner }) => {
      const index = cornerIndices.get(pointKey(panelId, corner));
      if (index === undefined) {
        throw new PanelBoundaryGenerationError(
          "invalid-gap",
          `Gap ${gap.id} references unavailable panel corner ${panelId}.${corner}.`,
          gap.id,
        );
      }
      return index;
    });
    if (new Set(indices).size !== indices.length) {
      throw new PanelBoundaryGenerationError(
        "invalid-gap",
        `Gap ${gap.id} repeats a welded panel corner; every cap vertex must be unique.`,
        gap.id,
      );
    }
    const points = indices.map((index) => vertices[index]!);
    const validation = validateSimplePolygon(gap.id, points);
    faces.push({
      id: `gap:${gap.id}`,
      role: "cap",
      gapId: gap.id,
      vertexIndices: indices,
      triangleIndices: triangulateFace(indices, validation.projected),
      normal: validation.normal,
      areaSquareMm: validation.area,
    });
  }

  const capFaces = faces.filter((face) => face.role === "cap");
  for (const cap of capFaces) {
    for (const triangle of cap.triangleIndices) {
      const points = triangle.map((index) => vertices[index]!);
      for (const panel of sortedPanels) {
        if (triangleIntersectsOpenPanelEnvelope(points, panel, profile)) {
          throw new PanelBoundaryGenerationError(
            "pcb-intersection",
            `Gap ${cap.gapId} intersects the open interior of PCB envelope ${panel.id}; boundary-edge contact alone is permitted.`,
            cap.gapId,
          );
        }
      }
    }
  }
  for (let first = 0; first < capFaces.length; first += 1) {
    for (let second = first + 1; second < capFaces.length; second += 1) {
      const left = capFaces[first]!;
      const right = capFaces[second]!;
      for (const leftTriangle of left.triangleIndices) {
        for (const rightTriangle of right.triangleIndices) {
          if (trianglesIntersectImproperly(
            { face: left, indices: leftTriangle },
            { face: right, indices: rightTriangle },
            vertices,
          )) {
            throw new PanelBoundaryGenerationError(
              "cap-intersection",
              `Gap ${left.gapId} intersects gap ${right.gapId} away from a shared boundary edge or vertex.`,
              left.gapId,
            );
          }
        }
      }
    }
  }

  const topologyValidation = validateCombinedBoundary(faces, vertices);
  const triangles = faces.flatMap((face) => face.triangleIndices);
  const sourceFingerprint = createGeneratedMechanicsFingerprint(definition, profile);
  const meshFingerprint = sha256Text(JSON.stringify({ vertices, triangles }));
  return {
    schemaVersion: "1.0.0",
    kind: "closed-panel-outline-boundary",
    units: "mm",
    vertices,
    triangles,
    faces,
    metadata: {
      generator: {
        id: "wled-orbital-lab/panel-outline-boundary",
        version: "0.1.0",
      },
      sourceFingerprint: { algorithm: "sha256", value: sourceFingerprint },
      meshFingerprint: { algorithm: "sha256", value: meshFingerprint },
      status: { generation: "complete", validation: "passed" },
      tolerances: PANEL_BOUNDARY_TOLERANCES,
      counts: {
        vertices: vertices.length,
        edges: topologyValidation.edgeCount,
        faces: faces.length,
        panelOutlines: sortedPanels.length,
        caps: capFaces.length,
        triangles: triangles.length,
        connectedComponents: topologyValidation.connectedComponents,
      },
    },
  };
}
