# Panel system

## Authoritative model

Active projects use Schema `2.0.0` from `src/sculpture/PanelAssembly.ts`.
`panels[].pose` is the authoritative installed transform:

- `position`: panel centre in world millimetres.
- `orientation.xAxis`: panel-local horizontal direction.
- `orientation.yAxis`: panel-local vertical direction.
- `orientation.normal`: outward-facing local Z direction.

The pose also owns physical PCB rotation around that normal. Automatic wiring
writes the selected local-Z rotation into `xAxis`/`yAxis`, so DIN/DOUT, LED
positions, tutorial cables, and fabrication share one physical frame. New
automatic results keep the separate installed-address transform at identity.
Before a generated-part manifest or manual rotation gate exists, routing can
test 0/90/180/270 degrees. A manifest or saved `half-turns-only` wiring
constraint lets routing keep the pose or add 180 degrees only.
In the explicit manual-gate/no-manifest migration, current saved poses represent
the fabricated panels; assumed legacy address turns are reset before routing.

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
| Mounting holes | six total in three columns x two rows; four mechanically eligible |
| Blocked holes | bottom-right by DIN; top-left by DOUT (back view, three-hole reference at top) |
| Fastener / printed pilot | M2 / 1.6 mm |
| Screw lead-in | 3.2 mm diameter × 0.7 mm deep |
| Proven corrections | 0.20 mm hole-edge; 0.50 mm surface-flush |

Treat these as working physical facts. Exact electrical pad/keep-out geometry,
power topology, and exact electrical pad centres remain incomplete. The
front-view straight row-major pixel order and GRB color order are measured.
The editor shows mounting rings only on the PCB back: DIN is green, DOUT is
red, and the four usable screw holes are gold.
Never use a blocked hole for a structural tab.

The two middle hole IDs are retained as `middle-left` and `middle-right` for
Schema 2 and generated-part compatibility. Their measured coordinates are the
top-middle and bottom-middle holes. Coordinates, not the legacy ID words, are
the geometry authority. The browser cuts the six 2.8 mm openings into each
virtual PCB, so the mounting pattern and DIN/DOUT orientation can be checked
from the front or back before assembly.

The profile keeps `columns × rows` as the addressable coordinate grid, but
emitter geometry can be explicit. Optional row-major `localEmitterPositions`
stores one XYZ point per grid coordinate in the authoritative pose frame. The
existing pixel-order contract still maps those coordinates to wire addresses.
Optional `dataConnectors.localPositions` stores exact pose-local DIN and DOUT
anchors.
When these fields are absent, the runtime derives the historical rectangular
grid and back-view corner anchors exactly. This compatible seam lets a flexible
1×N strip or ring use mapping, wiring, simulation, and WLED without pretending
that its LEDs form a rectangular physical carrier.

`dataConnectors.orientationReference` distinguishes the historical
`three-mounting-holes-vertical` legacy board convention,
`six-holes-three-columns-two-rows` measured flagship convention, and
`pose-local-explicit-connectors`. The latter requires explicit pose-local DIN
and DOUT positions and is suitable for carriers that do not share the legacy
mounting-hole orientation. Profile evidence remains explicit: provisional
connector assignments and physical corrections are accepted as visual-study
data, while the approved 8×8 profile keeps its measured 0.20 mm and 0.50 mm
corrections unchanged.

Carrier rendering and capability gates are described below. Dedicated
non-rectangular automatic placement and fabrication remain separate work;
explicit emitter geometry alone does not authorize rectangular placement or
print generation.

The optional `carrier` field now distinguishes three display contracts:

- absent or `rectangular`: the historical rigid width × height carrier;
- `planar-outline`: one validated simple pose-local XY polygon, with optional
  validated circular display apertures;
- `flexible-path`: a validated open or closed pose-local XYZ path with ribbon
  width and thickness.

The browser triangulates planar outlines and renders flexible paths as bounded
ribbon segments. Carrier coordinates must stay inside `dimensions`, which
remains the camera, selection, and portability envelope. Mapping, wiring,
simulation, MadMapper export, ESP32 setup, project save, and project reload are
carrier-independent.

