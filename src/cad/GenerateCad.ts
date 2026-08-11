import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import type { SculptureProject } from "../sculpture/Definition.ts";

export interface GeneratedCadArtifact {
  id: string;
  kind: "closure";
  faceType: "triangle";
  quantity: number;
  entrypoint: string;
  canonicalSource: string;
  modes: {
    print: "print";
    assembly: "assembly";
  };
}

export interface GeneratedCadManifest {
  schemaVersion: "1.0.0";
  sculptureId: string;
  source: string;
  artifacts: GeneratedCadArtifact[];
}

export interface EmitCadOptions {
  rootDirectory?: string;
  outputDirectory?: string;
}

export interface EmitCadResult {
  outputDirectory: string;
  entrypointPath: string;
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
  project: SculptureProject,
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

export async function emitCadArtifacts(
  project: SculptureProject,
  options: EmitCadOptions = {},
): Promise<EmitCadResult> {
  const rootDirectory = resolve(options.rootDirectory ?? process.cwd());
  const outputDirectory = resolve(
    options.outputDirectory ??
      resolve(rootDirectory, "build", "generated", project.sculpture.id),
  );
  const closure = project.sculpture.openings.triangleFaces.closure;
  const canonicalPath = resolve(rootDirectory, closure.canonicalSource);
  await access(canonicalPath);
  await mkdir(outputDirectory, { recursive: true });

  const entrypointPath = resolve(outputDirectory, closure.generatedFile);
  const entrypoint = createTriangleClosureEntrypoint(
    project,
    entrypointPath,
    rootDirectory,
  );
  await writeFile(entrypointPath, entrypoint, "utf8");

  const manifest: GeneratedCadManifest = {
    schemaVersion: "1.0.0",
    sculptureId: project.sculpture.id,
    source: "sculptures/rhombicosidodecahedron/sculpture.json",
    artifacts: [
      {
        id: closure.partId,
        kind: "closure",
        faceType: "triangle",
        quantity: closure.quantity,
        entrypoint: closure.generatedFile,
        canonicalSource: closure.canonicalSource,
        modes: closure.modes,
      },
    ],
  };
  const manifestPath = resolve(outputDirectory, "cad-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return { outputDirectory, entrypointPath, manifestPath, manifest };
}
