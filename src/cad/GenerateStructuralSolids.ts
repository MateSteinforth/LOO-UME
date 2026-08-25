import type { Manifold, ManifoldToplevel, Mat4 } from "manifold-3d";
import type {
  NormalizedStructuralDesign,
  StructuralConnectorSurfaceStyle,
  StructuralVector,
} from "../sculpture/StructuralDesign.ts";
import type {
  CandidateConnectorCell,
  CandidateTrussMember,
} from "../structure/CandidateTruss.ts";
import { validateCandidateTruss } from "../structure/CandidateTruss.ts";
import type { TrussOptimizationResult } from "../structure/TrussOptimizer.ts";
import { loadManifoldRuntime } from "./ManifoldRuntime.ts";
import { panelIdLabelSection, panelIdLabelSize } from "./PanelIdGlyphs.ts";

const EPSILON_MM = 0.03;
const CIRCULAR_SEGMENTS = 32;
const MAXIMUM_STRUT_SEGMENTS = 256;
const LOFT_STATION_COUNT = 9;
const LOFT_REAR_DEPARTURE_MM = 6;
const SURFACE_BRIDGE_STATION_COUNT = 9;
const SURFACE_BRIDGE_EDGE_SAMPLES = 17;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export interface StructuralGeometryPolicy {
  schemaVersion: "1.0.0";
  minimumWallMm: number;
  hubMinimumRadiusMm: number;
  socketDepthMm: number;
  socketBossExtensionMm: number;
  socketRadialClearanceMm: number;
  tenonRadialReductionMm: number;
  orientationMarkHeightMm: number;
  capScrewTabWidthMm: number;
  capShoeThicknessMm: number;
  panelLabelPixelMm: number;
  panelLabelDepthMm: number;
  loftStationCount: number;
  loftRearDepartureMm: number;
  surfaceRidgeWidthMm: number;
  surfaceBridgeThicknessMm: number;
  surfaceBridgeStationCount: number;
  surfaceBridgeEdgeSamples: number;
  surfacePanelClearanceMm: number;
  surfaceOrganicCrownMm: number;
  surfaceMeshSimplificationToleranceMm: number;
  meshSimplificationToleranceMm: number;
  connectorClearanceCylinderSegments: number;
  connectorClearanceRadialScale: number;
}

export const STRUCTURAL_GEOMETRY_POLICY: StructuralGeometryPolicy = {
  schemaVersion: "1.0.0",
  minimumWallMm: 1.2,
  hubMinimumRadiusMm: 4.5,
  socketDepthMm: 4,
  socketBossExtensionMm: 1.5,
  socketRadialClearanceMm: 0.15,
  tenonRadialReductionMm: 0.1,
  orientationMarkHeightMm: 1.2,
  capScrewTabWidthMm: 13,
  capShoeThicknessMm: 3,
  panelLabelPixelMm: 0.62,
  panelLabelDepthMm: 0.55,
  loftStationCount: LOFT_STATION_COUNT,
  loftRearDepartureMm: LOFT_REAR_DEPARTURE_MM,
  surfaceRidgeWidthMm: 5,
  surfaceBridgeThicknessMm: 2,
  surfaceBridgeStationCount: SURFACE_BRIDGE_STATION_COUNT,
  surfaceBridgeEdgeSamples: SURFACE_BRIDGE_EDGE_SAMPLES,
  surfacePanelClearanceMm: 0.3,
  surfaceOrganicCrownMm: 0.02,
  surfaceMeshSimplificationToleranceMm: 0.0001,
  meshSimplificationToleranceMm: 0.001,
  connectorClearanceCylinderSegments: CIRCULAR_SEGMENTS,
  connectorClearanceRadialScale:
    1 / Math.cos(Math.PI / CIRCULAR_SEGMENTS),
};

export interface StructuralSolidProbe {
  x: number;
  y: number;
  z: number;
}

export interface StructuralSolidMesh {
  partId: string;
  kind: "organic-connector" | "ribbon-junction" | "surface-bridge" |
    "surface-bridge-junction" | "connector-bracket" | "strut-segment" |
    "splice-sleeve";
  status: string;
  volumeCubicMm: number;
  numTri: number;
  genus: number;
  boundingBoxMm: { min: StructuralVector; max: StructuralVector };
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  panelId?: string;
  panelIds?: string[];
  connectorCellId?: string;
  connectorJunctionId?: string;
  memberId?: string;
  segmentIndex?: number;
  segmentCount?: number;
  anchorIds: string[];
  anchorCentersMm: StructuralSolidProbe[];
  printedPilotDiameterMm?: number;
  holeEdgeCorrectionMm?: number;
  surfaceFlushCorrectionMm?: number;
  screwHoleCentersMm: StructuralSolidProbe[];
  nutTrapCentersMm: StructuralSolidProbe[];
  nutTrapDepthMm?: number;
  cableClearanceCentersMm: StructuralSolidProbe[];
  socketCentersMm: StructuralSolidProbe[];
  orientationMarkCenterMm?: StructuralSolidProbe;
  loftStationCentersMm?: StructuralSolidProbe[];
  labelCentersMm?: Array<StructuralSolidProbe & { panelId: string }>;
  labelDepthMm?: number;
  surfaceStyle?: StructuralConnectorSurfaceStyle;
  panelEdgeIds?: Array<{ panelId: string; edgeId: PanelSurfaceEdgeId }>;
  ridgeTopCentersMm?: Array<StructuralSolidProbe & { panelId: string }>;
  surfaceThicknessMm?: number;
}

