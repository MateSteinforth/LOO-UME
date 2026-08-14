# Pose-first sculpture schema

Processed sculptures use `schemas/panel-assembly.schema.json` version `2.0.0`.
The authored panel poses are the placement source of truth. The compiler does
not reconstruct a panel transform from a named solid, face center, or rotation
recipe.

```json
{
  "schemaVersion": "2.0.0",
  "panelProfile": {
    "id": "ws2812b-8x8-66x65",
    "source": "../../catalog/panels/ws2812b-8x8-66x65.json"
  },
  "panels": [
    {
      "id": "P-01",
      "mountFaceId": "SQ-01",
      "pose": {
        "position": [0, 46.24478349, 0],
        "orientation": {
          "xAxis": [-0.7071067811865475, 0, 0.7071067811865475],
          "yAxis": [0.7071067811865475, 0, 0.7071067811865475],
          "normal": [0, 1, 0]
        }
      }
    }
  ],
  "mechanicalShell": {
    "kind": "explicit-planar-face-graph",
    "vertices": [],
    "faces": []
  }
}
```

## Pose convention

- All numbers use the sculpture's millimetre world coordinate system.
- `position` is the PCB center.
- `xAxis` and `yAxis` are the panel profile's local axes in world space.
- `normal` is local +Z and points outward from the finished sculpture.
- The three orientation vectors must be finite, unit length, mutually
  perpendicular, and right-handed (`xAxis × yAxis = normal`).

An explicit basis avoids Euler-angle ambiguity and maps directly to the first
three columns of a Three.js `Matrix4`. A browser editor can use a quaternion
internally, but it loads and saves the basis in the sculpture JSON.

An in-plane panel rotation is a rotation around local Z, which is the saved
`normal`. It must rotate `xAxis` and `yAxis` together while preserving
`position`, `normal`, and the surface attachment. The selected-panel gizmo
implements this operation. The saved basis is authoritative, and mapping and
wiring refresh after each rotation.

`surfaceAttachment.surface` identifies the authoring mesh. `mechanical-shell` uses
the face graph already embedded in sculpture JSON, so add and drag sessions resume
from JSON alone. `design-surface` uses the optional external GLB reference; legacy
attachments without this field also mean the GLB design surface. The GLB stays
external and is protected by its saved relative path, scale, and SHA-256 hash.

`mountFaceId` is a mechanical association used by the current closure
generator. It identifies which face of `mechanicalShell` the panel borders, but
does not determine its position or orientation. This separation lets the
placement editor move a panel without silently having its pose regenerated. A
new panel created directly on a design surface has no `mountFaceId`: this is
valid only while it has a surface attachment and `mechanicalShell.derivationStatus`
is `requires-regeneration`. Pose-based simulation and provisional wiring remain
available, while mechanical compilation and CAD stay blocked until a real face
topology is regenerated.

## Panel profiles

Panel dimensions, holes, blocked DIN/DOUT corners, pixel traversal, connector
locations, and electrical facts remain in a separate panel-profile JSON. The
`panelProfile.source` path is resolved relative to the sculpture JSON in both
the Node pipeline and the web simulator. The loaded profile's `id` must match
the reference, so changing panel hardware is a JSON-level project choice.

The current schema intentionally selects one panel profile per project. A
future schema can add per-panel profile IDs when mixed hardware is supported by
CAD, wiring, and WLED addressing end to end.

## Mechanics-free projects and portable asset references

A project may omit `manualMechanics`, `mechanicalShell`, and `closures`. Such a
project loads, edits, simulates, maps, wires, saves, and reloads. A panel pose
does not require `mountFaceId` or a surface attachment; those fields describe
optional authoring/mechanical relationships rather than the panel's existence.
The browser does not create a placeholder shell. When served by the local
desktop or Vite host, a mechanics-free project with panels may enter generic
3D-part generation: if its exposed panel-outline graph is unambiguous, the
generator detects and persists the missing boundary connectivity before
validation. A missing or invalid optional GLB disables surface placement without
invalidating the project.

