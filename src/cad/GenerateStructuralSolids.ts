import type { Manifold, ManifoldToplevel, Mat4 } from "manifold-3d";
import type {
  NormalizedStructuralDesign,
  StructuralVector,
} from "../sculpture/StructuralDesign.ts";
import type {
  CandidateConnectorCell,
  CandidateTrussMember,
  CandidateTrussNode,
} from "../structure/CandidateTruss.ts";
import { validateCandidateTruss } from "../structure/CandidateTruss.ts";
import type { TrussOptimizationResult } from "../structure/TrussOptimizer.ts";
import { loadManifoldRuntime } from "./ManifoldRuntime.ts";

const EPSILON_MM = 0.03;
const CIRCULAR_SEGMENTS = 32;
const MAXIMUM_STRUT_SEGMENTS = 256;

export interface StructuralGeometryPolicy {
  schemaVersion: "1.0.0";
  minimumWallMm: number;
  hubMinimumRadiusMm: number;
  socketDepthMm: number;
  socketBossExtensionMm: number;
  socketRadialClearanceMm: number;
  tenonRadialReductionMm: number;
  nutTrapAcrossFlatsMm: number;
  nutTrapDepthMm: number;
  orientationMarkHeightMm: number;
}

export const STRUCTURAL_GEOMETRY_POLICY: StructuralGeometryPolicy = {
  schemaVersion: "1.0.0",
  minimumWallMm: 1.2,
  hubMinimumRadiusMm: 4.5,
  socketDepthMm: 4,
  socketBossExtensionMm: 1.5,
  socketRadialClearanceMm: 0.15,
  tenonRadialReductionMm: 0.1,
  nutTrapAcrossFlatsMm: 4.2,
  nutTrapDepthMm: 2.2,
  orientationMarkHeightMm: 1.2,
};

export interface StructuralSolidProbe {
  x: number;
  y: number;
  z: number;
}

export interface StructuralSolidMesh {
  partId: string;
  kind: "connector-bracket" | "strut-segment" | "splice-sleeve";
  status: string;
  volumeCubicMm: number;
  numTri: number;
  genus: number;
  boundingBoxMm: { min: StructuralVector; max: StructuralVector };
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  panelId?: string;
  panelIds?: [string, string];
  connectorCellId?: string;
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
  cableClearanceCentersMm: StructuralSolidProbe[];
  socketCentersMm: StructuralSolidProbe[];
  orientationMarkCenterMm?: StructuralSolidProbe;
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
        throw new Error(`Structural part ${partId} intersects PCB envelope ${panel.id}.`);
      }
    } finally {
      localEnvelope.delete();
      envelope?.delete();
      collision?.delete();
    }
  }
}

function meshFromSolid(
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
    const meaningful = components.filter((_, index) => componentVolumes[index]! > 1e-5);
    if (meaningful.length !== 1) {
      throw new Error(
        `Structural part ${metadata.partId} contains ${meaningful.length} printable solids ` +
        `with component volumes ${componentVolumes.map((volume) => volume.toFixed(6)).join(", ")} mm^3.`,
      );
    }
    const outputSolid = meaningful[0]!;
    const volumeCubicMm = outputSolid.volume();
    if (!Number.isFinite(volumeCubicMm) || volumeCubicMm <= 1e-6) {
      throw new Error(`Structural part ${metadata.partId} has no positive volume.`);
    }
    const mesh = outputSolid.getMesh();
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
      if (Math.hypot(...cross(ab, ac)) <= 1e-10) {
        throw new Error(`Structural part ${metadata.partId} contains a degenerate triangle.`);
      }
    }
    const box = outputSolid.boundingBox();
    return {
      ...metadata,
      status,
      volumeCubicMm,
      numTri: outputSolid.numTri(),
      genus: outputSolid.genus(),
      boundingBoxMm: {
        min: [box.min[0], box.min[1], box.min[2]],
        max: [box.max[0], box.max[1], box.max[2]],
      },
      vertProperties,
      triVerts,
    };
  } finally {
    dispose(components);
  }
}