function add(left: StructuralVector, right: StructuralVector): StructuralVector {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: StructuralVector, right: StructuralVector): StructuralVector {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(value: StructuralVector, amount: number): StructuralVector {
  return [value[0] * amount, value[1] * amount, value[2] * amount];
}

function cross(left: StructuralVector, right: StructuralVector): StructuralVector {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalize(value: StructuralVector): StructuralVector {
  const length = Math.hypot(...value);
  if (!Number.isFinite(length) || length <= 1e-9) throw new Error("Structural solid requires a nonzero axis.");
  return scale(value, 1 / length);
}

function distance(left: StructuralVector, right: StructuralVector): number {
  return Math.hypot(...subtract(left, right));
}

function cubicBezier(
  start: StructuralVector,
  firstControl: StructuralVector,
  secondControl: StructuralVector,
  end: StructuralVector,
  amount: number,
): StructuralVector {
  const inverse = 1 - amount;
  return add(
    add(scale(start, inverse ** 3), scale(firstControl, 3 * inverse ** 2 * amount)),
    add(scale(secondControl, 3 * inverse * amount ** 2), scale(end, amount ** 3)),
  );
}

function probe(value: StructuralVector): StructuralSolidProbe {
  return { x: value[0], y: value[1], z: value[2] };
}

function basisMat4(origin: StructuralVector, zAxis: StructuralVector): Mat4 {
  const z = normalize(zAxis);
  const reference: StructuralVector = Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const x = normalize(cross(reference, z));
  const y = cross(z, x);
  return [
    x[0], x[1], x[2], 0,
    y[0], y[1], y[2], 0,
    z[0], z[1], z[2], 0,
    origin[0], origin[1], origin[2], 1,
  ];
}

function frameMat4(
  origin: StructuralVector,
  xAxis: StructuralVector,
  yAxis: StructuralVector,
  zAxis: StructuralVector,
): Mat4 {
  return [
    xAxis[0], xAxis[1], xAxis[2], 0,
    yAxis[0], yAxis[1], yAxis[2], 0,
    zAxis[0], zAxis[1], zAxis[2], 0,
    origin[0], origin[1], origin[2], 1,
  ];
}

function dispose(items: Array<{ delete(): void } | undefined>): void {
  for (const item of items) item?.delete();
}

function unionAll(wasm: ManifoldToplevel, solids: Manifold[]): Manifold {
  const owned = solids.splice(0);
  if (owned.length === 0) throw new Error("Structural part has no positive solids.");
  if (owned.length === 1) return owned[0]!;
  try {
    return wasm.Manifold.union(owned);
  } finally {
    dispose(owned);
  }
}

function hullAll(wasm: ManifoldToplevel, solids: Manifold[]): Manifold {
  const owned = solids.splice(0);
  if (owned.length < 2) throw new Error("Structural hull requires at least two solids.");
  try {
    return wasm.Manifold.hull(owned);
  } finally {
    dispose(owned);
  }
}

function cylinderAlong(
  wasm: ManifoldToplevel,
  startMm: StructuralVector,
  endMm: StructuralVector,
  startRadiusMm: number,
  endRadiusMm = startRadiusMm,
  segments = CIRCULAR_SEGMENTS,
): Manifold {
  const axis = subtract(endMm, startMm);
  const lengthMm = Math.hypot(...axis);
  if (lengthMm <= 1e-6) throw new Error("Structural cylinder has zero length.");
  const local = wasm.Manifold.cylinder(
    lengthMm,
    startRadiusMm,
    endRadiusMm,
    segments,
  );
  try {
    return local.transform(basisMat4(startMm, axis));
  } finally {
    local.delete();
  }
}

function translatedSphere(
  wasm: ManifoldToplevel,
  centerMm: StructuralVector,
  radiusMm: number,
): Manifold {
  const local = wasm.Manifold.sphere(radiusMm, CIRCULAR_SEGMENTS);
  try {
    return local.translate(centerMm);
  } finally {
    local.delete();
  }
}

function dot(left: StructuralVector, right: StructuralVector): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function panelIdRibbonLabelCutter(
  wasm: ManifoldToplevel,
  panelId: string,
  panel: NormalizedStructuralDesign["panels"][number],
  mountPositions: StructuralVector[],
  inward: StructuralVector,
): { cutter: Manifold; center: StructuralSolidProbe & { panelId: string } } |
  undefined {
  if (mountPositions.length < 2) return undefined;
  const pixel = STRUCTURAL_GEOMETRY_POLICY.panelLabelPixelMm;
  const size = panelIdLabelSize(panelId, pixel);
  if (size.width <= 0) return undefined;
  const spacing = distance(mountPositions[0]!, mountPositions[1]!);
  const maximumWidth = spacing - STRUCTURAL_GEOMETRY_POLICY.capScrewTabWidthMm;
  if (maximumWidth <= 0) return undefined;
  const fit = Math.min(1, maximumWidth / size.width);
  const section = panelIdLabelSection(wasm, panelId, pixel);
  if (!section) return undefined;
  let along = normalize(subtract(mountPositions[1]!, mountPositions[0]!));
  const orientationReference = Math.abs(dot(along, panel.xAxis)) >=
      Math.abs(dot(along, panel.yAxis)) ? panel.xAxis : panel.yAxis;
  if (dot(along, orientationReference) < 0) along = scale(along, -1);
  const outward = scale(inward, -1);
  const up = normalize(cross(inward, along));
  const midpoint = scale(add(mountPositions[0]!, mountPositions[1]!), 0.5);
  const cutterOrigin = add(
    midpoint,
    scale(outward, EPSILON_MM),
  );
  let placed: ReturnType<typeof section.scale> | undefined;
  let local: Manifold | undefined;
  try {
    placed = section.scale([-fit, fit]);
    local = placed.extrude(
      STRUCTURAL_GEOMETRY_POLICY.panelLabelDepthMm + 2 * EPSILON_MM,
    );
    const cutter = local.transform(frameMat4(cutterOrigin, along, up, inward));
    const stemX = -fit * (-size.width / 2 + 1.5 * pixel);
    const center = add(
      add(cutterOrigin, scale(along, stemX)),
      scale(
        inward,
        STRUCTURAL_GEOMETRY_POLICY.panelLabelDepthMm / 2 + EPSILON_MM,
      ),
    );
    return { cutter, center: { ...probe(center), panelId } };
  } finally {
    local?.delete();
    placed?.delete();
    section.delete();
  }
}

function translateOwned(
  local: Manifold,
  x: number,
  y: number,
  z: number,
): Manifold {
  try {
    return local.translate(x, y, z);
  } finally {
    local.delete();
  }
}

function subtractCutters(
  wasm: ManifoldToplevel,
  positive: Manifold,
  cutters: Manifold[],
): Manifold {
  if (cutters.length === 0) return positive;
  let cutter: Manifold | undefined;
  try {
    cutter = unionAll(wasm, cutters);
    return positive.subtract(cutter);
  } finally {
    positive.delete();
    cutter?.delete();
  }
}

function correctedPilotPosition(
  panel: NormalizedStructuralDesign["panels"][number],
  anchorPositionMm: StructuralVector,
  correctionMm: number,
): StructuralVector {
  const relative = subtract(anchorPositionMm, panel.centerMm);
  const localX = relative[0] * panel.xAxis[0] + relative[1] * panel.xAxis[1] + relative[2] * panel.xAxis[2];
  const localY = relative[0] * panel.yAxis[0] + relative[1] * panel.yAxis[1] + relative[2] * panel.yAxis[2];
  const xEdgeDistance = panel.dimensionsMm.width / 2 - Math.abs(localX);
  const yEdgeDistance = panel.dimensionsMm.height / 2 - Math.abs(localY);
  const inwardAxis = xEdgeDistance <= yEdgeDistance
    ? scale(panel.xAxis, localX < 0 ? 1 : -1)
    : scale(panel.yAxis, localY < 0 ? 1 : -1);
  return add(anchorPositionMm, scale(inwardAxis, correctionMm));
}

function boxesOverlap(
  left: { min: StructuralVector; max: StructuralVector },
  right: { min: StructuralVector; max: StructuralVector },
): boolean {
  return left.min.every((value, axis) => value < right.max[axis]! - 1e-6) &&
    left.max.every((value, axis) => value > right.min[axis]! + 1e-6);
}

function panelEnvelopeBounds(
  panel: NormalizedStructuralDesign["panels"][number],
): { min: StructuralVector; max: StructuralVector } {
  const half = [
    panel.dimensionsMm.width / 2,
    panel.dimensionsMm.height / 2,
    panel.dimensionsMm.thickness / 2,
  ] as const;
  const corners: StructuralVector[] = [];
  for (const x of [-half[0], half[0]]) for (const y of [-half[1], half[1]]) {
    for (const z of [-half[2], half[2]]) {
      corners.push(add(panel.centerMm, add(
        add(scale(panel.xAxis, x), scale(panel.yAxis, y)),
        scale(panel.outwardNormal, z),
      )));
    }
  }
  return {
    min: [0, 1, 2].map((axis) => Math.min(...corners.map((corner) => corner[axis]!))) as StructuralVector,
    max: [0, 1, 2].map((axis) => Math.max(...corners.map((corner) => corner[axis]!))) as StructuralVector,
  };
}

function assertAvoidsPanelEnvelopes(
  wasm: ManifoldToplevel,
  solid: Manifold,
  normalized: NormalizedStructuralDesign,
  partId: string,
): void {
  const bounds = solid.boundingBox();
  const solidBounds = {
    min: [bounds.min[0], bounds.min[1], bounds.min[2]] as StructuralVector,
    max: [bounds.max[0], bounds.max[1], bounds.max[2]] as StructuralVector,
  };
  for (const panel of normalized.panels) {
    if (!boxesOverlap(solidBounds, panelEnvelopeBounds(panel))) continue;
    const localEnvelope = wasm.Manifold.cube([
      panel.dimensionsMm.width,
      panel.dimensionsMm.height,
      panel.dimensionsMm.thickness,
    ], true);
    let envelope: Manifold | undefined;
    let collision: Manifold | undefined;
    try {
      envelope = localEnvelope.transform(frameMat4(
        panel.centerMm,
        panel.xAxis,
        panel.yAxis,
        panel.outwardNormal,
      ));
      collision = solid.intersect(envelope);
      if (!collision.isEmpty() && collision.volume() > 1e-7) {
        const collisionBounds = collision.boundingBox();
        throw new Error(
          `Structural part ${partId} intersects PCB envelope ${panel.id} by ` +
          `${collision.volume().toFixed(6)} mm3 at ` +
          `[${collisionBounds.min.map((value) => value.toFixed(3)).join(", ")}] to ` +
          `[${collisionBounds.max.map((value) => value.toFixed(3)).join(", ")}].`,
        );
      }
    } finally {
      localEnvelope.delete();
      envelope?.delete();
      collision?.delete();
    }
  }
}

function connectorClearanceProbes(
  normalized: NormalizedStructuralDesign,
  panelIds: readonly string[],
): StructuralSolidProbe[] {
  const included = new Set(panelIds);
  return normalized.cableClearances
    .filter(({ panelId }) => included.has(panelId))
    .map(({ positionMm }) => probe(positionMm));
}

function assertAvoidsConnectorClearances(
  wasm: ManifoldToplevel,
  solid: Manifold,
  normalized: NormalizedStructuralDesign,
  partId: string,
): void {
  const bounds = solid.boundingBox();
  const solidBounds = {
    min: [bounds.min[0], bounds.min[1], bounds.min[2]] as StructuralVector,
    max: [bounds.max[0], bounds.max[1], bounds.max[2]] as StructuralVector,
  };
  for (const clearance of normalized.cableClearances) {
    const axis = normalize(clearance.outwardNormal);
    const nominalRadiusMm = clearance.diameterMm / 2;
    // Manifold's segmented cylinder is inscribed. Enlarge only this keep-out
    // mesh so every side is tangent to the specified nominal clearance circle.
    const meshRadiusMm = nominalRadiusMm *
      STRUCTURAL_GEOMETRY_POLICY.connectorClearanceRadialScale;
    const halfLengthMm = clearance.diameterMm / 2;
    const keepoutExtent = axis.map((component) =>
      halfLengthMm * Math.abs(component) +
      meshRadiusMm * Math.sqrt(Math.max(0, 1 - component * component))
    ) as StructuralVector;
    const keepoutBounds = {
      min: subtract(clearance.positionMm, keepoutExtent),
      max: add(clearance.positionMm, keepoutExtent),
    };
    if (!boxesOverlap(solidBounds, keepoutBounds)) continue;
    const start = add(
      clearance.positionMm,
      scale(axis, -halfLengthMm),
    );
    const end = add(
      clearance.positionMm,
      scale(axis, halfLengthMm),
    );
    const keepout = cylinderAlong(
      wasm,
      start,
      end,
      meshRadiusMm,
      meshRadiusMm,
      STRUCTURAL_GEOMETRY_POLICY.connectorClearanceCylinderSegments,
    );
    let collision: Manifold | undefined;
    try {
      collision = solid.intersect(keepout);
      if (!collision.isEmpty() && collision.volume() > 1e-7) {
        const collisionBounds = collision.boundingBox();
        throw new Error(
          `Structural part ${partId} intersects ${clearance.blockedBy} ` +
          `connector clearance ${clearance.id} by ` +
          `${collision.volume().toFixed(6)} mm3 at ` +
          `[${collisionBounds.min.map((value) => value.toFixed(3)).join(", ")}] to ` +
          `[${collisionBounds.max.map((value) => value.toFixed(3)).join(", ")}].`,
        );
      }
    } finally {
      keepout.delete();
      collision?.delete();
    }
  }
}

function subtractPanelEnvelopeClearance(
  wasm: ManifoldToplevel,
  solid: Manifold,
  normalized: NormalizedStructuralDesign,
  clearanceMm: number,
): Manifold {
  const cutters: Manifold[] = [];
  let consumed = false;
  try {
    for (const panel of normalized.panels) {
      const localEnvelope = wasm.Manifold.cube([
        panel.dimensionsMm.width + 2 * clearanceMm,
        panel.dimensionsMm.height + 2 * clearanceMm,
        panel.dimensionsMm.thickness + 2 * clearanceMm,
      ], true);
      try {
        cutters.push(localEnvelope.transform(frameMat4(
          panel.centerMm,
          panel.xAxis,
          panel.yAxis,
          panel.outwardNormal,
        )));
      } finally {
        localEnvelope.delete();
      }
    }
    consumed = true;
    return subtractCutters(wasm, solid, cutters);
  } catch (error) {
    if (!consumed) solid.delete();
    dispose(cutters);
    throw error;
  }
}

function meshFromSolid(
  wasm: ManifoldToplevel,
  solid: Manifold,
  metadata: Omit<StructuralSolidMesh,
    "status" | "volumeCubicMm" | "numTri" | "genus" | "boundingBoxMm" |
    "vertProperties" | "triVerts"
  >,
): StructuralSolidMesh {
  const status = solid.status();
  if (status !== "NoError") throw new Error(`Structural part ${metadata.partId} is not valid: ${status}.`);
  const components = solid.decompose();
  try {
    const componentVolumes = components.map((component) => component.volume());
    const minimumComponentVolume = metadata.surfaceStyle === "led-surface-bridge" ? 2 : 1e-5;
    const meaningful = components.filter(
      (_, index) => componentVolumes[index]! > minimumComponentVolume,
    );
    if (meaningful.length !== 1) {
      throw new Error(
        `Structural part ${metadata.partId} contains ${meaningful.length} printable solids ` +
        `with component volumes ${componentVolumes.map((volume) => volume.toFixed(6)).join(", ")} mm^3.`,
      );
    }
    let floatPrecisionSolid: Manifold | undefined;
    let toleranceSolid: Manifold | undefined;
    let outputSolid: Manifold | undefined;
    let roundTripSolid: Manifold | undefined;
    let roundTripToleranceSolid: Manifold | undefined;
    let finalSolid: Manifold | undefined;
    try {
      floatPrecisionSolid = metadata.labelCentersMm?.length ||
          metadata.surfaceStyle === "led-surface-bridge"
        ? meaningful[0]!.warp((vertex) => {
          vertex[0] = Math.fround(vertex[0]);
          vertex[1] = Math.fround(vertex[1]);
          vertex[2] = Math.fround(vertex[2]);
        })
        : undefined;
      const simplificationTolerance = metadata.surfaceStyle === "led-surface-bridge"
        ? STRUCTURAL_GEOMETRY_POLICY.surfaceMeshSimplificationToleranceMm
        : STRUCTURAL_GEOMETRY_POLICY.meshSimplificationToleranceMm;
      toleranceSolid = floatPrecisionSolid?.setTolerance(simplificationTolerance);
      outputSolid = (toleranceSolid ?? meaningful[0]!).simplify(simplificationTolerance);
      if (metadata.surfaceStyle === "led-surface-bridge") {
        roundTripSolid = wasm.Manifold.ofMesh(outputSolid.getMesh());
        roundTripToleranceSolid = roundTripSolid.setTolerance(simplificationTolerance);
        finalSolid = roundTripToleranceSolid.simplify(simplificationTolerance);
      } else {
        finalSolid = outputSolid;
      }
      const outputStatus = finalSolid.status();
      if (outputStatus !== "NoError") {
        throw new Error(
          `Structural part ${metadata.partId} is not valid after mesh simplification: ${outputStatus}.`,
        );
      }
      const volumeCubicMm = finalSolid.volume();
      if (!Number.isFinite(volumeCubicMm) || volumeCubicMm <= 1e-6) {
        throw new Error(`Structural part ${metadata.partId} has no positive volume.`);
      }
      const mesh = finalSolid.getMesh();
      const vertProperties = Float32Array.from(mesh.vertProperties);
      const triVerts = Uint32Array.from(mesh.triVerts);
      if (vertProperties.some((value) => !Number.isFinite(value))) {
        throw new Error(`Structural part ${metadata.partId} contains a non-finite vertex.`);
      }
      for (let index = 0; index < triVerts.length; index += 3) {
        const a = triVerts[index]! * 3;
        const b = triVerts[index + 1]! * 3;
        const c = triVerts[index + 2]! * 3;
        const ab: StructuralVector = [
          vertProperties[b]! - vertProperties[a]!,
          vertProperties[b + 1]! - vertProperties[a + 1]!,
          vertProperties[b + 2]! - vertProperties[a + 2]!,
        ];
        const ac: StructuralVector = [
          vertProperties[c]! - vertProperties[a]!,
          vertProperties[c + 1]! - vertProperties[a + 1]!,
          vertProperties[c + 2]! - vertProperties[a + 2]!,
        ];
        const doubledArea = Math.hypot(...cross(ab, ac));
        if (doubledArea <= 1e-10) {
          throw new Error(
            `Structural part ${metadata.partId} contains a degenerate triangle ` +
            `(triangle ${index / 3}, doubled area ${doubledArea}, vertices ` +
            `${[a, b, c].map((offset) => `[` + [0, 1, 2].map((axis) =>
              vertProperties[offset + axis]!.toFixed(6)
            ).join(", ") + `]`).join(", ")}).`,
          );
        }
      }
      const box = finalSolid.boundingBox();
      return {
        ...metadata,
        status: outputStatus,
        volumeCubicMm,
        numTri: finalSolid.numTri(),
        genus: finalSolid.genus(),
        boundingBoxMm: {
          min: [box.min[0], box.min[1], box.min[2]],
          max: [box.max[0], box.max[1], box.max[2]],
        },
        vertProperties,
        triVerts,
      };
    } finally {
      if (finalSolid !== outputSolid) finalSolid?.delete();
      roundTripToleranceSolid?.delete();
      roundTripSolid?.delete();
      outputSolid?.delete();
      toleranceSolid?.delete();
      floatPrecisionSolid?.delete();
    }
  } finally {
    dispose(components);
  }
}

export function buildConnectorBracket(
  wasm: ManifoldToplevel,
  normalized: NormalizedStructuralDesign,
  optimized: TrussOptimizationResult,
  cell: CandidateConnectorCell,
  sideIndex: 0 | 1,
  hubRadii: Map<string, number>,
): StructuralSolidMesh {
  const candidate = optimized.optimizedCandidate;
  const panelId = cell.panelIds[sideIndex];
  const panel = normalized.panels.find(({ id }) => id === panelId)!;
  const anchorIds = cell.panelAnchorIds[sideIndex];
  const nodes = cell.sideNodeIds[sideIndex]
    .map((id) => candidate.nodes.find((node) => node.id === id)!);
  const nodeById = new Map(candidate.nodes.map((node) => [node.id, node]));
  const memberById = new Map(candidate.members.map((member) => [member.id, member]));
  const positives: Manifold[] = [];
  const cutters: Manifold[] = [];
  const screwHoleCentersMm: StructuralSolidProbe[] = [];
  const anchorCentersMm: StructuralSolidProbe[] = [];
  const socketCentersMm: StructuralSolidProbe[] = [];
  try {
  for (const node of nodes) {
    const hubRadius = hubRadii.get(node.id)!;
    positives.push(translatedSphere(wasm, node.positionMm, hubRadius));
    if (node.anchorId === undefined || !anchorIds.includes(node.anchorId)) continue;
    const bracket = candidate.brackets.find((item) => item.hubNodeId === node.id)!;
    const anchor = normalized.anchors.find(({ id }) => id === bracket.anchorId)!;
    const inward = normalize(subtract(bracket.hubPositionMm, bracket.anchorPositionMm));
    const pilotAnchorPosition = correctedPilotPosition(
      panel,
      bracket.anchorPositionMm,
      anchor.holeEdgeCorrectionMm,
    );
    const mountPosition = add(
      pilotAnchorPosition,
      scale(inward, panel.dimensionsMm.thickness / 2 + anchor.surfaceFlushCorrectionMm),
    );
    const pilotHubPosition = add(pilotAnchorPosition, scale(inward, bracket.lengthMm));
    const bossRadius = Math.max(
      normalized.design.fabrication.minimumMemberDiameterMm / 2,
      anchor.screwLeadInDiameterMm / 2 + STRUCTURAL_GEOMETRY_POLICY.minimumWallMm,
    );
    positives.push(cylinderAlong(
      wasm,
      mountPosition,
      add(pilotHubPosition, scale(inward, hubRadius * 0.25)),
      bossRadius,
      bossRadius,
    ));
    const screwStart = add(mountPosition, scale(inward, -EPSILON_MM));
    const screwEnd = add(pilotHubPosition, scale(inward, hubRadius + EPSILON_MM));
    cutters.push(cylinderAlong(
      wasm,
      screwStart,
      screwEnd,
      anchor.printedPilotDiameterMm / 2,
    ));
    cutters.push(cylinderAlong(
      wasm,
      screwStart,
      add(screwStart, scale(inward, anchor.screwLeadInDepthMm + EPSILON_MM)),
      anchor.screwLeadInDiameterMm / 2,
      anchor.printedPilotDiameterMm / 2,
    ));
    anchorCentersMm.push(probe(bracket.anchorPositionMm));
    screwHoleCentersMm.push(probe(scale(add(mountPosition, screwEnd), 0.5)));
  }
  for (const memberId of cell.bracketTieMemberIds[sideIndex]) {
    const member = memberById.get(memberId);
    if (!member) throw new Error(`Panel ${panelId} is missing required local tie ${memberId}.`);
    const start = nodeById.get(member.startNodeId)!;
    const end = nodeById.get(member.endNodeId)!;
    positives.push(cylinderAlong(
      wasm,
      start.positionMm,
      end.positionMm,
      member.initialDiameterMm / 2,
      member.initialDiameterMm / 2,
    ));
  }
  for (const member of candidate.members.filter(({ id }) => cell.memberIds.includes(id))) {
    const isStart = cell.sideNodeIds[sideIndex].includes(member.startNodeId);
    const isEnd = cell.sideNodeIds[sideIndex].includes(member.endNodeId);
    if (!isStart && !isEnd) continue;
    const node = nodeById.get(isStart ? member.startNodeId : member.endNodeId)!;
    const other = nodeById.get(isStart ? member.endNodeId : member.startNodeId)!;
    const direction = normalize(subtract(other.positionMm, node.positionMm));
    const hubRadius = hubRadii.get(node.id)!;
    const boreRadius = member.initialDiameterMm / 2 +
      STRUCTURAL_GEOMETRY_POLICY.socketRadialClearanceMm;
    const bossRadius = boreRadius + STRUCTURAL_GEOMETRY_POLICY.minimumWallMm;
    positives.push(cylinderAlong(
      wasm,
      node.positionMm,
      add(node.positionMm, scale(direction, hubRadius + STRUCTURAL_GEOMETRY_POLICY.socketBossExtensionMm)),
      bossRadius,
      bossRadius,
    ));
    const socketStart = add(
      node.positionMm,
      scale(direction, hubRadius - STRUCTURAL_GEOMETRY_POLICY.socketDepthMm),
    );
    const socketEnd = add(
      node.positionMm,
      scale(direction, hubRadius + STRUCTURAL_GEOMETRY_POLICY.socketBossExtensionMm + EPSILON_MM),
    );
    cutters.push(cylinderAlong(wasm, socketStart, socketEnd, boreRadius));
    socketCentersMm.push(probe(add(node.positionMm, scale(direction, hubRadius))));
  }
  const firstTie = memberById.get([...cell.bracketTieMemberIds[sideIndex]].sort()[0]!)!;
  const firstTieStart = nodeById.get(firstTie.startNodeId)!;
  const firstTieEnd = nodeById.get(firstTie.endNodeId)!;
  const markBase = scale(add(firstTieStart.positionMm, firstTieEnd.positionMm), 0.5);
  const markAxis = scale(panel.outwardNormal, -1);
  const markStart = add(markBase, scale(markAxis, -0.3));
  const markEnd = add(markStart, scale(markAxis, STRUCTURAL_GEOMETRY_POLICY.orientationMarkHeightMm));
  positives.push(cylinderAlong(wasm, markStart, markEnd, 1.5, 0, 3));
  const positive = unionAll(wasm, positives);
  const solid = subtractCutters(wasm, positive, cutters);
  try {
    const partId = `connector-bracket:${cell.panelIds.join("--")}:side:${panelId}`;
    assertAvoidsPanelEnvelopes(wasm, solid, normalized, partId);
    return meshFromSolid(wasm, solid, {
      partId,
      kind: "connector-bracket",
      panelId,
      panelIds: [...cell.panelIds],
      connectorCellId: cell.id,
      anchorIds: [...anchorIds],
      anchorCentersMm,
      printedPilotDiameterMm: normalized.anchors[0]?.printedPilotDiameterMm,
      holeEdgeCorrectionMm: normalized.anchors[0]?.holeEdgeCorrectionMm,
      surfaceFlushCorrectionMm: normalized.anchors[0]?.surfaceFlushCorrectionMm,
      screwHoleCentersMm,
      nutTrapCentersMm: [],
      cableClearanceCentersMm: [],
      socketCentersMm,
      orientationMarkCenterMm: probe(add(markStart, scale(markAxis, STRUCTURAL_GEOMETRY_POLICY.orientationMarkHeightMm / 2))),
    });
  } finally {
    solid.delete();
  }
  } catch (error) {
    dispose(positives);
    dispose(cutters);
    throw error;
  }
}

function buildStrut(
  wasm: ManifoldToplevel,
  normalized: NormalizedStructuralDesign,
  optimized: TrussOptimizationResult,
  member: CandidateTrussMember,
  hubRadii: Map<string, number>,
): StructuralSolidMesh {
  const nodeById = new Map(optimized.optimizedCandidate.nodes.map((node) => [node.id, node]));
  const startNode = nodeById.get(member.startNodeId)!;
  const endNode = nodeById.get(member.endNodeId)!;
  const cell = optimized.optimizedCandidate.connectorCells.find(
    ({ id }) => id === member.connectorCellId,
  )!;
  const direction = normalize(subtract(endNode.positionMm, startNode.positionMm));
  const startHubRadius = hubRadii.get(startNode.id)!;
  const endHubRadius = hubRadii.get(endNode.id)!;
  const bodyStart = add(startNode.positionMm, scale(
    direction,
    startHubRadius + STRUCTURAL_GEOMETRY_POLICY.socketBossExtensionMm,
  ));
  const bodyEnd = add(endNode.positionMm, scale(
    direction,
    -endHubRadius - STRUCTURAL_GEOMETRY_POLICY.socketBossExtensionMm,
  ));
  const bodyLength = distance(bodyStart, bodyEnd);
  if (bodyLength <= 2) throw new Error(`Optimized member ${member.id} is too short for printable hub sockets.`);
  const tenonRadius = member.initialDiameterMm / 2 -
    STRUCTURAL_GEOMETRY_POLICY.tenonRadialReductionMm;
  if (tenonRadius <= 0) throw new Error(`Optimized member ${member.id} has no printable tenon radius.`);
  const startTenon = add(
    bodyStart,
    scale(
      direction,
      -STRUCTURAL_GEOMETRY_POLICY.socketDepthMm -
        STRUCTURAL_GEOMETRY_POLICY.socketBossExtensionMm + EPSILON_MM,
    ),
  );
  const endTenon = add(
    bodyEnd,
    scale(
      direction,
      STRUCTURAL_GEOMETRY_POLICY.socketDepthMm +
        STRUCTURAL_GEOMETRY_POLICY.socketBossExtensionMm - EPSILON_MM,
    ),
  );
  const middle = add(bodyStart, scale(direction, bodyLength / 2));
  const radius = member.initialDiameterMm / 2;
  const totalLength = distance(startTenon, endTenon);
  const bodyStartZ = distance(startTenon, bodyStart);
  const bodyEndZ = distance(startTenon, bodyEnd);
  const middleZ = distance(startTenon, middle);
  const localParts: Manifold[] = [];
  try {
    localParts.push(wasm.Manifold.cylinder(
      totalLength,
      tenonRadius,
      tenonRadius,
      CIRCULAR_SEGMENTS,
    ));
    localParts.push(translateOwned(wasm.Manifold.cylinder(
      middleZ - bodyStartZ + 0.1,
      radius,
      radius * 0.88,
      CIRCULAR_SEGMENTS,
    ), 0, 0, bodyStartZ));
    localParts.push(translateOwned(wasm.Manifold.cylinder(
      bodyEndZ - middleZ + 0.1,
      radius * 0.88,
      radius,
      CIRCULAR_SEGMENTS,
    ), 0, 0, middleZ - 0.1));
    localParts.push(translateOwned(
      wasm.Manifold.cylinder(1, radius + 0.65, radius + 0.65, 3),
      0,
      0,
      bodyStartZ,
    ));
    const localSolid = unionAll(wasm, localParts);
    let solid: Manifold;
    try {
      solid = localSolid.transform(basisMat4(startTenon, direction));
    } finally {
      localSolid.delete();
    }
    try {
      assertAvoidsPanelEnvelopes(wasm, solid, normalized, `strut:${member.id}`);
      return meshFromSolid(wasm, solid, {
      partId: `strut:${member.id}`,
      kind: "strut-segment",
      panelIds: [...cell.panelIds],
      connectorCellId: cell.id,
      memberId: member.id,
      segmentIndex: 1,
      segmentCount: 1,
      anchorIds: [],
      anchorCentersMm: [],
      screwHoleCentersMm: [],
      nutTrapCentersMm: [],
      cableClearanceCentersMm: [],
      socketCentersMm: [probe(bodyStart), probe(bodyEnd)],
      orientationMarkCenterMm: probe(add(bodyStart, scale(direction, 0.5))),
      });
    } finally {
      solid.delete();
    }
  } catch (error) {
    dispose(localParts);
    throw error;
  }
}

export function buildSegmentedStrut(
  wasm: ManifoldToplevel,
  normalized: NormalizedStructuralDesign,
  optimized: TrussOptimizationResult,
  member: CandidateTrussMember,
  hubRadii: Map<string, number>,
): StructuralSolidMesh[] {
  const candidate = optimized.optimizedCandidate;
  const nodeById = new Map(candidate.nodes.map((node) => [node.id, node]));
  const startNode = nodeById.get(member.startNodeId)!;
  const endNode = nodeById.get(member.endNodeId)!;
  const direction = normalize(subtract(endNode.positionMm, startNode.positionMm));
  const startHubRadius = hubRadii.get(startNode.id)!;
  const endHubRadius = hubRadii.get(endNode.id)!;
  const bodyStart = add(startNode.positionMm, scale(
    direction,
    startHubRadius + STRUCTURAL_GEOMETRY_POLICY.socketBossExtensionMm,
  ));
  const bodyEnd = add(endNode.positionMm, scale(
    direction,
    -endHubRadius - STRUCTURAL_GEOMETRY_POLICY.socketBossExtensionMm,
  ));
  const startTenon = add(
    bodyStart,
    scale(direction, -STRUCTURAL_GEOMETRY_POLICY.socketDepthMm -
      STRUCTURAL_GEOMETRY_POLICY.socketBossExtensionMm + EPSILON_MM),
  );
  const endTenon = add(
    bodyEnd,
    scale(direction, STRUCTURAL_GEOMETRY_POLICY.socketDepthMm +
      STRUCTURAL_GEOMETRY_POLICY.socketBossExtensionMm - EPSILON_MM),
  );
  const totalLengthMm = distance(startTenon, endTenon);
  const maximumSegmentLengthMm = normalized.connectorization.maximumStrutSegmentLengthMm;
  if (totalLengthMm <= maximumSegmentLengthMm + 1e-9) {
    return [buildStrut(wasm, normalized, optimized, member, hubRadii)];
  }
  const cell = candidate.connectorCells.find(({ id }) => id === member.connectorCellId)!;
  const segmentCount = Math.ceil(totalLengthMm / maximumSegmentLengthMm);
  if (!Number.isSafeInteger(segmentCount) || segmentCount > MAXIMUM_STRUT_SEGMENTS) {
    throw new Error(
      `Structural member ${member.id} requires ${segmentCount} segments; the safe limit is ` +
      `${MAXIMUM_STRUT_SEGMENTS}. Increase maximumStrutSegmentLengthMm or shorten the connector.`,
    );
  }
  const segmentLengthMm = totalLengthMm / segmentCount;
  const radiusMm = member.initialDiameterMm / 2;
  const parts: StructuralSolidMesh[] = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const segmentStart = add(startTenon, scale(direction, segmentLengthMm * index));
    const segmentEnd = index === segmentCount - 1
      ? endTenon
      : add(startTenon, scale(direction, segmentLengthMm * (index + 1)));
    const solids: Manifold[] = [cylinderAlong(
      wasm,
      segmentStart,
      segmentEnd,
      radiusMm,
      radiusMm,
    )];
    if (index === 0) {
      solids.push(cylinderAlong(
        wasm,
        add(segmentStart, scale(direction, 0.3)),
        add(segmentStart, scale(direction, 1.3)),
        radiusMm + 0.65,
        radiusMm + 0.65,
        3,
      ));
    }
    const solid = unionAll(wasm, solids);
    const partId = `strut:${member.id}:segment:${String(index + 1).padStart(2, "0")}-of-${String(segmentCount).padStart(2, "0")}`;
    try {
      assertAvoidsPanelEnvelopes(wasm, solid, normalized, partId);
      parts.push(meshFromSolid(wasm, solid, {
        partId,
        kind: "strut-segment",
        panelIds: [...cell.panelIds],
        connectorCellId: cell.id,
        memberId: member.id,
        segmentIndex: index + 1,
        segmentCount,
        anchorIds: [],
        anchorCentersMm: [],
        screwHoleCentersMm: [],
        nutTrapCentersMm: [],
        cableClearanceCentersMm: [],
        socketCentersMm: [probe(segmentStart), probe(segmentEnd)],
        ...(index === 0
          ? { orientationMarkCenterMm: probe(add(segmentStart, scale(direction, 0.8))) }
          : {}),
      }));
    } finally {
      solid.delete();
    }
  }
  const sleeveDepthMm = Math.max(6, 1.5 * member.initialDiameterMm);
  for (let index = 1; index < segmentCount; index += 1) {
    const joint = add(startTenon, scale(direction, segmentLengthMm * index));
    const sleeveStart = add(joint, scale(direction, -sleeveDepthMm));
    const sleeveEnd = add(joint, scale(direction, sleeveDepthMm));
    const outer = cylinderAlong(
      wasm,
      sleeveStart,
      sleeveEnd,
      radiusMm + STRUCTURAL_GEOMETRY_POLICY.socketRadialClearanceMm +
        STRUCTURAL_GEOMETRY_POLICY.minimumWallMm,
    );
    const bore = cylinderAlong(
      wasm,
      add(sleeveStart, scale(direction, -EPSILON_MM)),
      add(sleeveEnd, scale(direction, EPSILON_MM)),
      radiusMm + STRUCTURAL_GEOMETRY_POLICY.socketRadialClearanceMm,
    );
    const sleeve = outer.subtract(bore);
    outer.delete();
    bore.delete();
    const partId = `sleeve:${member.id}:joint:${String(index).padStart(2, "0")}`;
    try {
      assertAvoidsPanelEnvelopes(wasm, sleeve, normalized, partId);
      parts.push(meshFromSolid(wasm, sleeve, {
        partId,
        kind: "splice-sleeve",
        panelIds: [...cell.panelIds],
        connectorCellId: cell.id,
        memberId: member.id,
        segmentIndex: index,
        segmentCount: segmentCount - 1,
        anchorIds: [],
        anchorCentersMm: [],
        screwHoleCentersMm: [],
        nutTrapCentersMm: [],
        cableClearanceCentersMm: [],
        socketCentersMm: [probe(joint)],
        orientationMarkCenterMm: probe(joint),
      }));
    } finally {
      sleeve.delete();
    }
  }
  return parts;
}

type PanelSurfaceEdgeId = "top" | "right" | "bottom" | "left";

interface PanelSurfaceEdge {
  id: PanelSurfaceEdgeId;
  panelId: string;
  panel: NormalizedStructuralDesign["panels"][number];
  startTopMm: StructuralVector;
  endTopMm: StructuralVector;
  midpointTopMm: StructuralVector;
  tangent: StructuralVector;
  outward: StructuralVector;
  lengthMm: number;
}

function panelLocalPoint(
  panel: NormalizedStructuralDesign["panels"][number],
  xMm: number,
  yMm: number,
  normalOffsetMm: number,
): StructuralVector {
  return add(
    add(panel.centerMm, scale(panel.xAxis, xMm)),
    add(scale(panel.yAxis, yMm), scale(panel.outwardNormal, normalOffsetMm)),
  );
}

function panelSurfaceEdges(
  panel: NormalizedStructuralDesign["panels"][number],
): PanelSurfaceEdge[] {
  const halfWidth = panel.dimensionsMm.width / 2;
  const halfHeight = panel.dimensionsMm.height / 2;
  const z = panel.emitterPlaneOffsetMm;
  const definitions: Array<{
    id: PanelSurfaceEdgeId;
    start: [number, number];
    end: [number, number];
    outward: StructuralVector;
  }> = [
    { id: "top", start: [-halfWidth, halfHeight], end: [halfWidth, halfHeight], outward: panel.yAxis },
    { id: "right", start: [halfWidth, halfHeight], end: [halfWidth, -halfHeight], outward: panel.xAxis },
    { id: "bottom", start: [halfWidth, -halfHeight], end: [-halfWidth, -halfHeight], outward: scale(panel.yAxis, -1) },
    { id: "left", start: [-halfWidth, -halfHeight], end: [-halfWidth, halfHeight], outward: scale(panel.xAxis, -1) },
  ];
  return definitions.map((definition) => {
    const startTopMm = panelLocalPoint(panel, definition.start[0], definition.start[1], z);
    const endTopMm = panelLocalPoint(panel, definition.end[0], definition.end[1], z);
    const tangent = normalize(subtract(endTopMm, startTopMm));
    return {
      id: definition.id,
      panelId: panel.id,
      panel,
      startTopMm,
      endTopMm,
      midpointTopMm: scale(add(startTopMm, endTopMm), 0.5),
      tangent,
      outward: definition.outward,
      lengthMm: distance(startTopMm, endTopMm),
    };
  });
}

function shiftedEdgePoint(
  edge: PanelSurfaceEdge,
  amount: number,
  outwardOffsetMm: number,
): StructuralVector {
  return add(
    add(edge.startTopMm, scale(subtract(edge.endTopMm, edge.startTopMm), amount)),
    scale(edge.outward, outwardOffsetMm),
  );
}

function selectSurfaceEdgePair(
  firstPanel: NormalizedStructuralDesign["panels"][number],
  secondPanel: NormalizedStructuralDesign["panels"][number],
): [PanelSurfaceEdge, PanelSurfaceEdge] {
  const ridgeOffset = STRUCTURAL_GEOMETRY_POLICY.surfaceRidgeWidthMm;
  const candidates = panelSurfaceEdges(firstPanel).flatMap((first) =>
    panelSurfaceEdges(secondPanel).map((second) => {
      const firstStart = shiftedEdgePoint(first, 0, ridgeOffset);
      const firstEnd = shiftedEdgePoint(first, 1, ridgeOffset);
      // Reverse the second oriented edge. This keeps the ruled sheet orientable
      // and makes its endpoint normal agree with the second panel normal.
      const secondStart = shiftedEdgePoint(second, 1, ridgeOffset);
      const secondEnd = shiftedEdgePoint(second, 0, ridgeOffset);
      const delta = subtract(second.midpointTopMm, first.midpointTopMm);
      const deltaLength = Math.max(distance(second.midpointTopMm, first.midpointTopMm), 1e-9);
      const direction = scale(delta, 1 / deltaLength);
      const facingPenalty = 40 * (
        Math.max(0, -dot(direction, first.outward)) +
        Math.max(0, dot(direction, second.outward))
      );
      return {
        first,
        second,
        score: (
          distance(firstStart, secondStart) +
          distance(firstEnd, secondEnd) +
          distance(first.midpointTopMm, second.midpointTopMm)
        ) / 3 + facingPenalty,
      };
    })
  );
  candidates.sort((left, right) =>
    left.score - right.score || compareText(left.first.id, right.first.id) ||
      compareText(left.second.id, right.second.id)
  );
  const selected = candidates[0];
  if (!selected) throw new Error("A surface bridge requires two panel edges.");
  return [selected.first, selected.second];
}

export function selectStructuralSurfaceEdgeIds(
  normalized: NormalizedStructuralDesign,
  panelIds: [string, string],
): [PanelSurfaceEdgeId, PanelSurfaceEdgeId] {
  const panels = panelIds.map((panelId) => {
    const panel = normalized.panels.find(({ id }) => id === panelId);
    if (!panel) throw new Error(`Unknown structural surface panel ${panelId}.`);
    return panel;
  }) as [NormalizedStructuralDesign["panels"][number], NormalizedStructuralDesign["panels"][number]];
  return selectSurfaceEdgePair(panels[0], panels[1]).map(({ id }) => id) as [
    PanelSurfaceEdgeId,
    PanelSurfaceEdgeId,
  ];
}

function closedSurfaceGrid(
  wasm: ManifoldToplevel,
  topRows: StructuralVector[][],
  backRows: StructuralVector[][],
  outwardHint: StructuralVector,
): Manifold {
  if (topRows.length < 2 || topRows.some((row) => row.length < 2)) {
    throw new Error("A structural surface grid requires at least two rows and two columns.");
  }
  const columns = topRows[0]!.length;
  if (
    topRows.some((row) => row.length !== columns) ||
    backRows.length !== topRows.length ||
    backRows.some((row) => row.length !== columns)
  ) {
    throw new Error("A structural surface grid must be rectangular.");
  }
  const rows = topRows.length;
  const vertices = [...topRows.flat(), ...backRows.flat()];
  const topIndex = (row: number, column: number): number => row * columns + column;
  const backIndex = (row: number, column: number): number =>
    rows * columns + row * columns + column;
  const firstDu = subtract(topRows[0]![1]!, topRows[0]![0]!);
  const firstDv = subtract(topRows[1]![0]!, topRows[0]![0]!);
  const reverseTop = dot(cross(firstDu, firstDv), outwardHint) < 0;
  const triangles: number[] = [];
  const triangle = (a: number, b: number, c: number, reverse = false): void => {
    triangles.push(a, ...(reverse ? [c, b] : [b, c]));
  };
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = topIndex(row, column);
      const b = topIndex(row, column + 1);
      const c = topIndex(row + 1, column + 1);
      const d = topIndex(row + 1, column);
      triangle(a, b, c, reverseTop);
      triangle(a, c, d, reverseTop);
      const aa = backIndex(row, column);
      const bb = backIndex(row, column + 1);
      const cc = backIndex(row + 1, column + 1);
      const dd = backIndex(row + 1, column);
      triangle(aa, cc, bb, reverseTop);
      triangle(aa, dd, cc, reverseTop);
    }
  }
  const boundary: Array<[number, number]> = [];
  for (let column = 0; column < columns - 1; column += 1) {
    boundary.push([topIndex(0, column), topIndex(0, column + 1)]);
  }
  for (let row = 0; row < rows - 1; row += 1) {
    boundary.push([topIndex(row, columns - 1), topIndex(row + 1, columns - 1)]);
  }
  for (let column = columns - 1; column > 0; column -= 1) {
    boundary.push([topIndex(rows - 1, column), topIndex(rows - 1, column - 1)]);
  }
  for (let row = rows - 1; row > 0; row -= 1) {
    boundary.push([topIndex(row, 0), topIndex(row - 1, 0)]);
  }
  if (reverseTop) boundary.reverse().forEach((edge) => edge.reverse());
  for (const [topA, topB] of boundary) {
    const backA = topA + rows * columns;
    const backB = topB + rows * columns;
    triangle(topA, backA, backB);
    triangle(topA, backB, topB);
  }
  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: Float32Array.from(vertices.flat()),
    triVerts: Uint32Array.from(triangles),
  });
  return new wasm.Manifold(mesh);
}

