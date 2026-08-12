# Mechanical architecture

The sculpture uses the 30 square faces of a rhombicosidodecahedron for the
original LED panels. Eleven pentagonal openings receive one additional
65 x 66 mm LED panel; the north-pole pentagon remains unpopulated. This produces
41 panels and 2,624 LEDs at 64 LEDs per panel.

The mechanical source is divided into three independently printable parts:

- The triangle filler closes a triangular opening and mounts three adjacent
  outer panels without covering their electrical connector corners.
- The pentagon U-frame mounts four surrounding outer panels and supports three
  sides of the added centre panel while staying inside the pentagon footprint.
- The rounded middle-panel connector supplies the remaining two-hole connection
  between the centre panel and its neighbouring angled outer panel.

The sculpture JSON is the authored assembly contract. For triangle faces it
describes the opening population, the closure template, handedness, flat print
surface, and all three adjacent square-panel interfaces. The generated SCAD
entrypoint includes the physically tested triangle source and asserts that its
fit constants still agree with the central panel profile and opening policy.


For pentagon faces the JSON assigns the U-frame to four outer edges and three
center-panel holes, then assigns the separate connector to the missing outer
edge and center top-middle hole. A generated assembly preview composes both
parts with the center and five outer PCB envelopes in their installed frame,
while separate wrappers assert their dimensions, pose, holes, corrections, and
clearances against the central source.
The files under `parts/` remain the canonical, physically tested geometry
templates while this migration proceeds. Git records design history, GitHub
Actions creates print artifacts and checks generated/canonical CSG parity, and
physical-test issues record real-world validation. New closure generators can
replace templates incrementally only after print and assembly verification.

## Pose-first editor mechanics

The generic browser editor has a separate planar mechanical path. Panel poses
are authoritative, while an optional GLB is only a visual positioning canvas.
Before an edit invalidates derived faces, the editor preserves the closed JSON
face graph as `mechanicalShell.authoringBoundary`. Run matches complete panel
envelopes to that stable boundary, rebuilds current panel and filler topology,
then invokes the same real-hole closure compiler.

The shell's outside face polygons are the mechanical boundary and explicit
cover thickness grows inward. Coplanar regions with one `partId` are emitted
as one flat-printable part. Whole-face panel regions retain the original face
as their opening; other supported convex planar faces can receive an inset
panel opening and grouped filler ring.

Generation remains blocked for curved GLB mechanics, unsafe envelopes,
ambiguous or non-planar placement, invalid manifolds, insufficient real-hole
attachment, DIN/DOUT obstruction, and non-flat parts. The full contract,
implemented file map, empty 66 mm cuboctahedron fixture, and verification
record is in
[Editor and planar mechanical regeneration](editor-mechanical-regeneration.md).
