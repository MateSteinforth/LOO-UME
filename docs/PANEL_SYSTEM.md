# Panel system

## Authoritative model

Active projects use Schema `2.0.0` from `src/sculpture/PanelAssembly.ts`.
`panels[].pose` is the authoritative installed transform:

- `position`: panel centre in world millimetres.
- `orientation.xAxis`: panel-local horizontal direction.
- `orientation.yAxis`: panel-local vertical direction.
- `orientation.normal`: outward-facing local Z direction.

The axes must be finite, unit length, mutually perpendicular, and right-handed
(`xAxis × yAxis = normal`). Mechanical faces and GLB attachments locate or
constrain panels but never calculate over a saved pose.

Supporting fields include `surfaceAttachment` (mesh triangle, barycentric
coordinates, offset), `mountFaceId` (current generated mechanics),
`neighborPanelIds` (adjacency routing), and `rotationDegrees`/`mirrored`
(installed facts, currently mostly unknown). UI selection is transient.

## Active hardware profile

`catalog/panels/ws2812b-8x8-66x65.json` defines the shared WS2812B PCB:

| Fact | Current value |
| --- | --- |
| PCB | 66 × 65 × 0.8 mm |
| LED grid | 8 × 8, 64 emitters |
| Mounting holes | six total; four mechanically eligible |
| Blocked holes | bottom-left by DIN; top-right by DOUT (back view) |
| Fastener / printed pilot | M2 / 1.6 mm |
| Screw lead-in | 3.2 mm diameter × 0.7 mm deep |
| Proven corrections | 0.20 mm hole-edge; 0.50 mm surface-flush |

Treat these as working physical facts. Exact electrical pad/keep-out geometry,
power topology, and numbered-test pixel-order confirmation remain incomplete.
Never use a blocked hole for a structural tab.

## Placement and editing

The editor creates panels in three ways:

1. A click on an active GLB or JSON shell surface saves a deterministic ID,
   world pose, triangle index, barycentric coordinates, and normal offset. It
   does not invent a mechanical face assignment.
2. “Add to face” fits a panel into a supported convex planar closure face,
   replaces that face with a panel opening, and partitions the remaining ring
   into closure regions.
3. Automatic placement samples indexed mesh triangles by area and uses
   deterministic farthest-point selection until the target count is reached.
   Existing panels remain; new panels go to the currently shortest provisional
   output. This is placement only and does not promise CAD fit.

Selected panels can move across the active surface, move in saved local XY,
rotate around local Z, or be deleted. Selection, LED/panel/label focus,
wiring/connectors, gizmo, and delete control share one selected panel ID. Edits
rebuild mapping and wiring immediately.

After an edit:

- Generated mechanics retain `mechanicalShell.authoringBoundary`, set
  `derivationStatus` to `requires-regeneration`, and hide stale previews.
- Manual mechanics set `manualMechanics.compatibilityStatus` to
  `requires-review`; tested parts must not be presented as matching new poses.

The agreed mechanics-free workflow extends this behavior: a project with no
mechanics still supports every normal editor, simulator, mapping, wiring, save,
and reload action. If referenced generated parts exist, an edit makes them
stale; it does not require a shell to exist and does not disable the interface.

## Mechanical routes

### Manual 41-panel sculpture

The canonical, printed geometry is:

- `parts/triangle.scad`: 20 triangular fillers, handedness `-1`.
- `parts/pentagon_u.scad`: 11 U-frames.
- `parts/middle_panel_connector.scad`: 11 two-screw connectors.

The sculpture has 30 square-face panels and 11 panels in pentagonal openings;
the north-pole pentagon remains open. Established geometry includes centre-panel
rotation 234°, offset `(9.62, -7.04)` mm, recess 0.70 mm, inside
square/pentagon angle 148.282526°, and small fold 31.717474°. The generic
generator does not reproduce this assembly.

### Generic planar closures

The generic path accepts a closed two-manifold explicit planar face graph. It
uses panel poses and real hole coordinates; generates inward-growing flat covers
with tabs, lips, pilot holes, lead-ins, and gussets; subtracts PCB envelope
space; clips to the polyhedron interior; and groups coplanar regions by
`partId`.

Regeneration/compilation checks the stable boundary, face planarity and
convexity, outward winding/normal alignment, panel surface position, the full
PCB rectangle plus clearance, one panel per face, complete eligible-hole
allocation, blocked-hole avoidance, and flat grouped parts. Do not assume JSON
already marked `authored` passed every editor-regeneration check.

Supported checked-in examples:

| Project | Panels | Generic printable result |
| --- | ---: | --- |
| Empty cuboctahedron | 0 | Authoring boundary awaiting panels |
| Cuboctahedron | 6 | 8 triangular closures |
| Automatic rhombicosidodecahedron | 30 | 20 triangle + 12 pentagon closures |
| Truncated octahedron | 6 | 8 hexagon closures |

Some truncated-octahedron closure edges are unfastened butt seams; this is a
known limitation, not missing geometry. Generic parts are iterative fabrication
output and still require print/fit inspection.

### Planned panel-outline boundary generation

The target **Generate 3D Parts** flow does not require a mechanical boundary
before panel placement. It derives exact rectangular panel outlines from the
saved poses, identifies the gaps between them, and closes each gap with one flat
simple N-gon. The user is responsible for arranging panels so this is possible.
The software is responsible for proving planarity and producing a closed,
consistently wound, non-self-intersecting, two-manifold boundary.

Only a valid boundary proceeds to part splitting, thickness, PCB-envelope
subtraction, mounting-hole allocation, connector keep-outs, and STL generation.
The exact STL outputs are referenced by the project JSON and loaded in Three.js.
The design GLB may guide placement and topology suggestions but is not copied or
thickened into printable structure.

See [`MECHANICS_WORKFLOW.md`](MECHANICS_WORKFLOW.md) for the complete target
workflow, asset bundle, staleness rules, and acceptance journey.

## Mechanical invariants

- Do not change proven polyhedron panel angles unless explicitly requested.
- No printable material may intersect a PCB preview/envelope.
- Keep DIN, DOUT, V+, and V- corners unobstructed.
- Keep outside filler surfaces flat-printable and centre structures inside the
  pentagon boundary.
- Preserve rounded screw-tab language and triangle handedness.
- Before automatic structure generation, validate the complete panel rectangle
  and clearance, not merely its centre point.
- Validate every generated cap as a flat simple N-gon and validate the combined
  panel/cap boundary as closed and two-manifold before making printable parts.
- Display the exact generated STL assets; do not call an approximate Three.js
  reconstruction the printable result.