function buildSurfaceSheet(
  wasm: ManifoldToplevel,
  first: PanelSurfaceEdge,
  second: PanelSurfaceEdge,
): {
  solid: Manifold;
  ridgeTopCentersMm: Array<StructuralSolidProbe & { panelId: string }>;
  stationCentersMm: StructuralSolidProbe[];
} {
  const policy = STRUCTURAL_GEOMETRY_POLICY;
  const firstOuter = Array.from({ length: policy.surfaceBridgeEdgeSamples }, (_, index) =>
    shiftedEdgePoint(first, index / (policy.surfaceBridgeEdgeSamples - 1), policy.surfaceRidgeWidthMm)
  );
  const secondOuter = Array.from({ length: policy.surfaceBridgeEdgeSamples }, (_, index) =>
    shiftedEdgePoint(second, 1 - index / (policy.surfaceBridgeEdgeSamples - 1), policy.surfaceRidgeWidthMm)
  );
  const firstInner = Array.from({ length: policy.surfaceBridgeEdgeSamples }, (_, index) =>
    shiftedEdgePoint(first, index / (policy.surfaceBridgeEdgeSamples - 1), policy.surfacePanelClearanceMm)
  );
  const secondInner = Array.from({ length: policy.surfaceBridgeEdgeSamples }, (_, index) =>
    shiftedEdgePoint(second, 1 - index / (policy.surfaceBridgeEdgeSamples - 1), policy.surfacePanelClearanceMm)
  );
  const meanGap = firstOuter.reduce((sum, point, index) =>
    sum + distance(point, secondOuter[index]!), 0) / firstOuter.length;
  const controlLength = Math.min(35, Math.max(0.5, meanGap / 3), meanGap * 0.45);
  const topRows: StructuralVector[][] = [firstInner, firstOuter];
  const backRows: StructuralVector[][] = [
    firstInner.map((point) =>
      add(point, scale(first.panel.outwardNormal, -policy.surfaceBridgeThicknessMm))
    ),
    firstOuter.map((point) => add(point, scale(first.panel.outwardNormal, -policy.surfaceBridgeThicknessMm))),
  ];
  const stationCentersMm: StructuralSolidProbe[] = [];
  const normalSum = add(first.panel.outwardNormal, second.panel.outwardNormal);
  const crownAxis = Math.hypot(...normalSum) > 1e-6
    ? normalize(normalSum)
    : first.panel.outwardNormal;
  const addOrganicCrown = (
    point: StructuralVector,
    column: number,
    amount: number,
  ): StructuralVector => add(point, scale(
    crownAxis,
    policy.surfaceOrganicCrownMm * Math.sin(Math.PI * amount) *
      Math.sin(Math.PI * column / (policy.surfaceBridgeEdgeSamples - 1)),
  ));
  const keepInsideEdgeGap = (
    point: StructuralVector,
    column: number,
  ): StructuralVector => {
    let result = point;
    const firstOutline = shiftedEdgePoint(
      first,
      column / (policy.surfaceBridgeEdgeSamples - 1),
      0,
    );
    const secondOutline = shiftedEdgePoint(
      second,
      1 - column / (policy.surfaceBridgeEdgeSamples - 1),
      0,
    );
    for (let iteration = 0; iteration < 3; iteration += 1) {
      for (const [edge, outline] of [
        [first, firstOutline],
        [second, secondOutline],
      ] as const) {
        const clearance = dot(subtract(result, outline), edge.outward);
        if (clearance < policy.surfacePanelClearanceMm) {
          result = add(
            result,
            scale(edge.outward, policy.surfacePanelClearanceMm - clearance),
          );
        }
      }
    }
    return result;
  };
  for (let station = 1; station < policy.surfaceBridgeStationCount; station += 1) {
    const amount = station / (policy.surfaceBridgeStationCount - 1);
    const topRow = firstOuter.map((point, index) => addOrganicCrown(keepInsideEdgeGap(cubicBezier(
      point,
      add(point, scale(first.outward, controlLength)),
      add(secondOuter[index]!, scale(second.outward, controlLength)),
      secondOuter[index]!,
      amount,
    ), index), index, amount));
    const backRow = firstOuter.map((point, index) => {
      const firstBack = add(point, scale(first.panel.outwardNormal, -policy.surfaceBridgeThicknessMm));
      const secondBack = add(
        secondOuter[index]!,
        scale(second.panel.outwardNormal, -policy.surfaceBridgeThicknessMm),
      );
      return addOrganicCrown(keepInsideEdgeGap(cubicBezier(
        firstBack,
        add(firstBack, scale(first.outward, controlLength)),
        add(secondBack, scale(second.outward, controlLength)),
        secondBack,
        amount,
      ), index), index, amount);
    });
    topRows.push(topRow);
    backRows.push(backRow);
    stationCentersMm.push(probe(scale(add(topRow[0]!, topRow.at(-1)!), 0.5)));
  }
  topRows.push(secondInner);
  backRows.push(secondInner.map((point) =>
    add(point, scale(second.panel.outwardNormal, -policy.surfaceBridgeThicknessMm))
  ));
  return {
    solid: closedSurfaceGrid(wasm, topRows, backRows, first.panel.outwardNormal),
    ridgeTopCentersMm: [
      { ...probe(shiftedEdgePoint(first, 0.5, policy.surfaceRidgeWidthMm / 2)), panelId: first.panelId },
      { ...probe(shiftedEdgePoint(second, 0.5, policy.surfaceRidgeWidthMm / 2)), panelId: second.panelId },
    ],
    stationCentersMm,
  };
}

