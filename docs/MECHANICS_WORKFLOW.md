# UI-driven mechanics workflow

This page records the agreed product direction for general sculptures. The
mechanics-independent interface in steps 1–4 is implemented: mechanics fields
may be omitted and optional GLB failures are non-fatal. Boundary generation,
asset persistence, exact STL restoration, and ZIP support remain target
architecture. The existing manual 41-panel parts and planar-shell generator
remain supported while later slices are built.

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
asset identity. Large binary geometry remains external and is addressed by a
relative path plus SHA-256, following the existing GLB reference model.

The planned generated-mechanics record needs, at minimum:

- a generator/version identifier;
- a deterministic fingerprint of the panel poses and relevant panel-profile
  facts used for generation;
- a referenced closed-boundary mesh;
- an ordered list of referenced STL parts with stable IDs, relative paths, and
  SHA-256 hashes;
- generation/validation status; and
- enough manifest data to associate a loaded STL with its part and display
  controls.

The exact Schema 2 extension must be settled in the contract slice before code
is written. Do not save temporary `build/editor-projects/...` paths into a
portable project.

## Viewer and staleness rules

After successful generation, Three.js must display the exact referenced STL
files, not a visually similar reconstruction. The files shown, downloaded, and
restored after reopening must have matching hashes.

When any panel pose or generation-relevant profile fact changes:

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
location. ZIP import should unpack in browser memory, validate `sculpture.json`,
validate every referenced hash, create browser object URLs for the GLB and STL
files, and restore the project without a server-side database.

ZIP export should contain the current JSON and every referenced local asset. It
must fail clearly if an asset is missing or its hash does not match. External
URLs should not be silently copied into a supposedly self-contained ZIP.

## Acceptance journey

The milestone is complete only when one testable journey works end to end:

> Import GLB -> automatically place panels -> edit panels -> generate a closed
> flat-cap boundary -> generate STL parts -> display those exact STLs -> export
> the project ZIP -> reopen the ZIP -> recover the same GLB, panel poses,
> boundary, and STL parts.

OpenSCAD or the chosen mesh backend must render every changed printable part,
and the assembly inspection must confirm panel poses, holes, PCB envelopes,
connector access, cap planarity, closed topology, and flat print surfaces.
