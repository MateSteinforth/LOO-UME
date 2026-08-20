import type { Mat4, ManifoldToplevel } from "manifold-3d";
import type { Manifold } from "manifold-3d";
import type { Vector3Data } from "../../web/src/LedMapping.ts";
import {
  compilePanelAssembly,
  type CompiledAssemblyFace,
  type CompiledClosureConnector,
  type CompiledPanelAssembly,
  type CompiledPanelPlacement,
  type PanelAssemblyProject,
} from "../sculpture/PanelAssembly.ts";
import { triangulatePolygon } from "./TriangulatePolygon.ts";
import { loadManifoldRuntime } from "./ManifoldRuntime.ts";

const EPS = 0.03;
const CIRCULAR_SEGMENTS = 40;

interface ClosureFrame {
  origin: Vector3Data;
  xAxis: Vector3Data;
  yAxis: Vector3Data;
  inwardAxis: Vector3Data;
}

export interface ClosureSolidProbe {
  x: number;
  y: number;
  z: number;
}

export interface ClosureSolidMesh {
  partId: string;
  status: string;
  volume: number;
  numTri: number;
  genus: number;
  boundingBox: { min: [number, number, number]; max: [number, number, number] };
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  panelMountOffset: number;
  pilotDiameter: number;
  holeEdgeCorrection: number;
  surfaceFlushCorrection: number;
  connectorHoleIds: string[];
  blockedHoleIds: string[];
  holeCenters: ClosureSolidProbe[];
  panelEnvelopeCenters: ClosureSolidProbe[];
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

function normalize(value: Vector3Data): Vector3Data {
  const length = Math.hypot(value.x, value.y, value.z);
  if (length < 1e-10) throw new Error("Cannot normalize a zero vector.");
  return scale(value, 1 / length);
}

function closureFrame(face: CompiledAssemblyFace): ClosureFrame {
  return {
    origin: face.center,
    xAxis: face.xAxis,
    yAxis: face.yAxis,
    inwardAxis: scale(face.normal, -1),
  };
}

function localPoint(frame: ClosureFrame, point: Vector3Data): Vector3Data {
  const delta = subtract(point, frame.origin);
  return {
    x: dot(delta, frame.xAxis),
    y: dot(delta, frame.yAxis),
    z: dot(delta, frame.inwardAxis),
  };
}

function localVector(frame: ClosureFrame, value: Vector3Data): Vector3Data {
  return {
    x: dot(value, frame.xAxis),
    y: dot(value, frame.yAxis),
    z: dot(value, frame.inwardAxis),
  };
}

function basisMat4(
  origin: Vector3Data,
  xAxis: Vector3Data,
  yAxis: Vector3Data,
  zAxis: Vector3Data,
): Mat4 {
  return [
    xAxis.x, xAxis.y, xAxis.z, 0,
    yAxis.x, yAxis.y, yAxis.z, 0,
    zAxis.x, zAxis.y, zAxis.z, 0,
    origin.x, origin.y, origin.z, 1,
  ];
}

function connectorParameters(
  face: CompiledAssemblyFace,
  connector: CompiledClosureConnector,
  regionCenter: Vector3Data,
): {
  edgeOrigin: Vector3Data;
  edgeAxis: Vector3Data;
  panelInwardAxis: Vector3Data;
  panelInwardNormal: Vector3Data;
  gapInwardAxis: Vector3Data;
  edgeLength: number;
  holeX: number;
  holeY: number;
} {
  const frame = closureFrame(face);
  const edgeOrigin = localPoint(frame, connector.edgeVertices[0]);
  const edgeAxis = normalize(localVector(frame, connector.edgeAxis));
  const panelInwardAxis = normalize(localVector(frame, connector.panelInwardAxis));
  const panelInwardNormal = normalize(localVector(frame, connector.panelInwardNormal));
  const midpoint = scale(add(connector.edgeVertices[0], connector.edgeVertices[1]), 0.5);
  const gapInwardAxis = normalize(
    localVector(frame, normalize(subtract(regionCenter, midpoint))),
  );
  const holeDelta = subtract(connector.pilotPosition, connector.edgeVertices[0]);
  return {
    edgeOrigin,
    edgeAxis,
    panelInwardAxis,
    panelInwardNormal,
    gapInwardAxis,
    edgeLength: Math.hypot(
      connector.edgeVertices[1].x - connector.edgeVertices[0].x,
      connector.edgeVertices[1].y - connector.edgeVertices[0].y,
      connector.edgeVertices[1].z - connector.edgeVertices[0].z,
    ),
    holeX: dot(holeDelta, connector.edgeAxis),
    holeY: dot(holeDelta, connector.panelInwardAxis),
  };
}

function signedArea(points: Array<[number, number]>): number {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function ccw(points: Array<[number, number]>): Array<[number, number]> {
  return signedArea(points) >= 0 ? points : [...points].reverse();
}

function dispose(items: Array<{ delete(): void } | undefined>): void {
  for (const item of items) item?.delete();
}

function unionAll(wasm: ManifoldToplevel, items: Manifold[]): Manifold {
  if (items.length === 0) throw new Error("Cannot union zero solids.");
  if (items.length === 1) return items[0]!;
  const combined = wasm.Manifold.union(items);
  dispose(items);
  return combined;
}

function groupedClosureFaces(
  assembly: CompiledPanelAssembly,
): Array<{ partId: string; regions: CompiledAssemblyFace[] }> {
  const grouped = new Map<string, CompiledAssemblyFace[]>();
  for (const face of assembly.faces.filter((candidate) => candidate.role === "closure")) {
    grouped.set(face.partId, [...(grouped.get(face.partId) ?? []), face]);
  }
  return [...grouped].map(([partId, regions]) => ({ partId, regions }));
}

function roundedRect(
  wasm: ManifoldToplevel,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  radius: number,
) {
  const { CrossSection } = wasm;
  const circles = [
    [x0 + radius, y0 + radius],
    [x1 - radius, y0 + radius],
    [x1 - radius, y1 - radius],
    [x0 + radius, y1 - radius],
  ].map((point) =>
    CrossSection.circle(radius, CIRCULAR_SEGMENTS)
      .translate(point as [number, number])
  );
  const hull = CrossSection.hull(circles);
  dispose(circles);
  return hull;
}

function coverSolid(
  wasm: ManifoldToplevel,
  frame: ClosureFrame,
  regions: CompiledAssemblyFace[],
  coverThickness: number,
  coverCornerRadius: number,
): Manifold {
  const { CrossSection } = wasm;
  const sections = regions.map((region) => {
    const points = ccw(
      region.vertices.map((vertex) => {
        const point = localPoint(frame, vertex);
        return [point.x, point.y] as [number, number];
      }),
    );
    const polygon = new CrossSection([points]);
    const shrunk = polygon.offset(-coverCornerRadius, "Miter");
    polygon.delete();
    const rounded = shrunk.offset(coverCornerRadius, "Round", 2, CIRCULAR_SEGMENTS);
    shrunk.delete();
    return rounded;
  });
  const outline = sections.length === 1
    ? sections[0]!
    : (() => {
      const combined = CrossSection.union(sections);
      dispose(sections);
      return combined;
    })();
  const solid = outline.extrude(coverThickness);
  outline.delete();
  return solid;
}

function connectorSolid(
  wasm: ManifoldToplevel,
  values: ReturnType<typeof connectorParameters>,
  policy: NonNullable<PanelAssemblyProject["sculpture"]["closures"]>,
  panelMountOffset: number,
  pilotDiameter: number,
  leadInDiameter: number,
  leadInDepth: number,
): {
  flange: Manifold;
  gusset: Manifold;
  holeCenter: ClosureSolidProbe;
  holeCutter: Manifold;
} {
  const { Manifold, CrossSection } = wasm;
  const lip = roundedRect(
    wasm,
    policy.connectorCornerClearance,
    values.edgeLength - 1.35,
    -policy.flangeOverlap,
    policy.edgeLipDepth,
    0.8,
  );
  const tabStartY = 0;
  const tabEndY = values.holeY + policy.screwTabEndMargin - policy.screwTabWidth / 2;
  const tabA = CrossSection.circle(policy.screwTabWidth / 2, CIRCULAR_SEGMENTS)
    .translate([values.holeX, tabStartY] as [number, number]);
  const tabB = CrossSection.circle(policy.screwTabWidth / 2, CIRCULAR_SEGMENTS)
    .translate([values.holeX, tabEndY] as [number, number]);
  const tab = CrossSection.hull([tabA, tabB]);
  tabA.delete();
  tabB.delete();
  const outline = lip.add(tab);
  lip.delete();
  tab.delete();
  const extruded = outline.extrude(policy.flangeThickness);
  outline.delete();
  const pilot = Manifold.cylinder(
    policy.flangeThickness + 2 * EPS,
    pilotDiameter / 2,
    pilotDiameter / 2,
    CIRCULAR_SEGMENTS,
  ).translate(values.holeX, values.holeY, -EPS);
  const leadIn = Manifold.cylinder(
    leadInDepth + EPS,
    pilotDiameter / 2,
    leadInDiameter / 2,
    CIRCULAR_SEGMENTS,
  ).translate(values.holeX, values.holeY, policy.flangeThickness - leadInDepth);
  const bored = extruded.subtract(pilot).subtract(leadIn);
  extruded.delete();
  pilot.delete();
  leadIn.delete();
  const flangeOrigin = add(values.edgeOrigin, scale(values.panelInwardNormal, panelMountOffset));
  const flange = bored.transform(basisMat4(
    flangeOrigin,
    values.edgeAxis,
    values.panelInwardAxis,
    values.panelInwardNormal,
  ));
  bored.delete();

  const gussetStart = values.holeX - policy.screwTabWidth / 2 + 0.35;
  const gussetWidth = policy.screwTabWidth - 0.7;
  const gussetBase = Manifold.cube([
    gussetWidth,
    values.holeY + policy.screwTabEndMargin,
    0.8,
  ]).transform(basisMat4(
    add(
      add(values.edgeOrigin, scale(values.edgeAxis, gussetStart)),
      scale(values.panelInwardNormal, panelMountOffset),
    ),
    values.edgeAxis,
    values.panelInwardAxis,
    values.panelInwardNormal,
  ));
  const gussetTip = Manifold.cube([gussetWidth, 3.5, 0.5]).transform(basisMat4(
    add(
      add(
        add(values.edgeOrigin, scale(values.edgeAxis, gussetStart)),
        scale(values.gapInwardAxis, 0.4),
      ),
      scale(vector(0, 0, 1), policy.coverThickness - 0.5),
    ),
    values.edgeAxis,
    values.gapInwardAxis,
    vector(0, 0, 1),
  ));
  const gusset = wasm.Manifold.hull([gussetBase, gussetTip]);
  gussetBase.delete();
  gussetTip.delete();

  const holeCutter = Manifold.cylinder(
    policy.flangeThickness + 2 * EPS,
    pilotDiameter / 2,
    pilotDiameter / 2,
    CIRCULAR_SEGMENTS,
  ).transform(basisMat4(
    add(
      add(
        add(flangeOrigin, scale(values.edgeAxis, values.holeX)),
        scale(values.panelInwardAxis, values.holeY),
      ),
      scale(values.panelInwardNormal, -EPS),
    ),
    values.edgeAxis,
    values.panelInwardAxis,
    values.panelInwardNormal,
  ));
  const holeCenter = add(
    flangeOrigin,
    add(
      scale(values.edgeAxis, values.holeX),
      add(
        scale(values.panelInwardAxis, values.holeY),
        scale(values.panelInwardNormal, policy.flangeThickness / 2),
      ),
    ),
  );
  return { flange, gusset, holeCenter, holeCutter };
}

function panelCutter(
  wasm: ManifoldToplevel,
  frame: ClosureFrame,
  panel: CompiledPanelPlacement,
  project: PanelAssemblyProject,
): { cutter: Manifold; envelopeCenter: ClosureSolidProbe } {
  const clearance = project.sculpture.closures!.panelEnvelopeClearance;
  const cutterDepth =
    project.panelProfile.dimensions.thickness +
    project.panelProfile.mounting.physicalCorrections.surfaceFlush;
  const origin = localPoint(frame, panel.position);
  const xAxis = localVector(frame, panel.xAxis);
  const yAxis = localVector(frame, panel.yAxis);
  const inward = localVector(frame, scale(panel.normal, -1));
  const cube = wasm.Manifold.cube([
    panel.width + 2 * clearance,
    panel.height + 2 * clearance,
    cutterDepth + 2 * EPS,
  ]);
  const placed = cube.transform(basisMat4(
    add(
      add(origin, scale(xAxis, -(panel.width / 2 + clearance))),
      add(scale(yAxis, -(panel.height / 2 + clearance)), scale(inward, -EPS)),
    ),
    xAxis,
    yAxis,
    inward,
  ));
  cube.delete();
  const envelopeCenter = add(origin, scale(inward, cutterDepth / 2));
  return { cutter: placed, envelopeCenter };
}

function exteriorClip(
  wasm: ManifoldToplevel,
  project: PanelAssemblyProject,
  assembly: CompiledPanelAssembly,
  frame: ClosureFrame,
): Manifold {
  const vertProperties = new Float32Array(assembly.vertices.length * 3);
  assembly.vertices.forEach((vertex, index) => {
    const radius = Math.hypot(vertex.x, vertex.y, vertex.z);
    const inflated = scale(vertex, 1 + 0.03 / radius);
    const local = localPoint(frame, inflated);
    vertProperties[index * 3] = local.x;
    vertProperties[index * 3 + 1] = local.y;
    vertProperties[index * 3 + 2] = local.z;
  });
  const sourceFaceById = new Map(
    project.sculpture.mechanicalShell!.faces.map((candidate) => [candidate.id, candidate]),
  );
  const triangles: number[] = [];
  for (const candidate of assembly.faces) {
    if (sourceFaceById.get(candidate.id)?.connectorPolicy) {
      for (const triangle of triangulatePolygon(
        candidate.vertexIndices,
        candidate.localVertices,
      )) {
        triangles.push(triangle[2]!, triangle[1]!, triangle[0]!);
      }
      continue;
    }
    const reversed = [...candidate.vertexIndices].reverse();
    for (let index = 0; index < reversed.length - 2; index += 1) {
      triangles.push(reversed[0]!, reversed[index + 1]!, reversed[index + 2]!);
    }
  }
  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties,
    triVerts: Uint32Array.from(triangles),
  });
  return new wasm.Manifold(mesh);
}