interface LoftSide {
  frontMm: StructuralVector[];
  backMm: StructuralVector[];
}

function loftPoint(
  firstFront: StructuralVector,
  firstBack: StructuralVector,
  secondFront: StructuralVector,
  secondBack: StructuralVector,
  amount: number,
  useBack: boolean,
): StructuralVector {
  const first = useBack ? firstBack : firstFront;
  const second = useBack ? secondBack : secondFront;
  const firstInward = normalize(subtract(firstBack, firstFront));
  const secondInward = normalize(subtract(secondBack, secondFront));
  const controlOffsetMm = STRUCTURAL_GEOMETRY_POLICY.loftRearDepartureMm;
  return cubicBezier(
    first,
    add(first, scale(firstInward, controlOffsetMm)),
    add(second, scale(secondInward, controlOffsetMm)),
    second,
    amount,
  );
}

function matchLoftSides(first: LoftSide, second: LoftSide): LoftSide {
  const available = second.frontMm.map((_, index) => index);
  const frontMm: StructuralVector[] = [];
  const backMm: StructuralVector[] = [];
  for (const firstPoint of first.frontMm) {
    available.sort((left, right) =>
      distance(firstPoint, second.frontMm[left]!) -
        distance(firstPoint, second.frontMm[right]!) || left - right
    );
    const selected = available.shift();
    if (selected === undefined) throw new Error("Loft side anchor count does not match.");
    frontMm.push(second.frontMm[selected]!);
    backMm.push(second.backMm[selected]!);
  }
  return { frontMm, backMm };
}