Planar carrier apertures describe visible PCB cutouts only. They do not add
mounting or fabrication authority. The separate legacy `mounting` contract
continues to control the existing rectangular fabrication pipelines.

`sculptures/one-metre-led-ring/sculpture.json` is the tracked flexible-path
example. It models one 1,000 mm diameter hoop with 188 explicit outward-radial
emitters at approximately 60 LEDs/m, one authored chain, and GPIO 16. Its panel-profile mounting fields are
legacy compatibility data only; capability gates keep rectangular placement
and fabrication disabled. Color order, connector anchors, and power values are
provisional demo assumptions rather than physical evidence.

`sculptures/photo-wedge-panel/sculpture.json` is the tracked planar-outline
photo-study example. It represents one of the three matching wedge PCBs in the
operator photographs as one 8×8, 64-emitter GPIO 16 fixture. Its dimensions,
outline, holes, connector anchors, address order, color order, and electrical
facts are estimates. It is useful for simulation, mapping, wiring, ESP32 setup,
and portable-project exchange, but it is not manufacturing or fabrication
authority.

`sculptures/photo-wedge-panel/sculpture-30-panel.json` is the corresponding
full visual-study reconstruction. It places 30 copies on provisional
rhombic-triacontahedron face-normal directions at a 270 mm center radius and
stores a current automatic route: three equal 10-panel chains on GPIO 16, 17,
and 18. The arrangement reproduces the supplied rendering for simulation and
Project Browser review. It does not claim measured panel poses, enclosure fit,
or fabrication geometry.

`sculptures/kicad-diamond-panel/sculpture.json` is an image-derived KiCad
study. It preserves the visible six-sided board outline, one apparent 8 by 8
rhombic LED lattice, and nine circular apertures. The approximate 170 by 110 mm
envelope comes from the screenshot ruler. The exact outline, thickness,
emitter and aperture centres, DIN/DOUT positions, address order, color order,
and electrical values are provisional. The project supports simulation,
mapping, wiring, WLED setup, MadMapper export, and portable save/reload, but it
does not authorize fabrication.

The optional `radial-outward` flexible frame keeps strip thickness aligned with
the radius from its declared center and strip width perpendicular to the path
and radius. Existing flexible paths without this frame retain their original
path-normal cross-section. Explicit radial-frame emitter positions already sit
on their physical display surface, so the renderer does not add the rigid-panel
2.4 mm preview separation to them.

Automatic surface placement, planar closures, connector ribbons, and
LED-surface bridges still use rigid rectangular PCB assumptions. Their browser
controls are disabled for other carrier kinds, and the CAD entry points repeat
the same fail-closed check. Printable generation also requires measured
physical corrections; a rectangular visual-study profile can still map and be
placed, but provisional hole-edge or surface-flush values cannot authorize
fabrication. This is a capability boundary, not a claim that a flexible strip
cannot eventually receive dedicated placement or fabrication tools.

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
   A separating-axis preflight treats existing and proposed panels as oriented
   rectangular footprints and selects only non-overlapping candidates. If the
   requested count cannot fit, placement fails before mutation and reports the
   fitted count. Existing panels remain; new panels go to the currently
   shortest provisional output. This is placement only and does not promise
   CAD fit.

Selected panels have two explicit transform modes. Surface mode keeps the
existing constrained surface move, saved local-XY move without a surface, and
local-Z rotation. Free 6DOF mode shows local XYZ translation and rotation
controls. A completed free transform writes one normalized, right-handed saved
pose and removes `surfaceAttachment`, because the old triangle and barycentric
coordinates no longer describe the transformed panel. The design surface stays
available for adding panels. Selection, LED/panel/label focus,
wiring/connectors, gizmo, and delete control share one selected panel ID. Edits
rebuild mapping and wiring immediately.
The viewport does not rotate automatically. Selection keeps the panel
stationary and does not edit its pose.

After an edit:

