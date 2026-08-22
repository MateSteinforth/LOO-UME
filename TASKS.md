# Project task board

Last reconciled: 2026-08-22
Integration baseline: `main` at `b9e0f7c`, which combines the Codex
wiring/manual work and Grok Manifold work.
Current milestone: generate a deterministic structural truss and printable
connectors from arbitrary Schema 2 panel poses. The work starts from every
eligible profile mounting hole, uses pinned `manifold-3d` 3.5.1, and keeps the
existing planar-closure and physically tested manual CAD routes separate.

This file is the persistent source of truth for work status. Read it before starting work and update it whenever a task changes state.

## Control rules

1. Use the stable task IDs below in commits, reviews, and handoffs.
2. Prefer independently testable end-to-end slices. Do not introduce a second pose, mapping, boundary, fabrication, or project-file architecture.
3. Use this lifecycle in order: **Backlog** -> **Ready** -> **In Progress** ->
   **Blocked** or **Human Review** when needed -> **Ready to Merge** ->
   **Done**. Pick the first unblocked task in **Ready** unless the user changes
   priorities. Keep at most one implementation slice in **In Progress**;
   bounded audits may run in parallel.
4. Record dependencies and acceptance checks before moving a task to **In Progress**.
5. After implementation, assign a separate subagent to test/review it. A failed review returns the task to **In Progress** or **Ready** with the failure recorded.
6. Move tasks requiring a product decision, visual check, or physical check to **Human Review**. Do not mark them **Done** without explicit approval.
7. Update the relevant architecture and knowledge pages in the same slice whenever behavior or an invariant changes.
8. Subagents report to the primary agent. The user is never used as a message relay.
9. Generated artifacts are not authored truth, except for the deliberately tracked WLED WASM runtime documented in `AGENTS.md`.
10. Every active task records scope/outcome, acceptance criteria, dependencies,
    and verification. An **In Progress** or **Ready to Merge** task also records
    its owning branch and worktree plus likely file conflicts.
11. A completed task stops at **Ready to Merge**. Merge into `main` only after
    explicit operator authorization. After authorized integration and remote
    verification, move it to **Done** and apply the safe cleanup rules in
    `AGENTS.md`.

## Backlog

### `TRUSS-010` Generate analyzed printable structures from arbitrary panel poses — umbrella

- Outcome: existing Schema 2 panel JSON produces normalized anchors, a
  candidate and optimized 3D truss, printable brackets/hubs/struts, exact STL
  and 3MF assets, an exact-mesh preview, and an engineering report.
- Acceptance: `TRUSS-011` through `TRUSS-018` pass; panel poses and panel
  profiles remain the only panel-geometry authorities; the report states that
  analysis is load-path guidance and not engineering certification.
- Depends on: its component tasks and `HR-016` for physical fit claims.

### `MECH-020` Add correction tools for ambiguous detected gaps

- Outcome: let users repair the exceptional case where automatic gap detection cannot choose an unambiguous corner cycle.
- Acceptance: users can accept, reject, reorder, or redraw a candidate cap; confirmed topology persists and survives save/reopen; no correction duplicates panel geometry or poses.
- Depends on: the automatic path in `MECH-010` and evidence that real layouts need correction.
- Verify: focused geometry tests, invalid fixtures, browser preview, existing boundary regression tests.

### `MECH-021` Improve automatic gap detection for additional arrangements

- Outcome: expand automatic detection one evidence-backed arrangement at a time after the first flat-gap workflow ships.
- Acceptance: each new supported arrangement has a fixture, explicit ambiguity rules, and unchanged validation of planarity, intersections, winding, and manifold closure.
- Depends on: `MECH-010` and a concrete unsupported project.

### `FAB-020` Add one evidence-backed generic fabrication enhancement

- Outcome: improve seams/connectors or multi-panel-per-face support for one concrete printable case.
- Acceptance: the exact scope is chosen from a real model; geometry preserves
  PCB envelopes and connector access; changed generic parts compile with
  Manifold and receive physical review.
- Depends on: completion of the current arbitrary-project milestone and `HR-006`.
- Note: multi-profile and mixed-hardware work must remain separate later slices.

### `LEGACY-010` Move the manual 41-panel contract fully to Schema 2

- Outcome: Schema 2 can express the complete physically tested manual route before any live Schema 1 dependency is removed.
- Acceptance: identical poses/mapping/CAD behavior and unchanged mechanical regression results.
- Verify: manual editor, mapping, CAD, render, and regression suites.

### `LEGACY-011` Isolate and retire live Schema 1 dependencies

- Outcome: new runtime/editor paths no longer depend on legacy definition or procedural mapping code.
- Depends on: `LEGACY-010`, `HR-005`.
- Acceptance: migration policy is explicit; retained legacy fixtures are clearly isolated; no active browser path uses Schema 1.

### `ARCH-010` Split browser orchestration only along tested behavior boundaries

- Outcome: reduce the size of `web/src/main.ts` without changing behavior or inventing new architecture.
- Depends on: browser coverage from `TEST-010` and `TEST-011`.
- Acceptance: import/export, placement, mechanics, mapping, wiring, and rendering journeys remain covered.

### `SEC-010` Bound ZIP resource use

- Outcome: safely reject excessive entry counts, individual sizes, total uncompressed size, and suspicious compression ratios before buffering arbitrary archives.
- Acceptance: actionable errors and adversarial archive tests; normal exported projects still round-trip byte-for-byte.

### `PLACE-010` Preflight panel footprints during automatic placement

- Outcome: detect impossible dense placement before accepting overlapping panel poses.
- Acceptance: placement either returns a non-overlapping set or explains which requested panels cannot fit.

### `CAD-020` Enforce full fit checks for every authored automatic-CAD entry

- Outcome: static JSON cannot bypass the same panel-envelope and boundary checks used by generation.
- Acceptance: browser and CLI use one preflight path; invalid authored fixtures fail before artifact writes.

### `CAD-021` Decide and test generated-SCAD artifact stability

- Outcome: either snapshot the generated SCAD contract or document why only mesh/part outputs are stable.
- Acceptance: one explicit policy replaces the current implicit behavior.

### `MAP-020` Version and strengthen ledmap fingerprints

- Outcome: remove collisions caused by hashing only the low 16 bits of LED indices.
- Acceptance: indices differing by 65,536 produce different fingerprints; compatibility/migration behavior is documented and tested.

### `FIRM-011` Build and deploy the minimum pinned WLED target

- Outcome: produce a reproducible firmware artifact and non-secret device
  configuration for mapping proof only, without adding network/audio feature
  claims.
- Acceptance: install the pinned build, exact RGB/order-1 four-bus fragment, and
  matching `ledmap.json`; credentials remain outside Git. Device read-back is
  optional diagnostics, not a mapping gate.
- Depends on: `MAP-030` and `WIRE-012`.
- Verify: clean firmware build, artifact receipt, flash/install procedure, and
  one-panel hardware smoke test.

### `DIAG-010` Deliver deterministic hardware diagnostic frames

- Outcome: provide one repository-owned method to send known logical frames to
  the selected local WLED target and record the expected physical result.
- Acceptance: the chosen local transport and capture procedure are explicit;
  frames identify output, panel, local coordinate, logical index, physical
  index, and RGB channel; large updates are serialized within the pinned
  target's request/buffer limits; no cloud service is required and any
  operator-supplied local device credential stays outside Git and artifacts.
- Depends on: `FIRM-011` and `MAP-030`.
- Verify: one-panel walking-pixel and RGB proof, deterministic frame fixtures,
  retry/error behavior, and exact comparison with the mapping manifest.

### `PROOF-010` Prove simulator-to-device address and color parity

- Outcome: show that a known logical frame reaches the same physical LED and
  RGB color on the assembled sculpture as the simulator predicts.
- Acceptance: walking-pixel, per-output, per-panel, corner, row-transition, and
  RGB diagnostics cover all 2,624 addresses; observed results are compared with
  the deployment manifest and recorded; corrections regenerate all dependent
  hashes and receipts.
- Depends on: `DIAG-010`, `HW-012`, and `WIRE-012`.
- Verify: automated capture where practical plus a structured signed bench
  record. Static address/color parity does not claim identical animation timing.

### `INSTALL-015` Qualify managed OpenSCAD on Windows clients — deferred

- Outcome: convert the retained Windows x86-64 candidate from `INSTALL-014` into a tested Windows PC support claim if Windows returns to the required platform set.
- Acceptance: use disposable native Windows 10 Enterprise LTSC 2021 and Windows 11 25H2 non-N x86-64 client VMs; start without OpenSCAD, administrator rights, repository cache, registry install, or `PATH` wiring; run setup twice from a path with spaces; generate real STL files; prove clean server shutdown; destroy each trusted runner after use.
- Depends on: `INSTALL-014` and provisioned ephemeral Windows client runner images.
- Deferred by: the operator selected Linux and macOS as the current required targets. Windows candidate code and CI checks stay implemented, but Windows client qualification does not block `INSTALL-011` or `INSTALL-012`.

