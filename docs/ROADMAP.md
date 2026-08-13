# Roadmap

This page separates shipped behavior from gaps and proposals. “Proposed” is not
an implemented contract; settle open product/schema choices before coding.

## Implemented

- Schema 2 registry plus URL/local sculpture JSON loading and JSON download.
- Optional GLB loading with source, scale, hash, and status metadata.
- Pose-authoritative 3D panels and 64-LED expansion from a reusable profile.
- Selection, surface/local movement, local-Z rotation, deletion, manual
  placement, and deterministic automatic GLB/JSON-surface placement.
- Immediate mapping and provisional wiring rebuild after edits.
- WLED ledmap/wiring downloads with readiness diagnostics.
- Separate manual mechanics for the printed 41-panel sculpture and generic
  planar closure generation for supported closed face graphs.
- Mechanical invalidation after edits and development-only isolated CAD output.
- Three.js layer/focus controls and a deterministic 30-effect WLED WASM preview.
- File-based persistence; no database or browser local storage.

## Incomplete or blocked in the current model

Highest-priority architecture gaps:

1. Schema 2 requires manual or generated mechanics; pose-only mapping projects
   are invalid although downstream mapping/wiring can operate from poses.
2. JSON stores chain lengths but not ordered panel sequences per output.
3. Validation/readiness states cannot consistently represent fully measured
   production wiring.
4. The live manual CAD wrapper still depends on Schema 1 types.
5. Static `authored` JSON can bypass editor regeneration fit checks.

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
- WASM tests depend on generated files; `npm test` does not build them from a
  clean checkout. Browser interaction coverage is mostly helper-level.
- `main.ts`, `SphereRenderer.ts`, and `SurfacePlacementController.ts` carry
  multiple responsibilities; fingerprinting ignores index bits above bit 15;
  some overlap code is unreachable; generated SCAD is not committed with
  artifact snapshots.

## Proposed milestones

### 1. Make the pose-first core mechanics-independent

- Decide whether absent mechanics or an explicit `mechanics.mode: "none"` is
  canonical.
- Update parsing, capabilities, tests, and UI so pose-only projects support
  editing, simulation, mapping, and wiring.
- Keep automatic GLB placement distinct from structure generation.

### 2. Make wiring explicit and export states coherent

- Store ordered panel IDs per output, GPIOs, installed rotation/mirroring, and
  final pixel order in sculpture JSON.
- Treat heuristic routing as an initial suggestion that becomes authored data
  once edited or confirmed.
- Define reachable provisional/review/production states and use the same
  readiness policy in browser and CLI exports.

### 3. Retire Schema 1 from live paths

- Represent the manual 41-panel CAD contract directly in Schema 2.
- Move manual wrappers off legacy types, then remove procedural mapping and
  obsolete runtime/schema dependencies.
- Decide whether migration JSON/script remain as isolated historical tests or
  are deleted.

### 4. Harden validation and clean-checkout verification

- Centralize complete runtime validation, including manual mechanics and full
  panel-fit checks for every automatic CAD entry.
- Derive LED-count assumptions from the selected panel profile.
- Make tests build required WASM inputs or provide deterministic setup.
- Add end-to-end browser interaction tests; retain render checks for geometry.

### 5. Expand fabrication and hardware deliberately

- Keep the planar generator for shapes it can prove safe; improve seams,
  connectors, multi-panel, and multi-profile support with explicit tests.
- Add firmware/transport only after board, GPIO, network, microphone, power,
  fuse, and measured mapping decisions exist.
- Treat generated parts as iterative prototypes; preserve the printed manual
  route until a replacement has equivalent physical evidence.

## Open product decisions

- How should “no mechanics” appear in Schema 2: omission or explicit mode?
- Should migration assets remain as isolated fixtures after legacy removal?
- Should provisional browser exports remain downloadable with strong labeling,
  or be gated like CLI hardware exports?
- What confirmation promotes an automatically suggested route to authored
  wiring?