- Generated mechanics retain `mechanicalShell.authoringBoundary`, set
  `derivationStatus` to `requires-regeneration`, and hide stale previews.

The mechanics-free workflow is implemented: a project with no mechanics still
supports every normal editor, simulator, mapping, wiring, save, and reload
action. Its panels need neither `mountFaceId` nor `surfaceAttachment`. Edits do
not call nonexistent mechanics stale or awaiting regeneration. If referenced
generated parts exist, an edit makes them stale without disabling the interface.

## Printable planar closures

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

### Structural truss route

`structuralDesign` is an optional part of the same Schema 2 sculpture JSON. It
stores material, panel mass, safety factor, displacement and fabrication
limits, installed gravity, transport-case selection, supports, and explicit
face, corner, or cable forces. It does not store panel coordinates or duplicate
the panel profile.

`normalizeStructuralDesign()` in `src/sculpture/StructuralDesign.ts` derives a
stable structural input model from the authoritative poses and profile:

- every panel has its centre, right-handed axes, exact dimensions, mass, and
  four derived outline corners;
- every mechanically eligible profile hole becomes an anchor with a stable
  `<panel-id>:<hole-id>` identity and exact world position;
- DIN/DOUT-blocked holes never become anchors;
- panel supports expand to all eligible anchors, while anchor supports constrain
  only their named eligible hole;
- installed gravity and optional world-axis transport cases have normalized
  directions; and
- face, corner, and cable forces have derived world application points.

When no structural design exists, normalization uses named preview defaults.
When no support exists, it fixes every eligible anchor on the first panel in
stable ID order and emits `NO_REAL_SUPPORTS`. This reference is only for
preview. The analysis requires real mounting conditions. Unknown electrical
pad envelopes also produce a warning; cable load points use the measured DIN
or DOUT corner until exact pad positions exist.

`generatedStructure` is a derived, hash-checked asset manifest for the later
STL, 3MF, analysis, and report pipeline. It is mutually exclusive with the
planar generated-part route. A pose, profile, support, load,
material, or fabrication change makes its fingerprint stale without disabling
editing, simulation, mapping, wiring, or save. See
[`STRUCTURAL_WORKFLOW.md`](STRUCTURAL_WORKFLOW.md).

`createCandidateTruss()` starts from all normalized eligible anchors, selects
local degree-limited panel neighbors, and keeps analytical hubs only at anchors
reserved by a connector. It applies explicit include/exclude overrides,
reserves at least two distinct anchors on each side of every panel-pair
connector, and adds a triangulated offset connector hub. Analysis-only nodes
and ties represent panel rigidity without adding print mass or self-weight. It
rejects members that intersect an expanded PCB oriented box.

The candidate is valid only when all hub nodes are connected and every member
has another graph path around it. Coincident hubs, duplicate or zero-length
edges, isolated panels, and fewer than three non-collinear eligible holes fail
with an error. Rejected collision and length candidates remain in the result as
diagnostic evidence for later reports.

`solveStructuralTruss()` maps each normalized anchor support to its rear hub
and preserves each constrained X/Y/Z translation. It distributes panel gravity
across that panel's hubs and member self-weight across member ends. A face force
is shared across all panel hubs. A corner or cable force is applied to the
nearest eligible hub because the PCB and bracket plate transfer that point
load into the axial model.

The solver reports node displacement, applied force, and reaction for every
case. It reports member axial force, tension/compression state, stress, safety-
factored yield utilization, pinned-pinned Euler buckling capacity and
utilization, and the governing case. A singular stiffness matrix or residual
failure stops analysis with an error. These results guide load paths only; they
are not engineering certification. A pipeline catches this analysis error,
records it as an unavailable advisory result, and still generates a ribbon
when the independent panel, hardware, PCB, and print checks pass.

`optimizeStructuralTruss()` uses the maximum absolute force and utilization
from all selected cases. It can remove only inter-panel candidates; panel-local
ties remain required attachments. A proposed removal must retain a connected,
bridge-free graph and must pass a maximum-diameter stiffness and strength solve.
If a complete removal batch is too weak, the optimizer restores the shortest
members by stable ID until the hard limits can be met.