## Ready

Tasks are ordered. The primary agent automatically takes the first unblocked item after this board has been shown to the user.

### `BUILD-010` Fail CI when a pinned WASM rebuild changes tracked bytes — P1

- Outcome: the checked-in runtime is demonstrably reproducible.
- Acceptance: after the pinned rebuild, CI runs a scoped Git diff check for both tracked WASM files and fails on any change.
- Depends on: none.

### `VALID-010` Make LED dimensions profile-driven end to end — P1

- Outcome: remove remaining hard-coded 8x8/64 validation assumptions.
- Acceptance: one non-8x8 profile parses, maps, validates, exports, and reloads correctly; errors report resolved profile dimensions.
- Depends on: none.

### `VALID-011` Centralize deep Schema 2 runtime validation — P2

- Outcome: browser and CLI reject the same malformed nested mapping, calibration, notes, manual-mechanics, boundary, and generated-asset data.
- Acceptance: a single loader is shared; JSON Schema/runtime parity tests cover valid and invalid nested fixtures; notes require strings.
- Depends on: none. Keep this validation slice behavior-focused rather than a broad refactor.

## In Progress

## Blocked

### `INSTALL-011` Complete the one-command clean-checkout bootstrap — umbrella

- Outcome: one Linux/macOS command installs and connects every dependency needed to build, test, start, and generate parts after a clean clone.
- Acceptance: `INSTALL-011A`, `INSTALL-011B`, and `INSTALL-011C` all pass in order; Windows remains a retained candidate and is not a completion gate.
- Blocked by: `HR-013`, then `INSTALL-011B` and `INSTALL-011C`.

### `INSTALL-011B` Acquire the repository-local base toolchain — P0

- Outcome: the documented POSIX entry point starts from the chosen stage-zero supply and acquires pinned repository-local Node.js/npm and Python for the selected Linux/macOS target.
- Acceptance: no administrator, system package-manager, profile, or global `PATH` change; exact size/hash verification; target-bound receipts; atomic promotion; safe warm reuse, interruption recovery, and paths with spaces; no undeclared system executable.
- Blocked by: the Python distribution choice in `HR-013`. `INSTALL-011A` is complete.
- Verify: injected download/extraction failures, tampered cache, unsupported tuple, empty/warm retry, and native executable/version checks.

### `INSTALL-011C` Orchestrate the complete clean-checkout setup — P0

- Outcome: one command uses the managed base toolchain to initialize WLED,
  install exact npm dependencies including Manifold, install pinned Emscripten,
  verify generator availability, and print the managed desktop start command.
- Acceptance: all subprocesses use explicit managed paths; repeated and interrupted runs are safe; failures name the dependency and recovery action; Windows candidate behavior may remain but is not a completion gate.
- Blocked by: `INSTALL-011B`; `INSTALL-010` and `INSTALL-013` are complete.
- Verify: empty-cache and warm-cache integration tests, interruption recovery,
  `npm run verify`, real Manifold generation, and a local production-server
  smoke test.
- Docs: make this the primary Linux/macOS installation path and list only the chosen stage-zero supply as the prerequisite.

### `INSTALL-012` Prove automatic installation on clean supported systems — P0

- Outcome: every current required platform proves that a fresh clone becomes a
  working local production editor without a manual Node, npm, Python, Manifold,
  SDK, utility, PATH, or dependency-wiring step.
- Acceptance:
  - CI starts from clean Linux and macOS environments for every OS/architecture pair declared required by the bootstrap.
  - Each job runs only the documented bootstrap and start commands, sees
    generator status `available: true`, generates exact STL files with real
    Manifold, and shuts down cleanly.
  - Cached tools are verified before reuse; tampered downloads, unsupported systems, offline failures, and partial installs fail safely and actionably.
- Windows candidate CI may remain as non-gating compatibility evidence; it does not define a current supported target.
- Blocked by: `INSTALL-011C`.
- Verify: the clean-install matrix is required in CI and release checks; tests
  remove Node.js, npm, Python, Emscripten, and undeclared download/archive
  utilities from `PATH` and may use only Git plus the declared standard shell
  before bootstrap starts.
- Docs: publish the tested Linux and macOS matrix and state clearly which repository installation command applies to each required platform.

### `WIRE-012` Unify readiness and export policy

- Outcome: browser and CLI use one evidence-gated production export and never
  present provisional or stale files as controller-ready.
- Acceptance: draft data can produce only clearly named diagnostic artifacts;
  an installation-ready bundle contains `ledmap.json`, non-secret bus
  configuration, route/mapping manifest, source and artifact SHA-256 values,
  pinned WLED/build identity and current-limit data; any missing, stale, or
  tampered mapping prerequisite blocks that bundle;
  `WIRE-013` defines the lifecycle and only accepted `PROOF-010` evidence can
  authorize the hardware-verified transition.
- Blocked by: `MAP-022` and browser/CLI bundle integration. Electrical approval
  is separate from mapping export.
- Verify: shared readiness tests, browser/CLI bundle equivalence, tamper and
  staleness negatives, and portable save/reopen.

### `HW-010` Establish the production hardware evidence — umbrella

- Outcome: replace every provisional addressing and electrical fact with a
  measured value tied to the physical 41-panel build.
- Acceptance: `CAL-010`, `PWR-010`, `HW-012`, and `PROOF-010` complete; each
  panel and output has traceable evidence; software readiness can truthfully
  reach hardware-verified.
- Blocked by: its component tasks and physical assembly evidence.

### `PWR-010` Approve the operating power and protection plan

- Outcome: define a safe power envelope before full-sculpture operation.
- Acceptance: measured panel current and the selected maximum operating mode
  determine supply capacity, independent positive-rail domains, common ground,
  injection points, wire sizes, connector ratings, fuse groups/values, voltage
  drop limits, supply derating, branch return/data-ground routing, backfeed
  prevention, fuse placement, short-circuit/inrush behavior, and WLED current
  limit. The plan states that software limiting is secondary protection and
  that accumulated chain current does not pass through panel pads.
- Blocked by: `CAL-010`, `HR-015`, and available power hardware.
- Verify: electrical calculation, continuity/polarity procedure, fuse schedule,
  loaded voltage measurements, and human review before energizing all panels.

### `HW-012` Record the installed 41-panel route

- Outcome: create the as-built record while panels are installed.
- Acceptance: all 41 panel IDs record installed orientation/mirroring, output,
  chain position, predecessor DOUT, successor DIN, controller GPIO, power
  domain, injection point, fuse, wire size, and continuity result; every panel
  appears once and no positive connection crosses power domains.
- Blocked by: `WIRE-011`, `CAL-010`, `PWR-010`, `FIRM-011`, and the physical
  assembly.
- Verify: generated build worksheet versus saved Schema 2 route, continuity and
  polarity checks before power, photographs/notes, and save/reopen.

### `FIRM-010` Add later production transport and audio behavior

- Outcome: add only explicitly selected network, realtime, microphone, preset,
  or custom-effect behavior after static mapping parity is proven.
- Blocked by: `PROOF-010` plus separate board, network, microphone, power, and
  transport decisions.
- Constraint: do not claim DDP, Art-Net, Ethernet, audio-reactive, or exact
  animation behavior before each item is implemented and device-tested.

### `FAB-030` Claim generic CAD equivalence with the manual 41-panel route

- Blocked by: equivalent print/fit evidence. The generic planar generator does not currently reproduce the tested U-frame structure.

## Human Review

### `HR-016` Review structural assumptions and printed connector fit

- Required review: inspect representative analysis results and exact meshes,
  then print and fit one bracket, hub, and strut connection before any physical
  fit or load claim.
- Constraint: code tests, linear truss analysis, optimization, and watertight
  meshes do not certify structural safety.
- Depends on: `TRUSS-017`; browser review also depends on `TRUSS-018`.

### `UI-011` Render LED PCBs as opaque glossy black — P1

- Outcome: panel boards now render as physical opaque near-black PCBs with a
  restrained specular highlight.
- Acceptance: shell/closure transparency remains independent; LEDs, connector
  markers, wiring, outlines, labels, mapping modes, and selection focus remain
  visible and functional.
- Evidence: TypeScript and Vite production build pass; 17 focused mapping,
  selection, and flagship tests pass; `git diff --check` passes. Independent
  review found no z-fighting, disposal, layering, or focus defect.
- Required review: inspect the live LAN preview and approve or request a change
  to black level and gloss strength.
- Depends on: the current mapping branch at `35fed8c`.
- Owner: branch `codex/ui-011-opaque-pcbs`; worktree
  `/home/mate/Documents/led-rhombicosidodecahedron`.
