# Project task board

Last reconciled: 2026-08-25
Integration baseline: `main`, including the unified UI, Manifold-only
fabrication, checked WLED simulator runtime, and Schema 2-only mapping path.

Current milestone: produce one guarded simulator-to-ESP32 deployment contract,
then prove static address and RGB parity on the physical 41-panel sculpture.

## Control rules

1. Use stable task IDs in commits and handoffs.
2. Lifecycle: **Backlog -> Ready -> In Progress -> Blocked or Human Review ->
   Ready to Merge -> Done**.
3. Keep at most one implementation slice In Progress. Bounded audits may run in
   parallel when their files do not overlap.
4. Record scope, acceptance, dependencies, verification, owner branch/worktree,
   and likely conflicts only when useful.
5. Use FAST by default, STANDARD for substantial normal features, and QUALITY
   for architecture, geometry, conflict, ambiguity, or high risk. Escalate
   Luna -> Terra -> Sol only when evidence requires it.
6. FAST needs orchestrator diff inspection and focused checks. Use an
   independent review when justified in STANDARD and for QUALITY/high-risk work.
7. Completed task-branch work stops at Ready to Merge. Integrate into `main`
   only with explicit operator authorization. After verified integration and
   push, move the task to Done and clean up only task-owned resources.
8. Never force-push, discard unfamiliar changes, or delete another owner's
   branch or worktree.
9. Stop when acceptance criteria and relevant checks pass. Record later ideas
   as separate tasks.

## Backlog

### `ARCH-010` Split browser orchestration along covered behavior boundaries

- Acceptance: project, placement, mechanics, mapping, wiring, package, and
  rendering journeys remain covered; no new manager or state authority.

### `FIRM-011` Build and deploy the minimum pinned WLED target

- Acceptance: reproducible pinned firmware, exact bus fragment and ledmap,
  non-secret procedure, and one fused-panel smoke test.
- Depends on: `WIRE-012` and the operator-approved `CAL-010` profile facts.

### `DIAG-010` Deliver deterministic hardware diagnostic frames

- Acceptance: frames identify output, panel, local coordinate, logical and
  physical index, and RGB channel; retry and request-size behavior is tested.
- Depends on: `FIRM-011`.

### `PROOF-010` Prove simulator-to-device address and RGB parity

- Acceptance: all 2,624 addresses, row transitions, corners, outputs, and RGB
  channels agree with the exact deployment manifest and recorded bench result.
- Depends on: `DIAG-010`, `HW-012`, and `WIRE-012`.

## Ready

No tasks.

## In Progress

### `ARCH-010` Split browser orchestration along covered behavior boundaries

- Owner: `codex/unblocked-batch` in `/tmp/led-rhombo-unblocked-batch`.
- Conflict risk: browser event orchestration and focused UI modules.

## Blocked

### `MECH-020` Add correction tools for a proven ambiguous gap case

- Blocked by: a concrete project whose boundary gap cannot be represented or
  corrected by the current editor.
- Needed: the smallest failing Schema 2 project and the intended corrected
  corner cycle.

### `FAB-020` Add one evidence-backed fabrication enhancement

- Blocked by: a real printed-model need that is not covered by current ribbons,
  LED-surface bridges, or planar closures.
- Needed: the affected project, failed physical result, and required fit or
  fabrication outcome.

### `FAB-023` Route automatic structural connectors around DIN/DOUT

- Blocked by: the 30-panel bridge path contains exact-zero Manifold triangles;
  naive post-CAD pair exclusion disconnects the degree-2 graph or causes an
  unbounded search.
- Needed: a bounded pre-CAD path optimizer that treats keep-out and printable-
  mesh feasibility as edge costs while preserving the strict final mesh gate.

### `PWR-010` Approve power and protection

- Blocked by: available hardware, electrical calculation, and physical review.
- Acceptance: supply, domains, injection, wire, connector, fuse, voltage-drop,
  derating, inrush, backfeed, and current-limit plan passes before full power.

### `HW-012` Record the installed 41-panel route

- Blocked by: `PWR-010`, `FIRM-011`, and physical assembly.

### `FIRM-010` Add later transport or audio behavior

- Blocked by: `PROOF-010` plus explicit board, network, microphone, and
  transport decisions.

## Human Review

No tasks.

## Ready to Merge

### `CAD-020` Apply one fit preflight to every authored generation entry

- Scope: the browser in-memory path and CLI publisher now enter one named
  boundary, PCB-envelope, and compiled-topology preflight before Manifold or
  filesystem staging.
- Verification: browser/CLI invalid-envelope parity and atomic-publication
  regression passed with the complete boundary-parts journey; TypeScript passed.
- Owner: `codex/unblocked-batch` in `/tmp/led-rhombo-unblocked-batch`.

### `PLACE-010` Preflight automatic-placement footprints

- Scope: deterministic separating-axis preflight selects only non-overlapping
  oriented panel footprints and fails before mutation when the count cannot fit.
- Verification: six automatic-placement cases and twelve editor regressions
  passed; TypeScript passed.
- Owner: `codex/unblocked-batch` in `/tmp/led-rhombo-unblocked-batch`.

### `FAB-022` Reconcile back-view coordinates in planar closure connectors

- Scope: one shared back-view-to-outward conversion now owns planar closure
  holes and structural anchors/clearances without changing IDs or addressing.
- Verification: focused profile, pose, planar, structural, and Manifold tests
  passed 43/43.
- Owner: `codex/unblocked-batch` in `/tmp/led-rhombo-unblocked-batch`.