Remaining members grow in the authored diameter increment. Yield needs area,
buckling needs the circular fourth-power second moment, and the global
displacement ratio scales all retained diameters. Each iteration recompiles
member self-weight. The retained trace records removal and resize decisions,
material, stress, buckling, displacement, long-compression, fragile-attachment,
and unprintable-dimension terms.

If the authored maximum diameter is not on the minimum-plus-increment grid, the
optimizer uses the largest grid value below it. A low-force ratio must be in
the interval `(0, 1]`. An infeasible terminal trace cannot be labeled as
converged, and reaching the iteration bound while values still change reports
`iteration-limit`.

The profile names mounting holes in PCB back view. Before planar or structural
fabrication positions enter the outward-facing right-handed pose frame, the
shared conversion mirrors profile-local X and preserves Y. Hole IDs remain the
measured back-view identities. Structural normalization also derives a cable-
load axis at
each blocked hole. Ribbon CAD does not cut a cable bore there. Instead, every
final ribbon and bridge must stay outside a fail-closed axial clearance cylinder
whose diameter and length equal the configured conservative cable clearance.
The segmented collision mesh circumscribes that nominal cylinder, so polygon
facets cannot reduce the specified radial clearance.

Each independent panel-pair connector is one printable loft body. Each side starts with
broad 13 mm rounded screw shoes derived from the canonical triangle and
pentagon fixtures. Candidate generation reserves the unused eligible holes
nearest the neighboring panel. Those shoes are the exact end profiles of one
twisted cap surface. A body does not join another panel-pair cell. The shoe
starts at the PCB rear surface plus the proven 0.50 mm flush correction. It keeps the profile's 1.60 mm pilot,
3.20 × 0.70 mm lead-in, and moves the pilot 0.20 mm inward from its nearest
panel edge. The exact authored hole remains the structural anchor. It does not
add a nut pocket, insert pocket, transverse access tunnel, or cable bore. When
the existing 5×7 glyph set supports the panel ID, a 0.55 mm-deep recessed ID is
centered between the two screws on the flat panel-facing surface. It identifies
the panel that the screw pair mounts to. When at least two selected pairs
share a panel and all pose-derived nearest-hole connection regions are within
70% of the smallest involved panel dimension, candidate generation marks one
local junction. It reuses that junction's screw shoes on the shared panel and
Manifold unites the loft paths into one printable part. A three-panel trail
whose connection regions are farther apart stays as two parts.

The surface uses nine deterministic cap-shaped stations. A cubic path leaves
each shoe only 6 mm along its panel rear normal before it bends through the gap. Manifold
hulls adjacent stations, which keeps the 3 mm cap thickness near each panel and
creates a continuous surface when the panel planes differ. The axial solver
still validates panel-pair load paths and reports its own circular member
sizes. Those sizes do not set loft thickness, and the solver does not calculate
stresses in the final lofted solid. Every part must fit the configured print
envelope after margin and rotation. Every returned mesh must have
Manifold `NoError`, one printable component, positive volume, finite vertices,
non-degenerate triangles, and millimetre bounds.
Before those final checks, Manifold simplifies the completed solid by at most
0.001 mm. This removes sub-micron sliver faces created by Boolean overlap. It is
three orders of magnitude smaller than the 1.2 mm minimum wall and does not
replace the strict non-degenerate-triangle check.
The final organic volumes are intersected with every nearby oriented
PCB envelope. CAD stops if any printable volume enters a PCB.

The selectable LED-surface bridge keeps the same eligible screw anchors,
hardware corrections, labels, local junction groups, PCB gates, and print-bed
limits. It derives one complete rectangle edge per panel pair from the saved
poses. A 5 mm ridge sits outside that PCB edge with its top at the panel
profile's LED-emitter plane. A 2 mm ruled sheet then bends between the two full
65 mm or 66 mm edges. The bridge style does not change the panel profile or add
another pose authority. The current screw-shoe ribbon remains the compatible
default for old JSON.

### Panel-outline boundary generation