- Likely conflicts: `web/src/SphereRenderer.ts`, visual documentation, and
  `TASKS.md`.

### `CAL-010` Measure one panel before mass wiring — Physical check

- Outcome: establish the real addressing and electrical facts of the installed
  WS2812B panel type before those facts are copied across 41 panels.
- Required evidence: back-view DIN/DOUT orientation; numbered pixel zero; all
  64 addresses; traversal and serpentine direction; red/green/blue color order;
  actual current at defined patterns/brightness; pad centres; connector and
  electrical keep-outs; panel model/revision/batch; photos or video tied to the
  panel identifier.
- Acceptance: measured values replace only the matching provisional profile
  facts; a repeatable diagnostic agrees with compiler corner/row vectors; test
  one representative from every identifiable panel batch. If batches cannot be
  identified or any sample differs, require per-panel proof or explicit
  per-panel overrides before readiness.
- Depends on: a fused current-limited 5 V bench supply and a test controller.
  Repeat controller-dependent facts on the `HR-014` production target if the
  first test uses different hardware.
- Unblocks: measured activation of the `MAP-021` transform contract,
  `PWR-010`, and later hardware readiness.

### `HR-013` Choose the managed Python distribution — Decision needed

- Constraint: python.org does not publish a relocatable Linux CPython distribution, and the pinned Emscripten SDK needs Python before it can run.
- Recommended option: use exact, checksum-verified Astral `python-build-standalone` artifacts for Linux x86-64, macOS arm64, and macOS x86-64. Record Astral as a third-party binary trust root and preserve the complete bundled license set.
- Alternative: permit a system Python prerequisite. This weakens the no-manual-dependency requirement.
- Unblocks: `INSTALL-011B`.

### `HR-005` Decide whether migration fixtures remain after Schema 1 retirement

- Unblocks: `LEGACY-011`.

### `HR-006` Physically review generic generated parts

- Required review: print the changed parts and inspect panel fit, clearances, connector access, seams, and flat print surfaces.
- Constraint: code tests and mesh validation cannot approve physical fit.

### `HR-007` Review the interface on phone and desktop

- Required review: folder/ZIP controls, GLB and exact-STL layers, stale-after-edit messaging, long errors, busy states, and responsive layout.
- Move to Done only after the user approves the rendered interface.

### `HR-008` Choose stale-part inspection behavior

- Question: hide stale parts, or allow an opt-in warning view for comparison?

### `HR-009` Choose a topology-preserving boundary asset format if STL proves insufficient

- Current rule: do not add another format speculatively. Decide only from a concrete metadata/topology need.

## Ready to Merge

### `TRUSS-021` through `TRUSS-025` Generate modular local structural connectors — P0

- Outcome: Schema 2 connector policy selects deterministic nearby panel pairs,
  analyzes the complete assembly, preserves redundant local load paths, and
  emits separate print-bed-bounded brackets, strut segments, and splice sleeves.
  The browser exposes pair overrides and print-envelope settings without a new
  panel schema.
- Acceptance: a three-panel spatial trail produces only adjacent connector
  cells by default; each active solver anchor has printed bracket material;
  analysis-only PCB-rigidity links add no print mass or self-weight; explicit
  include/exclude overrides, active supports, optimization, Manifold topology,
  STL/3MF export, preview, save/reopen, stale state, and failure isolation pass.
- Evidence: 12 structural-design, 9 candidate, 5 optimizer, 7 solid, and 6
  pipeline tests pass. The real Chromium trail journey passes with pair edits,
  forced segmentation, exact ZIP reopen, stale edit, and singular failure.
  The full suite passes 335 tests after active-interface expectations were
  updated. TypeScript, the production web build, and `git diff --check` pass.
  Independent review found unprinted solver interfaces and lost preview
  provenance; both corrections passed focused verification and re-review.
- Depends on: `TRUSS-020`.
- Owner: branch `codex/truss-011-structural-contract`; worktree
  `/tmp/led-rhombo-truss-011`. Do not merge to `main`.
- Likely conflicts: `TASKS.md`, `FAILURES.md`, Schema 2 structural validation,
  `src/structure/`, structural CAD/pipeline files, browser orchestration and
  styles, structural fixtures/tests, and structural knowledge pages.
- Integration gate: explicit operator authorization is required before merge
  into `main`.

### `TRUSS-011` Define structural input and normalize panel anchors — P0

- Outcome: Schema 2 accepts strict optional structural inputs and derives
  deterministic panel geometry, load points, and every eligible mounting
  anchor directly from authoritative poses and the resolved panel profile.
- Acceptance: panel and individual-anchor supports, named units, material,
  mass, safety factor, displacement/print limits, installed and transport
  gravity, face/corner/cable loads, preview defaults, prominent fallback
  warnings, versioned artifacts, fingerprints, and stale state are implemented;
  blocked holes and empty structural projects fail clearly; no second panel
  schema exists.
- Evidence: 8 focused structural tests and all 284 Vitest tests pass;
  `npx tsc -b --pretty false`, `npm run build:web`, schema JSON parsing, and
  `git diff --check` pass. Independent review found the empty-project bypass;
  the runtime/schema/test correction passed re-review with no remaining
  material finding.
- Depends on: integrated Manifold baseline `b9e0f7c`.
- Owner: branch `codex/truss-011-structural-contract`; worktree
  `/tmp/led-rhombo-truss-011`.
- Likely conflicts: `TASKS.md`, `src/sculpture/PanelAssembly.ts`, generated
  mechanics/fingerprint code, Schema 2 documentation, and validation tests.
- Integration gate: explicit operator authorization is required before merge
  into `main`.

### `TRUSS-012` Generate a deterministic candidate truss

- Outcome: every eligible profile hole gets a stable screw bracket and rear
  hub; deterministic local ties and collision-checked inter-panel candidates
  form a connected graph with no bridge.
- Acceptance: stable anchor, bracket, hub, and member IDs are independent of
  panel array order; blocked holes are excluded; PCB envelopes, zero-length
  members, duplicate edges, isolated panels, coincident hubs, and impossible
  attachments fail clearly; accepted layouts retain redundant graph paths.
- Evidence: 8 candidate tests cover the existing arbitrary-pose 41-panel
  project, shuffled input, PCB collision, coincident and disconnected layouts,
  malformed edges, and attachment feasibility. All 292 Vitest tests,
  `npx tsc -b --pretty false`, `npm run build:web`, and `git diff --check`
  pass. Independent review found one bracket endpoint validation gap; the
  canonical anchor/hub position correction passed focused re-review with no
  remaining finding.
- Depends on: `TRUSS-011`.
- Owner: branch `codex/truss-011-structural-contract`; worktree
  `/tmp/led-rhombo-truss-011`. The operator explicitly authorized continued
  work on this branch and worktree without a merge to `main`.
- Likely conflicts: `TASKS.md`, structural workflow and architecture
  documentation, and future `src/structure/` solver work.
- Integration gate: explicit operator authorization is required before merge
  into `main`.

### `TRUSS-013` Solve linear 3D truss load cases

- Outcome: a deterministic linear 3D axial solver gives each candidate hub
  three translational degrees of freedom and solves all normalized gravity,
  transport, face, corner, and cable load cases from one stiffness factor.
- Acceptance: stiffness uses member length, direction, circular area, and
  Young's modulus in N/mm/MPa; supports constrain individual node degrees of
  freedom; singular, residual, overflow, and non-finite results fail clearly;
  results include displacement, reaction, axial force, force state, stress,
  yield utilization, pinned Euler buckling utilization, and governing case.
- Evidence: 5 focused solver tests compare an analytical bar, equilibrium,
  reordered inputs, sub-newton relative residuals, all load types, overflow,
  zero length, missing support, and a rigid-body mechanism. The existing
  41-panel project solves 164 nodes, 13,366 candidates, and seven gravity cases.
  All 297 Vitest tests, `npx tsc -b --pretty false`, `npm run build:web`, and
  `git diff --check` pass. Independent review found non-finite-result and
  sub-newton residual gaps; explicit finite gates and the corrected denominator
  passed re-review with no remaining finding.
- Depends on: `TRUSS-011` and `TRUSS-012`.
- Owner: branch `codex/truss-011-structural-contract`; worktree
  `/tmp/led-rhombo-truss-011`. Continue on the operator-authorized truss
  workstream without a merge to `main`.
- Likely conflicts: `TASKS.md`, `src/structure/`, structural workflow and
  architecture documentation, and structural tests.
- Integration gate: explicit operator authorization is required before merge
  into `main`.

### `TRUSS-014` Optimize member sizes and load paths

- Outcome: bounded deterministic iterations remove consistently low-load or
  long-compression inter-panel candidates, restore capacity paths, round
  printable diameters, and update member self-weight.
