# Project task board

Last reconciled: 2026-08-20
Backlog reconstructed from: `main` at `ab9a96a`
Current milestone: make the arbitrary-project workflow complete: GLB -> panel placement/editing -> automatically close the flat gaps between panels -> watertight boundary -> printable parts -> exact referenced assets -> folder/ZIP reopen.

Current engineering epic (operator, 2026-08-20): replace native OpenSCAD with
the `manifold-3d` JavaScript/WASM library for **generic panel-outline printable
parts**. `grok/workspace` does not execute OpenSCAD. Codex keeps OpenSCAD for
the physically tested manual `parts/*.scad` route. Do not merge Grok work into
`main` unless the operator asks.

This file is the persistent source of truth for work status. Read it before starting work and update it whenever a task changes state.

## Active agents

| Agent | Task | Status | Branch | Worktree |
| --- | --- | --- | --- | --- |
| Grok | `CAD-036` OpenSCAD-free Grok line | Ready to Merge | `grok/workspace` | `/home/mate/Documents/led-rhombicosidodecahedron-grok` |
| Grok | `CAD-030` task snapshot | same commit as `grok/workspace` | `grok/cad-030-manifold-pin` | `/home/mate/Documents/led-rhombicosidodecahedron-grok-cad-030` |
| Grok | `CTRL-004` reconstruction snapshot | frozen | `grok/ctrl-004-reconstruct-project` | `/home/mate/Documents/led-rhombicosidodecahedron-grok-ctrl-004` |
| Codex | `WIRE-013` lifecycle | parallel, do not edit | `codex/wire-013-lifecycle` | `/home/mate/Documents/led-rhombicosidodecahedron` |

Grok works in `/home/mate/Documents/led-rhombicosidodecahedron-grok` on
`grok/workspace`. Merge finished Grok slices into this branch. Do not edit
the Codex worktree. Do not merge into `main` without an operator request.
`CTRL-004` is not merged to `main`.

## Control rules

1. Use the stable task IDs below in commits, reviews, and handoffs.
2. Prefer independently testable end-to-end slices. Do not introduce a second pose, mapping, boundary, fabrication, or project-file architecture.
3. Use this lifecycle in order: **Backlog** -> **Ready** -> **In Progress** ->
   **Blocked** or **Human Review** when needed -> **Ready to Merge** ->
   **Done**. Pick the first unblocked task in **Ready** unless the user changes
   priorities. Keep at most one implementation slice in **In Progress** per
   agent; bounded audits may run in parallel.
4. Record dependencies and acceptance checks before moving a task to **In Progress**.
5. After implementation, assign a separate subagent to test/review it. A failed review returns the task to **In Progress** or **Ready** with the failure recorded.
6. Move tasks requiring a product decision, visual check, or physical check to **Human Review**. Do not mark them **Done** without explicit approval.
7. Update the relevant architecture and knowledge pages in the same slice whenever behavior or an invariant changes.
8. Subagents report to the primary agent. The user is never used as a message relay.
9. Generated artifacts are not authored truth, except for the deliberately tracked WLED WASM runtime documented in `AGENTS.md`.
10. Every active task records scope/outcome, acceptance criteria, dependencies,
    and verification. An **In Progress** or **Ready to Merge** task also records
    its owning branch and worktree plus likely file conflicts.
11. A completed task stops at **Ready to Merge**. Grok may fast-forward or
    merge its own task branches into `grok/workspace`. Merge into `main` only
    after explicit operator authorization. After authorized integration and
    remote verification, move it to **Done** and apply the safe cleanup rules
    in `AGENTS.md`.
12. Stay parallel to Codex: never switch to, reset, or write the Codex
    worktree. Shared files such as `TASKS.md` will diverge until `main`
    integration; do not reconcile them by editing Codex's copy.

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

### `INSTALL-015` Qualify managed OpenSCAD on Windows clients — deferred