`boundaryTopology.kind = "panel-outline-gap-cycles"` stores that connectivity.
Each gap has a stable content-derived ID and an ordered `vertices` array of
`{ panelId, corner }` references, where `corner` is `bottom-left`,
`bottom-right`, `top-right`, or `top-left`. It stores no positions, dimensions,
or transforms. All corner coordinates are recomputed from the resolved profile
and authoritative panel poses. When the field is absent, local generation
detects only an unambiguous set of exposed-edge cycles, canonicalizes and sorts
them deterministically, and writes them into the generated Schema 2 JSON.
Open, wrongly wound, non-manifold, or ambiguous edge graphs fail instead of
persisting a guess.

`designSurface` preserves the existing GLB `source` plus `sha256` reference.
`generatedMechanics` uses the same project-relative identity pair for one
closed-boundary STL and an ordered list of exact printable STL parts with stable
IDs. It also records generator identity/version, successful generation and
validation status, and the SHA-256 fingerprint of the authoritative panel poses
and relevant resolved profile facts that produced the assets. The complete JSON
example and canonical fingerprint inputs are defined in
[`MECHANICS_WORKFLOW.md`](MECHANICS_WORKFLOW.md).

Part generation preserves the safe `designSurface.source`. The browser sends
only those verified GLB bytes with the JSON in a bounded multipart request. The
JSON field is limited to 5 MB and the complete request is limited to 64 MB. The
server verifies the hash before rendering or staging, copies the exact GLB to
the unchanged relative path, verifies the staged copy, and atomically publishes
the GLB with the STL files and JSON. The generated folder opens directly and can
become a ZIP without external asset injection. Missing, tampered, or reserved
paths fail before rendering.

The generated manifest is the only authority for its asset identities. Its
fingerprint comparison is the only authority for current versus stale; no
second status flag is saved. Asset paths must be safe portable relative paths,
and temporary `build/editor-projects/...` paths are rejected. The native layout
is a folder containing `sculpture.json` and referenced assets; ZIP is a
portable container for the same layout. See
[`MECHANICS_WORKFLOW.md`](MECHANICS_WORKFLOW.md).

## Mechanical regeneration contract

The optional GLB is only a positioning canvas. Its triangles never define wall
thickness, seams, clipping, segmentation, or printable material, and the GLB is
never exported as CAD. Run can regenerate mechanics only when every edited pose
matches exactly one face of the saved planar JSON authoring boundary.

Before the first surface edit, the editor captures that stable, uncut boundary
as `mechanicalShell.authoringBoundary`. It also records the authored panel poses
so unchanged, physically established panel/face associations remain compatible.
An edited panel must pass the stricter rule: its complete profile rectangle plus
`panelEnvelopeClearance` must lie inside one convex planar boundary face.

Regeneration replaces that face with an explicit panel opening and coplanar
filler regions. Regions sharing `partId` are one flat-printable part; their
OpenSCAD covers are unioned before the established real-hole tabs and cutters
are applied. The outside polygons are the mechanical boundary and
`closures.coverThickness` grows inward from them.

Generation blocks when the JSON boundary is open, non-two-manifold, concave, or
non-planar; when a pose is off-plane, ambiguous, crosses a boundary, or shares a
face with another panel; when a grouped part is not coplanar; or when the
existing connector compiler cannot safely allocate every eligible mounting
hole. Blocked DIN/DOUT corners are never candidates. The measured 0.20 mm pilot
correction, 0.50 mm flush correction, 1.6 mm pilot, and 3.2 mm by 0.7 mm lead-in
continue to come from the panel profile.

This first implementation supports one panel per convex planar JSON face.
Curved mechanical thickening, arbitrary GLB mesh segmentation, and automatic
panel distribution remain unsupported.