- Acceptance: the objective exposes material, stress, displacement, buckling,
  long compression, fragile attachment, and unprintable-dimension terms;
  removal preserves bridge-free topology and maximum-diameter capacity;
  convergence, infeasibility, and iteration limits are distinct and traced.
- Evidence: 5 optimizer tests cover the existing 41-panel project, removal,
  redundancy and capacity, sizing, print increments, self-weight, infeasible
  limits, bounded iteration, ratio validation, and reordered input. The default
  project converges in seven iterations from 13,366 to 2,385 members. All 302
  Vitest tests, `npx tsc -b --pretty false`, `npm run build:web`, and
  `git diff --check` pass. Independent review found terminal-state,
  attachment-penalty, diameter-grid, and ratio-bound gaps; all corrections
  passed focused re-review with no remaining finding.
- Depends on: `TRUSS-012` and `TRUSS-013`.
- Owner: branch `codex/truss-011-structural-contract`; worktree
  `/tmp/led-rhombo-truss-011`. Continue on the operator-authorized truss
  workstream without a merge to `main`.
- Likely conflicts: `TASKS.md`, `src/structure/`, structural workflow and
  architecture documentation, and structural tests.
- Integration gate: explicit operator authorization is required before merge
  into `main`.

### `TRUSS-015` Generate printable Manifold brackets, hubs, and struts

- Outcome: one integrated bracket per panel and one tapered socket strut per
  retained inter-panel member are generated as separated world-space Manifold
  meshes. Brackets include exact structural anchors, corrected screw pilots,
  lead-ins, open nut traps, cable voids, sockets, and orientation marks.
- Acceptance: millimetre scale, printable dimensions, connector hardware,
  PCB-volume keep-outs, stable part IDs, Manifold status, one meaningful
  component, positive volume, finite vertices, and non-degenerate triangles are
  checked before a mesh is returned. All Manifold objects are released on
  success and failure paths.
- Evidence: 5 focused solid tests cover arbitrary perpendicular panel poses,
  part separation, exact anchors, the measured 0.20/0.50 mm corrections,
  fastener and cable voids, socket fit, stale fingerprints, non-converged
  analysis, and PCB-volume collision rejection. All 307 Vitest tests,
  `npx tsc -b --pretty false`, `npm run build:web`, and `git diff --check` pass.
  Independent review found solid-volume, fingerprint, correction, and cleanup
  gaps; all corrections passed two focused re-reviews with no remaining
  material finding. OpenSCAD is unavailable on this host, so no OpenSCAD render
  is claimed; Manifold topology and representative material/void probes pass.
- Depends on: `TRUSS-014`.
- Owner: branch `codex/truss-011-structural-contract`; worktree
  `/tmp/led-rhombo-truss-011`. Continue on the operator-authorized truss
  workstream without a merge to `main`.
- Likely conflicts: `TASKS.md`, `FAILURES.md`, `src/cad/`, structural workflow
  and architecture documentation, and structural CAD tests.
- Integration gate: explicit operator authorization is required before merge
  into `main`.

### `TRUSS-016` Export deterministic STL, 3MF, and preview assets

- Outcome: each validated structural mesh becomes one stable binary STL; the
  same indexed meshes form one assembly-preview STL and named Core 3MF objects.
  A shared millimetre 3MF transform preserves relative geometry in the positive
  build octant.
- Acceptance: stable part identities, safe paths, units, finite vertices,
  triangle indices and counts, package relationships, byte lengths, hashes,
  resource bounds, and exact reordered-input bytes validate before publication.
  Only one complete generator-owned child of an authorized artifact root can be
  replaced; failed promotion restores the prior directory.
- Evidence: 8 structural artifact tests cover STL/3MF round-trip, exact preview
  mesh count, reordered-input byte equivalence, tampering, reserved IDs,
  resource limits, unrelated-directory refusal, exact staged files, and
  promotion rollback. All 315 Vitest tests, `npx tsc -b --pretty false`,
  `npm run build:web`, `git diff --check`, and ASCII source inspection pass.
  Independent review found broad-directory replacement, ID collision,
  uncontrolled allocation, and raw-control-byte risks; all corrections passed
  focused re-review with no remaining material finding.
- Depends on: `TRUSS-015`.
- Owner: branch `codex/truss-011-structural-contract`; worktree
  `/tmp/led-rhombo-truss-011`. Continue on the operator-authorized truss
  workstream without a merge to `main`.
- Likely conflicts: `TASKS.md`, `FAILURES.md`, `src/cad/`, structural artifact
  documentation, and structural export tests.
- Integration gate: explicit operator authorization is required before merge
  into `main`.

### `TRUSS-017` Publish the headless pipeline and engineering report

- Outcome: one TypeScript command reads an existing Schema 2 project and emits
  the complete structural asset set, portable source/profile inputs, structured
  analysis, and a readable engineering report.
- Acceptance: the report contains supports, load cases, safety factor,
  assumptions, warnings, displacements, per-member results, governing cases,
  buckling, optimization history, and artifact hashes; preview-only supports,
  assumed mass, and unknown connector geometry are prominent; the report says
  that the result is not engineering certification.
- Evidence: 5 pipeline tests cover complete existing-JSON generation,
  report/manifest content, panel/support/translation/load reorder byte
  equivalence, verified design-surface inclusion, and singular failure. The
  real CLI generated 18 parts and 24 validated files; the emitted project
  reloaded with its bundled profile and every manifest hash matched. All 321
  Vitest tests, `npx tsc -b --pretty false`, `npm run build:web`, and
  `git diff --check` pass. Independent review found portable-reference,
  serialization-order, and connector-evidence gaps; all corrections passed
  focused re-review with no remaining finding.
- Depends on: `TRUSS-011` through `TRUSS-016`.
- Owner: branch `codex/truss-011-structural-contract`; worktree
  `/tmp/led-rhombo-truss-011`. Continue on the operator-authorized truss
  workstream without a merge to `main`.
- Likely conflicts: `TASKS.md`, package scripts, structural pipeline/report
  source, generated-structure documentation, and end-to-end structural tests.
- Integration gate: explicit operator authorization is required before merge
  into `main`.

### `TRUSS-018` Integrate structural generation with the browser and portable projects

- Outcome: the editor generates, displays, downloads, saves, exports, and
  reopens the exact structural parts and report without requiring planar
  `boundaryTopology`. The planar action remains a separate available route.
- Acceptance: structural failure or staleness does not disable editing,
  simulation, mapping, wiring, or save; pose and structural-input fingerprints
  hide stale assets; folder and ZIP transport preserve exact STL, 3MF, preview,
  analysis, report, profile, and hash bytes.
- Evidence: 10 portable-project tests and 6 pipeline/browser-asset tests cover
  exact structural files, bundled-profile reopen and re-export, hash/format
  gates, current preview, and stale rejection. Five real Chromium journeys pass;
  the structural journey generates 18 parts, exports and reopens a ZIP with a
  changed same-path report, hides stale output after a panel edit, and keeps
  mapping, save, and simulation enabled after a singular solve. `npm run verify`
  passes with all 323 Vitest tests, the pinned WLED rebuild, TypeScript, and the
  production web build. Independent review found cross-project object-URL
  contamination; URL revocation and the same-path import regression passed
  re-review with no remaining finding.
- Depends on: `TRUSS-017`.
- Owner: branch `codex/truss-011-structural-contract`; worktree
  `/tmp/led-rhombo-truss-011`. Continue on the operator-authorized truss
  workstream without a merge to `main`.
- Likely conflicts: `TASKS.md`, browser controls/orchestration, portable-project
  asset handling, structural preview loading, and browser/portable tests.
- Integration gate: explicit operator authorization is required before merge
  into `main`.

### `TRUSS-019` Add a two-panel spatial UI trial project

- Outcome: the sculpture selector includes a small structural trial with two
  nearby non-coplanar panels, independent in-plane rotations, one authored
  bench support, and representative face, corner, and cable-pull loads.
- Acceptance: Schema 2 remains authoritative; headless and browser structural
  generation converge; the fixture produces validated printable assets and is
  selectable without a file upload.
- Evidence: headless generation converges with 18 printable parts, 28 retained
  members, 10 load cases, and 24 validated files. The real Chromium journey
  selects the registered fixture, generates, exports, reopens, checks authored
  supports and loads, hides stale output, and preserves controls after a
  singular failure. `npm run verify` passes with all 324 Vitest tests,
  TypeScript, the pinned WLED rebuild, and the production web build. A
  translated fixture exposed a Float32 3MF placement mismatch; the exporter
  now derives its transform from exact exported vertices, with a focused
  regression. Independent review found no actionable issue.
- Depends on: `TRUSS-018`.
- Owner: branch `codex/truss-011-structural-contract`; worktree
  `/tmp/led-rhombo-truss-011`. Do not merge to `main`.
- Likely conflicts: `TASKS.md`, `FAILURES.md`, structural export code,
  `sculptures/manifest.json`, structural workflow documentation, and browser
  fixture tests.
