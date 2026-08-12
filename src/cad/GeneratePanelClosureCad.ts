import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  compilePanelAssembly,
  type CompiledAssemblyFace,
  type CompiledClosureConnector,
  type CompiledPanelAssembly,
  type CompiledPanelPlacement,
  type PanelAssemblyProject,
} from "../sculpture/PanelAssembly.ts";
import type { Vector3Data } from "../../web/src/LedMapping.ts";
import { triangulatePolygon } from "./TriangulatePolygon.ts";

export interface GeneratedClosurePart {
  id: string;
  closureFaceId: string;
  quantity: 1;
  entrypoint: string;
  outputStl: string;
  connectorPanelIds: string[];
  connectorHoleIds: string[];
  status: "prototype-unvalidated";
}

export interface GeneratedPanelClosureManifest {
  schemaVersion: "1.0.0";
  sculptureId: string;
  source: string;
  mechanicalStatus: "prototype-unvalidated";
  topology: CompiledPanelAssembly["counts"];
  parts: GeneratedClosurePart[];
  assemblyPreview: string;
  warnings: string[];
}

export interface EmitPanelClosureCadResult {
  outputDirectory: string;
  manifestPath: string;
  manifest: GeneratedPanelClosureManifest;
  entrypointPaths: {
    closures: Record<string, string>;
    assemblyPreview: string;
  };
}

function scadNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Cannot emit non-finite SCAD data.");
  return Math.abs(value) < 1e-10 ? "0" : Number(value.toFixed(8)).toString();
}