The complete implemented editor and CAD behavior, including whole-face regions,
zero-panel authoring projects, blocking checks, and OpenSCAD verification, is
recorded in
[Editor and planar mechanical regeneration](editor-mechanical-regeneration.md).

The panel-outline route creates the boundary after panel editing by joining
exact panel outlines with validated flat N-gon caps. It automatically detects
and persists only unambiguous gap cycles, then passes only a closed,
two-manifold result to printable-part generation. The editor does not yet let
the user inspect, confirm, reorder, or redraw candidate gap topology, so an
ambiguous layout stops with an error. The GLB remains a positioning canvas and
is not converted into that boundary or used to detect topology. Local
generation copies its verified bytes only as the unchanged authoring asset in
the atomically published project folder.

The production desktop host and Vite development adapter share the same local
generator-status and pipeline handler. Repository-local setup installs the
pinned OpenSCAD tool on the current required Linux and macOS targets and
provides a Windows x86-64 candidate. Windows client qualification is deferred
and does not block installation proof for the required targets.
Unavailable or wrong-version status disables only generation, and the host must
restart after installation or repair. No schema state records generator
availability.

## Manually authored mechanics

Pose-first mapping and wiring do not require generated closure topology. A sculpture
with physically established parts may provide `manualMechanics` instead of
`mechanicalShell` and `closures`. Its panels need explicit `faceType` values but do
not need `mountFaceId` values. The simulator compiles LED positions, logical order,
and provisional wiring directly from the poses while omitting generated closure,
mount, and surface layers. Generic closure compilation must reject this branch; the
manual contract names the verified SCAD-wrapper generator and retains its tested
centre-panel and opening policies.

This is the authoritative path for the manual 41-panel rhombicosidodecahedron. It
does not reinterpret the U-frames, middle connectors, or triangle fillers as
automatically generated caps.

## Mechanical shell

The current printable closure algorithm still needs a closed, planar,
two-manifold face graph. It uses `mechanicalShell` for:

- closure boundaries and exterior clipping;
- panel-to-closure and closure-to-closure adjacency;
- assigning eligible mounting holes to different neighboring closures; and
- assembly surface previews.

The panel envelope, hole positions, LEDs, DIN/DOUT markers, and wiring nodes use
the explicit pose. A later arbitrary-placement connector generator may replace
the shell association without changing the panel pose representation.

## Editor-generated connector policies

The default mechanical invariant remains one distinct neighboring closure per
eligible screw hole and at least three panel-hole connectors per closure. When the
browser editor insets a panel into a face with only three populated neighbors,
those defaults are geometrically impossible: four usable holes must connect through
three anchored strip sectors. The editor records two explicit, reason-bearing
exceptions in the saved JSON rather than weakening the defaults globally:

- `panels[].connectorPolicy.allowSharedClosureAcrossAdjacentEdges` permits one
  strip closure to serve two adjacent holes on that panel; and
- `mechanicalShell.faces[].connectorPolicy.minimumPanelHoleConnectors` permits a
  generated strip closure to use two connectors instead of three.

The runtime parser and JSON Schema accept only the defined literal exception values.
Unmarked panels and closure faces continue to use the proven stricter checks.
Concave inset sectors use ear-clipping for the exterior clipping polyhedron; existing
convex sculptures keep their byte-identical fan triangulation.

## Migration equivalence

The cuboctahedron, automatic rhombicosidodecahedron, and truncated octahedron
were migrated by evaluating their former face-derived transforms once and
writing those transforms into `panels[].pose`. Permanent tests compare the new
pipeline against hashes captured before migration:

- generated closure SCAD and CAD manifests are byte-identical;
- WLED maps and mapping fingerprints are byte-identical; and
- compiled panel positions are equal to the authored JSON positions.

Only generated descriptive metadata changes from “derived from face graph” to
“compiled from explicit poses.”

Legacy schema-1.0 panel assemblies can be converted with:

```bash
npx tsx scripts/migrate-panel-assembly-to-poses.ts path/to/sculpture.json
```
