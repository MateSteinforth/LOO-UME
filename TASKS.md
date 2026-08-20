# Project task board

Last reconciled: 2026-08-20
Backlog reconstructed from: `main` at `ab9a96a`
Current milestone: make the manual 41-panel sculpture reproduce the simulator's
spatial LED output on one selected ESP32/WLED target. The path is: measured
single-panel facts -> authored four-output route -> installed-panel address
transforms -> guarded WLED deployment bundle -> one-panel proof -> 41-panel
proof. Fabrication and installation-bootstrap work remain supported but are not
the active priority.

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
- Acceptance: the exact scope is chosen from a real model; geometry preserves PCB envelopes and connector access; changed parts render in OpenSCAD and receive physical review.
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

### `MAP-021` Compile installed-panel address transforms

- Outcome: add an explicit installed address transform that maps pose-local
  display coordinates to the PCB's measured wire coordinates without changing
  the authoritative pose or LED world positions. Do not reuse the existing
  geometry/mechanical `rotationDegrees` as an address transform.
- Acceptance: the schema defines a back-view reference frame, discrete quarter
  turns, and mirroring with a migration rule for existing fields; the mapping
  compiler covers all eight square-panel transforms plus supported pixel-zero,
  traversal, and serpentine combinations; distinctive corner and row-transition
  vectors produce the expected physical indices; incomplete measured data is
  rejected. Measured color order flows separately into the WLED bus contract.
- Depends on: `WIRE-010` and measured facts from `CAL-010`.
- Verify: focused mapping tests, all 2,624 canonical LED records, save/reopen,
  and negative incomplete/contradictory fixtures.

### `WIRE-013` Add production-capable wiring lifecycle states

- Outcome: replace the provisional-only parser constraint with explicit draft,
  authored, requires-review, measured, and hardware-verified states.
- Acceptance: a complete measured fixture can reach readiness; missing evidence
  gives specific blockers; pose, panel-set, route, or profile edits invalidate
  the affected approval without silently replacing the authored route. This
  task defines the states and transitions; only evidence accepted by
  `PROOF-010` can trigger the hardware-verified transition.
- Depends on: `WIRE-010`.
- Verify: parser and mutation tests for every state transition plus browser and
  CLI readiness parity.

### `MAP-030` Define the WLED controller bus contract

- Outcome: generate one non-secret controller contract for the selected board,
  pinned WLED build, four output buses, global start indices, lengths, GPIOs,
  LED type/color order, explicit `reversed: false`, level shifting, and
  power-domain assignment. The authored route and ledmap own direction; WLED bus
  reversal must not add a second transform.
- Acceptance: every bus range agrees with the authored route; the 2,624-entry
  ledmap uses `map[logicalIndex] = globalPhysicalIndex`; configuration and map
  have SHA-256 deployment identities and reject stale or contradictory input.
  Hash the exact emitted bytes of every deployable file; build the root identity
  from a versioned canonical manifest of path, byte length, and file SHA-256.
  The manifest does not list or hash itself; its exact-byte SHA-256 is the root
  identity recorded in the external deployment receipt.
- Depends on: `MAP-020`, `MAP-021`, `WIRE-013`, `CAL-010`, `HR-014`, and
  `PWR-010`.
- Verify: golden configuration vectors, boundary indices for all four outputs,
  exact pinned-WLED compatibility tests, and tamper/staleness negatives.

### `FIRM-011` Build and deploy the minimum pinned WLED target

- Outcome: produce a reproducible firmware artifact and non-secret device
  configuration for mapping proof only, without adding network/audio feature
  claims.
- Acceptance: device read-back confirms board/build identity, WLED revision,
  four GPIOs, bus starts/lengths, color order, current limit, and installed
  `ledmap.json` SHA-256; every bus reports reversal disabled; credentials remain
  outside Git.
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

### `UI-010` Complete the arbitrary-project acceptance journey — P2

- Outcome: GLB -> auto-place -> manual edit -> automatic topology -> boundary ->
  exact STL parts -> display -> ZIP -> reopen works through the real UI.
- Acceptance: the browser test starts without `boundaryTopology`, drives the
  real local generator and OpenSCAD, injects no topology or asset bytes, and
  verifies the saved/reopened project and exact referenced parts.
- Depends on: completed `MECH-010`, `MECH-011`, `ASSET-010`, `TEST-010`, and
  `TEST-011`. Reuse `CI-010` real-render setup where practical, but do not
  duplicate its helper-level assertions.
- Verify: focused Playwright Chromium journey, existing browser journeys,
  focused pipeline tests, and real OpenSCAD output inspection.

### `CI-010` Exercise the panel-outline boundary-to-parts route with real OpenSCAD — P1

