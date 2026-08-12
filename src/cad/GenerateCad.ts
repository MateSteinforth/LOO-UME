import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import type {
  PanelHardwareProfile,
  SculptureDefinition,
} from "../sculpture/Definition.ts";
import type { PanelAssemblyProject } from "../sculpture/PanelAssembly.ts";

export interface ManualCadProject {
  sculpture: Pick<SculptureDefinition, "id" | "centerPanelMount" | "openings">;
  panelProfile: PanelHardwareProfile;
}

export function createManualCadProject(
  project: PanelAssemblyProject,
): ManualCadProject {
  const mechanics = project.sculpture.manualMechanics;
  if (!mechanics) {
    throw new Error("Sculpture does not declare manually authored mechanics.");
  }
  if (mechanics.compatibilityStatus === "requires-review") {
    throw new Error(
      "Manually authored mechanics require review after panel edits and cannot be emitted as verified wrappers.",
    );
  }
  return {
    sculpture: {
      id: project.sculpture.id,
      centerPanelMount: mechanics.centerPanelMount as unknown as SculptureDefinition["centerPanelMount"],
      openings: mechanics.openings as unknown as SculptureDefinition["openings"],
    },
    panelProfile: project.panelProfile,
  };
}

export interface GeneratedCadArtifact {
  id: string;
  kind: "closure";
  faceType: "triangle" | "pentagon";
  quantity: number;
  entrypoint: string;
  canonicalSource: string;
  modes: Record<string, string>;
}

export interface GeneratedCadAssembly {
  id: string;
  faceType: "pentagon";
  quantity: number;
  entrypoint: string;
  parts: string[];
  preview: "center-and-five-outer-panels";
}

export interface GeneratedCadManifest {
  schemaVersion: "1.0.0";
  sculptureId: string;
  source: string;
  artifacts: GeneratedCadArtifact[];
  assemblies: GeneratedCadAssembly[];
}

export interface EmitCadOptions {
  rootDirectory?: string;
  outputDirectory?: string;
}

export interface EmitCadResult {
  outputDirectory: string;
  entrypointPath: string;
  entrypointPaths: {
    triangle: string;
    pentagonUFrame: string;
    middlePanelConnector: string;
    pentagonAssembly: string;
  };
  manifestPath: string;
  manifest: GeneratedCadManifest;
}

function scadNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Cannot emit a non-finite SCAD value.");
  return Object.is(value, -0) ? "0" : String(value);
}

function scadIncludePath(fromFile: string, targetFile: string): string {
  const path = relative(dirname(fromFile), targetFile).split(sep).join("/");
  if (path.includes(">")) throw new Error("OpenSCAD include paths cannot contain >.");
  return path;
}

