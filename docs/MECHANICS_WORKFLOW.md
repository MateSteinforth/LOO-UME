# UI-driven mechanics workflow

This page records the current workflow for general sculptures. The
mechanics-independent interface is implemented: mechanics fields
may be omitted and optional GLB failures are non-fatal. The portable asset
contract and the zero-thickness panel-outline boundary stage are also
implemented. Local generation detects unambiguous gap topology as
panel-ID/named-corner cycles when it is absent, while every coordinate is
regenerated from poses and the profile. The locally hosted pipeline now generates
the printable closures, publishes an atomic folder asset set, verifies SHA-256,
and displays the exact referenced STL bytes.
Folder and ZIP import/export use that same path/hash contract, resolve imported
assets through browser object URLs, and retain no database or local-storage
state. The existing manual 41-panel parts and planar-shell generator remain supported.

## User workflow

The implemented generation and portable-project data flow is:

1. Load a GLB design surface.
2. Automatically place a requested number of LED panels on that surface.
3. Manually add, move, rotate, or delete panels until the layout is correct.
4. Use simulation, mapping, wiring preview, save, and reload without generating
   any mechanics.
5. Press **Generate 3D Parts**.
6. Detect and persist the ordered corner cycle around every unambiguous gap,
   then generate a closed boundary by filling those cycles.
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

The implemented topology contract stores no geometry. Each gap owns a stable ID
and an ordered list of `{ panelId, corner }` references. Named corner coordinates
are derived from the resolved panel width/height and the saved right-handed pose.
Topology therefore selects adjacency and winding without locating a panel or
boundary vertex.

When `boundaryTopology` is absent, detection sorts panels by ID, welds exact
outline corners within `vertexWeldMm`, removes shared edges only when the two
panels traverse them in opposite directions, and reverses each remaining panel
edge to obtain the cap winding. Every exposed vertex must have exactly one
incoming and one outgoing cap edge. Each resulting cycle is rotated to a
canonical panel/corner sequence, assigned a content-derived `gap-<12 hex>` ID,
and sorted by that ID. The generated Schema 2 JSON persists those cycles, so
save/reopen and later regeneration reuse the same connectivity. Detection is
independent of panel array order.

Detection fails actionably when no exposed edges exist, an exposed graph is
open, more than two panels use one welded edge, a shared edge has matching
winding, or touching gaps make a welded vertex ambiguous. It does not guess or
silently choose between multiple cycles. The interface has no topology
confirmation or correction control. It cannot accept, reject, reorder, or
redraw detected cycles. The user must move the panels until detection is
unambiguous or edit `boundaryTopology` outside the interface. The prism fixture is
`sculptures/panel-outline-prism/sculpture.json`. Invalid fixtures cover
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

The first supported class is a panel layout whose holes form valid planar
N-gons. It is not arbitrary curved gap filling. Generation rejects other
layouts with available error context, and the user can return to editing.

## Geometry pipeline

```text
authoritative panel poses
          |
          v
exact panel outlines and PCB envelopes
          |
          v
detected or persisted gap topology + planar N-gon cap candidates
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
not guess around or repair an invalid boundary. The GLB supports panel
placement only. It does not supply or suggest gap topology. Its triangles do
not become printable material and are not the boundary source of truth.

The current generic generator already contains useful downstream behavior for
validated planar faces: real mounting-hole allocation, blocked DIN/DOUT corner
avoidance, inward cover thickness, PCB-envelope subtraction, tabs, lead-ins,
lips, and grouping of coplanar regions. The panel-outline boundary stage reuses
those proven constraints instead of creating a second mounting system.

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

## Local desktop generation host

OpenSCAD is required but is not stored in the WLED Orbital Lab repository.
Automatic repository-local setup supports the declared Debian 13 x86-64,
Ubuntu 24.04 x86-64, and macOS 15 native arm64 and x86-64 targets. It also
provides the Windows x86-64 candidate. On Linux and macOS, run:

```bash
npm ci
npm run setup:openscad
npm run desktop
```

Setup selects the host target and installs it in `.tools`. Linux uses OpenSCAD
2021.01 from the official AppImage and a pinned `libgpg-error0` companion.
macOS uses the official universal OpenSCAD 2026.06.12 DMG. Its URL is
`https://files.openscad.org/snapshots/OpenSCAD-2026.06.12.dmg`, its exact size
is 64,447,344 bytes, and its SHA-256 is
`555be2ed313e67657b3d8ba3e1de0acd6141b982fd458776c52d3eda748f57c4`.
The toolchain manifest records source and license metadata but does not claim
an exact macOS source revision because upstream does not publish one.

Setup does not need administrator access or change `PATH`. macOS needs no
manual OpenSCAD install or Rosetta. Setup uses a read-only DMG mount, copies
only `OpenSCAD.app` into the local staging tree, validates the app tree and
native Mach-O slice, and cleans up the mount. It publishes the verified tree
atomically, records the target and version in a receipt, reuses a valid managed
install, and is safe to retry after failure.

