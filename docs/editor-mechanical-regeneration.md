# Editor and planar mechanical regeneration

This document records the browser authoring and mechanically honest CAD work
implemented on `refactor/sculpture-json-pipeline` through commits `4816f34`
and `9572779`.

The editor treats panel poses as authoritative. A GLB, when present, is only a
visual canvas for placing panels. It is never thickened, segmented, clipped, or
exported as printable CAD. Printable mechanics come exclusively from the
explicit planar face graph saved in sculpture JSON.

## Current user workflow

The editor starts with
`sculptures/cuboctahedron-empty-66/sculpture.json`, an authoring-only,
watertight cuboctahedron containing no panels or LEDs. Its six square faces are
66 mm on every edge and are marked as whole-face panel regions. Its eight
triangular faces are the gaps that become printable closures after all six
square panels have been placed.

The supported workflow is:

1. Start the editor or load a compatible sculpture JSON.
2. Use the JSON shell or an optional referenced GLB as the placement canvas.
3. Add, select, drag, or delete panels.
4. Save the pose-authoritative JSON at any time.
5. Click Run to validate the complete mechanical state, regenerate topology,
   and emit OpenSCAD, STL, simulator previews, provisional wiring, and saved
   JSON.

Panel labels and enlarged transparent panel targets both select panels. Label
taps do not move them; dragging begins only from a 3D panel target. Selection,
LEDs, and provisional wiring update immediately after edits. Mechanical
previews are hidden while the shell is stale.

## Data ownership

The relevant JSON fields have deliberately separate jobs:

- `panels[].pose` is the authoritative PCB position and right-handed
  orientation basis.
- `panels[].surfaceAttachment` records the authoring canvas triangle,
  barycentric position, and normal offset so JSON-shell sessions can resume and
  GLB sessions can be related back to their canvas.
- `mechanicalShell.vertices` and `mechanicalShell.faces` are the current
  explicit mechanical topology.
- `mechanicalShell.authoringBoundary` is the stable, uncut planar boundary
  used to regenerate edited topology.
- `mechanicalShell.derivationStatus` is `requires-regeneration` after a
  surface edit and returns to `authored` only after successful regeneration.
- `closures` contains wall, flange, tab, lip, clearance, and hole-selection
  policy.
- The panel profile owns the PCB dimensions, real hole positions, DIN/DOUT
  eligibility, pixel traversal, and the physically measured corrections.

The editor captures the authoring boundary before the first edit. Existing
populated faces are marked `panelPlacement: "whole-face"` when captured, so
their established outside boundary remains stable after a move. An explicitly
empty authoring project can mark intended whole-face regions directly in
`authoringBoundary.faces`.

## Mechanical regeneration

Run performs these operations in order:

1. Clone the saved JSON project; never consume GLB triangles.
2. Validate that the authoring boundary is planar, convex per face, closed, and
   two-manifold.
3. Match each panel pose to exactly one containing boundary face.
4. Validate the full 66 x 65 mm panel profile plus configured envelope
   clearance, not merely the panel center.
5. Reject two panels on one face in this first implementation.
6. Rebuild the current face graph:
   - a `whole-face` region becomes the panel opening when occupied;
   - another supported face receives an explicit panel rectangle and coplanar
     filler-ring regions;
   - unoccupied faces remain closure regions.
7. Group coplanar filler regions sharing `partId` into one flat-printable
   part.
8. Compile adjacency and allocate every eligible PCB hole to closure
   connectors.
9. Apply the established closure generator, PCB-envelope subtraction, wall
   thickness, tabs, pilot holes, lead-ins, and exterior clipping.
10. Generate mapping, wiring, WLED ledmap, OpenSCAD, STL, and exact simulator
    preview artifacts.

The outside face polygons are the mechanical boundary. Cover thickness grows
inward from those polygons. The generated material closes the holes between
panels; the PCB previews themselves are not exported as shell material.

## Whole-face cuboctahedron fixture

The empty fixture uses cuboctahedron vertices of the form
`(±a, ±a, 0)` and permutations, where `a = 66 / sqrt(2)`. It contains 12
vertices, 6 square faces, and 8 triangular faces.

The active panel is 66 x 65 mm. Therefore
`panelEnvelopeClearance` is intentionally zero for this exact-fit test: its
66 mm axis consumes the complete nominal square width. JSON-shell placement
uses the shortest edge of the clicked triangle as the local panel X direction.
That selects a real square side instead of the triangulation diagonal and
makes an actual UI click agree with regeneration.

