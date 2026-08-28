# Project task board

Last reconciled: 2026-08-28
Integration baseline: `main`, including the unified UI, Manifold-only
fabrication, checked WLED simulator runtime, and Schema 2-only mapping path.

Current milestone: copy the complete loaded simulator to one ESP32, then prove
static address and RGB parity on the physical 41-panel sculpture.

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

No tasks.

## Ready

### `P1 · LIVE-010` Prove direct MadMapper Art-Net physical addressing

- Scope: send the generated 16-universe physical fixture atlas directly from
  MadMapper to WLED over wired Ethernet. MadMapper owns realtime spatial-to-wire
  mapping; WLED realtime ledmap processing stays disabled. Native WLED effects
  continue to use the installed ledmap.
- First slice: three panels / 192 RGB LEDs / two universes; then 2,624 LEDs / 16
  universes with finite native-preset fallback.
- Acceptance: prove exact panel orientation, physical address, RGB order,
  universe boundaries, timeout fallback, restart behavior, sustained FPS, and
  incomplete-frame handling. Confirm that MadMapper remains responsive with
  2,624 individual fixtures.
- Dependencies: the approved Ethernet-capable WLED hardware and powered test
  setup. Do not add an Art-Net-to-DDP bridge unless measurements prove that the
  direct path cannot meet the performance target.
- Conflict risk: WLED Ethernet/realtime configuration and BUILD HARDWARE setup.

## In Progress

No tasks.

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

### `HW-012` Record the installed 41-panel route

- Blocked by: physical assembly.

### `FIRM-010` Add later transport or audio behavior

- Blocked by: `PROOF-010` plus explicit board, network, microphone, and
  transport decisions.

### `PROOF-010` Prove simulator-to-device address and RGB parity

- Blocked by: `HW-012` and an approved powered test setup. DIAG-010 supplies
  the exact offline frame plan.
- Needed: observe and record all 2,624 addresses, row transitions, corners,
  four outputs, and RGB channels against the exact deployment identity.

## Human Review

No tasks.

## Ready to Merge

No tasks.

## Done

- `MAD-010` / `MAD-011`: integrated the mapping-ready MadMapper ZIP download
  on 2026-08-28. It exports 2,624 pose-positioned physical RGB fixtures in 41
  panel groups, direct addresses over 16 universes, CSV/JSON information, and
  a setup PDF. Eight focused tests, TypeScript, and the production build passed;
  full-load MadMapper and Ethernet evidence remains in `LIVE-010`.
- `WIRE-016`: integrated automatic balanced data routing, GPIO 16–19
  assignment, pose-owned DIN/DOUT orientation, the durable pre/post-fabrication
  rotation gate, and the Advanced manual route editor on 2026-08-28. Focused
  optimizer/mapping/tutorial tests, TypeScript, Chromium, diff checks, physical
  LAN UI review, and independent review passed.
- `UI-025`: integrated panel-selection auto-rotation stop and synchronized View
  state on 2026-08-27. Reconciled current operator, architecture, hardware,
  firmware, mapping, workflow, CI, and failure-learning documentation;
  TypeScript, diff checks, stale-contract scan, and independent review passed.
- `UI-024`: integrated the always-editable six-step fabrication workflow,
  persistent View animation controls, Build Hardware assembly/ESP32 controls,
  compact action layout, and revised renderer lighting on 2026-08-27.
- `UI-023`: integrated the compact View control layout and standard framebuffer
  selector through UI-024 on 2026-08-27.
- `CI-012`: integrated nightly broad Vitest, Chromium, Manifold, bootstrap, and
  clean-host verification while keeping push/PR automation to the fast build
  gate on 2026-08-27.

- `UI-022`: integrated the full-height aspect-safe viewport, compact View
  controls, Plane/World transform toggle, plain tutorial panel IDs, button-only
  chain navigation, two-column placement controls, and atomic LAN staging on
  2026-08-27. Focused unit checks, TypeScript, diff checks, and independent
  review passed; the broad browser suite was not rerun by operator request.
- `CI-011`: normal pushes and pull requests now run only the locked install,
  checked-in WLED runtime verification, TypeScript, and production build. The
  full browser, Vitest, Manifold, bootstrap, and host matrix remains available
  through **Run workflow**; integrated on 2026-08-27.
- `UI-021`: DIN/DOUT and panel-wiring switches now control their scene layers
  during chain isolation, survive navigation, and remain selected after exit.
  The stable LAN preview command and P1 MadMapper bridge task are included;
  integrated on 2026-08-27.
- `UI-020`: integrated the interactive chain-by-chain wiring tutorial, compact
  two-column controls, red current-wire focus, muted selected-chain context,
  populated 41-panel default, improved LED depth separation, gradient backdrop,
  and three-point scene lighting. Focused tests, TypeScript, diff checks, and
  independent reviews passed; integrated on 2026-08-27.
- `FIRM-015`: pose-only panel edits now update and activate the exact spatial
  WLED ledmap before preset persistence and DDP resume. Route, calibration,
  output, color-order, malformed-map, and identity changes remain fail-closed.
  The operator accepted the physical result and requested integration on
  2026-08-27; 387 tests, TypeScript, Vite, and independent review passed.
- `FIRM-014`: copied loaded 1–41-panel simulator playback to WLED with exact
  config, ledmap, preset, and boot-state read-back; gamma-corrected DDP live
  mirroring; bounded reconnect; and persistent native fallback. On 2026-08-26,
  the operator confirmed connection, effect changes, tab-close fallback, page
  reload reconnect, and power-cycle restoration on the 192-LED three-panel
  sculpture.
- `PWR-010`: removed from repository scope by operator decision. External
  electrical design and protection are operator responsibilities; generated
  WLED current values are operating assumptions, not an electrical approval.
- `FIRM-013`: stabilized physical CP2102 flashing, serial Improv setup,
  private-device read-back and reconnect, and the physically mapped live 8x8
  simulator link. The operator completed setup at `192.168.68.53`; 366/366
  tests, TypeScript, Vite, focused browser journeys, and review passed.
- `FIRM-012`: integrated the receipt-verified BUILD HARDWARE ESP32 flash,
  private Wi-Fi provisioning, `loo-ume.local` identity, one-panel simulator
  state transfer, and device read-back; physical browser/USB review passed on
  2026-08-25. Full-install mode remains unavailable.
- `FIRM-011`: the pinned WLED binary flashed successfully to the ESP-WROOM-32;
  the operator confirmed the 64-pixel GPIO16 smoke configuration, GRB colors,
  straight 0–63 row-major address walk, reboot persistence, and stable operation.
- `CAL-011`: measured GRB/order-0 and front-view straight row-major addressing
  are integrated in `main` at `80a1225`; mapping fingerprint is `73b36d49`.
- `DIAG-010`, `ARCH-010`, `CAD-020`, `PLACE-010`, `FAB-022`, `SEC-010`, and
  `MAP-020`: the reviewed unblocked implementation batch is integrated in
  `main` at `d51e8bb`; integrated Vitest passed 348/348 with TypeScript and Vite.
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
  and remain subject to `PROOF-010`.
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
