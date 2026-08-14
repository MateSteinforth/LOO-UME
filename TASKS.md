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


### `INSTALL-011` Add a one-command clean-checkout bootstrap — P0

- Outcome: after cloning the repository, one platform-appropriate command installs and connects every project dependency needed to build, test, start, and generate parts.
- Acceptance:
  - POSIX and PowerShell entry points require only Git and the operating system's standard shell; every other executable is acquired or its function is supplied by a verified repository stage-zero component.
  - A committed dependency manifest accounts for Node.js/npm, Python, download/archive utilities, OpenSCAD, WLED sources, Emscripten, and every other command invoked by setup or verification.
  - Bootstrap acquires pinned repository-local Node.js/npm and Python toolchains when absent; it must not silently use an undeclared system executable.
  - Bootstrap initializes required submodules, installs exact npm dependencies, acquires OpenSCAD through `INSTALL-010`, `INSTALL-013`, or `INSTALL-014` for the selected platform, and installs pinned WLED/Emscripten tooling required by the documented full verification path.
  - Repeated and interrupted runs are safe and resumable; paths containing spaces work; no global packages, administrator access, or system package-manager changes are required.
  - Completion verifies generator availability and prints one start command; failures state the failed dependency and exact recovery action.
- Depends on: `INSTALL-010`, `INSTALL-013`, `INSTALL-014`, and `INSTALL-015`.
- Verify: empty-cache and warm-cache integration tests, interruption recovery, checksum/network failure tests, `npm run verify`, and a local production-server smoke test.
- Docs: make this the primary installation path and list only Git plus the standard shell as prerequisites.

### `INSTALL-012` Prove automatic installation on clean supported systems — P0

- Outcome: every declared supported platform proves that a fresh clone becomes a working local production editor without a manual Node, npm, Python, OpenSCAD, SDK, utility, PATH, or dependency-wiring step.
- Acceptance:
  - CI starts from clean Linux, macOS, and Windows environments for every OS/architecture pair declared supported by the bootstrap.
  - Each job runs only the documented bootstrap and start commands, sees generator status `available: true`, generates exact STL files with real OpenSCAD, and shuts down cleanly.
  - Cached tools are verified before reuse; tampered downloads, unsupported systems, offline failures, and partial installs fail safely and actionably.
- Depends on: `INSTALL-010`, `INSTALL-011`, `INSTALL-013`, `INSTALL-014`, `INSTALL-015`, and reuse of the real-render journey from `CI-010`.
- Verify: the clean-install matrix is required in CI and release checks; tests remove Node.js, npm, Python, OpenSCAD, Emscripten, and undeclared download/archive utilities from `PATH` and may use only Git plus the declared standard shell before bootstrap starts.
- Docs: publish the tested platform matrix and state clearly which repository installation command applies to each platform.


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

No implementation task is active.

## Blocked

### `INSTALL-015` Qualify managed OpenSCAD on supported Windows clients — P0

- Outcome: convert the Windows x86-64 candidate from `INSTALL-014` into a tested Windows PC support claim.
- Acceptance:
  - Disposable native x86-64 client VMs cover Windows 10 Enterprise LTSC 2021 and Windows 11 25H2 non-N editions; Windows N/KN and ARM64 remain excluded until their missing-runtime/native paths have separate proof.
  - Each VM starts without OpenSCAD, administrator rights, repository tool cache, registry install, or `PATH` wiring; it runs setup twice from PowerShell in a repository path containing spaces.
  - The receipt selects `win32-x64`; real OpenSCAD reaches generator status available, generates and serves the canonical two STL parts, and the local production server releases its port on shutdown.
  - The VMs are isolated, registered for one trusted job, and destroyed after the run. Public pull-request code never runs on them.
- Depends on: `INSTALL-014` and provisioned ephemeral Windows client runner images.
- Blocked by: no disposable Windows 10/11 client runner infrastructure is connected to this repository. Standard GitHub-hosted Windows runners are Windows Server and cannot satisfy this client proof.
- Docs: only after both client jobs pass, publish Windows PC support and the exact supported editions.

### `UI-010` Complete the arbitrary-project acceptance journey

- Outcome: GLB -> auto-place -> manual edit -> topology -> boundary -> exact STL parts -> display -> ZIP -> reopen works through the real UI.
- Remaining blockers: `TEST-010` and `TEST-011`; automatic topology detection shipped in `MECH-010`, and local production generation shipped in `MECH-011`.
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

### `DOC-010` Reconcile documentation with shipped behavior

- Public and architecture documents now describe automatic topology detection,
  boundary validation, exact STL generation and display, folder and ZIP
  transport, and local production generation as shipped behavior.
- The documents state that the browser has no topology confirmation or
  correction controls and that local generation does not copy the referenced
  GLB into the generated folder.
- False current claims about ESP32 firmware, DDP, Art-Net, Ethernet,
  microphones, and audio-reactive hardware behavior were removed or identified
  as proposals. The browser remains a small WLED effect simulator.
- Platform setup text now describes the declared Linux and macOS targets and
  the Windows x86-64 candidate that still needs the `INSTALL-015` client proof.
  Helper-level tests no longer imply real browser-control coverage.
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
- Independent review passed after ZIP type, native architecture, system command,
- Main workflow run `31812227275` passed after integration.
  bounded process-tree, and active-render proof findings were corrected. All
  215 Vitest tests, TypeScript, the production desktop build, workflow lint,
  real 221-entry archive validation, and diff hygiene passed.
- This is a verified Windows x86-64 implementation candidate, not a Windows PC
  support claim. `INSTALL-015` remains blocked on the declared real Windows 10
  and Windows 11 client virtual machines.

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
- Implementation sequence: `INSTALL-010`, `INSTALL-011`, and `INSTALL-012`.

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