function buildLoftSection(
  wasm: ManifoldToplevel,
  first: LoftSide,
  second: LoftSide,
  amount: number,
): Manifold {
  const pads: Manifold[] = [];
  try {
    for (let index = 0; index < first.frontMm.length; index += 1) {
      pads.push(cylinderAlong(
        wasm,
        loftPoint(
          first.frontMm[index]!,
          first.backMm[index]!,
          second.frontMm[index]!,
          second.backMm[index]!,
          amount,
          false,
        ),
        loftPoint(
          first.frontMm[index]!,
          first.backMm[index]!,
          second.frontMm[index]!,
          second.backMm[index]!,
          amount,
          true,
        ),
        STRUCTURAL_GEOMETRY_POLICY.capScrewTabWidthMm / 2,
      ));
    }
    return hullAll(wasm, pads);
  } catch (error) {
    dispose(pads);
    throw error;
  }
}

function buildLoftBridge(
  wasm: ManifoldToplevel,
  first: LoftSide,
  unmatchedSecond: LoftSide,
): { segments: Manifold[]; stationCentersMm: StructuralSolidProbe[] } {
  if (first.frontMm.length !== unmatchedSecond.frontMm.length || first.frontMm.length < 2) {
    throw new Error("A structural loft needs the same two or more screw shoes on each panel side.");
  }
  const second = matchLoftSides(first, unmatchedSecond);
  const segments: Manifold[] = [];
  const stationCentersMm: StructuralSolidProbe[] = [];
  for (let index = 0; index < STRUCTURAL_GEOMETRY_POLICY.loftStationCount; index += 1) {
    const amount = index / (STRUCTURAL_GEOMETRY_POLICY.loftStationCount - 1);
    const points = first.frontMm.flatMap((front, anchorIndex) => [
      loftPoint(
        front,
        first.backMm[anchorIndex]!,
        second.frontMm[anchorIndex]!,
        second.backMm[anchorIndex]!,
        amount,
        false,
      ),
      loftPoint(
        front,
        first.backMm[anchorIndex]!,
        second.frontMm[anchorIndex]!,
        second.backMm[anchorIndex]!,
        amount,
        true,
      ),
    ]);
    const center = scale(points.reduce((sum, point) => add(sum, point), [0, 0, 0]),
      1 / points.length);
    stationCentersMm.push(probe(center));
  }
  try {
    for (let index = 0; index < STRUCTURAL_GEOMETRY_POLICY.loftStationCount - 1; index += 1) {
      const startAmount = index / (STRUCTURAL_GEOMETRY_POLICY.loftStationCount - 1);
      const endAmount = (index + 1) / (STRUCTURAL_GEOMETRY_POLICY.loftStationCount - 1);
      const sections: Manifold[] = [];
      try {
        sections.push(buildLoftSection(wasm, first, second, startAmount));
        sections.push(buildLoftSection(wasm, first, second, endAmount));
        segments.push(hullAll(wasm, sections));
      } catch (error) {
        dispose(sections);
        throw error;
      }
    }
    return { segments, stationCentersMm };
  } catch (error) {
    dispose(segments);
    throw error;
  }
}

