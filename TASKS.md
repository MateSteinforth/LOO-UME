# Project task board

Last reconciled: 2026-08-14
Backlog reconstructed from: `main` at `5fa1b60`
Current milestone: make the arbitrary-project workflow complete: GLB -> panel placement/editing -> automatically close the flat gaps between panels -> watertight boundary -> printable parts -> exact referenced assets -> folder/ZIP reopen. The installed desktop system serves its interface locally and runs OpenSCAD on that same computer.

This file is the persistent source of truth for work status. Read it before starting work and update it whenever a task changes state.

## Control rules

1. Use the stable task IDs below in commits, reviews, and handoffs.
2. Prefer independently testable end-to-end slices. Do not introduce a second pose, mapping, boundary, fabrication, or project-file architecture.
3. Pick the first unblocked task in **Ready** unless the user changes priorities. Keep at most one implementation slice in **In Progress**; bounded audits may run in parallel.
4. Record dependencies and acceptance checks before moving a task to **In Progress**.
5. After implementation, assign a separate subagent to test/review it. A failed review returns the task to **In Progress** or **Ready** with the failure recorded.
6. Move tasks requiring a product decision, visual check, or physical check to **Human Review**. Do not mark them **Done** without explicit approval.
7. Update the relevant architecture and knowledge pages in the same slice whenever behavior or an invariant changes.
8. Subagents report to the primary agent. The user is never used as a message relay.
9. Generated artifacts are not authored truth, except for the deliberately tracked WLED WASM runtime documented in `AGENTS.md`.

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

## Ready

Tasks are ordered. The primary agent automatically takes the first unblocked item after this board has been shown to the user.

### `MECH-010` Automatically close flat gaps from placed panels — P0

- Outcome: **Generate 3D Parts** works on a newly arranged project without requiring hand-written `boundaryTopology` JSON.
- Current gap: placement saves panel poses, but the present acceptance test manually inserts the ordered panel-corner cycles before calling the boundary generator.
- Acceptance:
  - Starting with a GLB and placed/edited panels, the generator derives the connectivity-only ordered corner cycle around every enclosed gap.
  - The project rule may assume the user arranged every intended cap as a flat N-gon.
  - The existing boundary validator still rejects non-planar, self-intersecting, wrongly wound, incomplete, or non-manifold results with a useful panel/gap error.
  - The detected topology is stored in Schema 2, the watertight boundary is previewed, and the existing printable-parts pipeline consumes that exact boundary.
  - A real workflow test covers GLB -> placement/edit -> Generate -> boundary -> STL references without injecting topology in test code.
- Depends on: none; the product behavior was confirmed by the user on 2026-08-14.
- Verify: focused detection/validation tests, boundary regressions, editor tests, and the end-to-end workflow fixture.
- Docs: update the mechanics workflow and boundary-topology contract.

### `MECH-011` Serve the production desktop UI with local OpenSCAD generation — P0

- Outcome: the installed production system, not only Vite development mode, can generate mechanics on its host computer.
- Current gap: `import.meta.env.DEV` controls availability and the generation endpoint exists only as Vite development middleware.
- Acceptance:
  - A production command serves the built interface locally and exposes the same bounded generation endpoint.
  - Startup checks for the supported OpenSCAD version and gives direct installation/repair instructions if it is absent.
  - The UI discovers actual generator availability instead of checking the Vite development flag.
  - OpenSCAD runs locally; sculpture data and assets do not require a hosted service.
  - Installation, clean-start, unavailable-OpenSCAD, generation, and shutdown behavior are documented and tested.
- Depends on: none; implement after `MECH-010` to avoid overlapping changes in generation capabilities.
- Packaging note: decide during implementation whether the desktop installer bundles a pinned OpenSCAD binary or installs/verifies it as a system prerequisite. It is not a browser or ordinary npm runtime dependency.

### `DOC-010` Reconcile documentation with shipped behavior — P0

- Outcome: the public and architectural docs describe what the repository actually does today.
- Acceptance:
  - README, `docs/PANEL_SYSTEM.md`, `docs/MECHANICS_WORKFLOW.md`, `docs/DECISIONS.md`, and `docs/ARCHITECTURE.md` no longer describe shipped boundary, exact-STL, or ZIP work as future work.
  - Documentation states that arbitrary new layouts still need a UI path for authoring/confirming gap topology.
  - Claims of implemented ESP32 firmware, DDP, Art-Net, Ethernet, or audio-reactive behavior are removed.
  - Local-development-only mechanics generation is described honestly.
- Depends on: none.
- Verify: contradiction-focused `rg` checks, link review, `git diff --check`.

### `ASSET-010` Preserve the referenced GLB in generated project folders — P0

- Outcome: generation produces a folder that can be reopened directly, not JSON that points to an absent design surface.
- Acceptance: verified input assets are copied or safely rewritten during generation; the generated folder opens directly; folder -> ZIP -> reopen preserves exact GLB/STL bytes and hashes; missing/mismatched assets fail clearly.
- Depends on: none.
- Verify: portable-project integration test plus parser/path/hash negative tests.
- Docs: update the portable project contract if path rewriting is introduced.

### `TEST-010` Add a real browser smoke test for mechanics-free authoring — P0

- Outcome: cover the actual interface rather than only helper modules.
- Acceptance: a browser loads the app, imports a mechanics-free project and GLB, auto-places panels, edits/deletes a panel, keeps simulation/mapping/wiring usable, saves, and reports no page or console errors.
- Depends on: none. Choose and document the smallest suitable browser harness as part of the slice.
- Verify: local test command and CI job both pass from a clean checkout.

