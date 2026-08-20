# Roadmap

This page separates shipped behavior from gaps and proposals. “Proposed” is not
an implemented contract; settle open product/schema choices before coding.

## Implemented

- Schema 2 registry plus URL/local sculpture JSON loading and JSON download.
- Mechanics-free Schema 2 projects with full panel editing and placement-only
  GLB use,
  simulation, mapping, provisional wiring, save, and reopen behavior; missing
  optional GLBs are non-fatal.
- Optional GLB loading with source, scale, hash, and status metadata.
- Pose-authoritative 3D panels and 64-LED expansion from a reusable profile.
- Selection, surface/local movement, local-Z rotation, deletion, manual
  placement, and deterministic automatic GLB/JSON-surface placement.
- Immediate mapping and provisional wiring rebuild after edits.
- WLED ledmap/wiring downloads with readiness diagnostics.
- Separate manual mechanics for the printed 41-panel sculpture and generic
  planar closure generation for supported closed face graphs.
- Mechanical invalidation after edits and exact referenced STL generation and
  display through the local production host.
- Three.js layer/focus controls and a deterministic 30-effect WLED WASM preview.
- File-based persistence; no database or browser local storage.
- A checked-in deterministic WLED WASM runtime for immediate tests and browser
  use, plus clean-checkout verification that rebuilds it from pinned WLED,
  emsdk, and Emscripten revisions.
- Deterministic detection of unambiguous connectivity-only gap cycles from
  pose/profile panel outlines, persistence in Schema 2, and zero-thickness
  closed-boundary generation with cap-local and global two-manifold validation,
  manifest-ready metadata, complete/invalid fixtures, and an in-browser Three.js
  boundary preview.
- Managed OpenSCAD setup for the required Linux and macOS targets and a retained
  Windows x86-64 candidate. Windows client qualification is deferred and does
  not block the current installation milestone.

## Incomplete or blocked in the current model

Highest-priority architecture gaps:

1. JSON stores chain lengths but not ordered panel sequences per output.
2. Validation/readiness states cannot consistently represent fully measured
   production wiring.
3. The live manual CAD wrapper still depends on Schema 1 types.
4. Static `authored` JSON can bypass editor regeneration fit checks.

Other known gaps:

- Schema 1, procedural mapping, migration data, and generated-artifact loading
  remain alongside the active path.
- Schema 2 nested validation is incomplete; JSON Schema files are not used by
  the runtime loader; mapping validation assumes 8 × 8 / 64 LEDs in places.
- Installed rotation/mirroring, exact routes, output GPIOs, electrical keep-outs,
  power/fuse planning, and numbered pixel-order proof are incomplete.
- Browser exports do not enforce the CLI readiness guard.
- Generic CAD supports planar face graphs only, one panel per face, one profile,
  and flat grouped parts. It does not reproduce the U-frame system.
- No production firmware, DDP/Art-Net transport, Ethernet/microphone setup, or
  audio-reactive simulation exists.
- Browser interaction coverage now proves mechanics-free authoring and portable
  folder/ZIP controls, but it does not yet drive the complete real generation
  journey through **Generate 3D Parts**.
- Ambiguous touching gap cycles have no accept/reject/reorder/redraw correction
  tools; automatic detection rejects them with welded-vertex context.
- Unambiguous detected cycles are saved without a browser confirmation step.
- `main.ts`, `SphereRenderer.ts`, and `SurfacePlacementController.ts` carry
  multiple responsibilities; fingerprinting ignores index bits above bit 15;
  some overlap code is unreachable; generated SCAD is not committed with
  artifact snapshots.

## Milestones

### 1. Make the complete interface mechanics-independent — shipped

Mechanics are represented by omitting all mechanics fields. Pose-only projects
support GLB/automatic/manual placement, local edits, simulation, mapping,
provisional wiring, save, and reopen. Optional GLB load failures are non-fatal.
Generation detects unambiguous gap topology from panel outlines when the
project does not contain `boundaryTopology`.

### 2. Define portable project assets — shipped

Schema 2 now treats a project as `sculpture.json` plus safe project-relative,
SHA-256-identified assets. Its generated-mechanics manifest contains canonical
panel/profile fingerprinting, a boundary reference, ordered exact STL
references with stable part IDs, generator identity/version, and successful
generation/validation status. Fingerprint comparison is the sole current/stale
authority, and save-time validation rejects temporary
`build/editor-projects/...` paths. Folder and ZIP import/export now use these
same reference and hash rules and browser-owned object URLs.

### 3. Generate and validate a boundary from panel outlines — shipped

- Derive exact panel outlines and PCB envelopes from authoritative poses.
- Detect connectivity-only panel-corner gap cycles from welded exposed panel
  edges when every junction is unambiguous, assign deterministic IDs, persist
  them in Schema 2, and close each gap with one flat simple N-gon. The user
  remains responsible for arranging panels so this assumption holds.