function buildOneClosure(
  wasm: ManifoldToplevel,
  project: PanelAssemblyProject,
  assembly: CompiledPanelAssembly,
  regions: CompiledAssemblyFace[],
): ClosureSolidMesh {
  const policy = project.sculpture.closures!;
  const profile = project.panelProfile;
  const face = regions[0]!;
  const frame = closureFrame(face);
  const panelMountOffset =
    profile.dimensions.thickness + profile.mounting.physicalCorrections.surfaceFlush;
  const panels = new Map(assembly.panels.map((panel) => [panel.id, panel]));
  const connectorEntries = regions.flatMap((region) =>
    region.connectors.map((connector) => ({ connector, region }))
  );

  const cover = coverSolid(wasm, frame, regions, policy.coverThickness, policy.coverCornerRadius);
  const flanges: Manifold[] = [];
  const gussets: Manifold[] = [];
  const holeCutters: Manifold[] = [];
  const holeCenters: ClosureSolidProbe[] = [];
  for (const { connector, region } of connectorEntries) {
    const values = connectorParameters(face, connector, region.center);
    const built = connectorSolid(
      wasm,
      values,
      policy,
      panelMountOffset,
      profile.mounting.printedPilotDiameter,
      profile.mounting.screwLeadIn.diameter,
      profile.mounting.screwLeadIn.depth,
    );
    flanges.push(built.flange);
    gussets.push(built.gusset);
    holeCutters.push(built.holeCutter);
    holeCenters.push(built.holeCenter);
  }
  const cutters: Manifold[] = [];
  const panelEnvelopeCenters: ClosureSolidProbe[] = [];
  for (const connector of connectorEntries.map(({ connector }) => connector)) {
    const panel = panels.get(connector.panelId);
    if (!panel) throw new Error(`Missing panel ${connector.panelId} for closure cutter.`);
    const built = panelCutter(wasm, frame, panel, project);
    cutters.push(built.cutter);
    panelEnvelopeCenters.push(built.envelopeCenter);
  }

  const positive = unionAll(wasm, [cover, ...flanges, ...gussets]);
  const holeUnion = holeCutters.length === 0 ? undefined : unionAll(wasm, holeCutters);
  const bored = holeUnion ? positive.subtract(holeUnion) : positive;
  if (holeUnion) {
    positive.delete();
    holeUnion.delete();
  }
  const cutterUnion = cutters.length === 0 ? undefined : unionAll(wasm, cutters);
  const hollow = cutterUnion ? bored.subtract(cutterUnion) : bored;
  if (cutterUnion) {
    bored.delete();
    cutterUnion.delete();
  }
  const clip = exteriorClip(wasm, project, assembly, frame);
  const clipped = hollow.intersect(clip);
  hollow.delete();
  clip.delete();
  const status = clipped.status();
  if (status !== "NoError") {
    clipped.delete();
    throw new Error(`Manifold closure ${face.partId} is not valid: ${status}.`);
  }
  const mesh = clipped.getMesh();
  const box = clipped.boundingBox();
  const result: ClosureSolidMesh = {
    partId: face.partId,
    status,
    volume: clipped.volume(),
    numTri: clipped.numTri(),
    genus: clipped.genus(),
    boundingBox: {
      min: [box.min[0], box.min[1], box.min[2]],
      max: [box.max[0], box.max[1], box.max[2]],
    },
    vertProperties: Float32Array.from(mesh.vertProperties),
    triVerts: Uint32Array.from(mesh.triVerts),
    panelMountOffset,
    pilotDiameter: profile.mounting.printedPilotDiameter,
    holeEdgeCorrection: profile.mounting.physicalCorrections.holeEdge,
    surfaceFlushCorrection: profile.mounting.physicalCorrections.surfaceFlush,
    connectorHoleIds: connectorEntries.map(({ connector }) => connector.panelHoleId),
    blockedHoleIds: profile.mounting.holes
      .filter((hole) => hole.mechanicalUse === "blocked")
      .map((hole) => hole.id),
    holeCenters,
    panelEnvelopeCenters,
  };
  clipped.delete();
  return result;
}