- Outcome: convert the retained Windows x86-64 candidate from `INSTALL-014` into a tested Windows PC support claim if Windows returns to the required platform set.
- Acceptance: use disposable native Windows 10 Enterprise LTSC 2021 and Windows 11 25H2 non-N x86-64 client VMs; start without OpenSCAD, administrator rights, repository cache, registry install, or `PATH` wiring; run setup twice from a path with spaces; generate real STL files; prove clean server shutdown; destroy each trusted runner after use.
- Depends on: `INSTALL-014` and provisioned ephemeral Windows client runner images.
- Deferred by: the operator selected Linux and macOS as the current required targets. Windows candidate code and CI checks stay implemented, but Windows client qualification does not block `INSTALL-011` or `INSTALL-012`.

## Ready

No implementation slice is Ready. `CAD-036` is Ready to Merge on
`grok/workspace`. Do not edit Codex-owned files.

### Epic note — generic parts today

The Manifold generic path is implemented on `grok/workspace`. This Grok line
does not execute OpenSCAD. Codex keeps OpenSCAD for manual `parts/*.scad`.

### `CI-010` Exercise the panel-outline route with real OpenSCAD — superseded

- Do not implement. Generic parts will use Manifold (`CAD-032` / `CAD-035`).
- Manual canonical SCAD renders in CI remain as they are.

### `BUILD-010` Fail CI when a pinned WASM rebuild changes tracked bytes — P1

- Outcome: the checked-in runtime is demonstrably reproducible.
- Acceptance: after the pinned rebuild, CI runs a scoped Git diff check for both tracked WASM files and fails on any change.
- Depends on: none.
- Likely conflicts: `.github/workflows/render.yml` and `scripts/build-wasm.mjs`. Do not run in parallel with `CAD-035`.

### `WIRE-010` Store an explicit ordered panel route per output — P1

- Outcome: Schema 2 can preserve authored physical panel order instead of recomputing it on every load.
- Acceptance: ordered panel IDs and optional GPIO data parse, validate, round-trip, and drive mapping/wiring; every panel is covered exactly once; existing projects retain heuristic routing as a clearly labelled suggestion/fallback.
- Depends on: none.
- Verify: parser/schema negatives, mapping/wiring tests, save/reopen fixture, existing regression suites.
- Docs: update architecture, Schema 2 format, and LED mapping docs.
- Likely conflicts: `src/sculpture/PanelAssembly.ts`, `schemas/panel-assembly.schema.json`, `web/src/WiringPreview.ts`, mapping tests. Do not run in parallel with `VALID-010` or `VALID-011`.

### `VALID-010` Make LED dimensions profile-driven end to end — P1

- Outcome: remove remaining hard-coded 8x8/64 validation assumptions.
- Acceptance: one non-8x8 profile parses, maps, validates, exports, and reloads correctly; errors report resolved profile dimensions.
- Depends on: none.
- Likely conflicts: `src/sculpture/PanelAssembly.ts` and mapping/validation tests. Do not run in parallel with `WIRE-010` or `VALID-011`.

### `VALID-011` Centralize deep Schema 2 runtime validation — P2

- Outcome: browser and CLI reject the same malformed nested mapping, calibration, notes, manual-mechanics, boundary, and generated-asset data.
- Acceptance: a single loader is shared; JSON Schema/runtime parity tests cover valid and invalid nested fixtures; notes require strings.
- Depends on: none. Keep this validation slice behavior-focused rather than a broad refactor.
- Likely conflicts: `src/sculpture/PanelAssembly.ts`, `src/sculpture/LoadPanelAssemblyProject.ts`. Do not run in parallel with `WIRE-010` or `VALID-010`.

## In Progress

### `CTRL-004` Reconstruct current project control and architecture documents

- Scope: reconcile repository state, architecture, decisions, work status,
  collaboration rules, dependencies, and conflict risks without production-code
  changes.