- Integration gate: explicit operator authorization is required before merge
  into `main`.

### `TRUSS-020` Keep browser structural generation available on LAN preview

- Outcome: the structural action uses the in-browser Manifold pipeline without
  depending on the loopback-only file-generation service.
- Acceptance: a LAN-hosted editor does not request the forbidden local status
  endpoint; the two-panel spatial trial keeps its structural action enabled;
  the loopback API security boundary remains unchanged.
- Evidence: 10 focused status tests cover LAN bypass and explicit localhost,
  IPv4, and IPv6 loopback hosts. The real Chromium structural journey forces
  HTTP 503 from the optional service and still generates, previews, exports,
  reopens, invalidates, and reports a singular solve correctly. TypeScript,
  the production web build, and `git diff --check` pass. Independent review's
  missing-browser-regression finding was corrected and passed re-review.
- Depends on: `TRUSS-018` and `TRUSS-019`.
- Owner: branch `codex/truss-011-structural-contract`; worktree
  `/tmp/led-rhombo-truss-011`. Do not merge to `main`.
- Likely conflicts: `TASKS.md`, `FAILURES.md`, browser generator status and
  orchestration, and generator-status/browser tests.
- Integration gate: explicit operator authorization is required before merge
  into `main`.

## Done

### `CAD-030`–`CAD-036` Replace generic OpenSCAD generation with Manifold

- Generic panel-outline solids, portable STL bundles, local-pipeline serving,
  browser in-process generation, CI proof, and the OpenSCAD-free generic path
  use pinned `manifold-3d` 3.5.1.
- The manual `parts/*.scad` files remain a separate physically tested route.
- Source branches/worktrees remain preserved: `grok/workspace` at `9adb160`
  and `codex/wire-015-printable-manual` at `5329044`.

### `UI-010` Generate Manifold parts through the browser

- The real browser flow loads a mechanics-free project, generates exact
  Manifold STL files, displays them, and exports the portable project ZIP.

### `PLACE-011` Place panels on connected planar mesh faces

- Automatic placement uses connected planar regions and their face normals;
  smoothed vertex normals do not control panel poses.

### Pose-only placement surfaces and flat-gap generation

- Pose-only cuboctahedron and rhombicosidodecahedron GLBs are placement aids.
  Printable caps derive from authoritative panel outlines, including radial
  walks at non-coplanar multi-edge vertices and recessed panel IDs.

### `WIRE-015` Export a printable wiring assembly manual for any project — P0

- Outcome: **Export wiring assembly manual** generates an A4 print/PDF manual
  from the current mapping contract, with no flagship route or palette embedded
  in the renderer.
- Acceptance: panel count, output count, validated output colors, labels,
  GPIOs, routes, address ranges, placement views, and page count are derived.
  Long chains paginate in groups of at most 11 without changing global chain
  positions, cross-sheet links, or physical addresses. Empty outputs render an
  explicit sheet. Draft, stale, temporary, non-authored, and ambiguous mirrored
  instructions remain refused.
- Evidence: generic long-chain, variable-metadata, empty-output, flagship
  parity, refusal, orientation, rendering, and print-CSS tests pass. A real
  browser journey reports the generic export action, six current-project sheets,
  41 rows, the four authored output colors, and **Print / Save PDF**. Full
  Vitest passes 264/264; TypeScript, Vite multi-page build, and
  `git diff --check` pass. A second real Chrome journey through the HTTP LAN
  address proves the `getRandomValues()` handshake fallback when
  `randomUUID()` is unavailable. Independent review has no findings.
- Depends on: first WIRE-015 milestone `aa2f59d`.
- Owner: branch `codex/wire-015-printable-manual`; worktree
  `/home/mate/Documents/led-rhombicosidodecahedron`.
- Likely conflicts: printable manual renderer/tests, browser orchestration,
  wiring documentation, and `TASKS.md`.
- Merge rule: stop at Ready to Merge; do not merge into `main` without explicit
  operator authorization.

### `HW-017` Correct mapping assumptions and readiness scope — P0

- Outcome: the selected snake/RGB contract is mapping-ready, while full
  electrical readiness remains a separate state.
- Acceptance: WLED uses RGB/order 1; snake traversal remains assumed; voltage,
  temperature, and device read-back do not block mapping export; the deployment
  builder rejects any contract with `mappingReady: false`.
- Evidence: the guarded export emits 2,624 addresses on GPIOs 16–19 with
  ledmap fingerprint `bc5054d1`; the exact manifest identity is
  `1673767d17864a522c8994b0707915e47f5a0de474f75cd0d797b2d79272a6eb`.
  Full Vitest passes 257/257; TypeScript, Vite build, sculpture validation,
  schema parsing, artifact parity, and `git diff --check` pass. Independent
  final review has no findings. Full `npm run verify` reached `build:wasm` and
  stopped because the pinned Emscripten 4.0.14 SDK is not installed; the tracked
  WASM runtime passed its tests.
- Depends on: `MAP-030` at `638540e`.
- Owner: branch `codex/hw-017-corrected-assumptions`; worktree
  `/home/mate/Documents/led-rhombicosidodecahedron`.
- Likely conflicts: mapping readiness, WLED deployment generator/artifacts,
  hardware documentation, and `TASKS.md`.
- Merge rule: stop at Ready to Merge; do not merge into `main` without explicit
  operator authorization.

### `MAP-022` Optimize installed panel quarter turns — P0

- Outcome: all 41 installed quarter turns are selected from the saved route and
  geometry to minimize total DOUT-to-next-DIN data-wire length.
- Acceptance: deterministic per-output dynamic programming evaluates all four
  non-mirrored turns, preserves poses/routes, and binds provenance to the exact
  route, poses, and resolved optimization-relevant panel-profile facts.
- Evidence: the estimate is 1,245.8 mm versus 3,429.5 mm for identity; turn
  counts are 0:10, 1:8, 2:14, 3:9; optimization fingerprint is
  `2771611b3264c1da`. Exhaustive small-chain comparison, deterministic replay,
  stale route/pose/profile negatives, all 41 assignments, and ledmap parity
  pass. Full Vitest passes 257/257; TypeScript, Vite build, sculpture validation,
  and `git diff --check` pass. Independent final review has no findings.
- Depends on: `MAP-021` at `05ae747` and `WIRE-014` at `359cb0f`.
- Owner: branch `codex/hw-017-corrected-assumptions`; same worktree.
- Likely conflicts: Schema 2 parser/project loading, editor invalidation,
  mapping compiler/artifacts, flagship sculpture JSON, and wiring docs.
- Merge rule: stop at Ready to Merge; do not merge into `main` without explicit
  operator authorization.

### `MAP-030` Define the WLED controller bus contract — P0

- Outcome: generation now emits one non-secret assumed-review WLED fragment for
  the pinned target and exact four mapping outputs.
- Contract: total 2,624, global `maxpwr: 0`, GPIOs 16/17/18/19, starts
  0/704/1344/1984, lengths 704/640/640/640, type 22, RGB order 1, no reversal,
  60 mA/LED, 14 A/bus, RMT driver 0, and domains A/A/B/B.
- Identity: a canonical manifest records exact path, byte length, and SHA-256
  for config and ledmap plus source-project and pinned-target identities. Its
  exact-byte SHA-256 is the external review deployment identity; it does not
  list itself.
- Correction: `HW-017` changes manifest status to `assumed-mapping-ready` and
  separates electrical approval from mapping.
- Evidence: pinned source commit and all WLED field semantics were audited;
  original generator identity was `d798327877bedf46dee3d63216b1ecb0e5bf31c917276664eb6bbdfd91087c57`;
  golden and tamper tests pass; full Vitest passes 250/250; TypeScript and
  `git diff --check` pass. Independent re-review has no findings.
- Depends on: `MAP-021` at `05ae747`, `WIRE-014` at `359cb0f`, and `HW-016` at
  `f1b728c`. Exact SHA-256 supplies deployment identity; MAP-020 remains for the
  legacy UI fingerprint.
- Owner: branch `codex/map-030-wled-bus-contract`; worktree
  `/home/mate/Documents/led-rhombicosidodecahedron`.
- Likely conflicts: mapping generator, WLED review artifacts, hardware docs,
  task state, and future deployment scripts.
- Merge rule: stop at Ready to Merge; do not merge into `main` without explicit
  operator authorization.

### `MAP-021` Compile installed-panel address transforms — P0

- Outcome: Schema 2 now stores and compiles an installed address transform
  without changing poses, world LED positions, or logical coordinates.
- Acceptance: the frame is back view; mirroring occurs first; zero to three
  clockwise quarter turns follow. Missing legacy fields become assumed identity
  and never infer from mechanical fields. Measured global calibration requires
  every transform measured; the converse contradiction is rejected. Panel edits
  keep numeric values but explicitly change their status to assumed.
