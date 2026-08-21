# Panel-driven cuboctahedron fixture

`sculptures/cuboctahedron-empty-66/sculpture.json` is the JSON-shell cuboctahedron
authoring fixture. The editor default is the mechanics-free empty pose-only
project. This fixture starts with zero panels on a watertight cuboctahedron
whose six square faces are exactly 66 mm per side. Those faces are explicit
whole-face panel regions; after all six panels are manually placed, the eight
triangular gaps regenerate into printable closures with 24 real-hole tabs and
384 mapped LEDs.

The exact-fit fixture intentionally uses zero panel-envelope clearance because
the PCB's 66 mm axis consumes the square width. Initial JSON-shell clicks align
to a real face edge rather than the triangulation diagonal. Partial population
is allowed for editing and saving but Run blocks CAD until every would-be
printable part has enough real panel-hole attachment. See
[Editor and planar mechanical regeneration](editor-mechanical-regeneration.md)
for the complete contract.

`sculptures/cuboctahedron/sculpture.json` is the complete authored source for
the cuboctahedron fixture. The TypeScript compiler contains no cuboctahedron
vertex or face table.

The JSON supplies:

- six explicit world-space panel positions and orientation bases;
- the supporting mechanical shell and each panel's mount-face association;
- the eight faces that must become printable closures;
- the rule that cap interfaces are matched to usable panel holes with one
  different cap per screw, preferring the hole nearest each edge middle so
  each square side gets one tab; unique IDs matching simulator panel labels
  are recessed on the inside of each triangle;
- cover, flange, tab, clearance, mapping, and data-only wiring policy with a
  near-top controller.

The reusable panel profile supplies the 66 x 65 x 0.8 mm PCB envelope and all
six back-view hole coordinates. It marks bottom-left unusable because it
overlaps DIN and top-right unusable because it overlaps DOUT, leaving top-left,
middle-left, middle-right, and bottom-right for M2 cap screws. The profile also
contains the pilot and lead-in diameters, conservative provisional power
constraints, and the physically tested 0.20/0.50 mm corrections.

## Compilation flow

```text
explicit panel poses + mechanical shell + panel hardware profile
                              |
                     validate closed manifold
                              |
           transform all six physical holes onto each panel
                              |
     assign four cap edges to four eligible holes, one cap per screw
             /                |                 \
 integrated closure CAD   visualizer mesh   wiring + WLED map
```

For the cuboctahedron this produces six panel placements, eight triangular
closures, and 24 integrated mounting tabs. Each closure is clipped to the polyhedron interior for a clean exterior silhouette and is one printable part:
a flat triangular outside plane plus three angled tabs, one for a real mounting
hole on each adjacent PCB. There are no generated panel carriers or generic
edge brackets.

Generate any compatible panel-assembly JSON with:

```bash
npm run generate:sculpture -- --sculpture path/to/sculpture.json
```

For this fixture, generate the compiled assembly, panel map, provisional WLED
map, eight closure SCAD entrypoints, assembly preview, and manifest with:

```bash
npm run generate:cuboctahedron
```

Render every closure STL and the full panel/closure assembly with:

```bash
npm run verify:cuboctahedron
```

The browser visualizer contains a sculpture selector and accepts the direct
query `?sculptureJson=./sculptures/cuboctahedron/sculpture.json`. The browser fetches and compiles that JSON directly. Gold markers show the real PCB holes selected
for closure tabs, and gold links show which closure edge targets each hole. After `npm run verify:cuboctahedron`, the viewer loads the exact generated STL for each closure—including the clipped cover, lips, gussets, angled tabs, pilot holes, and lead-ins—and applies the face transform compiled from the same JSON.

## Physical status

The generated closures remain `prototype-unvalidated`. The compiler verifies
that every connector targets a real, unique, mechanically eligible mounting
hole, that the DIN/DOUT-overlapped holes remain unused, and that each of the
four screws belongs to a different cap. It subtracts the PCB envelope from the
completed closure. Exact electrical pad envelopes and installed panel rotations
still require physical confirmation. Print and test one closure before
producing the complete set.

## Generalization

Another sculpture can use the same pipeline by supplying explicit panel poses, a different closed planar mechanical shell,
and assigning mount faces to panels and the remainder to closures. The compiler fails if a face is unassigned, an edge is non-manifold,
a closure does not border a panel, or a panel cannot give every interface a
different eligible mounting hole.