/** Builds printable closure solids from compiled panel-outline facts. Does not emit SCAD. */
export async function buildPanelClosureSolids(
  project: PanelAssemblyProject,
): Promise<ClosureSolidMesh[]> {
  if (project.sculpture.manualMechanics) {
    throw new Error("Manually authored mechanics cannot enter generic Manifold solids.");
  }
  const wasm = await loadManifoldRuntime();
  wasm.setCircularSegments(CIRCULAR_SEGMENTS);
  const assembly = compilePanelAssembly(project);
  return groupedClosureFaces(assembly).map(({ regions }) =>
    buildOneClosure(wasm, project, assembly, regions)
  );
}

export function solidContainsPoint(
  wasm: ManifoldToplevel,
  solid: Manifold,
  point: ClosureSolidProbe,
  probeSize = 0.35,
): boolean {
  const probe = wasm.Manifold.cube(probeSize, true).translate(point.x, point.y, point.z);
  const hit = solid.intersect(probe);
  const contained = !hit.isEmpty() && hit.volume() > 1e-6;
  hit.delete();
  probe.delete();
  return contained;
}

export async function meshContainsPoint(
  mesh: ClosureSolidMesh,
  point: ClosureSolidProbe,
): Promise<boolean> {
  const wasm = await loadManifoldRuntime();
  const solid = new wasm.Manifold(new wasm.Mesh({
    numProp: 3,
    vertProperties: mesh.vertProperties,
    triVerts: mesh.triVerts,
  }));
  try {
    return solidContainsPoint(wasm, solid, point);
  } finally {
    solid.delete();
  }
}