- Assumed flagship decision: all 41 panels start as identity, zero-turn,
  non-mirrored, status assumed. Physical calibration can change each value later
  without changing the route or panel pose.
- Evidence: fixed corner and row-transition vectors pass; all eight transforms
  crossed with all 16 supported pixel orders produce complete 64-address
  permutations; focused tests pass 39/39; full Vitest passes 248/248;
  TypeScript, sculpture validation, schema JSON parsing, and `git diff --check`
  pass. All 2,624 canonical addresses remain unique and fingerprint
  `31291c59` is unchanged. Independent re-review has no findings.
- Depends on: `WIRE-014` at `359cb0f`; physical measurement remains `CAL-010`.
- Owner: branch `codex/map-021-installed-transform`; worktree
  `/home/mate/Documents/led-rhombicosidodecahedron`.
- Likely conflicts: Schema 2 panel contract/parser, mapping compiler and
  readiness, editor invalidation, flagship JSON, generated panel map, and docs.
- Merge rule: stop at Ready to Merge; do not merge into `main` without explicit
  operator authorization.

### `WIRE-014` Save the assumed 41-panel prototype route and GPIOs — P0

- Outcome: the flagship source now stores the exact simulator route as
  authored route revision 1 and binds outputs 0–3 to GPIOs 16–19.
- Acceptance: all 41 panel IDs occur exactly once in saved 11/10/10/10 order;
  the lifecycle is authored; notes and UI identify the route and GPIOs as
  assumptions, not measurements; browser draft coverage remains synthetic.
- Evidence: Schema validation reports 41 panels and 2,624 LEDs; focused tests
  pass 32/32; full Vitest passes 244/244; the Playwright draft journey passes;
  TypeScript and `git diff --check` pass. The generated panel map has the saved
  authored route, 2,624 unique addresses, and unchanged fingerprint
  `31291c59`. Independent review found the route internally consistent and its
  stale-documentation finding is resolved.
- Depends on: `WIRE-011` at `d8ac08d` and `HW-016` at `f1b728c`.
- Owner: branch `codex/wire-014-prototype-route`; worktree
  `/home/mate/Documents/led-rhombicosidodecahedron`.
- Likely conflicts: flagship sculpture JSON, generated panel-map review
  artifact, wiring preview wording, and route/browser tests.
- Merge rule: stop at Ready to Merge; do not merge into `main` without explicit
  operator authorization.

### `HW-016` Establish the assumed prototype hardware baseline — P0

- Outcome: the prototype contract selects an ESP32-DevKitC V4 with an
  ESP32-WROOM-32E-N4, pinned WLED commit `d9b9a846`, `esp32dev`, GPIOs
  16/17/18/19, an SN74AHCT125, and four limited WS281x buses.
- Power decision (`HR-015`): two isolated 5 V / 40 A positive domains share a
  star ground. Two 14 A buses per domain cap it at 28 A; global WLED ABL is zero
  so per-bus limits apply. Each output uses a 15 A fused 12 AWG trunk; each
  panel has a separate 18 AWG pair and 5 A positive fuse. Unrestricted full
  white is not approved.
- Controller decision (`HR-014`): local WLED web/JSON control only. `HW-017`
  corrects color order to RGB; the snake remains assumed; `MAP-022` selects
  non-mirrored installed quarter turns. Ethernet, transport, audio, and custom
  effects remain deferred.
- Safety: mapping assumptions do not claim electrical approval. Current,
  connector, fuse, and fault protection remain separate.
- Evidence: board pins agree with Espressif documentation; bus fields and ABL
  behavior agree with the exact pinned WLED source; output arithmetic and power
  domains cross-check; `git diff --check` passes; independent review resolved
  all findings.
- Owner: branch `codex/hw-016-prototype-contract`; worktree
  `/home/mate/Documents/led-rhombicosidodecahedron`.
- Likely conflicts: hardware decisions, LED mapping, software/power guidance,
  and task dependencies.
- Merge rule: stop at Ready to Merge; do not merge into `main` without explicit
  operator authorization.

### `HR-014` Select the production ESP32/WLED execution contract

- Decision: resolved by the assumed controller selection in `HW-016` and D15.
- Remaining proof: compile, install, and read back the exact pinned target under
  `FIRM-011`; a different physical board invalidates this decision.

### `HR-015` Select the operating power envelope

- Decision: resolved by the limited two-domain plan in `HW-016` and D15.
- Remaining proof: `PWR-010` must validate the plan under physical load before
  all panels are energized.

### `WIRE-011` Edit and confirm routes in the browser — P0

- Outcome: the browser now lets the operator copy a labelled draft, assign and
  reorder panels in controller-to-DIN-to-DOUT order, inspect route metadata,
  and explicitly confirm the exact stored route.
- Acceptance: each row shows output, GPIO or `unknown`, one-based chain
  position, predecessor/successor, and connector direction. Confirmation
  stores exact `panelIds`, derives chain lengths, advances `routeRevision`,
  clears stale proof, and returns measured or review state to authored with
  provisional physical-chain calibration. Later relevant sculpture edits keep
  the route and revision but mark them requires-review.
- Safety: draft suggestions need an explicit copy action; GPIO and output
  metadata are read-only; confirmation does not create measured, physical, or
  hardware-ready claims.
- Evidence: focused route/lifecycle/mapping tests pass 30/30; the full Vitest
  suite passes 244/244; the 41-panel Playwright copy/edit/confirm/save/reopen
  journey passes; TypeScript, Vite production build, JSON parsing, and
  `git diff --check` pass; independent review findings are resolved.
- Depends on: `WIRE-010` at `c0c58b8` and `WIRE-013` at `139f0c0`.
- Owner: branch `codex/wire-011-route-editor`; worktree
  `/home/mate/Documents/led-rhombicosidodecahedron`.
- Likely conflicts: browser orchestration and styles, Schema 2 wiring contract,
  browser tests, and wiring/architecture documentation.
- Merge rule: stop at Ready to Merge; do not merge into `main` without explicit
  operator authorization.

### `WIRE-013` Add production-capable wiring lifecycle states — P0

- Outcome: Schema 2 now defines draft, authored, requires-review, measured, and
  hardware-verified wiring states. Legacy provisional projects derive as draft
  or authored without changing their saved bytes.
- Acceptance: explicit non-draft routes require ordered panel IDs; measured
  wiring requires a measured controller; current measured-fact checks can pass
  without claiming address or hardware readiness; hardware export remains
  blocked by `MAP-021`, `MAP-030`, and `PWR-010`; hardware-verified activation
  is rejected until `PROOF-010` supplies an acceptance validator.
- Invalidation: pose and panel-set edits preserve the last authored route and
  enter requires-review. A stale panel-set route remains saved while a clearly
  labelled temporary suggestion keeps mapping and simulation operational.
- Evidence: lifecycle and mutation tests pass 39/39; the full Vitest suite
  passes 240/240 with loopback access; `npx tsc -b --pretty false`, schema JSON
  parsing, and `git diff --check` pass; independent review confirmed all safety
  blockers are resolved.
- Depends on: `WIRE-010` at `c0c58b8`.
- Remaining gates: profile, installed-address, bus, power, deployment, and proof
  changes cannot unlock hardware output until their owning tasks add validated
  contracts and call the requires-review transition.
- Owner: branch `codex/wire-013-lifecycle`; worktree
  `/home/mate/Documents/led-rhombicosidodecahedron`.
- Likely conflicts: Schema 2 wiring types/schema/parser, editor invalidation,
  wiring preview, hardware readiness, browser status text, and related tests
  and mapping docs.
- Merge rule: operator approval is required before integration into `main`.

### `WIRE-010` Store an explicit ordered panel route per output — P0

- Outcome: Schema 2 now preserves an exact ordered DIN-to-DOUT `panelIds`
  route for each output. The browser preview, physical mapping, review export,
  save, and reopen paths use that order without route optimization.
- Acceptance: route fields are all-or-nothing; output array order, optional
  GPIOs, route lengths, known IDs, and exact once-only panel coverage validate;
  old projects remain clearly labelled draft suggestions; pose edits preserve
  routes; panel-set edits clear them with a saved review note.
- Evidence: focused route tests pass 21/21; the full Vitest suite passes 235/235
  with loopback access; `npx tsc -b --pretty false` and `git diff --check` pass;
  an independent review approved the corrected direct-preview validation.
- Depends on: none. The canonical 41-panel project still contains no measured
  route or GPIO values. Those require `CAL-010`, `HR-014`, and installation
  evidence.
- Owner: branch `codex/wire-010-authored-routes`; worktree
  `/home/mate/Documents/led-rhombicosidodecahedron`.
- Likely conflicts: `schemas/panel-assembly.schema.json`,
  `src/sculpture/PanelAssembly.ts`, `src/sculpture/SculptureEditor.ts`,
  `web/src/WiringPreview.ts`, `web/src/main.ts`, mapping/wiring tests, and
  mapping docs.