- Acceptance: `AGENTS.md`, this board, `docs/ARCHITECTURE.md`, and
  `docs/DECISIONS.md` agree with `main` at `ab9a96a`; `TEST-011` is closed;
  blocked installation work is not listed as Ready; the full task lifecycle and
  no-automatic-merge rule are explicit; Grok and Codex routing are recorded;
  Markdown links and diff hygiene pass.
- Depends on: none.
- Grok snapshot: branch `grok/ctrl-004-reconstruct-project` at `a3c73ea`;
  worktree `/home/mate/Documents/led-rhombicosidodecahedron-grok-ctrl-004`.
  Leave that worktree frozen.
- Grok standing workspace: branch `grok/workspace`; worktree
  `/home/mate/Documents/led-rhombicosidodecahedron-grok`.
- Concurrent risk: Codex committed a separate reconstruction at `9e0659a` on
  `codex/ctrl-004-reconstruct-project` in
  `/home/mate/Documents/led-rhombicosidodecahedron`. Do not merge either copy
  into `main` without operator choice.
- Likely conflicts: `AGENTS.md`, `TASKS.md`, `docs/ARCHITECTURE.md`,
  `docs/DECISIONS.md`.
- Merge rule: operator approval is required before integration into `main`.
  This task stays In Progress until an independent review and operator
  direction; it does not start a feature slice.

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
- Likely conflicts: `bootstrap.sh`, `toolchains/bootstrap/`, `scripts/`, `.github/workflows/render.yml`.

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
- Likely conflicts: `.github/workflows/render.yml` (also `CI-010` and `BUILD-010`).

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

### `HR-014` Confirm Manifold replacement scope — Decision needed

- Confirmed by this request: generic panel-outline printable parts stop using
  native OpenSCAD and use `manifold-3d` instead.
- Recommended remaining defaults:
  1. Keep `parts/*.scad` and managed OpenSCAD for the manual 41-panel route.
  2. First shipping path is Node/WASM Manifold behind the existing local
     generator HTTP contract (`CAD-030`–`CAD-033`).
  3. Browser-in-process generation is `CAD-034`, not the first slice.
  4. `HR-002` still means local software on the user's computer. It no longer
     means generic parts require an OpenSCAD executable.
- Alternative: also port the manual U-frame/middle-connector parts to Manifold
  before removing OpenSCAD from install. That is a later epic with physical
  review (`HR-006` / `FAB-030`).
- Unblocks: implementation of `CAD-030` with the recommended defaults.

### `HR-013` Choose the managed Python distribution — Decision needed

- Constraint: python.org does not publish a relocatable Linux CPython distribution, and the pinned Emscripten SDK needs Python before it can run.
- Recommended option: use exact, checksum-verified Astral `python-build-standalone` artifacts for Linux x86-64, macOS arm64, and macOS x86-64. Record Astral as a third-party binary trust root and preserve the complete bundled license set.
- Alternative: permit a system Python prerequisite. This weakens the no-manual-dependency requirement.
- Unblocks: `INSTALL-011B`, then `INSTALL-011C` and `INSTALL-012`.

## Ready to Merge

### `CAD-036` Make `grok/workspace` OpenSCAD-free — P0

- Outcome: tests, verify, desktop, and CI on this Grok line do not install,
  probe, or execute OpenSCAD. Generic parts stay on Manifold 3.5.1. Codex
  keeps the OpenSCAD worktree path.
- Acceptance: OpenSCAD Vitest files are removed; leftover `generate:sculpture`
  OpenSCAD rendering is rejected; `npm test` does not run OpenSCAD tests.
- Owner: Grok; `grok/workspace`.
- Verify: `npx vitest run` 30 files / 169 tests passed; `npx tsc -b` passed;
  YAML lint of `.github/workflows/render.yml` passed. OpenSCAD tests remain
  on Codex.

### `CAD-035` Prove generic Manifold generation in CI — P1

- Workflow job `manifold-panel-parts` generates the prism fixture with
  `scripts/generate-panel-boundary-parts.ts` and no OpenSCAD.

### `CAD-034` Run generic part generation in the browser — P1