export function createTriangleClosureEntrypoint(
  project: ManualCadProject,
  entrypointPath: string,
  rootDirectory = process.cwd(),
): string {
  const opening = project.sculpture.openings.triangleFaces;
  const closure = opening.closure;
  const panel = project.panelProfile;
  const panelInterface = closure.interfaces[0];
  if (!panelInterface) throw new Error("Triangle closure has no panel interface.");

  const canonicalPath = resolve(rootDirectory, closure.canonicalSource);
  const includePath = scadIncludePath(entrypointPath, canonicalPath);

  return `// Generated from sculptures/rhombicosidodecahedron/sculpture.json.
// Do not edit this artifact; edit the JSON policy or canonical part instead.
// The wrapper deliberately reuses the physically tested geometry and fails if
// its public fit constants drift from the central hardware/interface contract.

include <${includePath}>;

assert(triangle_handedness == ${closure.handedness}, "triangle_handedness differs from sculpture.json");
assert(triangle_panel_edge == ${scadNumber(panel.dimensions.height)}, "triangle panel edge differs from the panel profile");
assert(panel_depth == ${scadNumber(panel.dimensions.width)}, "triangle panel depth differs from the panel profile");
assert(panel_thickness == ${scadNumber(panel.dimensions.thickness)}, "PCB thickness differs from the panel profile");
assert(hole_from_corner == ${scadNumber(panel.mounting.cornerHoleInset)}, "corner-hole inset differs from the panel profile");
assert(pilot_hole_d == ${scadNumber(panel.mounting.printedPilotDiameter)}, "pilot diameter differs from the panel profile");
assert(screw_bevel_entry_d == ${scadNumber(panel.mounting.screwLeadIn.diameter)}, "lead-in diameter differs from the panel profile");
assert(screw_bevel_depth == ${scadNumber(panel.mounting.screwLeadIn.depth)}, "lead-in depth differs from the panel profile");
assert(hole_edge_correction == ${scadNumber(panel.mounting.physicalCorrections.holeEdge)}, "tested hole-edge correction differs from the panel profile");
assert(surface_flush_correction == ${scadNumber(panel.mounting.physicalCorrections.surfaceFlush)}, "tested surface-flush correction differs from the panel profile");
assert(connector_corner_clearance == ${scadNumber(panelInterface.connectorCornerClearance)}, "connector-corner clearance differs from the opening interface");
assert(panel_envelope_clearance_xy == ${scadNumber(panelInterface.panelEnvelopeClearance)}, "PCB-envelope clearance differs from the opening interface");
`;
}

export function createPentagonUFrameEntrypoint(
  project: ManualCadProject,
  entrypointPath: string,
  rootDirectory = process.cwd(),
): string {
  const closure = project.sculpture.openings.pentagonFaces.closure;
  const part = closure.parts[0];
  const panel = project.panelProfile;
  const includePath = scadIncludePath(
    entrypointPath,
    resolve(rootDirectory, part.canonicalSource),
  );

  return `// Generated from the populated-pentagon closure in sculpture.json.
// Reuses the physically tested U-frame and guards its public fit constants.

include <${includePath}>;

assert(print_quantity == ${part.quantity}, "U-frame quantity differs from sculpture.json");
assert(open_outer_edge == ${closure.openOuterEdge}, "open outer edge differs from sculpture.json");
assert(pentagon_panel_edge == ${scadNumber(panel.dimensions.width)}, "outer panel edge differs from the panel profile");
assert(outer_panel_depth == ${scadNumber(panel.dimensions.height)}, "outer panel depth differs from the panel profile");
assert(panel_thickness == ${scadNumber(panel.dimensions.thickness)}, "PCB thickness differs from the panel profile");
assert(outer_hole_from_corner == ${scadNumber(panel.mounting.cornerHoleInset)}, "outer corner-hole inset differs from the panel profile");
assert(outer_to_middle_hole == ${scadNumber(panel.mounting.middleHoleOffsetFromOuter)}, "middle-hole spacing differs from the panel profile");
assert(pilot_hole_d == ${scadNumber(panel.mounting.printedPilotDiameter)}, "outer pilot diameter differs from the panel profile");
assert(screw_leadin_d == ${scadNumber(panel.mounting.screwLeadIn.diameter)}, "outer lead-in diameter differs from the panel profile");
assert(screw_leadin_depth == ${scadNumber(panel.mounting.screwLeadIn.depth)}, "outer lead-in depth differs from the panel profile");
assert(hole_edge_correction == ${scadNumber(panel.mounting.physicalCorrections.holeEdge)}, "tested hole-edge correction differs from the panel profile");
assert(surface_flush_correction == ${scadNumber(panel.mounting.physicalCorrections.surfaceFlush)}, "tested surface-flush correction differs from the panel profile");
assert(center_panel_rotation == ${scadNumber(project.sculpture.centerPanelMount.rotationDegrees)}, "center-panel rotation differs from sculpture.json");
assert(center_panel_offset_x == ${scadNumber(project.sculpture.centerPanelMount.offsetX)}, "center-panel X offset differs from sculpture.json");
assert(center_panel_offset_y == ${scadNumber(project.sculpture.centerPanelMount.offsetY)}, "center-panel Y offset differs from sculpture.json");
assert(center_panel_recess == ${scadNumber(project.sculpture.centerPanelMount.recess)}, "center-panel recess differs from sculpture.json");
assert(center_panel_clearance == ${scadNumber(part.interfaces.centerPanelClearance)}, "center-panel clearance differs from sculpture.json");
assert(center_connector_corner_clearance == ${scadNumber(part.interfaces.connectorCornerClearance)}, "connector-corner clearance differs from sculpture.json");
`;
}