### `SEC-010` Bound ZIP resource use

- Scope: preflight central-directory archive, entry, expansion, and ratio
  limits; require streamed local entries to match before buffering.
- Verification: focused resource-limit, portable round-trip, and complete
  boundary-package tests passed 19/19; TypeScript passed.
- Owner: `codex/unblocked-batch` in `/tmp/led-rhombo-unblocked-batch`.

### `MAP-020` Version and strengthen ledmap fingerprints

- Scope: new mapping artifacts use labeled full-width 32-bit index hashing;
  unlabeled historical artifacts retain the low-16-bit reload rule.
- Verification: focused mapping, deployment, fixture, and compatibility tests
  passed 45/45; generated diagnostic artifacts are synchronized.
- Owner: `codex/unblocked-batch` in `/tmp/led-rhombo-unblocked-batch`.

## Done

- `HR-006`: operator printed representative Manifold parts and confirmed on
  2026-08-25 that they work.
- `FAB-021`: corrected structural PCB back-view coordinates and added
  fail-closed DIN/DOUT keep-outs for ribbons, LED-surface bridges, and merged
  junctions in `main` at `4961f4d`; unsafe automatic paths now stop instead of
  exporting overlapping parts.
- `DOC-010`: integrated the ten-page connector design-process HTML/PDF and five
  current UI images in `main` at `4c8c82c`; its task worktree and branches were
  removed after the verified push.
- `TRUSS-011`: integrated connector ribbons, LED-surface bridges, four JSON
  presets, switchable surface/free-6DOF editing, Advanced Tools settings, and
  exact displayed-connector ZIP export in `main` at `641cf6b`; its source and
  integration worktrees and branches were removed after documentation and
  integration completed.
- `INSTALL-012`: the restricted-PATH one-command setup passed on Linux x86-64
  and native macOS arm64/x86-64 in integration run `32656402016`; no global
  Node/npm installation or administrator command is required.
- `INSTALL-011`: added one-command pinned repository-local Node/npm setup,
  locked dependency installation, desktop build, and Manifold production proof.
- `VALID-011`: centralized deep Schema 2 validation for browser and CLI input,
  including mapping, calibration, boundary, asset, and note contracts.
- `VALID-010`: made LED grid dimensions profile-driven through mapping,
  validation, export, reload, rendering, and rectangular-turn safeguards.
- `LEGACY-011`: retired the Schema 1 schema, migration fixture/script,
  procedural mapping path, and legacy-only tests; the 41-panel Schema 2 project
  and deployment artifacts remain byte-identical.
- `BUILD-010`: normal development and CI now verify the checked-in WLED
  simulator without Python, Emscripten, or a WLED checkout. Reproducible source
  generation remains on `generate/wled-simulator` at `64b743a`.
- `WIRE-012`: integrated the shared guarded browser/CLI deployment policy in
  `main` at `d900cdb`; mapping-ready input gets exact WLED installation files,
  while draft or stale input gets only explicit diagnostic artifacts.
- `CTRL-008`: recorded the operator-approved visual, panel-profile, WLED
  generation, Schema 2, stale-mechanics, and boundary-format decisions in
  `main` at `ee8f79f`; physical Manifold print review remains open as `HR-006`.
- `UI-011`: operator approved the opaque glossy black PCB appearance.
- `CAL-010`: operator approved the existing panel profile for the current
  41-panel build. Existing measured values stay measured; provisional or
  unknown electrical, pad, and address facts are not relabelled as measurements
  and remain subject to `PWR-010` and `PROOF-010`.
- `HR-013`: normal `main` will use the checked-in WLED simulator and will not
  require Python or Emscripten; reproducible generation moves to a dedicated
  branch under `BUILD-010`.
- `HR-005`: confirmed the 41-panel authority is Schema 2; `LEGACY-011` retired
  the remaining Schema 1 migration dependencies.
- `HR-008`: stale generated parts stay hidden until regeneration; no stale-part
  inspection toggle is required.
- `HR-009`: keep JSON poses/topology and STL output; do not add another boundary
  asset format without a concrete future need.
- `UI-019`: removed the performance overlay and individual-file export menu,
  moved secondary display and GLB controls into Advanced Tools, and unified
  operator messages in one activity log in `main` at `6615c54`.
- `CTRL-007`: removed the retired printable toolchain and its generated
  artifacts, made Manifold the only printable-parts kernel, and established
  FAST/STANDARD/QUALITY execution and Luna/Terra/Sol routing in `main` at
  `33d6455`.
- `UI-012`–`UI-018`: integrated browser-first Manifold status, generation,
  package/manual downloads, bounded JSON fallback, simplified controls, and
  unified project/route/package workflow in `main` at `e278333`.
- `CAD-030`–`CAD-037`: pinned Manifold solids, browser/local compilation,
  exact assets, pose-only caps, labels, planar tolerances, and CI proof.
- `WIRE-010`–`WIRE-015`, `MAP-021`, `MAP-022`, `MAP-030`, `HW-016`, `HW-017`:
  authored routes, lifecycle, route editor, assembly manual, installed address
  transforms, GPIO/bus contract, and corrected mapping assumptions.
- `CORE-001`, `ASSET-001`, `BOUNDARY-001`, `PARTS-001`, `PORTABLE-001`,
  `TEST-010`, `TEST-011`: pose-first editor, portable assets, validated
  boundary, exact parts, folder/ZIP support, and real browser journeys.
- `CTRL-001`–`CTRL-005`: persistent task board, safe workflow, failure learning,
  architecture reconstruction, and simulator-to-hardware priority.
