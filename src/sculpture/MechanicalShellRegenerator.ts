import type {
  PanelAssemblyDefinition,
  PanelAssemblyProject,
} from "./PanelAssembly.ts";

type Vector3Tuple = [number, number, number];
type Vector2Tuple = [number, number];
type ShellFace = PanelAssemblyDefinition["mechanicalShell"]["faces"][number];
type Panel = PanelAssemblyDefinition["panels"][number];

const PLANE_TOLERANCE = 0.05;
const NORMAL_TOLERANCE = 1e-5;
const GEOMETRY_TOLERANCE = 1e-6;

function add(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(value: Vector3Tuple, amount: number): Vector3Tuple {
  return [value[0] * amount, value[1] * amount, value[2] * amount];
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

function normalize(value: Vector3Tuple): Vector3Tuple {
  const length = Math.hypot(...value);
  if (length < 1e-10) throw new Error("Mechanical boundary contains a degenerate edge or face.");
  return scale(value, 1 / length);
}

function mean(values: Vector3Tuple[]): Vector3Tuple {
  return scale(values.reduce(add), 1 / values.length);
}

function samePose(a: Panel["pose"], b: Panel["pose"]): boolean {
  const valuesA = [
    ...a.position,
    ...a.orientation.xAxis,
    ...a.orientation.yAxis,
    ...a.orientation.normal,
  ];
  const valuesB = [
    ...b.position,
    ...b.orientation.xAxis,
    ...b.orientation.yAxis,
    ...b.orientation.normal,
  ];
  return valuesA.every((value, index) => Math.abs(value - valuesB[index]!) <= 1e-9);
}

/** Captures the JSON face graph before an editor operation makes derived topology stale. */
export function preserveAuthoringBoundary(
  definition: PanelAssemblyDefinition,
): void {
  if (definition.mechanicalShell.authoringBoundary) return;
  definition.mechanicalShell.authoringBoundary = {
    vertices: structuredClone(definition.mechanicalShell.vertices),
    faces: definition.mechanicalShell.faces.map(({ id, vertexIndices }) => ({
      id,
      vertexIndices: [...vertexIndices],
    })),
    authoredPanels: definition.panels.flatMap((panel) =>
      panel.mountFaceId
        ? [{
            id: panel.id,
            mountFaceId: panel.mountFaceId,
            pose: structuredClone(panel.pose),
          }]
        : []
    ),
  };
}

interface FaceFrame {
  face: { id: string; vertexIndices: number[] };
  vertices: Vector3Tuple[];
  origin: Vector3Tuple;
  normal: Vector3Tuple;
  xAxis: Vector3Tuple;
  yAxis: Vector3Tuple;
  local: Vector2Tuple[];
}

function signedArea(polygon: Vector2Tuple[]): number {
  return polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length]!;
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function faceFrame(
  face: { id: string; vertexIndices: number[] },
  vertices: Vector3Tuple[],
): FaceFrame {
  const points = face.vertexIndices.map((index) => vertices[index]!);
  const origin = mean(points);
  const xAxis = normalize(subtract(points[1]!, points[0]!));
  let normal = normalize(cross(
    subtract(points[1]!, points[0]!),
    subtract(points[2]!, points[1]!),
  ));
  if (dot(normal, origin) < 0) normal = scale(normal, -1);
  const yAxis = normalize(cross(normal, xAxis));
  const local = points.map<Vector2Tuple>((point) => {
    const delta = subtract(point, origin);
    if (Math.abs(dot(delta, normal)) > GEOMETRY_TOLERANCE) {
      throw new Error(`Mechanical boundary face ${face.id} is not planar.`);
    }
    return [dot(delta, xAxis), dot(delta, yAxis)];
  });
  if (signedArea(local) < 0) {
    face.vertexIndices.reverse();
    points.reverse();
    local.reverse();
  }
  for (let index = 0; index < local.length; index += 1) {
    const a = local[index]!;
    const b = local[(index + 1) % local.length]!;
    const c = local[(index + 2) % local.length]!;
    const turn = (b[0] - a[0]) * (c[1] - b[1]) -
      (b[1] - a[1]) * (c[0] - b[0]);
    if (turn < -GEOMETRY_TOLERANCE) {
      throw new Error(`Mechanical boundary face ${face.id} is concave; planar regeneration currently requires convex faces.`);
    }
  }
  return { face, vertices: points, origin, normal, xAxis, yAxis, local };
}

function validateBoundary(frames: FaceFrame[]): void {
  const uses = new Map<string, string[]>();
  for (const frame of frames) {
    for (let index = 0; index < frame.face.vertexIndices.length; index += 1) {
      const a = frame.face.vertexIndices[index]!;
      const b = frame.face.vertexIndices[(index + 1) % frame.face.vertexIndices.length]!;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      uses.set(key, [...(uses.get(key) ?? []), frame.face.id]);
    }
  }
  const invalid = [...uses].find(([, faceIds]) => faceIds.length !== 2);
  if (invalid) {
    throw new Error(
      `Mechanical boundary edge ${invalid[0]} belongs to ${invalid[1].length} faces; the JSON boundary must be closed and two-manifold.`,
    );
  }
}

function pointInsideConvex(polygon: Vector2Tuple[], point: Vector2Tuple): boolean {
  return polygon.every((start, index) => {
    const end = polygon[(index + 1) % polygon.length]!;
    return (end[0] - start[0]) * (point[1] - start[1]) -
        (end[1] - start[1]) * (point[0] - start[0]) >= -GEOMETRY_TOLERANCE;
  });
}

function segmentsIntersect(
  a: Vector2Tuple,
  b: Vector2Tuple,
  c: Vector2Tuple,
  d: Vector2Tuple,
): boolean {
  const orientation = (p: Vector2Tuple, q: Vector2Tuple, r: Vector2Tuple) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return abC * abD < -GEOMETRY_TOLERANCE && cdA * cdB < -GEOMETRY_TOLERANCE;
}

function polygonsOverlap(a: Vector2Tuple[], b: Vector2Tuple[]): boolean {
  if (a.some((point) => pointInsideConvex(b, point))) return true;
  if (b.some((point) => pointInsideConvex(a, point))) return true;
  return a.some((start, index) => {
    const end = a[(index + 1) % a.length]!;
    return b.some((otherStart, otherIndex) =>
      segmentsIntersect(
        start,
        end,
        otherStart,
        b[(otherIndex + 1) % b.length]!,
      )
    );
  });
}

interface LocatedPanel {
  panel: Panel;
  frame: FaceFrame;
  panelCorners: Vector2Tuple[];
  clearedCorners: Vector2Tuple[];
  grandfathered: boolean;
}

function panelCorners(
  panel: Panel,
  frame: FaceFrame,
  width: number,
  height: number,
  clearance: number,
): { panel: Vector2Tuple[]; cleared: Vector2Tuple[] } {
  const offset = panel.surfaceAttachment?.normalOffset ?? 0;
  const surfacePosition = subtract(
    panel.pose.position,
    scale(panel.pose.orientation.normal, offset),
  );
  const delta = subtract(surfacePosition, frame.origin);
  const center: Vector2Tuple = [dot(delta, frame.xAxis), dot(delta, frame.yAxis)];
  const localXAxis: Vector2Tuple = [
    dot(panel.pose.orientation.xAxis, frame.xAxis),
    dot(panel.pose.orientation.xAxis, frame.yAxis),
  ];
  const localYAxis: Vector2Tuple = [
    dot(panel.pose.orientation.yAxis, frame.xAxis),
    dot(panel.pose.orientation.yAxis, frame.yAxis),
  ];
  const rectangle = (extra: number): Vector2Tuple[] => ([
    [-width / 2 - extra, -height / 2 - extra],
    [width / 2 + extra, -height / 2 - extra],
    [width / 2 + extra, height / 2 + extra],
    [-width / 2 - extra, height / 2 + extra],
  ] satisfies Vector2Tuple[]).map(([x, y]) => [
    center[0] + localXAxis[0] * x + localYAxis[0] * y,
    center[1] + localXAxis[1] * x + localYAxis[1] * y,
  ]);
  return { panel: rectangle(0), cleared: rectangle(clearance) };
}

function locatePanel(
  panel: Panel,
  frames: FaceFrame[],
  authored: Map<string, { mountFaceId: string; pose: Panel["pose"] }>,
  dimensions: { width: number; height: number },
  clearance: number,
): LocatedPanel {
  const authoredPanel = authored.get(panel.id);
  const grandfathered = authoredPanel !== undefined &&
    samePose(panel.pose, authoredPanel.pose);
  const candidates = frames.flatMap((frame) => {
    if (grandfathered && frame.face.id !== authoredPanel.mountFaceId) return [];
    const alignment = dot(panel.pose.orientation.normal, frame.normal);
    if (alignment < 1 - NORMAL_TOLERANCE) return [];
    const offset = panel.surfaceAttachment?.normalOffset ?? 0;
    const surfacePosition = subtract(
      panel.pose.position,
      scale(panel.pose.orientation.normal, offset),
    );
    const planeDistance = Math.abs(dot(subtract(surfacePosition, frame.origin), frame.normal));
    if (planeDistance > PLANE_TOLERANCE) return [];
    const corners = panelCorners(
      panel,
      frame,
      dimensions.width,
      dimensions.height,
      clearance,
    );
    if (!grandfathered && !corners.cleared.every((point) => pointInsideConvex(frame.local, point))) {
      return [];
    }
    return [{ panel, frame, panelCorners: corners.panel, clearedCorners: corners.cleared, grandfathered }];
  });
  if (candidates.length === 0) {
    throw new Error(
      `Panel ${panel.id} does not lie fully inside one planar JSON boundary face with ${clearance} mm clearance. Move it away from seams or back onto a planar face.`,
    );
  }
  if (candidates.length > 1) {
    throw new Error(`Panel ${panel.id} matches more than one JSON boundary face; move it away from the seam.`);
  }
  return candidates[0]!;
}

function worldPoint(frame: FaceFrame, point: Vector2Tuple): Vector3Tuple {
  return add(add(frame.origin, scale(frame.xAxis, point[0])), scale(frame.yAxis, point[1]));
}

function rotateToClosestOuterCorner(
  inner: Vector2Tuple[],
  outerStart: Vector2Tuple,
): Vector2Tuple[] {
  const closest = inner.reduce(
    (best, point, index) => {
      const distance = (point[0] - outerStart[0]) ** 2 + (point[1] - outerStart[1]) ** 2;
      return distance < best.distance ? { index, distance } : best;
    },
    { index: 0, distance: Number.POSITIVE_INFINITY },
  ).index;
  return [...inner.slice(closest), ...inner.slice(0, closest)];
}

function insetFaces(
  located: LocatedPanel,
  vertices: Vector3Tuple[],
): { panelFace: ShellFace; closureFaces: ShellFace[] } {
  const outer = located.frame.face.vertexIndices;
  const innerLocal = rotateToClosestOuterCorner(
    located.panelCorners,
    located.frame.local[0]!,
  );
  const inner = innerLocal.map((point) => {
    vertices.push(worldPoint(located.frame, point));
    return vertices.length - 1;
  });
  const sectorCount = Math.min(outer.length, inner.length);
  const anchors = Array.from(
    { length: sectorCount },
    (_, index) => Math.round((index * outer.length) / sectorCount) % outer.length,
  );
  const partId = `${located.frame.face.id}-P-${located.panel.id}`;
  const closureFaces = anchors.map((outerStart, sectorIndex) => {
    const outerEnd = anchors[(sectorIndex + 1) % anchors.length]!;
    const outerCount = (outerEnd - outerStart + outer.length) % outer.length || outer.length;
    const indices = Array.from(
      { length: outerCount + 1 },
      (_, offset) => outer[(outerStart + offset) % outer.length]!,
    );
    const innerStart = Math.round((sectorIndex * inner.length) / sectorCount);
    const innerEnd = Math.round(((sectorIndex + 1) * inner.length) / sectorCount);
    for (let index = innerEnd; index >= innerStart; index -= 1) {
      indices.push(inner[index % inner.length]!);
    }
    return {
      id: `${partId}-C-${String(sectorIndex + 1).padStart(2, "0")}`,
      partId,
      vertexIndices: indices,
      connectorPolicy: {
        minimumPanelHoleConnectors: 2 as const,
        reason: "Coplanar sectors are emitted together as one four-hole face-ring part.",
      },
    };
  });
  return {
    panelFace: {
      id: `${located.frame.face.id}-PANEL-${located.panel.id}`,
      vertexIndices: inner,
    },
    closureFaces,
  };
}

/**
 * Rebuilds printable topology exclusively from the saved planar JSON boundary.
 * A GLB may have supplied poses, but no GLB vertex or triangle is consumed here.
 */
export function regenerateMechanicalShell(
  project: PanelAssemblyProject,
): PanelAssemblyDefinition {
  const definition = structuredClone(project.sculpture);
  const boundary = definition.mechanicalShell.authoringBoundary;
  if (!boundary) {
    throw new Error("Mechanical regeneration needs the stable JSON authoring boundary captured by the editor.");
  }
  const baseFaces = structuredClone(boundary.faces);
  const vertices = structuredClone(boundary.vertices);
  const frames = baseFaces.map((face) => faceFrame(face, vertices));
  validateBoundary(frames);
  const authored = new Map(boundary.authoredPanels.map((panel) => [panel.id, panel]));
  const located = definition.panels.map((panel) => locatePanel(
    panel,
    frames,
    authored,
    project.panelProfile.dimensions,
    definition.closures.panelEnvelopeClearance,
  ));
  const byFace = new Map<string, LocatedPanel[]>();
  for (const candidate of located) {
    byFace.set(candidate.frame.face.id, [
      ...(byFace.get(candidate.frame.face.id) ?? []),
      candidate,
    ]);
  }
  for (const [faceId, panels] of byFace) {
    if (panels.length > 1) {
      throw new Error(`Boundary face ${faceId} contains ${panels.length} panels; this first planar generator supports one panel per face.`);
    }
  }
  for (const panels of byFace.values()) {
    const first = panels[0]!;
    for (const second of panels.slice(1)) {
      if (polygonsOverlap(first.clearedCorners, second.clearedCorners)) {
        throw new Error(`Panels ${first.panel.id} and ${second.panel.id} overlap after mechanical clearance.`);
      }
    }
  }

  const faces: ShellFace[] = [];
  const closureFaceIds: string[] = [];
  for (const frame of frames) {
    const locatedPanel = byFace.get(frame.face.id)?.[0];
    if (!locatedPanel) {
      faces.push({ id: frame.face.id, vertexIndices: [...frame.face.vertexIndices] });
      closureFaceIds.push(frame.face.id);
      continue;
    }
    locatedPanel.panel.mountFaceId = locatedPanel.grandfathered
      ? frame.face.id
      : `${frame.face.id}-PANEL-${locatedPanel.panel.id}`;
    if (locatedPanel.grandfathered) {
      faces.push({ id: frame.face.id, vertexIndices: [...frame.face.vertexIndices] });
      continue;
    }
    const inset = insetFaces(locatedPanel, vertices);
    faces.push(inset.panelFace, ...inset.closureFaces);
    closureFaceIds.push(...inset.closureFaces.map((face) => face.id));
    locatedPanel.panel.connectorPolicy = {
      allowSharedClosureAcrossAdjacentEdges: true,
      reason: "Four eligible holes are owned by coplanar sectors of one generated face-ring part.",
    };
  }
  definition.mechanicalShell.vertices = vertices;
  definition.mechanicalShell.faces = faces;
  definition.mechanicalShell.derivationStatus = "authored";
  definition.closures.faceIds = closureFaceIds;
  definition.notes.push(
    "Printable topology was regenerated from the planar JSON mechanical boundary; the GLB was used only as a panel-positioning canvas.",
  );
  return definition;
}