The initial project legitimately has:

- `panels: []`;
- one provisional output with `chainLengths: [0]`;
- zero mapping entries; and
- `derivationStatus: "requires-regeneration"`.

The JavaScript WLED adapter presents a logical LED count of zero while keeping a
one-pixel backing allocation because the C++/WASM engine rejects a zero-sized
framebuffer. Adding the first panel resizes the logical engine to 64 LEDs.
Deleting the last panel returns the project to the valid empty state.

After all six square panels are placed, regeneration produces:

- 6 panel openings;
- 8 triangular printable closure parts;
- 24 real eligible-hole connectors;
- 384 mapped LEDs; and
- one valid provisional wiring route.

Running with only a partial set is intentionally blocked. Unoccupied square
regions cannot form safe, independently retained printable parts, and the
error names the part that lacks the required three panel-hole connectors.

## Preserved physical constraints

Regeneration reuses the existing mechanically tested constants rather than
creating a second tab system:

- 0.20 mm hole-edge pilot correction;
- 0.50 mm surface-flush correction;
- 1.6 mm M2 plastic pilot;
- 3.2 mm diameter by 0.7 mm deep screw lead-in;
- real panel-profile hole coordinates;
- DIN and DOUT blocked-hole keep-outs; and
- no printable intersection with the PCB envelope.

Existing authored panel angles are not changed. The feature does not synthesize
unsupported tabs or perform automatic panel distribution.

## Blocking checks

Generation stops with an actionable error for:

- missing stable authoring boundary;
- open or non-two-manifold boundary edges;
- degenerate, non-planar, or concave boundary faces;
- panel normal or surface position not matching one planar face;
- a panel envelope or configured clearance crossing a face boundary;
- ambiguous seam placement;
- more than one panel in a face;
- non-coplanar regions grouped into one printable part;
- a part with too few real panel-hole connectors;
- more panel/closure interfaces than eligible holes;
- incomplete eligible-hole assignment;
- DIN/DOUT-blocked hole use; or
- any stale shell passed directly to CAD without regeneration.

Curved arbitrary-GLB mechanics remain blocked until a separate, tested
thickening and segmentation contract exists.

## Main implementation files

- `src/sculpture/MechanicalShellRegenerator.ts`: stable-boundary capture,
  pose-to-face matching, topology regeneration, and whole-face regions.
- `src/sculpture/PanelAssembly.ts`: runtime contract, manifold compilation,
  real-hole allocation, grouped printable parts, mapping, and stale-shell gate.
- `src/sculpture/SculptureEditor.ts`: add, move, delete, stale-state changes,
  and provisional chain balancing.
- `src/sculpture/DesignSurface.ts`: watertight JSON-shell mesh and
  face-aligned placement basis.
- `src/cad/GeneratePanelClosureCad.ts`: OpenSCAD emission for grouped closure
  regions and established hole-tab geometry.
- `web/src/SurfacePlacementController.ts`: selection, add, and drag gestures.
- `web/src/WledEngine.ts`: zero-logical-LED adapter.
- `scripts/editor-pipeline-plugin.ts`: local Run endpoint and regenerated JSON
  response.
- `schemas/panel-assembly.schema.json`: empty authoring projects,
  zero-length provisional chains, stable boundary, and whole-face metadata.

## Verification completed

The implementation was verified with:

- 55 passing Vitest tests across 15 files;
- TypeScript project compilation;
- Vite production build;
- byte-equivalence tests for unaffected processed sculptures;
- the empty fixture loading as a watertight zero-panel mapping;
- deletion from one panel back to zero;
- six UI-equivalent face-aligned placements;
- regeneration to 8 closures, 24 connectors, and 384 LEDs;
- rejection of incomplete placement;
- OpenSCAD rendering of the new fixture's 8 closure STLs, closure detail, and
  assembly preview;
- canonical CAD CSG hashes for triangle, pentagon U-frame, and middle-panel
  connector; and
- full OpenSCAD rendering of all existing processed sculptures: 8
  cuboctahedron, 32 rhombicosidodecahedron, and 8 truncated-octahedron closure
  parts plus previews.

Generated STL and PNG files remain build artifacts. The empty registry entry is
`authoring-only`, so it is staged for the editor but does not claim a
versioned printable snapshot before panels exist.
