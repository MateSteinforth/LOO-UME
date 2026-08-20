# Handover: automatic panel placement on compatible shell faces

This is the next focused slice after restoring the manually authored 41-panel
rhombicosidodecahedron and separating mapping/wiring export from 3D print
generation on `feat/manual-rhombicosidodecahedron`.

Start from the latest state of that branch. The current work is intentionally
uncommitted and unpushed at handover time. Read [AGENTS.md](../AGENTS.md),
[Pose-first sculpture schema](pose-first-schema.md),
[Editor and planar mechanical regeneration](editor-mechanical-regeneration.md),
[Panel-driven cuboctahedron fixture](cuboctahedron-e2e.md), and
[Automatic rhombicosidodecahedron acceptance sculpture](rhombicosidodecahedron-auto-e2e.md)
before changing code.

## Current state to preserve

The current branch establishes two independent capabilities:

- pose-first mapping and provisional wiring work for every valid panel assembly;
- generic 3D closure generation works only for assemblies with compatible
  `mechanicalShell` and `closures` topology.

A schema-2 sculpture may instead declare `manualMechanics`. The restored
41-panel rhombicosidodecahedron uses that branch. It has 30 square-face panels,
11 pentagon-centre panels, 2,624 LEDs, chain lengths `[11, 10, 10, 10]`, and
mapping fingerprint `31291c59`. Its triangle fillers, pentagon U-frames, and
middle-panel connectors remain manually authored, physically tested SCAD parts.

The editor now exposes separate actions:

- **Generate WLED mapping + wiring review** downloads ledmap and a clearly
  labelled draft or authored-route wiring JSON;
- **Generate 3D print elements** runs mechanical regeneration and CAD only for
  compatible generated-mechanics projects.

Do not merge these actions again. Do not enable generic cap generation for
`manualMechanics` projects.

## Objective for this slice

Add an explicit editor operation that automatically places panels on compatible
faces of a pose-first generated-mechanics project.

The first slice should be deliberately narrow and deterministic:

1. operate only on the saved planar JSON mechanical shell or its stable
   `authoringBoundary`;
2. consider only convex planar faces explicitly marked
   `panelPlacement: "whole-face"`;
3. place at most one panel on each eligible face;
4. skip already occupied eligible faces;
5. use the real panel profile dimensions and configured
   `panelEnvelopeClearance`;
6. choose a deterministic in-plane orientation that fits the complete panel
   rectangle;
7. write explicit authoritative poses and surface attachments;
8. mark derived mechanics stale;
9. update provisional chain lengths deterministically; and
10. immediately refresh LEDs, mapping, and provisional wiring in the browser.

This is automatic placement onto already-authored compatible faces. It is not
arbitrary packing over a GLB, curved-surface distribution, topology inference,
or automatic printable-part design.

## Required capability boundary

Automatic placement must reject or disable itself when:

- `manualMechanics` is present;
- no `mechanicalShell.authoringBoundary` exists;
- the authoring boundary is stale, open, non-two-manifold, concave, or
  non-planar;
- an eligible face cannot contain the complete panel rectangle plus clearance;
- a face is ambiguously occupied;
- placement would create more than one panel on a face; or
- the requested placement count exceeds the number of compatible empty faces.

A GLB remains a visual placement canvas only. Do not distribute panels over GLB
triangles and do not export GLB geometry as CAD.

The manual 41-panel sculpture must remain byte-equivalent in mapping and must
not expose the automatic-placement control.

## Suggested API

Add a pure operation in `src/sculpture/SculptureEditor.ts`, for example:

```ts
interface AutomaticPlacementOptions {
  maximumPanelCount?: number;
}

interface AutomaticPlacementResult {
  definition: PanelAssemblyDefinition;
  placedPanelIds: string[];
  skippedFaceIds: string[];
}

automaticallyPlacePanels(
  source: PanelAssemblyDefinition,
  panelDimensions: AddPanelDimensions,
  options?: AutomaticPlacementOptions,
): AutomaticPlacementResult
```

The operation should clone its input and never mutate the caller's definition.
Return enough information for the UI to report what happened without
re-deriving it from array differences.

Do not call the CAD generator from this operation. Placement changes the
authoritative JSON; the separate **Generate 3D print elements** action remains
responsible for regeneration, OpenSCAD, STL, and previews.

## Placement algorithm

Use the stable authoring boundary, not the currently cut shell, as the
placement source.

For every eligible empty whole-face region:

1. resolve its ordered world-space vertices;
2. validate outward winding, planarity, and convexity using the established
   mechanical-regeneration tolerances;
3. compute a face-local right-handed basis;
4. project the face polygon to local 2D;
5. test the full panel rectangle expanded by
   `closures.panelEnvelopeClearance`;
6. evaluate deterministic orientation candidates;
7. create the pose at the face center with local +Z equal to the outward face
   normal;
8. save a `surfaceAttachment` with
   `surface: "mechanical-shell"`; and
9. associate the panel with the boundary face only through the existing
   regeneration contract.

For the first slice, orientation candidates should come from real face edges,
not a free one-degree sweep. Sort candidates deterministically by:

1. longest usable edge first;
2. smallest normalized angle in the face plane; and
3. source edge index.

Try both panel dimensions against each candidate, equivalent to 0 and 90 degree
local-Z orientations. Select the first safe fit. This avoids unstable
floating-point choices and gives the 66 x 65 mm PCB a predictable orientation.

Reuse or extract existing geometry checks from
`MechanicalShellRegenerator.ts` and `SculptureEditor.ts`; do not create a
second set of subtly different boundary tolerances. The existing
`fitPanelRectangle()` currently performs a one-degree search for manual
insetting and is not an ideal automatic-placement contract without revision.