function buildOrganicConnector(
  wasm: ManifoldToplevel,
  normalized: NormalizedStructuralDesign,
  candidate: import("../structure/CandidateTruss.ts").CandidateTruss,
  cell: CandidateConnectorCell,
): StructuralSolidMesh {
  const positives: Manifold[] = [];
  const cutters: Manifold[] = [];
  const labelCutters: Manifold[] = [];
  const loftSides: LoftSide[] = [];
  const anchorCentersMm: StructuralSolidProbe[] = [];
  const screwHoleCentersMm: StructuralSolidProbe[] = [];
  const labelCentersMm: Array<StructuralSolidProbe & { panelId: string }> = [];
  let orientationMarkCenterMm: StructuralSolidProbe | undefined;
  try {
    for (const sideIndex of [0, 1] as const) {
      const panelId = cell.panelIds[sideIndex];
      const panel = normalized.panels.find(({ id }) => id === panelId)!;
      const anchorIds = cell.panelAnchorIds[sideIndex];
      const frontMm: StructuralVector[] = [];
      const backMm: StructuralVector[] = [];
      const mountPositions: StructuralVector[] = [];
      for (const anchorId of anchorIds) {
        const bracket = candidate.brackets.find(({ anchorId: id }) => id === anchorId)!;
        const anchor = normalized.anchors.find(({ id }) => id === anchorId)!;
        const inward = normalize(subtract(bracket.hubPositionMm, bracket.anchorPositionMm));
        const pilotAnchorPosition = correctedPilotPosition(
          panel,
          bracket.anchorPositionMm,
          anchor.holeEdgeCorrectionMm,
        );
        const mountPosition = add(
          pilotAnchorPosition,
          scale(inward, panel.dimensionsMm.thickness / 2 + anchor.surfaceFlushCorrectionMm),
        );
        const shoeBack = add(
          mountPosition,
          scale(inward, STRUCTURAL_GEOMETRY_POLICY.capShoeThicknessMm),
        );
        mountPositions.push(mountPosition);
        frontMm.push(mountPosition);
        backMm.push(shoeBack);
        const screwStart = add(
          mountPosition,
          scale(inward, -STRUCTURAL_GEOMETRY_POLICY.capScrewTabWidthMm),
        );
        const screwEnd = add(
          mountPosition,
          scale(inward, 2 * STRUCTURAL_GEOMETRY_POLICY.capScrewTabWidthMm),
        );
        cutters.push(cylinderAlong(
          wasm, screwStart, screwEnd, anchor.printedPilotDiameterMm / 2,
        ));
        const leadInStart = add(mountPosition, scale(inward, -EPSILON_MM));
        cutters.push(cylinderAlong(
          wasm,
          leadInStart,
          add(leadInStart, scale(inward, anchor.screwLeadInDepthMm + EPSILON_MM)),
          anchor.screwLeadInDiameterMm / 2,
          anchor.printedPilotDiameterMm / 2,
        ));
        anchorCentersMm.push(probe(bracket.anchorPositionMm));
        screwHoleCentersMm.push(probe(scale(add(mountPosition, screwEnd), 0.5)));
      }
      loftSides.push({ frontMm, backMm });
      const midpoint = scale(mountPositions.reduce((sum, point) => add(sum, point), [0, 0, 0]),
        1 / mountPositions.length);
      const inward = scale(panel.outwardNormal, -1);
      const label = panelIdRibbonLabelCutter(
        wasm,
        panelId,
        panel,
        mountPositions,
        inward,
      );
      if (label) {
        cutters.push(label.cutter);
        labelCutters.push(label.cutter);
        labelCentersMm.push(label.center);
      }
      if (sideIndex === 0) {
        const markStart = add(midpoint, scale(inward, STRUCTURAL_GEOMETRY_POLICY.capShoeThicknessMm));
        const markEnd = add(
          markStart,
          scale(inward, STRUCTURAL_GEOMETRY_POLICY.orientationMarkHeightMm),
        );
        positives.push(cylinderAlong(
          wasm,
          markStart,
          markEnd,
          1.5,
          0,
          3,
        ));
        orientationMarkCenterMm = probe(scale(add(markStart, markEnd), 0.5));
      }
    }
    const loft = buildLoftBridge(wasm, loftSides[0]!, loftSides[1]!);
    positives.push(...loft.segments);
    const positive = unionAll(wasm, positives);
    try {
      for (const labelCutter of labelCutters) {
        const engraving = positive.intersect(labelCutter);
        try {
          const engravingVolume = engraving.volume();
          if (engraving.isEmpty() || engravingVolume <= 1) {
            throw new Error(
              `Ribbon label does not intersect enough printable material for ${cell.id}: ` +
              `${engravingVolume} mm3.`,
            );
          }
        } finally {
          engraving.delete();
        }
      }
    } catch (error) {
      positive.delete();
      throw error;
    }
    const solid = subtractCutters(wasm, positive, cutters);
    const partId = `organic-connector:${cell.panelIds.join("--")}`;
    try {
      assertAvoidsPanelEnvelopes(wasm, solid, normalized, partId);
      return meshFromSolid(wasm, solid, {
        partId,
        kind: "organic-connector",
        surfaceStyle: "screw-shoe-ribbon",
        panelIds: [...cell.panelIds],
        connectorCellId: cell.id,
        anchorIds: cell.panelAnchorIds.flat(),
        anchorCentersMm,
        printedPilotDiameterMm: normalized.anchors[0]?.printedPilotDiameterMm,
        holeEdgeCorrectionMm: normalized.anchors[0]?.holeEdgeCorrectionMm,
        surfaceFlushCorrectionMm: normalized.anchors[0]?.surfaceFlushCorrectionMm,
        screwHoleCentersMm,
        nutTrapCentersMm: [],
        cableClearanceCentersMm: connectorClearanceProbes(
          normalized, cell.panelIds,
        ),
        socketCentersMm: [],
        orientationMarkCenterMm,
        loftStationCentersMm: loft.stationCentersMm,
        labelCentersMm,
        labelDepthMm: STRUCTURAL_GEOMETRY_POLICY.panelLabelDepthMm,
      });
    } finally {
      solid.delete();
    }
  } catch (error) {
    dispose(positives);
    dispose(cutters);
    throw error;
  }
}