- Merge rule: operator approval is required before integration into `main`.

### `CTRL-005` Prioritize exact 41-panel wiring and ESP32 mapping parity

- Scope: turn the physical-build direction into ordered software, calibration,
  controller, electrical, installation, deployment, and proof tasks without
  implementing production code or inventing measurements.
- Acceptance: the active milestone and task priority reflect wiring/mapping;
  provisional exports cannot be mistaken for build instructions; one-panel,
  power, controller, as-built, and final parity gates are explicit; architecture
  and LED-mapping documents agree with the board.
- Depends on: `CTRL-004`.
- Owner: branch `codex/ctrl-004-reconstruct-project`; worktree
  `/home/mate/Documents/led-rhombicosidodecahedron`.
- Likely conflicts: `TASKS.md`, `AGENTS.md`, `FAILURES.md`,
  `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/LED_MAPPING.md`,
  `docs/ROADMAP.md`, and `docs/software.md`.
- Merge rule: operator approval is required before integration into `main`.

### `CTRL-004` Reconstruct current project control and architecture documents

- Scope: reconcile repository state, architecture, decisions, work status,
  collaboration rules, dependencies, and conflict risks without production-code
  changes; record reusable workflow failures found during closeout.
- Acceptance: `AGENTS.md`, this board, `docs/ARCHITECTURE.md`, and
  `docs/DECISIONS.md` agree with `main` at `ab9a96a`; `docs/ROADMAP.md` contains
  no conflicting browser-test claim; `TEST-011` is closed; blocked installation
  work is not listed as Ready; the full task lifecycle and no-automatic-merge
  rule are explicit; Markdown links and diff hygiene pass.
- Depends on: none.
- Owner: branch `codex/ctrl-004-reconstruct-project`; worktree
  `/home/mate/Documents/led-rhombicosidodecahedron`.
- Likely conflicts: the four required shared control/architecture documents and
  `docs/ROADMAP.md` and `FAILURES.md`.
- Merge rule: operator approval is required before integration into `main`.

### `HR-003` Confirm when a suggested route becomes authored

- Decision confirmed by the operator direction on 2026-08-20: the simulator
  must show the exact route that will be built. A heuristic route remains a
  draft until explicit confirmation. The confirmed ordered route persists;
  relevant edits mark it for review and never silently replace it.
- Implements through: `WIRE-010`, `WIRE-013`, and `WIRE-011`.

### `HR-004` Gate production exports on hardware evidence

- Decision confirmed by the operator direction on 2026-08-20: controller-ready
  output must be blocked until route, panel order, installed orientation, pixel
  order, color order, GPIO/bus configuration, power limit, and deployment
  identity are current and verified.
- Clearly named diagnostic artifacts may remain available while provisional;
  they must not look hardware-ready.
- Implements through: `WIRE-012`.

### `TEST-011` Cover folder/ZIP controls in the browser (`ab9a96a`)

- Playwright Chromium now imports a portable ZIP, restores referenced GLB and
  exact STL object URLs, exports folder and ZIP forms, reopens the exported ZIP,
  and verifies exact bytes and hashes.
- The journey marks generated mechanics stale after a valid additive panel
  edit, rejects missing and tampered assets with domain-specific status, and
  verifies object-URL release when the project is replaced.
- `main` and `origin/main` contain the implementation at `ab9a96a`. This
  2026-08-20 control audit inspected the test and commit; it did not repeat the
  browser run because npm dependencies are absent from this worktree.

### `TEST-010` Add a real browser smoke test for mechanics-free authoring

- Playwright Chromium now operates the real browser controls from a clean Vite host. It imports a mechanics-free Schema 2 project and a deterministic GLB, auto-places panels, selects and deletes a panel, uses mapping and wiring controls, pauses and resumes the WLED simulator, and saves the edited project.
- The test verifies the saved panel set, chain length, design-surface reference, mechanics-free state, and absence of browser page and console errors. It also records traces, screenshots, and video on failure.
- Local verification passed: one Playwright browser test, all 230 Vitest tests, TypeScript, the production web build, workflow YAML validation, and diff hygiene. An independent review approved the slice.
- Exact clean CI evidence: workflow run `31836393437`, Chromium job `94883512745`, commit `43671de34eab0123040befd526c4f1b29ebaf4b3`.

### `INSTALL-011A` Commit the reviewed stage-zero bootstrap executables

- `bootstrap.sh` selects the exact committed Linux x86-64, macOS arm64, or
  macOS x86-64 file before Node.js or Python exists. Windows is not a current
  stage-zero target.
- The standard-library Go source supplies strict manifest parsing,
  certificate-validated HTTPS, exact size and SHA-256 checks, bounded safe
  tar/gzip extraction, target-bound receipts, locking, tamper detection, and
  atomic repository-local publication.
- Go 1.26.6 source, license, compiler archive, deterministic build policy,
  source digest, binary sizes, and binary SHA-256 values are pinned in
  `toolchains/bootstrap/`. A two-build check matches all committed bytes.
- Workflow run `31826385513` passed the exact committed executable and contained
  self-test on Linux x86-64 job `94851417447`, macOS arm64 job `94851417444`,
  and macOS x86-64 job `94851417476`.
- Independent review passed after deterministic directory/symbolic-link hash,
  native self-test, compiler-provenance, and linked-receipt findings were
  corrected. Go tests and race tests, 230 Vitest tests, TypeScript, the web
  build, YAML lint, shell syntax, reproducible builds, and diff hygiene passed.
- This is the stage-zero trust root only. Complete automatic installation still
  requires `INSTALL-011B`, `INSTALL-011C`, and the Python decision in `HR-013`.

### `ASSET-010` Preserve the referenced GLB in generated project folders

- Browser generation sends one bounded multipart request containing the JSON
  and only the referenced, SHA-256-verified GLB bytes. Raw and multipart JSON
  fields are limited to 5 MB, and the complete multipart request is limited to
  64 MB before generation can start.
- The generator rejects missing, tampered, URL-escaped, reserved, or
  case-folded path collisions before staging or rendering. It copies the GLB to
  its unchanged safe relative path, verifies the staged copy, and atomically
  publishes it with the exact STL files and `sculpture.json`.
- The generated folder opens directly. Folder -> ZIP -> reopen preserves every
  GLB and STL byte and hash without external asset injection. Failure preserves
  the prior published folder and leaves no pending output.
- Independent review approved the implementation after the portable
  case-collision and URL-escape findings were corrected. Focused path,
  transport, handler, generator, and server tests, the complete Vitest suite,
  TypeScript, the production build, Markdown links, and diff hygiene passed.

### `DOC-010` Reconcile documentation with shipped behavior

- Public and architecture documents now describe automatic topology detection,
  boundary validation, exact STL generation and display, folder and ZIP
  transport, and local production generation as shipped behavior.
- The documents state that the browser has no topology confirmation or
  correction controls. Later `ASSET-010` work made generated folders include
  the referenced verified GLB at its unchanged safe relative path.
- False current claims about ESP32 firmware, DDP, Art-Net, Ethernet,
  microphones, and audio-reactive hardware behavior were removed or identified
  as proposals. The browser remains a small WLED effect simulator.
- Platform setup text describes Linux and macOS as the current required targets.
  The Windows x86-64 candidate remains implemented, while client qualification
  is deferred and does not block installation work. Helper-level tests no
  longer imply real browser-control coverage.
- Independent review passed after present-tense generator, boundary timing,
  browser-test scope, printable-prototype wording, and broken-link findings were
  corrected. Repository-wide contradiction scans, all local Markdown links,
  and diff hygiene passed.

### `INSTALL-014` Acquire and connect pinned OpenSCAD on Windows x86-64

- `npm.cmd run setup:openscad` now acquires the official portable OpenSCAD
  2021.01 ZIP for the `win32-x64` candidate, verifies its exact 21,884,613-byte
  size and SHA-256, validates all 221 allow-listed ZIP entries, and publishes a
  target-bound receipt below the ignored `.tools` path.
- Setup is repository-local, atomic, safe to retry, and valid in paths with
  spaces and `&`. It does not use an installer, administrator access, registry,
  profile, system application directory, or `PATH` change.
- Runtime selection remains explicit `OPENSCAD`, then the verified managed
  `openscad.com`, then the Windows system command. Native ARM64 is rejected.
  Bounded shutdown stops the complete `openscad.com` and `openscad.exe` process
  tree and waits for exit.
- Actions run `31811725310` passed the clean setup-twice, real two-STL local
  production-editor, active-render shutdown, and no-host-mutation proof on
  Windows Server 2022 job `94803696105` and Windows Server 2025 job
  `94803696109`.
