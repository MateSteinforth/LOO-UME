# UI-driven mechanics workflow

This page records the agreed product direction for general sculptures. The
mechanics-independent interface in steps 1–4 is implemented: mechanics fields
may be omitted and optional GLB failures are non-fatal. The portable asset
contract and the zero-thickness panel-outline boundary stage are also
implemented. Boundary topology is accepted as panel-ID/named-corner cycles,
while every coordinate is regenerated from poses and the profile. The local
development pipeline now generates the printable closures, publishes an atomic
folder asset set, verifies SHA-256, and displays the exact referenced STL bytes.
Folder and ZIP import/export use that same path/hash contract, resolve imported
assets through browser object URLs, and retain no database or local-storage
state. The existing manual 41-panel parts and planar-shell generator remain supported.

## User workflow

The intended end-to-end workflow is:

1. Load a GLB design surface.
2. Automatically place a requested number of LED panels on that surface.
3. Manually add, move, rotate, or delete panels until the layout is correct.
4. Use simulation, mapping, wiring preview, save, and reload without generating
   any mechanics.
5. Press **Generate 3D Parts**.
6. Generate a closed boundary by filling every gap between panel outlines.
7. Validate the boundary, split it into printable parts, and add the proven PCB
   clearances and mounting details.
8. Export the exact STL files and load those same STL files into Three.js.
9. Save relative asset references and hashes in the sculpture JSON.
10. Reopen the project folder or ZIP and restore the GLB, panels, generated
    boundary, and exact printable parts.

Mechanics generation is optional. Failure or absence of mechanics must never
disable panel editing, WLED simulation, LED mapping, provisional wiring, or
project save/reload.

## Geometry assumption for the first generator

The user is responsible for arranging panels so every gap that must be capped
can be represented by one flat, simple N-gon. The first generator may rely on
that product assumption, but it must verify it rather than silently flattening
bad input.

The implemented accepted-topology contract stores no geometry. Each gap owns a
stable ID and an ordered list of `{ panelId, corner }` references. Named corner
coordinates are derived from the resolved panel width/height and the saved
right-handed pose. Accepted topology therefore selects adjacency and winding
without locating a panel or boundary vertex. The complete prism fixture is
`sculptures/panel-outline-prism/sculpture.json`; focused invalid fixtures cover
non-planar, open, intersecting, and non-manifold layouts.

For each proposed cap, generation must reject:

- vertices that are not coplanar within the documented tolerance;
- self-intersecting polygon boundaries;
- degenerate edges or faces;
- inconsistent winding;
- caps that intersect a PCB envelope or another cap;
- edges that leave the combined panel-and-cap surface open or non-manifold; and
- disconnected boundary components unless the project explicitly supports
  multiple bodies.

The first supported class is therefore a panel layout whose holes form valid
planar N-gons. It is not arbitrary curved gap filling. If a layout does not meet
the assumption, the UI should identify the offending gap and return to editing.

## Geometry pipeline

```text
authoritative panel poses
          |
          v
exact panel outlines and PCB envelopes
          |
          v
gap topology + planar N-gon cap candidates
          |
          v
closed-boundary validation
          |
          v
part seams and printable grouping
          |
          v
thickness + PCB clearance + hole mounts + connector keep-outs
          |
          v
exact STL parts + manifest
```

The boundary stage and printable-part stage are separate. Part generation must
not guess around or repair an invalid boundary. The GLB may help with panel
placement and gap/topology suggestions, but its triangles do not become
printable material and are not the boundary source of truth.

The current generic generator already contains useful downstream behavior for
validated planar faces: real mounting-hole allocation, blocked DIN/DOUT corner
avoidance, inward cover thickness, PCB-envelope subtraction, tabs, lead-ins,
lips, and grouping of coplanar regions. Reuse those proven constraints after
the new panel-outline boundary stage instead of creating a second mounting
system.

The implemented boundary result includes deterministic vertices/triangles,
panel/cap face provenance, named tolerances, counts, the canonical source
fingerprint, and a mesh fingerprint. Printable generation derives stable
`part-001`, `part-002`, … identities from sorted gap IDs and feeds the
validated faces to the existing planar-closure compiler. That preserves the
profile's real holes, blocked DIN/DOUT corners, PCB envelope, 0.20 mm hole-edge
correction, 0.50 mm flush correction, pilots, and lead-ins.

Generation stages every SCAD, STL, hash, and final JSON in a sibling temporary
directory. Only a fully inspected set is published by directory rename; failure
removes the staging directory and retains the prior bundle.

## Project bundle


A project is one main JSON document plus referenced 3D assets. A portable bundle
may be an ordinary folder or a ZIP containing that folder.