function edgePointNearestAnchor(
  edge: PanelSurfaceEdge,
  anchorPositionMm: StructuralVector,
): StructuralVector {
  const halfUsableLength = Math.max(0, edge.lengthMm / 2 - 3.5);
  const along = Math.max(
    -halfUsableLength,
    Math.min(halfUsableLength, dot(subtract(anchorPositionMm, edge.midpointTopMm), edge.tangent)),
  );
  return add(edge.midpointTopMm, scale(edge.tangent, along));
}

function buildSurfaceBridgeConnector(
  wasm: ManifoldToplevel,
  normalized: NormalizedStructuralDesign,
  candidate: import("../structure/CandidateTruss.ts").CandidateTruss,
  cell: CandidateConnectorCell,
): StructuralSolidMesh {
  const positives: Manifold[] = [];
  const cutters: Manifold[] = [];
  const labelCutters: Manifold[] = [];
  const anchorCentersMm: StructuralSolidProbe[] = [];
  const screwHoleCentersMm: StructuralSolidProbe[] = [];
  const labelCentersMm: Array<StructuralSolidProbe & { panelId: string }> = [];
  let orientationMarkCenterMm: StructuralSolidProbe | undefined;
  const panels = cell.panelIds.map((panelId) =>
    normalized.panels.find(({ id }) => id === panelId)!
  ) as [NormalizedStructuralDesign["panels"][number], NormalizedStructuralDesign["panels"][number]];
  const edges = selectSurfaceEdgePair(panels[0], panels[1]);
  let sheet: ReturnType<typeof buildSurfaceSheet> | undefined;
  try {
    sheet = buildSurfaceSheet(wasm, edges[0], edges[1]);
    positives.push(sheet.solid);
    for (const sideIndex of [0, 1] as const) {
      const panel = panels[sideIndex];
      const edge = edges[sideIndex];
      const mountPositions: StructuralVector[] = [];
      const edgeApronFrames: Array<{
        rearTop: StructuralVector;
        rearBack: StructuralVector;
        frontTop: StructuralVector;
        frontBack: StructuralVector;
      }> = [];
      const inward = scale(panel.outwardNormal, -1);
      for (const anchorId of cell.panelAnchorIds[sideIndex]) {
        const bracket = candidate.brackets.find(({ anchorId: id }) => id === anchorId)!;
        const anchor = normalized.anchors.find(({ id }) => id === anchorId)!;
        const pilotAnchorPosition = correctedPilotPosition(
          panel,
          bracket.anchorPositionMm,
          anchor.holeEdgeCorrectionMm,
        );
        const mountPosition = add(
          pilotAnchorPosition,
          scale(inward, panel.dimensionsMm.thickness / 2 + anchor.surfaceFlushCorrectionMm),
        );
        const edgePoint = edgePointNearestAnchor(edge, pilotAnchorPosition);
        const wrapOffsetMm = 4;
        const frontWrapTop = add(
          add(edgePoint, scale(edge.outward, wrapOffsetMm)),
          scale(inward, EPSILON_MM),
        );
        const frontWrapBack = add(
          frontWrapTop,
          scale(inward, STRUCTURAL_GEOMETRY_POLICY.surfaceBridgeThicknessMm),
        );
        const rearWrapTop = add(
          frontWrapTop,
          scale(
            inward,
            panel.emitterPlaneOffsetMm + panel.dimensionsMm.thickness / 2 +
              anchor.surfaceFlushCorrectionMm,
          ),
        );
        const rearWrapBack = add(
          rearWrapTop,
          scale(inward, STRUCTURAL_GEOMETRY_POLICY.capShoeThicknessMm),
        );
        edgeApronFrames.push({
          rearTop: rearWrapTop,
          rearBack: rearWrapBack,
          frontTop: frontWrapTop,
          frontBack: frontWrapBack,
        });
        const screwStart = add(
          mountPosition,
          scale(inward, -STRUCTURAL_GEOMETRY_POLICY.capScrewTabWidthMm),
        );
        const screwEnd = add(
          mountPosition,
          scale(inward, 2 * STRUCTURAL_GEOMETRY_POLICY.capScrewTabWidthMm),
        );
        cutters.push(cylinderAlong(
          wasm, screwStart, screwEnd, anchor.printedPilotDiameterMm / 2,
        ));
        const leadInStart = add(mountPosition, scale(inward, -EPSILON_MM));
        cutters.push(cylinderAlong(
          wasm,
          leadInStart,
          add(leadInStart, scale(inward, anchor.screwLeadInDepthMm + EPSILON_MM)),
          anchor.screwLeadInDiameterMm / 2,
          anchor.printedPilotDiameterMm / 2,
        ));
        mountPositions.push(mountPosition);
        anchorCentersMm.push(probe(bracket.anchorPositionMm));
        screwHoleCentersMm.push(probe(scale(add(mountPosition, screwEnd), 0.5)));
      }
      const edgeApronPads = edgeApronFrames.flatMap((frame) => [
        cylinderAlong(wasm, frame.rearTop, frame.rearBack, 3),
        cylinderAlong(wasm, frame.frontTop, frame.frontBack, 3),
      ]);
      try {
        positives.push(hullAll(wasm, edgeApronPads));
      } catch (error) {
        dispose(edgeApronPads);
        throw error;
      }
      const rearDiaphragmPads = [
        ...mountPositions.map((mountPosition) => cylinderAlong(
          wasm,
          mountPosition,
          add(
            mountPosition,
            scale(inward, STRUCTURAL_GEOMETRY_POLICY.capShoeThicknessMm),
          ),
          STRUCTURAL_GEOMETRY_POLICY.capScrewTabWidthMm / 2,
        )),
        ...edgeApronFrames.map((frame) =>
          cylinderAlong(wasm, frame.rearTop, frame.rearBack, 3)
        ),
      ];
      try {
        positives.push(hullAll(wasm, rearDiaphragmPads));
      } catch (error) {
        dispose(rearDiaphragmPads);
        throw error;
      }
      const label = panelIdRibbonLabelCutter(wasm, panel.id, panel, mountPositions, inward);
      if (label) {
        cutters.push(label.cutter);
        labelCutters.push(label.cutter);
        labelCentersMm.push(label.center);
      }
    }
    const rawPositive = unionAll(wasm, positives);
    const positive = subtractPanelEnvelopeClearance(wasm, rawPositive, normalized, 0.15);
    try {
      for (const labelCutter of labelCutters) {
        const engraving = positive.intersect(labelCutter);
        try {
          if (engraving.isEmpty() || engraving.volume() <= 1) {
            throw new Error(`Surface-bridge label does not intersect enough material for ${cell.id}.`);
          }
        } finally {
          engraving.delete();
        }
      }
    } catch (error) {
      positive.delete();
      throw error;
    }
    const solid = subtractCutters(wasm, positive, cutters);
    const partId = `surface-bridge:${cell.panelIds.join("--")}`;
    try {
      assertAvoidsPanelEnvelopes(wasm, solid, normalized, partId);
      return meshFromSolid(wasm, solid, {
        partId,
        kind: "surface-bridge",
        surfaceStyle: "led-surface-bridge",
        panelIds: [...cell.panelIds],
        panelEdgeIds: edges.map((edge) => ({ panelId: edge.panelId, edgeId: edge.id })),
        ridgeTopCentersMm: sheet.ridgeTopCentersMm,
        surfaceThicknessMm: STRUCTURAL_GEOMETRY_POLICY.surfaceBridgeThicknessMm,
        connectorCellId: cell.id,
        anchorIds: cell.panelAnchorIds.flat(),
        anchorCentersMm,
        printedPilotDiameterMm: normalized.anchors[0]?.printedPilotDiameterMm,
        holeEdgeCorrectionMm: normalized.anchors[0]?.holeEdgeCorrectionMm,
        surfaceFlushCorrectionMm: normalized.anchors[0]?.surfaceFlushCorrectionMm,
        screwHoleCentersMm,
        nutTrapCentersMm: [],
        cableClearanceCentersMm: connectorClearanceProbes(
          normalized, cell.panelIds,
        ),
        socketCentersMm: [],
        orientationMarkCenterMm,
        loftStationCentersMm: sheet.stationCentersMm,
        labelCentersMm,
        labelDepthMm: STRUCTURAL_GEOMETRY_POLICY.panelLabelDepthMm,
      });
    } finally {
      solid.delete();
    }
  } catch (error) {
    dispose(positives);
    dispose(cutters);
    throw error;
  }
}

