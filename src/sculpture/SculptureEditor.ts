import type { PanelAssemblyDefinition } from "./PanelAssembly.ts";
import { preserveAuthoringBoundary } from "./MechanicalShellRegenerator.ts";

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
  const closureIndex = definition.closures.faceIds.indexOf(faceId);
  preserveAuthoringBoundary(definition);
  if (closureIndex < 0) {
    throw new Error(`${faceId} is not an available closure face.`);
  }
  const faceIndex = definition.mechanicalShell.faces.findIndex(
    (candidate) => candidate.id === faceId,
  );
  const face = definition.mechanicalShell.faces[faceIndex];
  if (!face) throw new Error("Mechanical face " + faceId + " does not exist.");
  const originalVertices = face.vertexIndices.map(
    (vertexIndex) => definition.mechanicalShell.vertices[vertexIndex]!,
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
      const neighbor = definition.mechanicalShell.faces.find((candidate) =>
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
    (vertexIndex) => definition.mechanicalShell.vertices[vertexIndex]!,
  );
  const localPolygon = vertices.map<Vector2Tuple>((vertex) => {
    const delta = subtract(vertex, position);
    return [dot(delta, xAxis), dot(delta, yAxis)];
  });
  const clearance = definition.closures.panelEnvelopeClearance;
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
    definition.mechanicalShell.vertices.push(vertex);
    return definition.mechanicalShell.vertices.length - 1;
  });
  const anchorEdgeIndices = anchors.map((anchor) => anchor.edgeIndex);
  const ringSectors = partitionRing(
    face.vertexIndices,
    innerIndices,
    anchorEdgeIndices,
    definition.mechanicalShell.vertices,
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
  definition.mechanicalShell.faces.splice(
    faceIndex,
    1,
    { id: faceId, vertexIndices: innerIndices },
    ...closureFaces,
  );
  definition.closures.faceIds.splice(
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
  const definition = structuredClone(source);
  preserveAuthoringBoundary(definition);
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
  definition.mechanicalShell.derivationStatus = "requires-regeneration";
  definition.status = "provisional";
  definition.calibration.panelTransforms = "generated-provisional";
  definition.calibration.installedPanelOrientation = "provisional";
  definition.calibration.physicalChains = "provisional";
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
): PanelAssemblyDefinition {
  if (
    placement.attachment.surface !== "mechanical-shell" &&
    !source.designSurface
  ) {
    throw new Error(
      "Load a GLB or use the sculpture JSON face graph before adding panels.",
    );
  }
  const definition = structuredClone(source);
  preserveAuthoringBoundary(definition);
  const panelId = nextPanelId(definition);
  definition.panels.push({
    id: panelId,
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
  definition.mechanicalShell.derivationStatus = "requires-regeneration";
  definition.status = "provisional";
  definition.calibration.panelTransforms = "generated-provisional";
  definition.calibration.installedPanelOrientation = "provisional";
  definition.calibration.physicalChains = "provisional";
  definition.notes.push(
    `Panel ${panelId} was placed manually on the design surface; mechanical shell regeneration remains required.`,
  );
  return definition;
}

export function deletePanel(
  source: PanelAssemblyDefinition,
  panelId: string,
): PanelAssemblyDefinition {
  const definition = structuredClone(source);
  preserveAuthoringBoundary(definition);
  const panelIndex = definition.panels.findIndex(
    (candidate) => candidate.id === panelId,
  );
  if (panelIndex < 0) throw new Error(`Unknown panel ${panelId}.`);
  const [panel] = definition.panels.splice(panelIndex, 1);
  if (panel?.mountFaceId && !definition.closures.faceIds.includes(panel.mountFaceId)) {
    definition.closures.faceIds.push(panel.mountFaceId);
  }
  const longestOutput = definition.wiring.chainLengths.reduce(
    (bestIndex, length, index, lengths) =>
      length > lengths[bestIndex]! ? index : bestIndex,
    0,
  );
  definition.wiring.chainLengths[longestOutput] =
    definition.wiring.chainLengths[longestOutput]! - 1;
  definition.mechanicalShell.derivationStatus = "requires-regeneration";
  definition.status = "provisional";
  definition.calibration.panelTransforms = "generated-provisional";
  definition.calibration.installedPanelOrientation = "provisional";
  definition.calibration.physicalChains = "provisional";
  definition.notes.push(
    `Panel ${panelId} was deleted in the browser editor; mechanical shell regeneration remains required.`,
  );
  return definition;
}

export function sculptureJson(definition: PanelAssemblyDefinition): string {
  return `${JSON.stringify(definition, null, 2)}\n`;
}