Milestone 3 is implemented in `src/sculpture/PanelOutlineBoundary.ts`. A
pose-first project may provide `boundaryTopology.kind =
"panel-outline-gap-cycles"`, or local generation detects it when the field is
absent. Each gap is an ordered cycle of stable panel IDs and named corners
(`bottom-left`, `bottom-right`, `top-right`, `top-left`). The topology is
connectivity only: it cannot store coordinates, dimensions, or transforms, so
it cannot become a second pose authority.

The generator derives exact 66 × 65 mm rectangles and 0.8 mm PCB envelopes
from the resolved profile and authoritative poses. It clusters neighbouring
corners within named `vertexWeldMm` (1.5 mm) and snaps each cluster to the
intersection of the incident panel planes. Detection removes oppositely wound
shared panel edges. Isolated loops still require one incoming and one outgoing
cap edge. When panels meet only at a vertex, a radial face walk finds the
holes, including eight cuboctahedron triangles after six square panels, and
discards cycles that retrace a panel outline. It canonicalizes every remaining
cycle, derives a stable content-based gap ID, sorts the result, and persists it
in the generated Schema 2 JSON. The result is independent of panel array order.

The existing boundary validator then checks each cap against named planarity,
edge, area, and intersection tolerances and proves consistent winding,
connectivity, closure, edge incidence, and vertex-link two-manifoldness. Errors
carry a stable code and identify the offending panel, welded vertex, or gap when
applicable. Detection rejects open graphs, overused or wrongly wound shared
edges, and ambiguous touching cycles instead of choosing topology silently.
The browser has no control to confirm or correct detected topology. It also has
no control to accept, reject, reorder, or redraw gap cycles. For an ambiguous
result, the user must change the panel poses until detection is unambiguous or
edit `boundaryTopology` outside the interface.

The **Generate boundary / 3D parts** flow does not require a mechanical boundary
or hand-written gap cycles before panel placement. It derives exact rectangular
panel outlines from the saved poses, detects every unambiguous gap, and closes
each cycle with one flat simple N-gon. The user is responsible for arranging
panels so this is possible. The software is responsible for proving planarity
and producing a closed, consistently wound, non-self-intersecting, two-manifold
boundary.

Only a valid boundary proceeds to part splitting, thickness, PCB-envelope
subtraction, mounting-hole allocation, connector keep-outs, and STL generation.
The exact STL outputs are referenced by the project JSON and loaded in Three.js.
The design GLB supports panel placement only. It does not supply or suggest gap
topology, and its triangles are not converted or thickened into printable
structure.

The locally hosted browser pipeline validates the deterministic boundary before
CAD, derives stable gap-sorted part groups, and generates printable closure STLs
with the established planar compiler. The production desktop server and Vite
development adapter use one bounded status/generation handler. Browser
availability comes from the local status endpoint; unavailable Manifold
disables generation without disabling panel editing, simulation,
mapping, wiring, or persistence. A multipart generation request contains the
JSON and only the referenced, verified GLB. Its JSON field is limited to 5 MB,
and the complete request is limited to 64 MB.

Panel-outline parts compile with pinned `manifold-3d` 3.5.1.

Before rendering or staging, the server verifies the referenced GLB SHA-256 and
rejects missing, tampered, or reserved paths. It copies the GLB to its unchanged
safe relative path and verifies the staged copy. Successful generation then
writes and inspects the complete STL set before atomically publishing the GLB,
STLs, and JSON. Three.js loads the exact referenced bytes after SHA-256
verification; downloads use the same verified bytes. A pose edit invalidates
the fingerprint and removes the stale set from the current printable view. The
generated folder opens directly, and folder-to-ZIP export preserves the exact
GLB and STL bytes without external asset injection.

See [`MECHANICS_WORKFLOW.md`](MECHANICS_WORKFLOW.md) for the implemented data
flow, asset bundle, staleness rules, and remaining interface-test gaps.

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
- Treat truss results as load-path guidance. Do not call them engineering
  certification, and do not hide preview supports or assumed material facts.