- Validate cap planarity, polygon simplicity, winding, intersections,
  connectivity, and closed two-manifold topology; report the offending gap when
  generation is impossible.
- Produce deterministic indexed geometry, source/mesh fingerprints, named
  tolerances, provenance, and counts for the asset manifest.
- Validate the complete generated boundary before printable-part generation.
  The browser displays the returned boundary after generation completes; it
  does not provide a separate approval step.

### 4. Generate, reference, and display exact printable parts — shipped

- Split only a validated boundary into printable parts, then reuse the proven
  thickness, PCB clearance, hole, lead-in, tab, and connector constraints.
- Write exact STL assets and atomically update the project manifest only after
  the complete generation succeeds.
- Load those same referenced STL files in Three.js; do not substitute an
  approximate preview.
- Mark assets stale after relevant panel/profile edits while keeping all
  non-mechanical interface features usable.
- A helper-level integration test covers panels -> automatic gap detection ->
  persisted topology -> boundary -> parts -> references -> exact STL reload. It
  begins without `boundaryTopology` and never injects cycles. A Playwright smoke
  test covers the real mechanics-free authoring controls. A second Playwright
  journey covers the real folder/ZIP controls, exact asset transport, stale
  parts after an edit, invalid assets, reopen, and object-URL release.
- Folder and ZIP reopening use the same references and hashes, restore GLB and
  exact STL bytes through object URLs, and preserve derived current/stale state.
- Local generation verifies and copies the referenced GLB to its unchanged safe
  relative path, then atomically publishes a directly reopenable GLB/STL/JSON
  folder that can become a ZIP without external asset injection.
- Export refuses missing or mismatched local bytes instead of fetching URLs.

### 5. Make wiring explicit and export states coherent

- Store ordered panel IDs per output, GPIOs, installed address transforms, and
  final pixel order in sculpture JSON.
- Treat heuristic routing as an initial suggestion that becomes authored data
  once edited or confirmed.
- Define reachable provisional/review/production states and use the same
  readiness policy in browser and CLI exports.
- Measure one panel before mass wiring, then define the exact WLED board, four
  buses, GPIOs, color order, level shifting, power domains, and deployment
  identity.
- Record the as-built route for all 41 panels and prove all 2,624 addresses plus
  RGB channels with diagnostic frames. Keep animation timing, networking, and
  audio as later claims.
- Approve supply, injection, wire, fuse, voltage-drop, and operating-current
  limits before the complete sculpture is energized. The conservative
  full-white profile load is 157.44 A at 5 V.

### 6. Retire Schema 1 from live paths

- Represent the manual 41-panel CAD contract directly in Schema 2.
- Move manual wrappers off legacy types, then remove procedural mapping and
  obsolete runtime/schema dependencies.
- Decide whether migration JSON/script remain as isolated historical tests or
  are deleted.

### 7. Harden validation and clean-checkout verification

- Centralize complete runtime validation, including manual mechanics and full
  panel-fit checks for every automatic CAD entry.
- Derive LED-count assumptions from the selected panel profile.
- Preserve the clean-checkout verification contract as WLED and Emscripten evolve.
- Extend end-to-end browser interaction coverage to the later generation
  journeys; retain render checks for geometry.

### 8. Expand fabrication and hardware deliberately

- Keep the planar generator for shapes it can prove safe; improve seams,
  connectors, multi-panel, and multi-profile support with explicit tests.
- Add firmware/transport only after board, GPIO, network, microphone, power,
  fuse, and measured mapping decisions exist.
- Treat generated parts as iterative prototypes; preserve the printed manual
  route until a replacement has equivalent physical evidence.

## Open product decisions

- Which browser controls let a user confirm an unambiguous detected cycle and
  accept, reject, reorder, or redraw a cycle when more than one flat N-gon
  arrangement is possible?
- Which mesh format should carry the referenced closed boundary if STL cannot
  preserve required topology or metadata by itself?
- Should a stale generated part remain optionally viewable with a warning, or
  be hidden until regeneration?
- Should migration assets remain as isolated fixtures after legacy removal?
- Should provisional browser exports remain downloadable with strong labeling,
  or be gated like CLI hardware exports?
- What confirmation promotes an automatically suggested route to authored
  wiring?

## Resolved product direction

- Mechanics are omitted until generated; they are not required for interface
  functionality.
- The generation order is boundary first, printable parts second.
- The first boundary generator assumes every panel gap is a flat simple N-gon
  and validates that assumption.
- Generated boundary/part files are relative, hash-checked project assets.
- Unambiguous exposed-edge cycles are detected and persisted deterministically;
  ambiguous touching cycles are rejected until correction tools exist.
- Three.js displays the exact referenced STL parts.
- A folder is the native project layout; ZIP is its portable container.