```text
my-sculpture/
|-- sculpture.json
|-- design/
|   `-- source.glb
`-- mechanics/
    |-- boundary.stl
    `-- parts/
        |-- part-001.stl
        `-- part-002.stl
```

The JSON remains the authority for panel poses, profile selection, mapping, and
asset identity. Large binary geometry remains external. Each reference owns
exactly one identity pair: a project-relative `source` and the lowercase
SHA-256 of that file. There is no separate asset registry to become
inconsistent with the reference.

Schema 2 uses this contract (the hashes below are illustrative):

```json
{
  "designSurface": {
    "kind": "triangle-mesh",
    "format": "glb",
    "source": "design/source.glb",
    "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "scaleToMillimeters": 1,
    "status": "watertight"
  },
  "generatedMechanics": {
    "generator": {
      "id": "wled-orbital-lab/planar-boundary",
      "version": "0.1.0"
    },
    "sourceFingerprint": {
      "algorithm": "sha256",
      "value": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    },
    "status": {
      "generation": "complete",
      "validation": "passed"
    },
    "boundary": {
      "kind": "closed-boundary-mesh",
      "format": "stl",
      "source": "mechanics/boundary.stl",
      "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    },
    "parts": [
      {
        "id": "part-001",
        "format": "stl",
        "source": "mechanics/parts/part-001.stl",
        "sha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
      },
      {
        "id": "part-002",
        "format": "stl",
        "source": "mechanics/parts/part-002.stl",
        "sha256": "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      }
    ]
  }
}
```

`parts` order is display/export order; `id` is the stable part identity. A
manifest represents the last completely generated and validated asset set, so
its status is `complete`/`passed`. A failed attempt does not replace it.

Asset sources use portable POSIX-style relative paths. Absolute paths, URLs,
backslashes, empty/`.`/`..` segments, query or fragment suffixes, and temporary
`build/editor-projects/...` sources are invalid. ZIP support will consume the
same references later; it does not change this contract.

## Viewer and staleness rules

After successful generation, Three.js fetches and parses the exact referenced
STL files, not a visually similar reconstruction. It verifies each boundary and
part SHA-256 before display. Downloads reuse those verified in-memory bytes, and
reopening reloads and re-verifies the project-relative files.

`sourceFingerprint` is SHA-256 over one canonical JSON projection: panels
sorted by stable panel ID with only their authoritative poses, plus the resolved
profile's dimensions, mounting geometry and allocation, physical corrections,
connector facts, electrical keep-outs, and any accepted gap cycles sorted by
stable gap ID. Descriptive notes, mapping, wiring, and pixel order are deliberately
excluded because they cannot change generated material.

Current versus stale has one authority: recompute that canonical fingerprint
from the loaded project and compare it with
`generatedMechanics.sourceFingerprint.value`. There is no saved `stale` or
`current` field. The manifest is current only when its generation/validation
status is successful and the fingerprints match. When any panel pose or
generation-relevant profile fact changes:

- panels, LEDs, simulation, mapping, and wiring continue to work;
- the generated-mechanics fingerprint no longer matches;
- the parts are marked stale and are not presented as current printable output;
- the UI may allow an explicitly labelled stale inspection mode; and
- **Generate 3D Parts** creates a new boundary and replaces the referenced part
  set only after the complete pipeline succeeds.

A failed generation must not partially replace the last successful manifest or
leave JSON references to missing files.

## Folder and ZIP behavior

An unzipped project works when its relative files are available from the JSON
location. Folder and ZIP import unpack in browser memory, require exactly one
`sculpture.json`, reject duplicate or unsafe entries, validate every referenced
file and hash, create browser object URLs for the GLB and STL files, and restore
the project without a server-side database.

Folder and ZIP export contain the current JSON and every referenced local asset.
They fail clearly if an asset is missing or its hash does not match. Export uses
only verified bytes already held by the browser and does not silently fetch an
external URL into a supposedly self-contained bundle.

## Acceptance journey

The milestone is complete only when one testable journey works end to end:

> Import GLB -> automatically place panels -> edit panels -> generate a closed
> flat-cap boundary -> generate STL parts -> display those exact STLs -> export
> the project ZIP -> reopen the ZIP -> recover the same GLB, panel poses,
> boundary, and STL parts.

This journey is covered by `tests/panel-boundary-parts-e2e.test.ts`, including
folder parity, object-URL loading, exact byte/hash recovery, and both current and
stale fingerprint states. Container rejection cases are covered separately by
`tests/portable-project.test.ts`.


OpenSCAD or the chosen mesh backend must render every changed printable part,
and the assembly inspection must confirm panel poses, holes, PCB envelopes,
connector access, cap planarity, closed topology, and flat print surfaces.