### `TEST-011` Cover folder/ZIP controls in the browser — P1

- Outcome: exercise the shipped portable-project controls end to end.
- Acceptance: ZIP import restores referenced GLB and exact STL URLs; edit marks parts stale; export downloads a valid ZIP; reopen preserves bytes/hashes; missing/tampered assets show an actionable error; old object URLs are released.
- Depends on: `TEST-010`.

### `CI-010` Exercise the panel-outline boundary-to-parts route with real OpenSCAD — P1

- Outcome: CI checks the new fabrication path with OpenSCAD instead of relying only on a deterministic fake renderer.
- Acceptance: one canonical supported fixture generates a boundary and every exact part through OpenSCAD; invalid topology fails before OpenSCAD; useful failure artifacts are retained.
- Depends on: none.

### `BUILD-010` Fail CI when a pinned WASM rebuild changes tracked bytes — P1

- Outcome: the checked-in runtime is demonstrably reproducible.
- Acceptance: after the pinned rebuild, CI runs a scoped Git diff check for both tracked WASM files and fails on any change.
- Depends on: none.

### `WIRE-010` Store an explicit ordered panel route per output — P1

- Outcome: Schema 2 can preserve authored physical panel order instead of recomputing it on every load.
- Acceptance: ordered panel IDs and optional GPIO data parse, validate, round-trip, and drive mapping/wiring; every panel is covered exactly once; existing projects retain heuristic routing as a clearly labelled suggestion/fallback.
- Depends on: none.
- Verify: parser/schema negatives, mapping/wiring tests, save/reopen fixture, existing regression suites.
- Docs: update architecture, Schema 2 format, and LED mapping docs.

### `VALID-010` Make LED dimensions profile-driven end to end — P1

- Outcome: remove remaining hard-coded 8x8/64 validation assumptions.
- Acceptance: one non-8x8 profile parses, maps, validates, exports, and reloads correctly; errors report resolved profile dimensions.
- Depends on: none.

### `VALID-011` Centralize deep Schema 2 runtime validation — P2

- Outcome: browser and CLI reject the same malformed nested mapping, calibration, notes, manual-mechanics, boundary, and generated-asset data.
- Acceptance: a single loader is shared; JSON Schema/runtime parity tests cover valid and invalid nested fixtures; notes require strings.
- Depends on: none. Keep this validation slice behavior-focused rather than a broad refactor.

## In Progress

None. The board must be reviewed before new implementation starts.

## Blocked

### `UI-010` Complete the arbitrary-project acceptance journey

- Outcome: GLB -> auto-place -> manual edit -> topology -> boundary -> exact STL parts -> display -> ZIP -> reopen works through the real UI.
- Blocked by: `MECH-010`, `MECH-011`, `TEST-010`, and `TEST-011`.
- Acceptance: no hand-authored topology, fake renderer, or manual asset injection is required by the test.

### `WIRE-011` Edit and confirm routes in the browser

- Outcome: reorder/assign outputs and persist a user-confirmed route without silent replacement after panel edits.
- Blocked by: `WIRE-010`, `HR-003`.

### `WIRE-012` Unify readiness and export policy

- Outcome: browser and CLI share coherent provisional, review, and measured states and never present provisional files as hardware-ready.
- Blocked by: `WIRE-010`, `HR-003`, `HR-004`.

### `HW-010` Record production wiring facts

- Blocked by: bench measurements and physical installation evidence.
- Required facts: exact ordered panel chains, GPIOs, DIN/DOUT endpoints, installed rotation/mirroring, numbered pixel-zero/order/color proof, electrical keep-outs, pad centers, power budget, and fusing.
- Acceptance: evidence-backed values replace provisional metadata and readiness can truthfully become measured.

### `FIRM-010` Implement production firmware/transport/network/audio behavior

- Blocked by: `HW-010` plus explicit board, network, microphone, power, and transport decisions.
- Constraint: do not claim firmware, DDP, Art-Net, Ethernet, or audio-reactive support before implementation and verification exist.

### `FAB-030` Claim generic CAD equivalence with the manual 41-panel route

- Blocked by: equivalent print/fit evidence. The generic planar generator does not currently reproduce the tested U-frame structure.

## Human Review

### `HR-003` Define when a suggested wiring route becomes authored — Decision needed

- Recommended rule: a route remains provisional until the user explicitly confirms it; later pose edits flag it for review and never silently replace it.
- Unblocks: `WIRE-011`, part of `WIRE-012`.

### `HR-004` Choose provisional browser export policy — Decision needed

- Question: permit downloads with unmistakable provisional names/warnings, or gate them like the guarded CLI?
- Constraint: browser and CLI must share one readiness evaluator and no provisional export may be called optimized or hardware-ready.
- Unblocks: `WIRE-012`.

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

## Done

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

### `CORE-001` Mechanics-free Schema 2 editor (`7b40263`)

- GLB placement, automatic/manual panel editing, simulation, mapping, wiring, save, and reload work without mechanics.

### `ASSET-001` Portable relative-path and SHA-256 asset contract (`0df76c7`)

- GLB/STL references are safe relative paths with verified bytes and fail-closed loading.

### `BOUNDARY-001` Validated closed-boundary generation (`d12b48e`)

- Authoritative panel/profile outlines plus supplied connectivity-only corner cycles generate a planar/simple/manifold closed boundary.
- Scope note: discovering or authoring those cycles from a new arbitrary UI layout is not done; see `MECH-010` and `MECH-020`.

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