export function createMiddlePanelConnectorEntrypoint(
  project: ManualCadProject,
  entrypointPath: string,
  rootDirectory = process.cwd(),
): string {
  const part = project.sculpture.openings.pentagonFaces.closure.parts[1];
  const panel = project.panelProfile;
  const includePath = scadIncludePath(
    entrypointPath,
    resolve(rootDirectory, part.canonicalSource),
  );

  return `// Generated from the populated-pentagon closure in sculpture.json.
// Reuses the physically tested middle connector and guards its fit constants.

include <${includePath}>;

assert(print_quantity == ${part.quantity}, "middle-connector quantity differs from sculpture.json");
assert(panel_thickness == ${scadNumber(panel.dimensions.thickness)}, "PCB thickness differs from the panel profile");
assert(pilot_hole_d == ${scadNumber(panel.mounting.printedPilotDiameter)}, "pilot diameter differs from the panel profile");
assert(screw_leadin_d == ${scadNumber(panel.mounting.screwLeadIn.diameter)}, "lead-in diameter differs from the panel profile");
assert(screw_leadin_depth == ${scadNumber(panel.mounting.screwLeadIn.depth)}, "lead-in depth differs from the panel profile");
assert(center_panel_w == ${scadNumber(panel.dimensions.width)}, "center-panel width differs from the panel profile");
assert(center_panel_h == ${scadNumber(panel.dimensions.height)}, "center-panel height differs from the panel profile");
assert(center_panel_rotation == ${scadNumber(project.sculpture.centerPanelMount.rotationDegrees)}, "center-panel rotation differs from sculpture.json");
assert(center_panel_offset_x == ${scadNumber(project.sculpture.centerPanelMount.offsetX)}, "center-panel X offset differs from sculpture.json");
assert(center_panel_offset_y == ${scadNumber(project.sculpture.centerPanelMount.offsetY)}, "center-panel Y offset differs from sculpture.json");
assert(center_panel_recess == ${scadNumber(project.sculpture.centerPanelMount.recess)}, "center-panel recess differs from sculpture.json");
assert(center_hole_edge_distance == ${scadNumber(part.interfaces[0]!.edgeDistance)}, "center interface differs from sculpture.json");
assert(outer_hole_edge_distance == ${scadNumber(part.interfaces[1]!.edgeDistance)}, "outer interface differs from sculpture.json");
`;
}

export function createPentagonAssemblyEntrypoint(
  project: ManualCadProject,
  entrypointPath: string,
  rootDirectory = process.cwd(),
): string {
  const closure = project.sculpture.openings.pentagonFaces.closure;
  const uFramePath = scadIncludePath(
    entrypointPath,
    resolve(rootDirectory, closure.parts[0].canonicalSource),
  );
  const connectorPath = scadIncludePath(
    entrypointPath,
    resolve(rootDirectory, closure.parts[1].canonicalSource),
  );

  return `// Generated populated-pentagon assembly preview. Do not print.
use <${uFramePath}>;
use <${connectorPath}>;

color([0.85, 0.28, 0.12, 1.0]) pentagon_u_part();
color([0.88, 0.18, 0.48, 1.0]) middle_panel_connector_part();
color([0.08, 0.08, 0.08, 0.48]) pentagon_u_outer_panel_previews();
color([0.10, 0.10, 0.10, 0.75]) pentagon_u_center_panel_preview();
`;
}