- Outcome: CI checks the new fabrication path with OpenSCAD instead of relying only on a deterministic fake renderer.
- Acceptance: one canonical supported fixture generates a boundary and every exact part through OpenSCAD; invalid topology fails before OpenSCAD; useful failure artifacts are retained.
- Depends on: none.

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

- None.

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

- Outcome: one command uses the managed base toolchain to initialize WLED, install exact npm dependencies, acquire OpenSCAD, install pinned Emscripten, verify generator availability, and print the managed desktop start command.
- Acceptance: all subprocesses use explicit managed paths; repeated and interrupted runs are safe; failures name the dependency and recovery action; Windows candidate behavior may remain but is not a completion gate.
- Blocked by: `INSTALL-011B`; `INSTALL-010` and `INSTALL-013` are complete.
- Verify: empty-cache and warm-cache integration tests, interruption recovery, `npm run verify`, real OpenSCAD generation, and a local production-server smoke test.
- Docs: make this the primary Linux/macOS installation path and list only the chosen stage-zero supply as the prerequisite.

### `INSTALL-012` Prove automatic installation on clean supported systems — P0

- Outcome: every current required platform proves that a fresh clone becomes a working local production editor without a manual Node, npm, Python, OpenSCAD, SDK, utility, PATH, or dependency-wiring step.
- Acceptance:
  - CI starts from clean Linux and macOS environments for every OS/architecture pair declared required by the bootstrap.
  - Each job runs only the documented bootstrap and start commands, sees generator status `available: true`, generates exact STL files with real OpenSCAD, and shuts down cleanly.
  - Cached tools are verified before reuse; tampered downloads, unsupported systems, offline failures, and partial installs fail safely and actionably.
- Windows candidate CI may remain as non-gating compatibility evidence; it does not define a current supported target.
- Blocked by: `INSTALL-011C`. `INSTALL-010` and `INSTALL-013` are complete; reuse the real-render journey from `CI-010`.
- Verify: the clean-install matrix is required in CI and release checks; tests remove Node.js, npm, Python, OpenSCAD, Emscripten, and undeclared download/archive utilities from `PATH` and may use only Git plus the declared standard shell before bootstrap starts.
- Docs: publish the tested Linux and macOS matrix and state clearly which repository installation command applies to each required platform.

### `WIRE-011` Edit and confirm routes in the browser

- Outcome: let the operator assign and reorder panels by the actual assembly
  sequence, inspect DIN-to-DOUT direction, and explicitly confirm the stored
  route.
- Acceptance: the UI shows output, GPIO when known, chain position,
  predecessor/successor, and connector direction; confirmation persists a
  revision; later relevant edits mark it requires-review without replacement;
  the interface does not call a heuristic route optimized or physical.
- Blocked by: `WIRE-010` and `WIRE-013`.
- Verify: focused UI state tests, Playwright route edit/confirm/save/reopen, and
  mapping equivalence before and after confirmation.

### `WIRE-012` Unify readiness and export policy

- Outcome: browser and CLI use one evidence-gated production export and never
  present provisional or stale files as controller-ready.
- Acceptance: draft data can produce only clearly named diagnostic artifacts;
  an installation-ready bundle contains `ledmap.json`, non-secret bus
  configuration, route/mapping manifest, source and artifact SHA-256 values,
  pinned WLED/build identity, current-limit data, and an install/read-back
  checklist; any missing, stale, or tampered prerequisite blocks that bundle;
  `WIRE-013` defines the lifecycle and only accepted `PROOF-010` evidence can
  authorize the hardware-verified transition.
- Blocked by: `WIRE-011`, `MAP-030`, `CAL-010`, and `PWR-010`.
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
- Unblocks: `MAP-021`, `PWR-010`, and later hardware readiness.

### `HR-014` Select the production ESP32/WLED execution contract — Decision needed

- Decide: exact ESP32 board/variant, pinned WLED revision/build target, four
  legal data GPIOs, LED driver/bus type, level shifter, configuration/deployment
  method, and whether PSRAM or other board limits affect 2,624 pixels.
- Recommended scope: prove native WLED 1D ledmap plus four buses first. Defer
  Ethernet, DDP, Art-Net, microphone, audio, presets, and custom effects.
- Unblocks: `MAP-030` and `FIRM-011`.

### `HR-015` Select the operating power envelope — Decision needed

- Decide: whether full-white at full brightness is a required operating mode,
  the available 5 V supplies, number of independent positive-rail domains, and
  the approved maximum continuous current.
- Evidence: the conservative profile limit is 157.44 A for 2,624 pixels and
  42.24/38.40/38.40/38.40 A for the current draft output lengths. The existing
  two 40 A proposal cannot supply conservative unrestricted full white.
- Constraint: grounds are common; positive rails remain isolated; software
  brightness/current limiting is secondary protection.
- Unblocks: `PWR-010`.

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

## Done

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