function dot(a: Vector3Data, b: Vector3Data): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function subtract(a: Vector3Data, b: Vector3Data): Vector3Data {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a: Vector3Data, b: Vector3Data): Vector3Data {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(value: Vector3Data, amount: number): Vector3Data {
  return { x: value.x * amount, y: value.y * amount, z: value.z * amount };
}

function normalize(value: Vector3Data): Vector3Data {
  const length = Math.hypot(value.x, value.y, value.z);
  if (length < 1e-10) throw new Error("Cannot normalize a zero vector.");
  return scale(value, 1 / length);
}

function point2(value: [number, number]): string {
  return `[${scadNumber(value[0])},${scadNumber(value[1])}]`;
}

function point3(value: Vector3Data): string {
  return `[${scadNumber(value.x)},${scadNumber(value.y)},${scadNumber(value.z)}]`;
}

interface ClosureFrame {
  origin: Vector3Data;
  xAxis: Vector3Data;
  yAxis: Vector3Data;
  inwardAxis: Vector3Data;
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

function scadFrame(
  origin: Vector3Data,
  xAxis: Vector3Data,
  yAxis: Vector3Data,
  zAxis: Vector3Data,
): string {
  return [
    `[[${scadNumber(xAxis.x)},${scadNumber(yAxis.x)},${scadNumber(zAxis.x)},${scadNumber(origin.x)}],`,
    `[${scadNumber(xAxis.y)},${scadNumber(yAxis.y)},${scadNumber(zAxis.y)},${scadNumber(origin.y)}],`,
    `[${scadNumber(xAxis.z)},${scadNumber(yAxis.z)},${scadNumber(zAxis.z)},${scadNumber(origin.z)}],`,
    "[0,0,0,1]]",
  ].join("");
}

function moduleId(faceId: string): string {
  return `closure_${faceId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function connectorParameters(
  face: CompiledAssemblyFace,
  connector: CompiledClosureConnector,
  regionCenter: Vector3Data = face.center,
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
  const panelInwardAxis = normalize(
    localVector(frame, connector.panelInwardAxis),
  );
  const panelInwardNormal = normalize(
    localVector(frame, connector.panelInwardNormal),
  );
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

function panelCutter(
  frame: ClosureFrame,
  panel: CompiledPanelPlacement,
  project: PanelAssemblyProject,
): string {
  const origin = localPoint(frame, panel.position);
  const xAxis = localVector(frame, panel.xAxis);
  const yAxis = localVector(frame, panel.yAxis);
  const inward = localVector(frame, scale(panel.normal, -1));
  const clearance = project.sculpture.closures.panelEnvelopeClearance;
  const cutterDepth =
    project.panelProfile.dimensions.thickness +
    project.panelProfile.mounting.physicalCorrections.surfaceFlush;
  return `  multmatrix(${scadFrame(origin, xAxis, yAxis, inward)})
    translate([-${scadNumber(panel.width / 2 + clearance)},-${scadNumber(panel.height / 2 + clearance)},-eps])
      cube([${scadNumber(panel.width + 2 * clearance)},${scadNumber(panel.height + 2 * clearance)},${scadNumber(cutterDepth)}+2*eps]);`;
}

function closureSource(
  project: PanelAssemblyProject,
  assembly: CompiledPanelAssembly,
  regions: CompiledAssemblyFace[],
): string {
  const policy = project.sculpture.closures;
  const face = regions[0]!;
  const connectorEntries = regions.flatMap((region) =>
    region.connectors.map((connector) => ({ connector, region }))
  );
  const connectors = connectorEntries.map(({ connector }) => connector);
  const profile = project.panelProfile;
  const frame = closureFrame(face);
  const panels = new Map(assembly.panels.map((panel) => [panel.id, panel]));
  const connectorModules = connectorEntries
    .map(({ connector, region }, index) => {
      const values = connectorParameters(face, connector, region.center);
      const flangeFrame = scadFrame(
        values.edgeOrigin,
        values.edgeAxis,
        values.panelInwardAxis,
        values.panelInwardNormal,
      );
      const gussetFrame = scadFrame(
        values.edgeOrigin,
        values.edgeAxis,
        values.gapInwardAxis,
        { x: 0, y: 0, z: 1 },
      );
      const lipStart = policy.connectorCornerClearance;
      const lipEnd = values.edgeLength - 1.35;
      const tabStart = values.holeX - policy.screwTabWidth / 2;
      const tabWidth = policy.screwTabWidth;
      const gussetStart = tabStart + 0.35;
      const gussetWidth = tabWidth - 0.7;
      return `module connector_${index}() {
  multmatrix(${flangeFrame})
    translate([0,0,panel_mount_offset])
      difference() {
        linear_extrude(height=flange_thickness)
          union() {
            rounded_rect(${scadNumber(lipStart)},${scadNumber(lipEnd)},-${scadNumber(policy.flangeOverlap)},${scadNumber(policy.edgeLipDepth)},0.8);
            hull() {
              translate([${scadNumber(values.holeX)},0]) circle(d=${scadNumber(policy.screwTabWidth)});
              translate([${scadNumber(values.holeX)},${scadNumber(values.holeY + policy.screwTabEndMargin - policy.screwTabWidth / 2)}]) circle(d=${scadNumber(policy.screwTabWidth)});
            }
          }
        translate([${scadNumber(values.holeX)},${scadNumber(values.holeY)},-eps])
          cylinder(d=pilot_d,h=flange_thickness+2*eps);
        translate([${scadNumber(values.holeX)},${scadNumber(values.holeY)},flange_thickness-leadin_depth])
          cylinder(d1=pilot_d,d2=leadin_d,h=leadin_depth+eps);
      }
}

module gusset_${index}() {
  hull() {
    multmatrix(${flangeFrame})
      translate([${scadNumber(gussetStart)},0,panel_mount_offset])
        cube([${scadNumber(gussetWidth)},${scadNumber(values.holeY + policy.screwTabEndMargin)},0.8]);
    multmatrix(${gussetFrame})
      translate([${scadNumber(gussetStart)},0.4,cover_thickness-0.5])
        cube([${scadNumber(gussetWidth)},3.5,0.5]);
  }
}`;
    })
    .join("\n\n");
  const connectorCalls = connectors
    .map((_, index) => `      connector_${index}();\n      gusset_${index}();`)
    .join("\n");
  const cutters = connectors
    .map((connector) => panelCutter(frame, panels.get(connector.panelId)!, project))
    .join("\n");
  const coverPointSets = regions.map((region) =>
    region.vertices.map((vertex) => {
      const point = localPoint(frame, vertex);
      return point2([point.x, point.y]);
    })
  );
  const clipPoints = assembly.vertices.map((vertex) => {
    const radius = Math.hypot(vertex.x, vertex.y, vertex.z);
    return point3(localPoint(frame, scale(vertex, 1 + 0.03 / radius)));
  });
  const sourceFaceById = new Map(
    project.sculpture.mechanicalShell.faces.map((candidate) => [candidate.id, candidate]),
  );
  const clipFaces = assembly.faces.flatMap((candidate) => {
    if (sourceFaceById.get(candidate.id)?.connectorPolicy) {
      return triangulatePolygon(
        candidate.vertexIndices,
        candidate.localVertices,
      ).map((triangle) => `[${[...triangle].reverse().join(",")}]`);
    }
    const reversed = [...candidate.vertexIndices].reverse();
    return Array.from({ length: reversed.length - 2 }, (_, index) =>
      `[${reversed[0]},${reversed[index + 1]},${reversed[index + 2]}]`,
    );
  });
  const id = moduleId(face.partId);
  const legacy = regions.length === 1 && face.partId === face.id;
  const description = legacy
    ? `// ${face.id}: one integrated closure using real holes on ${connectors.map((connector) => `${connector.panelId}/${connector.panelHoleId}`).join(", ")}.`
    : `// ${face.partId}: one flat-printable part using real holes on ${connectors.map((connector) => `${connector.panelId}/${connector.panelHoleId}`).join(", ")}.`;
  const coverDeclaration = legacy
    ? `cover_points=[${coverPointSets[0]!.join(",")}];`
    : `cover_point_sets=[${coverPointSets.map((points) => `[${points.join(",")}]`).join(",")}];`;
  const coverGeometry = legacy
    ? `      linear_extrude(height=cover_thickness)
        offset(r=cover_corner_radius)
          offset(delta=-cover_corner_radius)
            polygon(cover_points);`
    : `      linear_extrude(height=cover_thickness)
        offset(r=cover_corner_radius)
          offset(delta=-cover_corner_radius)
            union() for (cover_points=cover_point_sets)
              polygon(cover_points);`;
  return `// Generated from ${project.source}; do not hand-edit.
${description}
$fn=40;
eps=0.03;
cover_thickness=${scadNumber(policy.coverThickness)};
cover_corner_radius=${scadNumber(policy.coverCornerRadius)};
flange_thickness=${scadNumber(policy.flangeThickness)};
flange_overlap=${scadNumber(policy.flangeOverlap)};
panel_mount_offset=${scadNumber(profile.dimensions.thickness + profile.mounting.physicalCorrections.surfaceFlush)};
pilot_d=${scadNumber(profile.mounting.printedPilotDiameter)};
leadin_d=${scadNumber(profile.mounting.screwLeadIn.diameter)};
leadin_depth=${scadNumber(profile.mounting.screwLeadIn.depth)};
${coverDeclaration}
clip_points=[${clipPoints.join(",")}];
clip_faces=[${clipFaces.join(",")}];

module rounded_rect(x0,x1,y0,y1,r) {
  hull() for (x=[x0+r,x1-r],y=[y0+r,y1-r]) translate([x,y]) circle(r=r);
}

${connectorModules}

module exterior_clip() {
  polyhedron(points=clip_points,faces=clip_faces,convexity=10);
}

module ${id}() {
  intersection() {
    difference() {
    union() {
${coverGeometry}
${connectorCalls}
      }
${cutters}
    }
    exterior_clip();
  }
}

${id}();
`;
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

function assemblyPreviewSource(
  project: PanelAssemblyProject,
  assembly: CompiledPanelAssembly,
  outputDirectory: string,
): string {
  const parts = groupedClosureFaces(assembly);
  const closureUses = parts
    .map(({ partId }) => {
      const path = resolve(outputDirectory, `closure-${partId.toLowerCase()}.scad`);
      return `use <${path}>;`;
    })
    .join("\n");
  const closures = parts
    .map(({ partId, regions }, index) => {
      const face = regions[0]!;
      const color = index % 2 === 0 ? "[0.12,0.50,0.56,1]" : "[0.16,0.38,0.46,1]";
      return `color(${color}) multmatrix(${scadFrame(face.center, face.xAxis, face.yAxis, scale(face.normal, -1))}) ${moduleId(partId)}();`;
    })
    .join("\n");
  const panels = assembly.panels
    .map((panel) => {
      const frame = scadFrame(
        panel.position,
        panel.xAxis,
        panel.yAxis,
        scale(panel.normal, -1),
      );
      return `color([0.025,0.025,0.035,0.94]) multmatrix(${frame}) translate([0,0,panel_t/2]) cube([panel_w,panel_h,panel_t],center=true);`;
    })
    .join("\n");
  return `// Full generated panel-and-closure assembly preview. Do not print as one part.
${closureUses}
panel_w=${scadNumber(project.panelProfile.dimensions.width)};
panel_h=${scadNumber(project.panelProfile.dimensions.height)};
panel_t=${scadNumber(project.panelProfile.dimensions.thickness)};

${closures}
${panels}
`;
}

export async function emitPanelClosureCadArtifacts(
  project: PanelAssemblyProject,
  options: { rootDirectory?: string; outputDirectory?: string } = {},
): Promise<EmitPanelClosureCadResult> {
  const rootDirectory = resolve(options.rootDirectory ?? process.cwd());
  const outputDirectory = resolve(
    options.outputDirectory ??
      resolve(rootDirectory, "build", "generated", project.sculpture.id, "cad"),
  );
  const assembly = compilePanelAssembly(project);
  const closureParts = groupedClosureFaces(assembly);
  await mkdir(outputDirectory, { recursive: true });
  const closurePaths: Record<string, string> = {};
  await Promise.all(
    closureParts.map(async ({ partId, regions }) => {
      const path = resolve(outputDirectory, `closure-${partId.toLowerCase()}.scad`);
      closurePaths[partId] = path;
      await writeFile(path, closureSource(project, assembly, regions), "utf8");
    }),
  );
  const assemblyPreview = resolve(outputDirectory, "assembly-preview.scad");
  await writeFile(
    assemblyPreview,
    assemblyPreviewSource(project, assembly, outputDirectory),
    "utf8",
  );
  const parts: GeneratedClosurePart[] = closureParts.map(({ partId, regions }) => ({
    id: `closure-${partId.toLowerCase()}`,
    closureFaceId: partId,
    quantity: 1,
    entrypoint: `closure-${partId.toLowerCase()}.scad`,
    outputStl: `closure-${partId.toLowerCase()}.stl`,
    connectorPanelIds: regions.flatMap((face) => face.connectors.map((connector) => connector.panelId)),
    connectorHoleIds: regions.flatMap((face) => face.connectors.map((connector) => connector.panelHoleId)),
    status: "prototype-unvalidated",
  }));
  const faceRoleById = new Map(
    assembly.faces.map((face) => [face.id, face.role]),
  );
  const closureButtSeamCount = assembly.edges.filter((edge) =>
    edge.faceIds.every((faceId) => faceRoleById.get(faceId) === "closure"),
  ).length;
  const manifest: GeneratedPanelClosureManifest = {
    schemaVersion: "1.0.0",
    sculptureId: project.sculpture.id,
    source: project.source,
    mechanicalStatus: "prototype-unvalidated",
    topology: assembly.counts,
    parts,
    assemblyPreview: "assembly-preview.scad",
    warnings: [
      "Every tab is centered on a real PCB mounting hole, but installed electrical keep-outs remain provisional.",
      ...(closureButtSeamCount > 0
        ? [
            `${closureButtSeamCount} closure-to-closure edges are clean butt seams without direct fasteners.`,
          ]
        : []),
      "Print and inspect one closure fit coupon before producing the complete set.",
    ],
  };
  const manifestPath = resolve(outputDirectory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return {
    outputDirectory,
    manifestPath,
    manifest,
    entrypointPaths: { closures: closurePaths, assemblyPreview },
  };
}