## IDs, ordering, and wiring

Panel IDs must be deterministic. Reuse the current `P-01`, `P-02`, …
allocation rule while preserving every existing ID.

Face traversal must not depend on object insertion accidents. Sort eligible
faces by stable face ID unless a documented authored ordering field is added.

Append new panels in that same deterministic order. Do not reorder existing
panels, because panel order contributes to physical preview indices and mapping
fingerprints.

After placement:

- rebalance `wiring.chainLengths` with the existing shortest-output policy;
- keep output count, labels, GPIOs, and colors unchanged;
- leave routing provisional;
- mark transforms, installed orientation, and physical chains provisional;
- preserve panel-profile pixel traversal;
- preserve DIN/DOUT blocked holes and all measured physical corrections; and
- set `mechanicalShell.derivationStatus` to `requires-regeneration`.

“Optimized wiring” currently means configured grouping followed by a
deterministic nearest-neighbor heuristic. Do not claim a globally optimal
route unless a real objective function and exact/verified solver are added.

## Editor interaction

Add a clearly separate **Automatically place panels** control near the panel
editing controls, not beside the two generation/export buttons.

Recommended first interaction:

- show the number of compatible empty whole-face regions;
- allow an optional maximum count, defaulting to all compatible faces;
- disable the action for `manualMechanics`;
- disable it when no compatible empty faces remain;
- after placement, report placed panel IDs and skipped face IDs;
- update the simulator, LED count, mapping, and wiring immediately; and
- explain that 3D print elements remain stale until the separate generation
  action succeeds.

Do not automatically invoke either JSON download or 3D generation.

## Primary fixture

Use `sculptures/cuboctahedron-empty-66/sculpture.json` as the first end-to-end
fixture.

Expected all-faces result:

- 6 automatically placed panels;
- deterministic IDs `P-01` through `P-06`;
- 384 LEDs;
- provisional wiring covering all 6 panels;
- stale mechanics immediately after placement;
- successful regeneration to 8 triangular closure parts;
- 24 real eligible-hole connectors; and
- successful OpenSCAD rendering of all 8 STLs and both previews.

The fixture has zero envelope clearance because one PCB axis is exactly 66 mm.
The chosen edge-aligned 0/90-degree orientations may fit; arbitrary intermediate
angles generally do not. Do not weaken envelope validation to make a placement
pass.

## Tests to add

At minimum, cover:

1. all six empty cuboctahedron square faces receive one panel;
2. repeated runs with identical input serialize identical panel IDs, order,
   positions, and bases;
3. running again on the fully populated result is a no-op;
4. partial population fills only compatible empty faces and preserves existing
   panels byte-for-byte;
5. a maximum count places exactly that many panels in stable face order;
6. every pose is finite, right-handed, orthonormal, outward-facing, and
   edge-aligned;
7. the complete 66 x 65 mm envelope fits each selected face;
8. chain lengths sum to the new panel count and retain the existing outputs;
9. mapping contains 384 unique LEDs after all six placements;
10. regeneration produces 8 closures and 24 eligible-hole connectors;
11. DIN/DOUT-blocked holes remain unused;
12. an undersized or incompatible whole-face region is skipped or rejected with
    its face ID;
13. missing authoring boundary and invalid topology fail actionably;
14. `manualMechanics` rejects automatic placement;
15. the restored manual 41-panel mapping remains fingerprint
    `31291c59`; and
16. existing processed-sculpture CAD and WLED equivalence tests remain
    byte-identical.

## Verification

Run:

```bash
npm run validate:sculpture
npx tsc -b
npx vitest run --config vitest.config.ts
npm run build
npm run verify:cad
npm run verify:processed-sculptures
```

Also save an automatically populated cuboctahedron JSON and run:

```bash
npm run verify:sculpture -- \
  --sculpture path/to/automatic-cuboctahedron.json \
  --ephemeral
```

OpenSCAD verification is mandatory after regenerated geometry changes. Never
claim successful printable output from static inspection alone.

## Important files

- `src/sculpture/SculptureEditor.ts`: pure editor mutations, ID allocation,
  chain balancing, and stale-mechanics behavior.
- `src/sculpture/MechanicalShellRegenerator.ts`: stable boundary and
  authoritative containment/topology checks.
- `src/sculpture/DesignSurface.ts`: face-aligned orientation and mesh
  validation.
- `src/sculpture/PanelAssembly.ts`: pose-first runtime parsing, mapping, and
  manual-versus-generated capability boundary.
- `web/src/main.ts`: editor controls and immediate mapping/wiring refresh.
- `scripts/editor-pipeline-plugin.ts`: separate generated-mechanics CAD
  action; automatic placement should not be implemented here.
- `sculptures/cuboctahedron-empty-66/sculpture.json`: primary empty fixture.
- `sculptures/rhombicosidodecahedron/sculpture.json`: restored manual
  regression fixture; do not mutate it during automatic placement work.
- `tests/cuboctahedron-empty-authoring-e2e.test.ts`: editor/regeneration
  coverage.
- `tests/manual-rhombicosidodecahedron-e2e.test.ts`: manual-path golden
  regression.

## Completion criteria

The slice is complete when the editor can deterministically populate compatible
empty whole-face regions, save those placements as authoritative schema-2
poses, immediately generate valid mapping and provisional wiring, and later
regenerate mechanically valid printable closures through the separate 3D
action.

It must remain impossible to reinterpret the manually authored 41-panel
rhombicosidodecahedron as an automatically generated-cap sculpture.