function uniqueProbes(probes: StructuralSolidProbe[]): StructuralSolidProbe[] {
  const found = new Map<string, StructuralSolidProbe>();
  for (const item of probes) {
    const key = [item.x, item.y, item.z].map((value) => value.toFixed(6)).join(":");
    if (!found.has(key)) found.set(key, item);
  }
  return [...found.values()];
}

function uniqueLabelProbes(
  probes: Array<StructuralSolidProbe & { panelId: string }>,
): Array<StructuralSolidProbe & { panelId: string }> {
  const found = new Map<string, StructuralSolidProbe & { panelId: string }>();
  for (const item of probes) {
    const key = `${item.panelId}:` + [item.x, item.y, item.z]
      .map((value) => value.toFixed(6)).join(":");
    if (!found.has(key)) found.set(key, item);
  }
  return [...found.values()];
}

function uniquePanelEdges(
  edges: Array<{ panelId: string; edgeId: PanelSurfaceEdgeId }>,
): Array<{ panelId: string; edgeId: PanelSurfaceEdgeId }> {
  const found = new Map<string, { panelId: string; edgeId: PanelSurfaceEdgeId }>();
  for (const edge of edges) found.set(`${edge.panelId}:${edge.edgeId}`, edge);
  return [...found.values()].sort((left, right) =>
    compareText(left.panelId, right.panelId) || compareText(left.edgeId, right.edgeId)
  );
}

function mergeRibbonJunction(
  wasm: ManifoldToplevel,
  normalized: NormalizedStructuralDesign,
  junctionId: string,
  meshes: StructuralSolidMesh[],
): StructuralSolidMesh {
  const solids = meshes.map((mesh) => new wasm.Manifold(new wasm.Mesh({
    numProp: 3,
    vertProperties: mesh.vertProperties,
    triVerts: mesh.triVerts,
  })));
  const unioned = unionAll(wasm, solids);
  let solid: Manifold;
  let toleranceSolid: Manifold | undefined;
  let simplifiedSolid: Manifold | undefined;
  try {
    toleranceSolid = unioned.setTolerance(
      STRUCTURAL_GEOMETRY_POLICY.meshSimplificationToleranceMm,
    );
    simplifiedSolid = toleranceSolid.simplify(
      STRUCTURAL_GEOMETRY_POLICY.meshSimplificationToleranceMm,
    );
    solid = wasm.Manifold.ofMesh(simplifiedSolid.getMesh());
  } finally {
    simplifiedSolid?.delete();
    toleranceSolid?.delete();
    unioned.delete();
  }
  const panelIds = [...new Set(meshes.flatMap(({ panelIds: ids }) => ids ?? []))]
    .sort(compareText);
  const surfaceStyle = meshes[0]?.surfaceStyle ?? "screw-shoe-ribbon";
  const isSurfaceBridge = surfaceStyle === "led-surface-bridge";
  const partId = `${isSurfaceBridge ? "surface-bridge-junction" : "ribbon-junction"}:${panelIds.join("--")}`;
  try {
    assertAvoidsPanelEnvelopes(wasm, solid, normalized, partId);
    return meshFromSolid(wasm, solid, {
      partId,
      kind: isSurfaceBridge ? "surface-bridge-junction" : "ribbon-junction",
      surfaceStyle,
      panelIds,
      connectorJunctionId: junctionId,
      anchorIds: [...new Set(meshes.flatMap(({ anchorIds }) => anchorIds))].sort(compareText),
      anchorCentersMm: uniqueProbes(meshes.flatMap(({ anchorCentersMm }) => anchorCentersMm)),
      printedPilotDiameterMm: meshes[0]?.printedPilotDiameterMm,
      holeEdgeCorrectionMm: meshes[0]?.holeEdgeCorrectionMm,
      surfaceFlushCorrectionMm: meshes[0]?.surfaceFlushCorrectionMm,
      screwHoleCentersMm: uniqueProbes(meshes.flatMap(({ screwHoleCentersMm }) => screwHoleCentersMm)),
      nutTrapCentersMm: uniqueProbes(meshes.flatMap(({ nutTrapCentersMm }) => nutTrapCentersMm)),
      nutTrapDepthMm: meshes[0]?.nutTrapDepthMm,
      cableClearanceCentersMm: uniqueProbes(
        meshes.flatMap(({ cableClearanceCentersMm }) => cableClearanceCentersMm),
      ),
      socketCentersMm: uniqueProbes(meshes.flatMap(({ socketCentersMm }) => socketCentersMm)),
      orientationMarkCenterMm: meshes[0]?.orientationMarkCenterMm,
      loftStationCentersMm: uniqueProbes(
        meshes.flatMap(({ loftStationCentersMm }) => loftStationCentersMm ?? []),
      ),
      labelCentersMm: uniqueLabelProbes(
        meshes.flatMap(({ labelCentersMm }) => labelCentersMm ?? []),
      ),
      labelDepthMm: meshes[0]?.labelDepthMm,
      panelEdgeIds: uniquePanelEdges(
        meshes.flatMap(({ panelEdgeIds }) => panelEdgeIds ?? []),
      ),
      ridgeTopCentersMm: uniqueLabelProbes(
        meshes.flatMap(({ ridgeTopCentersMm }) => ridgeTopCentersMm ?? []),
      ),
      surfaceThicknessMm: meshes[0]?.surfaceThicknessMm,
    });
  } finally {
    solid.delete();
  }
}

function assertFitsPrintBed(
  mesh: StructuralSolidMesh,
  normalized: NormalizedStructuralDesign,
): void {
  const extents = mesh.boundingBoxMm.max
    .map((value, axis) => value - mesh.boundingBoxMm.min[axis]!)
    .sort((left, right) => left - right);
  const available = normalized.connectorization.printBedSizeMm
    .map((value) => value - 2 * normalized.connectorization.printBedMarginMm)
    .sort((left, right) => left - right);
  if (extents.some((extent, axis) => extent > available[axis]! + 1e-5)) {
    throw new Error(
      `Structural part ${mesh.partId} does not fit the configured print bed after margins: ` +
      `${extents.map((value) => value.toFixed(2)).join(" x ")} mm requires no more than ` +
      `${available.map((value) => value.toFixed(2)).join(" x ")} mm after rotation.`,
    );
  }
}

function assertMeshAvoidsFabricationKeepouts(
  wasm: ManifoldToplevel,
  mesh: StructuralSolidMesh,
  normalized: NormalizedStructuralDesign,
): void {
  const solid = new wasm.Manifold(new wasm.Mesh({
    numProp: 3,
    vertProperties: mesh.vertProperties,
    triVerts: mesh.triVerts,
  }));
  try {
    assertAvoidsPanelEnvelopes(wasm, solid, normalized, mesh.partId);
    assertAvoidsConnectorClearances(wasm, solid, normalized, mesh.partId);
  } finally {
    solid.delete();
  }
}

export async function buildStructuralSolids(
  normalized: NormalizedStructuralDesign,
  optimized: TrussOptimizationResult,
): Promise<StructuralSolidMesh[]> {
  if (optimized.status !== "converged") {
    throw new Error(`Printable structural geometry requires converged optimization; received ${optimized.status}.`);
  }
  if (optimized.sourceFingerprint.value !== normalized.sourceFingerprint.value) {
    throw new Error("Optimized truss fingerprint does not match normalized structural inputs.");
  }
  if (optimized.optimizedCandidate.sourceFingerprint.value !== normalized.sourceFingerprint.value) {
    throw new Error("Optimized candidate fingerprint does not match normalized structural inputs.");
  }
  return buildStructuralRibbonSolids(normalized, optimized.optimizedCandidate);
}

export async function buildStructuralRibbonSolids(
  normalized: NormalizedStructuralDesign,
  candidate: import("../structure/CandidateTruss.ts").CandidateTruss,
): Promise<StructuralSolidMesh[]> {
  if (candidate.sourceFingerprint.value !== normalized.sourceFingerprint.value) {
    throw new Error("Candidate truss fingerprint does not match normalized structural inputs.");
  }
  validateCandidateTruss(candidate);
  const wasm = await loadManifoldRuntime();
  wasm.setCircularSegments(CIRCULAR_SEGMENTS);
  const parts: StructuralSolidMesh[] = [];
  const junctionMeshes = new Map<string, StructuralSolidMesh[]>();
  for (const cell of candidate.connectorCells) {
    const mesh = normalized.connectorization.surfaceStyle === "led-surface-bridge"
      ? buildSurfaceBridgeConnector(wasm, normalized, candidate, cell)
      : buildOrganicConnector(wasm, normalized, candidate, cell);
    if (!cell.junctionId) {
      parts.push(mesh);
      continue;
    }
    const values = junctionMeshes.get(cell.junctionId) ?? [];
    values.push(mesh);
    junctionMeshes.set(cell.junctionId, values);
  }
  for (const [junctionId, meshes] of [...junctionMeshes].sort(([left], [right]) =>
    compareText(left, right)
  )) {
    parts.push(mergeRibbonJunction(wasm, normalized, junctionId, meshes));
  }
  parts.sort((left, right) => compareText(left.partId, right.partId));
  for (const part of parts) {
    assertMeshAvoidsFabricationKeepouts(wasm, part, normalized);
    assertFitsPrintBed(part, normalized);
  }
  return parts;
}

export async function structuralMeshContainsPoint(
  mesh: StructuralSolidMesh,
  point: StructuralSolidProbe,
  probeSizeMm = 0.3,
): Promise<boolean> {
  const wasm = await loadManifoldRuntime();
  const solid = new wasm.Manifold(new wasm.Mesh({
    numProp: 3,
    vertProperties: mesh.vertProperties,
    triVerts: mesh.triVerts,
  }));
  let probeSolid: Manifold | undefined;
  try {
    probeSolid = translateOwned(
      wasm.Manifold.cube(probeSizeMm, true),
      point.x,
      point.y,
      point.z,
    );
    const hit = solid.intersect(probeSolid);
    try {
      return !hit.isEmpty() && hit.volume() > 1e-7;
    } finally {
      hit.delete();
    }
  } finally {
    solid.delete();
    probeSolid?.delete();
  }
}