- **Generate 3D Parts** compiles Manifold STLs in-process, then falls back to
  the local pipeline. Shared kernel: `compilePanelBoundaryBundle()`.

### `UI-010` Complete the arbitrary-project acceptance journey — P0

- Playwright Chromium loads a mechanics-free prism JSON, clicks **Generate 3D
  Parts**, saves JSON with topology and two Manifold STLs, and exports a ZIP
  containing those parts. Test: `tests/browser/generate-parts.spec.ts`.

### `CAD-033` Serve Manifold from the local editor pipeline — P0

- Outcome: generator status is `manifold` 3.5.1 and **Generate 3D Parts** does
  not require OpenSCAD.
- Verify: generator-status, editor-pipeline-handler, and local-editor-server
  tests passed.

### `CAD-032` Generate the portable STL bundle with Manifold — P0

- Outcome: `generatePanelBoundaryParts()` writes hash-checked Manifold STLs.
  `renderScad` is optional and unused.
- Verify: `tests/panel-boundary-parts-e2e.test.ts` (5 passed) without a fake
  renderer. Invalid topology still fails before publish.

### `CAD-031` Port one closure solid to Manifold — P0

- Outcome: prism closures build as Manifold solids from compiled face and
  connector facts. SCAD emitter is unused by the new test.
- Acceptance: watertight `NoError` mesh; PCB envelope probes empty; DIN/DOUT
  holes unused; 0.20 mm and 0.50 mm profile corrections present.
- Owner: Grok; `grok/workspace`.
- Verify: `tests/panel-closure-solids.test.ts` passed with
  `tests/manifold-runtime.test.ts` and `npx tsc -b`.

### `CAD-030` Pin and load `manifold-3d` — P0

- Outcome: Node tests construct a solid, run one boolean, and export a
  manifold triangle mesh without OpenSCAD.
- Pin: npm `manifold-3d` `3.5.1`, Apache-2.0, https://github.com/elalish/manifold.
- Loader: `src/cad/ManifoldRuntime.ts`. Smoke: `tests/manifold-runtime.test.ts`
  (cube minus through-cylinder, `status() === "NoError"`, genus 1).
- Production generator call sites are unchanged.
- Owner: Grok. Task branch `grok/cad-030-manifold-pin` at `79a973b`.
  Fast-forwarded into `grok/workspace` (worktree
  `/home/mate/Documents/led-rhombicosidodecahedron-grok`). Not on `main`.
- Verify: `npx vitest run tests/manifold-runtime.test.ts` passed (2 tests);
  `npx tsc -b` passed. Independent review passed after the uncommitted-state
  finding.
- Merge rule: on the Grok line. Operator approval is still required before
  `main`. `CAD-031` may start on `grok/workspace`.

No reconstruction branch is merged. Do not merge Grok or Codex `CTRL-004`
into `main` without a separate operator request.

## Done

### `TEST-011` Cover folder/ZIP controls in the browser (`ab9a96a`)

- Playwright Chromium now imports a portable ZIP, restores referenced GLB and
  exact STL object URLs, exports folder and ZIP forms, reopens the exported ZIP,
  and verifies exact bytes and hashes.
- The journey marks generated mechanics stale after a valid additive panel
  edit, rejects missing and tampered assets with domain-specific status, and
  verifies object-URL release when the project is replaced.
- The portable fixture is generated with a deterministic fake STL renderer.
  Real OpenSCAD through the **Generate 3D Parts** control remains `UI-010`.
- `main` and `origin/main` contain the implementation at `ab9a96a`. This
  2026-08-20 reconstruction inspected the test, commit, architecture, and
  failure log; it did not re-run Playwright in the Grok worktree.

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
- Real-browser control coverage shipped in `TEST-011`. ZIP resource bounds remain `SEC-010`.

### `MANUAL-001` Preserve the physically tested 41-panel manual CAD route

- The manual U-frame geometry remains separate and supported; generic planar mechanics do not claim equivalence.