export async function emitCadArtifacts(
  project: ManualCadProject,
  options: EmitCadOptions = {},
): Promise<EmitCadResult> {
  const rootDirectory = resolve(options.rootDirectory ?? process.cwd());
  const outputDirectory = resolve(
    options.outputDirectory ??
      resolve(rootDirectory, "build", "generated", project.sculpture.id),
  );
  const triangleClosure = project.sculpture.openings.triangleFaces.closure;
  const pentagonClosure = project.sculpture.openings.pentagonFaces.closure;
  await Promise.all([
    access(resolve(rootDirectory, triangleClosure.canonicalSource)),
    ...pentagonClosure.parts.map((part) =>
      access(resolve(rootDirectory, part.canonicalSource)),
    ),
  ]);
  await mkdir(outputDirectory, { recursive: true });

  const entrypointPaths = {
    triangle: resolve(outputDirectory, triangleClosure.generatedFile),
    pentagonUFrame: resolve(
      outputDirectory,
      pentagonClosure.parts[0].generatedFile,
    ),
    middlePanelConnector: resolve(
      outputDirectory,
      pentagonClosure.parts[1].generatedFile,
    ),
    pentagonAssembly: resolve(
      outputDirectory,
      pentagonClosure.assembly.generatedFile,
    ),
  };
  await Promise.all([
    writeFile(
      entrypointPaths.triangle,
      createTriangleClosureEntrypoint(
        project,
        entrypointPaths.triangle,
        rootDirectory,
      ),
      "utf8",
    ),
    writeFile(
      entrypointPaths.pentagonUFrame,
      createPentagonUFrameEntrypoint(
        project,
        entrypointPaths.pentagonUFrame,
        rootDirectory,
      ),
      "utf8",
    ),
    writeFile(
      entrypointPaths.middlePanelConnector,
      createMiddlePanelConnectorEntrypoint(
        project,
        entrypointPaths.middlePanelConnector,
        rootDirectory,
      ),
      "utf8",
    ),
    writeFile(
      entrypointPaths.pentagonAssembly,
      createPentagonAssemblyEntrypoint(
        project,
        entrypointPaths.pentagonAssembly,
        rootDirectory,
      ),
      "utf8",
    ),
  ]);

  const manifest: GeneratedCadManifest = {
    schemaVersion: "1.0.0",
    sculptureId: project.sculpture.id,
    source: "sculptures/rhombicosidodecahedron/sculpture.json",
    artifacts: [
      {
        id: triangleClosure.partId,
        kind: "closure",
        faceType: "triangle",
        quantity: triangleClosure.quantity,
        entrypoint: triangleClosure.generatedFile,
        canonicalSource: triangleClosure.canonicalSource,
        modes: triangleClosure.modes,
      },
      {
        id: pentagonClosure.parts[0].partId,
        kind: "closure",
        faceType: "pentagon",
        quantity: pentagonClosure.parts[0].quantity,
        entrypoint: pentagonClosure.parts[0].generatedFile,
        canonicalSource: pentagonClosure.parts[0].canonicalSource,
        modes: pentagonClosure.parts[0].modes,
      },
      {
        id: pentagonClosure.parts[1].partId,
        kind: "closure",
        faceType: "pentagon",
        quantity: pentagonClosure.parts[1].quantity,
        entrypoint: pentagonClosure.parts[1].generatedFile,
        canonicalSource: pentagonClosure.parts[1].canonicalSource,
        modes: pentagonClosure.parts[1].modes,
      },
    ],
    assemblies: [
      {
        id: pentagonClosure.assemblyId,
        faceType: "pentagon",
        quantity: pentagonClosure.quantity,
        entrypoint: pentagonClosure.assembly.generatedFile,
        parts: pentagonClosure.parts.map((part) => part.partId),
        preview: pentagonClosure.assembly.preview,
      },
    ],
  };
  const manifestPath = resolve(outputDirectory, "cad-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    outputDirectory,
    entrypointPath: entrypointPaths.triangle,
    entrypointPaths,
    manifestPath,
    manifest,
  };
}