- Main workflow run `31812227275` passed after integration.
- Independent review passed after ZIP type, native architecture, system command,
  bounded process-tree, and active-render proof findings were corrected. All
  215 Vitest tests, TypeScript, the production desktop build, workflow lint,
  real 221-entry archive validation, and diff hygiene passed.
- This is a verified Windows x86-64 implementation candidate, not a Windows PC
  support claim. Windows client qualification is deferred and does not block
  the required Linux and macOS installation work.

### `INSTALL-013` Acquire and connect pinned OpenSCAD on macOS

- `npm run setup:openscad` now acquires the pinned official universal OpenSCAD
  2026.06.12 DMG on macOS 15 arm64 and x86-64. It verifies the exact size and
  SHA-256 value and publishes a target-bound receipt below the ignored `.tools`
  path.
- Setup rejects Rosetta and wrong native hosts before writes, mounts the DMG
  read-only, copies only `OpenSCAD.app`, validates the native Mach-O slice and
  app tree, cleans normal and partial mounts, and preserves atomic retry and
  warm reuse in repository paths that contain spaces.
- Runtime selection remains explicit `OPENSCAD`, then the verified native
  managed tool, then a supported system fallback. Linux 2021.01 behavior is
  unchanged.
- Artifact qualification run `31803416226` passed native version and STL
  rendering, signature, Gatekeeper, and DMG notarization checks on Apple
  Silicon and Intel. Permanent run `31806091066` passed setup twice and the real
  two-STL local production-server and shutdown journey on both native targets.
- Independent review passed after runtime fallback, DMG cleanup, permanent CI,
  and Apple-tool preflight findings were corrected. All 181 Vitest tests,
  TypeScript, the production web build, YAML lint, Linux real-render regression,
  local server verification, and diff hygiene passed.

### `INSTALL-010` Acquire and connect pinned OpenSCAD automatically

- `npm run setup:openscad` acquires pinned OpenSCAD 2021.01 and `libgpg-error0`
  artifacts on Debian 13 or Ubuntu 24.04 x86-64, verifies exact sizes and SHA-256
  values, and publishes a receipt-backed tool below the ignored `.tools` path.
- Setup requires no administrator access or `PATH` change, preserves a prior
  install on failure, is safe to retry, and reuses a valid warm installation.
- Runtime selection is explicit `OPENSCAD`, then the verified managed tool, then
  a system fallback. The production generator uses the same selection path.
- A clean local proof installed the tool, reused it on a second setup run, and
  generated and inspected canonical `part-001` and `part-002` STL files.
- Independent review passed after exact OS-tuple, rollback-error, and pinned-CI
  findings were corrected. All 168 Vitest tests, TypeScript, the production web
  build, YAML lint, the real OpenSCAD render, and diff hygiene passed.

### `MECH-011` Serve the production desktop UI with local OpenSCAD generation

- `npm run desktop` builds and serves the production interface on loopback with
  the shared bounded status/generation handler and live generated-asset overlays.
- OpenSCAD 2021.01 is discovered from explicit `OPENSCAD`, the receipt-backed
  managed tool, then system `PATH`. Missing or mismatched versions disable only
  generation with repair guidance.
- Browser status discovery keeps JSON, assets, generated output, and OpenSCAD local.
- The server enforces request bounds; tests cover origin and path safety, exact
  STL retrieval, and clean active-generation shutdown.
- Independent review passed after environment-isolation, restart-guidance,
  origin-scheme, and active-shutdown findings were corrected.
- All 157 Vitest tests, TypeScript through `build:desktop`, the production Vite
  build, and diff hygiene passed.

### `MECH-010` Automatically close flat gaps from placed panels

- Deterministic exposed-edge detection derives reverse-wound cap cycles from authoritative panel poses/profile facts and rejects ambiguous, open, wrongly wound, or non-manifold graphs actionably.
- Missing topology is stored as content-derived stable gap IDs in Schema 2; previously accepted topology remains unchanged.
- The existing boundary validator and exact printable-parts pipeline consume the detected topology before any artifact is published.
- The GLB -> placement/edit -> parts -> folder/ZIP reopen test starts without `boundaryTopology` and injects no cycles.
- Independent review passed; focused tests, all 134 Vitest tests, TypeScript, the production web build, and diff hygiene passed.

### `CTRL-003` Establish portable agent-learning and bootstrap guidance

- `AGENTS.md` defines the orchestrator's end-to-end operating loop and connects
  task status, integration, verification, and failure learning.
- `FAILURES.md` provides a durable, blame-free lesson format and promotion path
  into rules or automated checks.
- `docs/AGENTIC_WORKFLOW_BOOTSTRAP.md` gives a newly cloned or reopened
  repository a first-agent prompt and an evidence-first setup procedure without
  imposing this project's domain rules on another codebase.

### `CTRL-001` Establish this persistent task board

- Reconstructed from repository code, tests, docs, Git history, TODO/provisional markers, and independent docs/code/UI audits.
- No first-party `TODO`, `FIXME`, or `HACK` markers were found; outstanding work was reconstructed from actual behavior and documented gaps.

### `CTRL-002` Document the known patch-helper fallback

- `AGENTS.md` records the exact `bwrap` failure, the `git apply --unidiff-zero` fallback, the temporary staging procedure required for new untracked files, and the final status check.
- Decision confirmed by the user on 2026-08-14: agents should use the established workaround without repeatedly rediscovering or discussing it.

### `HR-001` Automatic flat-gap closure is the required primary workflow

- Decision confirmed by the user on 2026-08-14: users arrange panels so intended gaps are flat N-gons; generation must find and close those gaps automatically. Hand-authored JSON is not the normal workflow.
- Implementation task: `MECH-010`.

### `HR-002` The product is an installed, locally served desktop production system

- Decision confirmed by the user on 2026-08-14: OpenSCAD runs on the installed computer behind the local interface. A public hosted generation service is not the product architecture.
- Implementation task: `MECH-011`.

### `HR-010` Repository installation must acquire all dependencies automatically

- Decision confirmed by the user on 2026-08-14: after cloning the repository, no manual Node.js, npm, OpenSCAD, SDK, PATH, or dependency-connection step is acceptable.
- Implementation sequence: `INSTALL-010`, `INSTALL-011A`, `INSTALL-011B`, `INSTALL-011C`, and `INSTALL-012`.

### `HR-011` Linux and macOS are the current required installation targets

- Decision confirmed by the operator: `INSTALL-011` and `INSTALL-012` must complete for the declared Linux and native macOS targets.
- The implemented Windows x86-64 candidate and its CI checks remain in the repository. Windows client qualification is deferred and is not a dependency or completion gate for the current bootstrap work.

### `HR-012` Use committed native stage-zero bootstrap executables

- Decision confirmed by the operator on 2026-08-14: commit small, reviewed bootstrap executables for Linux x86-64, macOS arm64, and macOS x86-64.
- Each executable must be built from committed source with a pinned compiler, reproducible build instructions, exact hashes, byte-for-byte rebuild checks, and native execution checks.
- The executable supplies certificate-validated HTTPS, exact size/SHA-256 verification, safe bounded extraction, and atomic publication before Node.js or Python exists.
- This decision does not approve a Python binary provider. That separate supply-chain decision remains in `HR-013`.

### `CORE-001` Mechanics-free Schema 2 editor (`7b40263`)

- GLB placement, automatic/manual panel editing, simulation, mapping, wiring, save, and reload work without mechanics.

### `ASSET-001` Portable relative-path and SHA-256 asset contract (`0df76c7`)

- GLB/STL references are safe relative paths with verified bytes and fail-closed loading.

### `BOUNDARY-001` Validated closed-boundary generation (`d12b48e`)

- Authoritative panel/profile outlines plus supplied connectivity-only corner cycles generate a planar/simple/manifold closed boundary.
- Scope note: this initial slice required supplied cycles; automatic unambiguous discovery shipped in `MECH-010`, while ambiguous correction remains in `MECH-020`.

### `PARTS-001` Exact printable STL generation and display (`a9a9d43`)

- Stable printable parts are staged atomically, referenced by hash in JSON, reloaded as the exact files, and marked stale after panel edits.

### `BUILD-001` Clean-checkout build and test path (`d828d1e`)

- CI installs the pinned toolchain and runs the repository verification path from a clean checkout.

### `BUILD-002` Checked-in pinned WLED WASM runtime (`6302ad2`, `8dda052`)

- Ordinary tests and the viewer work immediately after checkout; source/SDK changes require rebuilding and recommitting both runtime files.

### `PORTABLE-001` Folder and ZIP import/export (`5fa1b60`)

- Portable helpers validate paths/hashes, preserve exact assets, and round-trip project bundles at library/integration-test level.
- Scope note: real-browser control coverage remains in `TEST-011`.

### `MANUAL-001` Preserve the physically tested 41-panel manual CAD route

- The manual U-frame geometry remains separate and supported; generic planar mechanics do not claim equivalence.