function buildHubRadii(
  nodes: CandidateTrussNode[],
  members: CandidateTrussMember[],
): Map<string, number> {
  const radii = new Map(nodes.map((node) => [node.id, STRUCTURAL_GEOMETRY_POLICY.hubMinimumRadiusMm]));
  for (const member of members) {
    if (member.analysisOnly) continue;
    const radius = member.initialDiameterMm / 2 + STRUCTURAL_GEOMETRY_POLICY.minimumWallMm;
    radii.set(member.startNodeId, Math.max(radii.get(member.startNodeId) ?? 0, radius));
    radii.set(member.endNodeId, Math.max(radii.get(member.endNodeId) ?? 0, radius));
  }
  return radii;
}

function buildConnectorBracket(
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
  const nutTrapCentersMm: StructuralSolidProbe[] = [];
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
    const nutStart = add(
      pilotHubPosition,
      scale(inward, hubRadius - STRUCTURAL_GEOMETRY_POLICY.nutTrapDepthMm),
    );
    const nutEnd = add(pilotHubPosition, scale(inward, hubRadius + EPSILON_MM));
    cutters.push(cylinderAlong(
      wasm,
      nutStart,
      nutEnd,
      STRUCTURAL_GEOMETRY_POLICY.nutTrapAcrossFlatsMm / Math.sqrt(3),
      STRUCTURAL_GEOMETRY_POLICY.nutTrapAcrossFlatsMm / Math.sqrt(3),
      6,
    ));
    anchorCentersMm.push(probe(bracket.anchorPositionMm));
    screwHoleCentersMm.push(probe(scale(add(mountPosition, screwEnd), 0.5)));
    nutTrapCentersMm.push(probe(add(nutStart, scale(inward, STRUCTURAL_GEOMETRY_POLICY.nutTrapDepthMm / 2))));
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
  const cableClearanceCentersMm: StructuralSolidProbe[] = [];
  for (const clearance of normalized.cableClearances.filter((item) => item.panelId === panelId)) {
    const inward = scale(clearance.outwardNormal, -1);
    const start = add(clearance.positionMm, scale(inward, -EPSILON_MM));
    const end = add(
      clearance.positionMm,
      scale(inward, normalized.design.fabrication.bracketOffsetMm +
        2 * Math.max(...nodes.map((node) => hubRadii.get(node.id)!))),
    );
    cutters.push(cylinderAlong(wasm, start, end, clearance.diameterMm / 2));
    cableClearanceCentersMm.push(probe(add(
      clearance.positionMm,
      scale(inward, normalized.design.fabrication.bracketOffsetMm),
    )));
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
    return meshFromSolid(solid, {
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
      nutTrapCentersMm,
      cableClearanceCentersMm,
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
      return meshFromSolid(solid, {
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

function buildSegmentedStrut(
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
      parts.push(meshFromSolid(solid, {
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
      parts.push(meshFromSolid(sleeve, {
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
  validateCandidateTruss(optimized.optimizedCandidate);
  const wasm = await loadManifoldRuntime();
  wasm.setCircularSegments(CIRCULAR_SEGMENTS);
  const candidate = optimized.optimizedCandidate;
  const hubRadii = buildHubRadii(candidate.nodes, candidate.members);
  const parts: StructuralSolidMesh[] = [];
  for (const cell of candidate.connectorCells) {
    parts.push(buildConnectorBracket(wasm, normalized, optimized, cell, 0, hubRadii));
    parts.push(buildConnectorBracket(wasm, normalized, optimized, cell, 1, hubRadii));
  }
  for (const member of candidate.members.filter(({ kind }) => kind === "inter-panel")) {
    parts.push(...buildSegmentedStrut(wasm, normalized, optimized, member, hubRadii));
  }
  for (const part of parts) assertFitsPrintBed(part, normalized);
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