`npm run desktop` performs a fresh production build and starts the local
server. It prints a loopback URL at `127.0.0.1`, using port 4173 unless
`ORBITAL_LAB_PORT` selects another valid port. At startup, an explicit
`OPENSCAD` value has first priority. Without an override, the server prefers the
valid receipt-backed managed tool and then uses `openscad` on Linux and macOS or
`openscad.com` on Windows as the system command on `PATH`.

At startup the server probes the exact target version: 2021.01 on Linux and the
Windows candidate, and 2026.06.12 on macOS. Both local hosts use the same
bounded handler for
`/api/generator-status` and `/api/editor-pipeline`. The browser fetches status
instead of inferring availability from its build mode. Missing, unreadable, or
wrong-version OpenSCAD disables **Generate 3D Parts** with direct repair
guidance; editing, simulation, mapping, wiring, save, and reopen continue. After
setup or repair, restart the server to repeat discovery.

On the Windows x86-64 candidate, PowerShell must use
`npm.cmd run setup:openscad`. Runtime selection falls back to `openscad.com` on
`PATH`, and the required version is 2021.01. The candidate pins the official
portable OpenSCAD 2021.01 ZIP at 21,884,613 bytes with
SHA-256
`fb0caabf5bbc89f8f2f80c10b79ae64d697aaff6efd58b2756f5d6270edb7ba7`
and uses `openscad.com`. Setup is repository-local and atomic, with no
administrator, installer, registry, profile, or `PATH` change. Source is tag
`openscad-2021.01`, commit `41f58fe57c03457a3a8b4dc541ef5654ec3e8c78`,
under GPL-2.0-or-later with the OpenSCAD CGAL exception.

Windows Server CI is surrogate proof only. Windows client qualification is
deferred. The candidate code and checks remain, but Windows does not block
INSTALL-011 or INSTALL-012. Node.js and npm remain prerequisites; Linux also
needs `dpkg-deb`. INSTALL-011/012 track the complete bootstrap and proof on the
required Linux and macOS targets.

The HTTP server, project data, generated assets, and OpenSCAD process all remain
on the local computer. Generation is same-origin and loopback-only. Ctrl-C
(SIGINT) or SIGTERM stops the server and active generation children cleanly. No
public hosted generation service is required.

The browser sends one multipart generation request with the sculpture JSON and
only the referenced, SHA-256-verified GLB. The JSON field is limited to 5 MB and
the complete request is limited to 64 MB. Missing, tampered, or reserved asset
paths fail before OpenSCAD runs or the output staging directory is created.

## Project bundle

A project is one main JSON document plus referenced 3D assets. A self-contained
portable bundle can be an ordinary folder or a ZIP that contains that folder.
The example below is the complete folder that local part generation publishes
when the project references a design GLB.

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

Before rendering or staging, local generation verifies the referenced GLB
bytes. It preserves the safe relative `source`, writes the exact bytes at that
path, verifies the staged copy, then writes and validates the STL set. JSON is
written last, and the complete GLB, STL, and JSON folder replaces the prior
folder atomically. The published folder therefore opens directly and can become
a ZIP without external asset injection.

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
`build/editor-projects/...` sources are invalid. Folder and ZIP support consume
the same references; neither changes this contract.

## Viewer and staleness rules

After successful generation, Three.js fetches and parses the exact referenced
STL files, not a visually similar reconstruction. It verifies each boundary and
part SHA-256 before display. Downloads reuse those verified in-memory bytes, and
reopening reloads and re-verifies the project-relative files.

`sourceFingerprint` is SHA-256 over one canonical JSON projection: panels
sorted by stable panel ID with only their authoritative poses, plus the resolved
profile's dimensions, mounting geometry and allocation, physical corrections,
connector facts, electrical keep-outs, and the detected or previously accepted
gap cycles sorted by stable gap ID. Descriptive notes, mapping, wiring, and
pixel order are deliberately
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
external URL into a supposedly self-contained bundle. A directly generated
folder already contains the verified GLB and STL bytes that this export needs.

## Acceptance journey and test scope

The implemented helper-level integration journey is:

> Import GLB -> automatically place panels -> edit panels -> generate a closed
> flat-cap boundary -> generate STL parts -> display those exact STLs -> export
> the project ZIP -> reopen the ZIP -> recover the same GLB, panel poses,
> boundary, and STL parts.

`tests/panel-boundary-parts-e2e.test.ts` covers this data path through helpers.
It starts with `boundaryTopology` absent, places and edits panels, invokes part
generation without injecting cycles, verifies that the detected topology is
saved, opens the generated folder without external asset injection, and then
covers folder-to-ZIP parity, object-URL loading, exact byte and hash recovery,
and current and stale fingerprint states. Container rejection cases
are covered separately by `tests/portable-project.test.ts`. These tests do not
operate the real browser interface. The Playwright TEST-010 smoke test covers
the mechanics-free JSON/GLB authoring controls, automatic placement, panel
deletion, simulation, mapping, wiring, and save. `TEST-011` tracks the remaining
folder/ZIP browser-control coverage.


OpenSCAD or the chosen mesh backend must render every changed printable part,
and the assembly inspection must confirm panel poses, holes, PCB envelopes,
connector access, cap planarity, closed topology, and flat print surfaces.
