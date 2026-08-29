# Failure-learning log

This file records reusable lessons from work that went wrong or nearly went
wrong. Its purpose is to change future agent behavior, not to preserve every
error message. Read it during task startup and update it in the same change that
reveals a durable lesson.

## How to use this log

- Add an entry when the cause and prevention are understood well enough to help
  the next agent. If the investigation is incomplete, mark that explicitly.
- Describe the system or workflow failure without assigning blame. Never record
  credentials, tokens, private data, or unnecessary raw logs.
- Prefer a small reproducible symptom and a concrete prevention step. Link to a
  test, issue, commit, decision, or canonical document when one exists.
- Update an existing entry when the same failure recurs. Promote repeated
  lessons into `AGENTS.md`, an architecture/decision page, or an automated test;
  keep this entry as the history and rationale.
- A log entry does not make a task complete. Apply the correction, verify the
  result, and report any remaining risk.

## Entry template

Copy this section for new entries and replace `NNN` with the next identifier.

```markdown
### F-NNN — Short, specific title

- **Date:** YYYY-MM-DD
- **Context:** What task or subsystem was involved?
- **Symptom:** What observable result showed that something was wrong?
- **Cause:** Which mistaken assumption, decision, or condition produced it?
- **Correction:** What restored the work?
- **Prevention:** What should a future agent do or verify before repeating it?
- **Evidence:** Relevant test, file, issue, commit, or command result.
- **Status:** Resolved, mitigated, monitoring, or investigating.
```

## Lessons

### F-001 — Sandbox helper can fail before repository commands run

- **Date:** 2026-08-14
- **Context:** Repository inspection and file editing in the managed Codex
  environment.
- **Symptom:** A normal command or `apply_patch` exits before doing any work with
  `bwrap: No permissions to create a new namespace` or
  `fs sandbox helper failed`.
- **Cause:** This environment may disallow the unprivileged namespace used by
  the sandbox helper even though an approved command can still run.
- **Correction:** Re-run the exact necessary command through the environment's
  approval path. For file edits, try `apply_patch` first and then use the exact
  `git apply --unidiff-zero` fallback documented in `AGENTS.md` if that helper
  fails.
- **Prevention:** Recognize this specific pre-execution failure, preserve the
  requested command's scope, and follow the established fallback instead of
  changing tools repeatedly or assuming the repository itself is broken.
- **Evidence:** `AGENTS.md`, under **Working safely**.
- **Status:** Mitigated.

### F-002 — A narrow documentation inventory can miss the existing control plane

- **Date:** 2026-08-14
- **Context:** Adding orchestrator guidance to a repository that already had a
  persistent task board.
- **Symptom:** The first workflow draft told agents to read architecture and
  failure guidance but omitted `TASKS.md`, even though that file was already the
  source of truth for work status.
- **Cause:** Initial discovery searched a selected list of documentation names
  instead of inventorying all top-level coordination files and recent workflow
  commits.
- **Correction:** Connect `AGENTS.md`, `TASKS.md`, `FAILURES.md`, and the
  bootstrap manual explicitly, with one responsibility for each file.
- **Prevention:** Before creating agent-control documents, inspect all top-level
  files, search existing documentation for workflow terms, and review recent
  relevant history. Reconcile existing authorities instead of creating a
  parallel process.
- **Evidence:** `TASKS.md` and commit `ae9022d`.
- **Status:** Resolved.

### F-003 — Shell and evaluator modes can invalidate a verification command

- **Date:** 2026-08-14
- **Context:** Direct TypeScript imports and documentation contradiction scans.
- **Symptom:** `npx tsx -e` treated a top-level-`await` script as CommonJS, and
  Markdown backticks in a double-quoted `rg` pattern ran as shell substitutions.
- **Cause:** The command used an evaluator or quoting mode that did not match the
  source text.
- **Correction:** Use `node --import tsx --input-type=module -e` for direct ESM
  imports. Put complete `rg` arguments that contain backticks in single quotes.
- **Prevention:** Select the execution and quoting mode before a direct-import or
  Markdown scan. Do not interpret these mode failures as repository failures.
- **Evidence:** `AGENTS.md`, under **Working safely**.
- **Status:** Resolved.

### F-004 — Availability probes can fail even when a tool is usable

- **Date:** 2026-08-14
- **Context:** Native macOS tool qualification and setup preflight.
- **Symptom:** `lipo -verify_arch` rejected the qualified universal DMG, and
  `ditto -h` returned a nonzero usage status although `ditto` was executable.
- **Cause:** The checks used command behaviors that were not reliable
  availability or native-execution tests.
- **Correction:** Record `lipo -archs`, then run the exact binary through
  `/usr/bin/arch -<architecture>` for version and real STL checks. Test Apple
  tool availability with `fs.access(path, X_OK)`.
- **Prevention:** Prefer direct executable-access checks and real target work to
  help or metadata commands when qualifying a required tool.
- **Evidence:** `AGENTS.md` and the `INSTALL-013` evidence in `TASKS.md`.
- **Status:** Resolved.

### F-005 — Clean Windows checks cannot rely on shell shims or PATH tools

- **Date:** 2026-08-14
- **Context:** Managed native-tool setup and active-process shutdown on Windows.
- **Symptom:** PowerShell policy can block `npm.ps1`, and a clean verification
  that clears `PATH` cannot find a bare `taskkill` command.
- **Cause:** The first command paths depended on user shell policy and ambient
  host wiring that the clean-host proof intentionally removed.
- **Correction:** Invoke `npm.cmd`. Resolve and validate the absolute
  `%SystemRoot%\System32\taskkill.exe` path, and use argument arrays without a
  shell.
- **Prevention:** Windows setup and verification must use native command entry
  points and validated absolute system-tool paths when `PATH` is not authority.
- **Evidence:** Historical managed-tool verification work.
- **Status:** Resolved.

### F-006 — A repository-local GitHub CLI is not guaranteed

- **Date:** 2026-08-14
- **Context:** Monitoring required GitHub Actions runs after integration pushes.
- **Symptom:** The expected `.tools` GitHub CLI path was absent.
- **Cause:** The workflow assumed a local helper that is not a declared project
  dependency.
- **Correction:** For this public repository, query the public GitHub Actions
  REST API with `curl` and parse the saved JSON with Node.js.
- **Prevention:** Check for an available declared client before use. Do not add
  an installation dependency only to read public workflow status.
- **Evidence:** `AGENTS.md`, under **Working safely**.
- **Status:** Mitigated.

### F-007 — Shared-worktree line numbers can become stale before a fallback patch

- **Date:** 2026-08-14
- **Context:** ASSET-010 integration with concurrent bounded agent edits.
- **Symptom:** A line-number-only fallback could place an import in the wrong
  part of a file after another agent changed nearby lines.
- **Cause:** The patch coordinates came from an earlier file view in a shared
  worktree.
- **Correction:** Re-read the exact target block immediately before applying
  the fallback and normalize the affected import block.
- **Prevention:** Prefer context hunks. When zero-context line coordinates are
  necessary, refresh them immediately before `git apply --unidiff-zero` and
  inspect the resulting diff.
- **Evidence:** `AGENTS.md`, under **Working safely**, and ASSET-010 integration.
- **Status:** Mitigated.

### F-008 — CSS labels are not stable WebGL gizmo coordinates

- **Date:** 2026-08-14
- **Context:** TEST-010 real-browser authoring coverage.
- **Symptom:** A Playwright drag that started from a CSS2D panel-label position
  did not commit a panel move after another control scrolled the page.
- **Cause:** The Three.js translation gizmo has no DOM target. A CSS2D label is
  only a projected visual reference, and its viewport coordinates can change
  with scrolling, camera state, or surface attachment.
- **Correction:** Use the real accessible panel label and delete billboard for
  the required saved editor mutation. Keep coordinate gestures out of the basic
  smoke test until they have a stable operator-facing target.
- **Prevention:** Prefer accessible DOM controls in browser smoke tests. Do not
  infer a WebGL hit target from a projected label across scrolling or camera
  changes.
- **Evidence:** `tests/browser/mechanics-free-authoring.spec.ts`.
- **Status:** Resolved.

### F-009 — A staged empty path is not a new-file patch target

- **Date:** 2026-08-14
- **Context:** Adding the new TEST-011 Playwright specification after the normal
  patch helper failed with the known sandbox error.
- **Symptom:** `git apply` refused a `/dev/null` new-file patch because the
  required empty path already existed in the working tree as the staged base.
- **Cause:** The fallback mixed two patch models: an existing empty file in the
  index and a patch that declared the destination as a new file.
- **Correction:** Keep the exact empty path staged, generate the diff from that
  empty path to the intended content, apply it, and immediately unstage it.
- **Prevention:** When the new-file fallback needs a staged base, never generate
  its patch from `/dev/null`. Inspect the final diff and staging state before
  continuing.
- **Evidence:** `AGENTS.md`, under **Working safely**, and TEST-011 integration.
- **Status:** Resolved.

### F-010 — Portable browser tests used transient status signals and an invalid edit

- **Date:** 2026-08-14
- **Context:** TEST-011 real-browser folder and ZIP coverage.
- **Symptom:** Early runs waited for a viewer error that the animation loop
  cleared, raced startup generator text, timed out on repeated Blob digests,
  and tried to delete a panel still referenced by stored boundary topology.
- **Cause:** The test treated transient presentation text and an invalid
  topology mutation as stable evidence for portable-project behavior.
- **Correction:** Assert handled import errors in `#pipeline-status`, wait on
  the current default project's surface/mapping/control state for success,
  prove content hashes once, and use automatic additive placement to make the
  generated mechanics stale validly. Update that bootstrap assertion when the
  authored default project changes. After a successful file import, wait for a
  project-specific control or count before asserting controls that the prior
  project also exposes; generator discovery can replace the pipeline message.
- **Prevention:** Browser tests must select stable domain-specific signals and
  valid editor mutations. Do not repeat asynchronous proof after exact byte
  comparison and production validation already establish the same fact.
- **Evidence:** `tests/browser/portable-project.spec.ts` and the browser-test
  rules in `AGENTS.md`.
- **Status:** Resolved.

### F-011 — An ignored preview output hid a clean-checkout test failure

- **Date:** 2026-08-14
- **Context:** TEST-011 real-browser folder and ZIP coverage.
- **Symptom:** The browser test passed in the working tree but its generated
  project fixture was absent from a clean CI checkout.
- **Cause:** The first test version read old files below the ignored
  `web/public/generated-projects/` runtime-output directory.
- **Correction:** Build the fixture from the tracked panel-outline project with
  the production generator and a deterministic renderer under
  `testInfo.outputPath()`.
- **Prevention:** Confirm that static fixture inputs are tracked. Create derived
  browser fixtures in the test output directory instead of using ignored local
  preview output.
- **Evidence:** `tests/browser/portable-project.spec.ts` and the browser-test
  rule in `AGENTS.md`.
- **Status:** Resolved.

### F-012 — WLED readiness did not mean the full editor was ready

- **Date:** 2026-08-14
- **Context:** TEST-011 independent clean-checkout review.
- **Symptom:** A portable import started after WLED became ready, then the
  remaining startup work replaced its error status with generator status.
- **Cause:** The test used engine readiness as a proxy for completion of
  generator discovery and initial project restoration.
- **Correction:** Wait for the initial JSON face-graph surface status before
  using portable-project controls.
- **Prevention:** Use a full editor-state signal for file operations. WLED
  readiness proves only the simulation engine.
- **Evidence:** `tests/browser/portable-project.spec.ts` and the browser-test
  rule in `AGENTS.md`.
- **Status:** Resolved.

### F-013 — A clean checkout can lack a Git author identity

- **Date:** 2026-08-20
- **Context:** CTRL-004 documentation-only task closeout.
- **Symptom:** `git commit` stopped before creating a commit because Git could
  not determine `user.name` or `user.email`.
- **Cause:** This checkout had no local or global author configuration.
- **Correction:** Re-run the task commit with the established repository author
  supplied through command-local `git -c user.name=... -c user.email=...`
  values. Do not change global Git configuration.
- **Prevention:** Before task closeout, inspect the recent repository author and
  either confirm configured identity or use matching command-local values. Do
  not invent a personal identity or store one globally.
- **Evidence:** The failed CTRL-004 commit attempt and existing commits authored
  by `Codex <codex@openai.com>`.
- **Status:** Resolved.

### F-014 — A task title and its board section can contradict each other

- **Date:** 2026-08-20
- **Context:** CTRL-005 wiring-priority task reconciliation.
- **Symptom:** `HR-013` said “Decision needed” and blocked installation tasks,
  but it remained under **Done**.
- **Cause:** The earlier board audit checked dependencies and main task moves
  without checking whether every task's wording agreed with its containing
  lifecycle section.
- **Correction:** Move `HR-013` to **Human Review** and keep the dependent
  installation tasks blocked.
- **Prevention:** During board reconciliation, validate task headings and
  dependency language against the containing lifecycle section, not only task
  IDs and duplicate entries.
- **Evidence:** `TASKS.md` status correction in `CTRL-005`.
- **Status:** Resolved.

### F-015 — Mapping assumptions were treated as measurement gates

- **Date:** 2026-08-21
- **Context:** Simulator-to-ESP32 wiring contract.
- **Symptom:** The first contract assumed GRB and identity panel orientation,
  then blocked mapping export on voltage, temperature, and device read-back.
- **Cause:** Electrical commissioning evidence and mapping completeness were
  combined in one hardware-readiness concept. The tool also failed to use the
  known geometry to select shorter installed panel orientations.
- **Correction:** Use the operator-selected RGB assumption, keep the snake pixel
  traversal, calculate panel quarter turns from route geometry, and report a
  separate mapping-ready state. Electrical protection stays outside mapping.
- **Prevention:** Ask whether a fact changes address/color output, cable-route
  geometry, or only electrical commissioning. Only the first two categories
  belong in simulator-to-controller mapping readiness.
- **Evidence:** `HW-017`, `MAP-022`, and the corrected generated WLED contract.
- **Status:** Resolved.

### F-016 — Normal verification was coupled to the simulator toolchain

- **Date:** 2026-08-21
- **Context:** `HW-017` and `MAP-022` closeout.
- **Symptom:** `npm run verify` completed asset generation, then stopped at a
  simulator rebuild because the pinned Emscripten SDK was not installed.
- **Cause:** Normal application verification rebuilt an already checked-in
  runtime and therefore pulled the WLED source and compiler into every clean
  setup.
- **Correction:** `BUILD-010` moved the rebuild source and toolchain to
  `generate/wled-simulator`. Normal verification now checks the tracked runtime
  against its exact byte-length and SHA-256 receipt.
- **Prevention:** Keep generated runtime integrity checks on `main`. Rebuild
  only on the generation branch, then transfer only reviewed runtime bytes and
  their synchronized receipt.
- **Evidence:** `scripts/verify-wasm-runtime.mjs` and
  `web/public/wasm/runtime-integrity.json`.
- **Status:** Resolved.

### F-017 — `crypto.randomUUID()` is unavailable on an HTTP LAN origin

- **Date:** 2026-08-21
- **Context:** WIRE-015 wiring-manual export from a second computer on the local
  network.
- **Symptom:** Clicking **Export wiring assembly manual** threw
  `TypeError: crypto.randomUUID is not a function` before the print page opened.
- **Cause:** Browsers expose `crypto.randomUUID()` only in a secure context.
  The LAN review URL uses plain HTTP and is not treated like the secure
  `localhost` exception.
- **Correction:** Generate the same-origin handshake token with
  `randomUUID()` when available and `crypto.getRandomValues()` otherwise.
- **Prevention:** Do not use secure-context-only browser APIs in a feature that
  is explicitly supported through `npm run preview:phone` or an HTTP LAN URL
  without a tested non-secure-context path.
- **Evidence:** The fallback unit test and a real Chrome journey through
  `http://192.168.68.61:5174` with `isSecureContext: false`, unavailable
  `randomUUID`, and available `getRandomValues`; the export opened all six
  sheets and 41 rows.
- **Status:** Resolved.

### F-018 — npm writes follow the process working directory

- **Date:** 2026-08-20
- **Context:** CAD-030 added `manifold-3d` while multiple worktrees existed.
- **Symptom:** `npm install` first changed the Codex worktree instead of the
  intended Grok CAD worktree.
- **Cause:** The command did not use the task worktree as its explicit working
  directory.
- **Correction:** Restore the unintended files and repeat the installation in
  the exact task worktree.
- **Prevention:** Set the working directory for every npm and Git write, then
  inspect other active worktrees after any path mistake.
- **Status:** Resolved.

### F-019 — Relative deletion follows the process working directory

- **Date:** 2026-08-20
- **Context:** CAD-036 removed obsolete generic CAD tests from the Grok
  line while the session started in another worktree.
- **Symptom:** A relative deletion targeted Codex files and left the intended
  Grok files unchanged.
- **Cause:** The deletion used relative paths without an explicit task
  worktree.
- **Correction:** Restore the unintended deletion and repeat against validated
  absolute targets in the correct worktree.
- **Prevention:** Resolve and verify exact worktree paths before deletion. Check
  every concurrently active worktree after a path error.
- **Status:** Resolved.

### F-020 — Near-fitting rectangular panels do not share exact mesh corners

- **Date:** 2026-08-21
- **Context:** Pose-only generation on 66 mm square faces with 66 × 65 mm PCBs.
- **Symptom:** Gap detection capped panel outlines or produced non-planar quads
  when nearby corners on different planes were welded with a first-wins rule.
- **Cause:** Adjacent panel corners have about 1.1–1.3 mm of separation, and
  cuboctahedron square faces meet at 4-regular vertices rather than shared
  edges.
- **Correction:** Cluster within the 1.5 mm weld tolerance, use a radial face
  walk at non-coplanar junctions, discard panel-outline cycles, and place each
  cluster on the incident panel-plane intersection.
- **Prevention:** Do not require only 2-regular gap walks or use first-wins
  welding across different planes. Keep cuboctahedron closure coverage.
- **Evidence:** `tests/panel-outline-boundary.test.ts`.
- **Status:** Resolved.

### F-021 — Executables installed under a `/tmp` worktree can fail in the sandbox

- **Date:** 2026-08-21
- **Context:** Integration verification in a temporary Git worktree.
- **Symptom:** `npm ci` installed `esbuild`, but its post-install version probe
  failed with `spawnSync .../node_modules/esbuild/bin/esbuild EPERM`.
- **Cause:** The restricted sandbox did not permit execution from the temporary
  worktree, although the same pinned executable was valid outside that sandbox.
- **Correction:** Repeat `npm ci` with approved execution outside the restricted
  sandbox, then run the verification commands in the same environment.
- **Prevention:** If a task worktree is under `/tmp`, treat an executable
  `EPERM` during dependency installation as a sandbox boundary. Do not change
  package versions or bypass install scripts before testing the approved path.
- **Evidence:** The Manifold integration install and subsequent passing builds.
- **Status:** Resolved.

### F-022 — A draft-route browser fixture retained route-optimized provenance

- **Date:** 2026-08-21
- **Context:** Manifold and wiring integration browser verification.
- **Symptom:** The wiring route test removed saved `panelIds`, but the imported
  project stayed at zero panels and the prior project's controls remained.
- **Cause:** The test left each installed address transform marked
  `route-optimized` with a fingerprint bound to the removed route. The runtime
  correctly rejected that inconsistent local project.
- **Correction:** When the fixture intentionally converts authored wiring to a
  draft, also downgrade installed transform selection to `manual` and remove
  its optimization fingerprint.
- **Prevention:** Test fixtures that mutate a route must apply the same
  provenance invalidation as the editor. Wait for a project-specific state so
  a rejected import cannot appear to succeed against prior controls.
- **Evidence:** `tests/browser/wiring-route-editor.spec.ts`.
- **Status:** Resolved.

### F-023 — LAN review requested a deliberately loopback-only helper API

- **Date:** 2026-08-21
- **Context:** Reviewing merged Manifold generation from another computer on
  the same network.
- **Symptom:** The browser logged HTTP 403 for `/api/generator-status`.
- **Cause:** The helper API correctly accepts only loopback Host values, but the
  browser requested it even though Manifold generation runs in-process.
- **Correction:** Non-loopback browser origins report in-browser Manifold ready
  without requesting the helper API. Loopback origins keep API discovery.
- **Prevention:** Keep optional loopback helpers separate from capabilities
  that are bundled into the browser. Do not weaken the helper Host or
  same-origin guards for LAN preview convenience.
- **Evidence:** `tests/generator-status.test.ts` and HTTP LAN review.
- **Status:** Resolved.

### F-024 — First-vertex cap distance rejected a valid deterministic gap

- **Date:** 2026-08-21
- **Context:** Live 30-panel rhombicosidodecahedron Manifold generation.
- **Symptom:** `gap-1efef6988a7b` failed as 0.111107 mm non-planar against a
  0.05 mm limit, then appeared to intersect PCB P-04.
- **Cause:** Plane distance used the first cap vertex instead of the polygon
  centroid, and any non-empty clipped polygon counted as PCB interior overlap,
  including boundary-only numerical slivers.
- **Correction:** Measure from the centroid-referenced polygon plane, use a
  documented 0.10 mm coplanarity limit for the measured 0.061419 mm warp,
  require a named 0.01 mm clipped span in both panel-local axes for real PCB
  interior overlap, and use the centroid/Newell flat-cover frame only for
  closure faces outside the legacy strict plane. Panel faces remain strict and
  already-planar closure output remains byte-for-byte unchanged.
- **Prevention:** Exercise closed-boundary generation, not topology detection
  alone, on each flagship automatic placement. Keep invalid warped and
  intersecting fixtures as rejection coverage.
- **Evidence:** `tests/panel-outline-boundary.test.ts` and exact live-project
  Manifold generation.
- **Status:** Resolved.

### F-025 — Manual export treated useful draft wiring as unavailable

- **Date:** 2026-08-22
- **Context:** Printable assembly-manual export for automatically generated
  panel layouts.
- **Symptom:** The manual control reported draft route, missing GPIO, and
  non-optimized orientation blockers, and the STL ZIP contained no manual.
- **Cause:** Mapping readiness was used as an export gate even though the
  operator explicitly wanted the current automatic wiring suggestion as the
  working assembly plan.
- **Correction:** Export the current preview for all panelized projects. Label
  non-ready output **DRAFT SUGGESTION**, show GPIO as unassigned, show current
  turns as non-optimized assumptions, and include that HTML in the STL ZIP.
- **Prevention:** Do not convert evidence quality into an availability gate
  when a clearly labelled draft artifact remains useful and the operator has
  authorized draft assumptions.
- **Evidence:** Draft manual model tests and the browser manual-to-STL-ZIP E2E
  journey.
- **Status:** Resolved.

### F-026 — The main interface exposed duplicate controls and internal status text

- **Date:** 2026-08-22
- **Context:** Operator review of the simulator before physical assembly.
- **Symptom:** The interface mixed useful authoring actions with pause/restart,
  fixed engine values, implementation provenance, repeated geometry guidance,
  and long readiness text.
- **Cause:** Development diagnostics and low-level tuning controls accumulated
  in the primary operator interface after their values became project-derived
  or stable defaults.
- **Correction:** Keep WLED playback continuous, remove the duplicate controls
  and explanatory chrome, and retain only hidden state hooks needed for stable
  browser startup tests.
- **Prevention:** Add an operator-facing control only when it changes a current
  authored result or supports a necessary review action. Keep implementation
  provenance and test synchronization state out of the visible workflow.
- **Evidence:** `tests/browser/mechanics-free-authoring.spec.ts` asserts the
  reduced interface and advancing engine timeline.
- **Status:** Resolved.

### F-027 — A geometry error entered the runtime fallback and parsed HTML as JSON

- **Date:** 2026-08-22
- **Context:** Browser boundary and printable-part generation on a LAN review
  server.
- **Symptom:** The console reported `Unexpected token '<'` because `<!doctype`
  application HTML was passed to `Response.json()`.
- **Cause:** A broad text match treated all errors containing `Manifold` as a
  WASM-load failure. The optional local endpoint then returned the static app
  fallback instead of a pipeline JSON response.
- **Correction:** Use a dedicated `ManifoldRuntimeUnavailableError` for the
  only condition that can enter the local fallback. Validate the response media
  type, JSON syntax, and object shape before reading pipeline fields.
- **Prevention:** Route fallback behavior by typed failure category, not a
  product-name substring. Validate response contracts before parsing bodies.
- **Evidence:** `tests/manifold-runtime.test.ts`,
  `tests/editor-pipeline-response.test.ts`, and the real browser generation and
  ZIP-reopen journey.
- **Status:** Resolved.

### F-028 — Separate project and fabrication controls produced a fragmented handoff

- **Date:** 2026-08-22
- **Context:** Operator preparation for physical panel and wiring assembly.
- **Symptom:** JSON, folder, ZIP, STL, manual, ledmap, and wiring-review actions
  appeared as separate primary buttons. The operator had to know which sequence
  produced a complete current package.
- **Cause:** Each subsystem added its own import or export control instead of
  joining verified outputs at the project handoff boundary.
- **Correction:** Use one editable project ZIP, one generate/download
  panel-closure action, one **Regenerate mapping/wiring** action, and one
  complete assembly package. Keep specialized fabrication downloads beside
  their corresponding generated viewport result.
- **Prevention:** When several files describe one physical build, export them
  from one current in-memory contract and test exact package contents plus
  reopen. Prefer stateful actions over separate prerequisite/result buttons.
- **Evidence:** `tests/assembly-package.test.ts` and the Playwright generation,
  portable-project, and wiring-route journeys.
- **Status:** Resolved.

### F-029 — Replacing staged files under a live Vite server cached HTML fallbacks

- **Date:** 2026-08-22
- **Context:** LAN review of the UI-018 project and assembly-package workflow.
- **Symptom:** Startup logged `Unexpected token '<'` because a registry-listed
  sculpture URL returned the application HTML page with HTTP 200.
- **Cause:** The staging command replaced the public sculpture directory while
  the existing Vite process stayed active. Playwright startup also runs this
  staging command. The live server kept history fallbacks for the replaced JSON
  paths.
- **Correction:** Stop the preview before staging, then start it again. Read
  staged JSON responses through a bounded parser that identifies an HTML
  fallback and gives the operator a restart action.
- **Prevention:** Stage assets before starting Vite. Stop the live preview
  before browser tests or any staging command. Restart only after all checks,
  then verify every registry source returns JSON.
- **Evidence:** `tests/json-response.test.ts` and
  `tests/browser/json-response.spec.ts`.
- **Status:** Resolved.

### F-030 — Normalized Node archive modes disabled managed npm launchers

- **Date:** 2026-08-23
- **Context:** Repository-local Node/npm clean-checkout bootstrap.
- **Symptom:** The first managed setup passed, but a nested `npm run` command
  skipped `.tools/node/bin/npm` and entered the incomplete host npm package.
- **Cause:** The safe archive extractor normalizes regular files to mode 0644.
  The manifest marked only `bin/node` executable, while `bin/npm` and `bin/npx`
  are symlinks to JavaScript CLI files that remained non-executable.
- **Correction:** Mark the real npm and npx CLI target files as executables in
  every target manifest, recompute extracted-tree identities, and run the full
  suite with global Node/npm removed from `PATH`.
- **Prevention:** For archive symlink launchers, verify both the link and its
  normalized final target. Test nested package scripts with a restricted PATH.
- **Evidence:** `tests/bootstrap-install.test.ts` and the clean-checkout CI job
  run through `./bootstrap.sh` with `PATH=/usr/bin:/bin`.
- **Status:** Resolved.

### F-031 — A long-running feature branch can restore retired contracts

- **Date:** 2026-08-24
- **Context:** Integration of the structural connector branch after the
  Manifold-only, Schema 2 validation, and unified-UI milestones.
- **Symptom:** A text merge retained structural additions but also reintroduced
  references to retired OpenSCAD/manual mechanics and removed UI controls.
- **Cause:** The feature branch started before those later decisions, so clean
  textual hunks were not necessarily valid against the current architecture.
- **Correction:** Integrate in a separate worktree, keep current shared control
  documents as the base, port structural behavior explicitly, and scan active
  code and documentation for retired contract names before testing.
- **Prevention:** Treat a large old-base branch as a semantic migration. Preserve
  its source ref, but accept each shared-file hunk only against current source
  authorities and operator UI requirements.
- **Evidence:** `TRUSS-011`, `docs/DECISIONS.md`, and the integrated retired-
  reference scan.
- **Status:** Resolved.

### F-032 — Cross-worktree dependencies blocked Manifold WASM

- **Date:** 2026-08-25
- **Context:** LAN review server in an isolated task worktree.
- **Symptom:** Connector generation reported that Manifold WASM could not be
  loaded because both asynchronous and synchronous fetches failed.
- **Cause:** The task worktree used a `node_modules` symlink to another
  worktree. Vite resolved `manifold.wasm` through that external real path and
  rejected the request with HTTP 403 because it was outside the server file
  allowlist.
- **Correction:** Remove the cross-worktree symlink, run locked `npm ci` in the
  task worktree, and restart Vite. Verify the exact `manifold.wasm` request and
  one browser generation action.
- **Prevention:** Do not use cross-worktree dependency symlinks for a Vite
  preview that loads package-relative WASM. Install dependencies locally in the
  active preview worktree.
- **Evidence:** Browser verification returned HTTP 200 for the task-local
  `node_modules/manifold-3d/manifold.wasm` and generated two SHA-256-verified
  connector parts.
- **Status:** Resolved.

### F-033 — Back-view PCB coordinates placed structural anchors on the wrong side

- **Date:** 2026-08-25
- **Context:** Printable connector ribbons and LED-surface bridges.
- **Symptom:** Screw shoes and holes appeared on the opposite physical PCB side
  and could overlap DIN or DOUT hardware.
- **Cause:** The panel profile records mounting-hole coordinates in PCB back
  view, but structural normalization applied them directly in the outward-facing
  panel pose frame.
- **Correction:** Mirror profile-local X before structural anchor and connector
  clearance placement. Keep measured hole IDs unchanged. Reject every final
  part that intersects a finite DIN/DOUT clearance cylinder.
- **Prevention:** Every hardware coordinate contract must name its viewing side
  and its conversion into the pose frame. Geometry tests must include a rotated
  pose and final-solid connector keep-outs for each structural style.
- **Evidence:** `tests/structural-design.test.ts` and
  `tests/structural-solids.test.ts`.
- **Status:** Resolved.

### F-034 — Post-CAD connector retries created an unbounded route search

- **Date:** 2026-08-25
- **Context:** Automatic 30-panel ribbon and LED-surface bridge routing.
- **Symptom:** Excluding a connector only after Manifold rejected it either
  disconnected the degree-2 graph or repeatedly rebuilt many candidate paths.
- **Cause:** Printable feasibility entered after graph selection, so the route
  algorithm had no bounded edge cost for connector keep-outs or mesh failure.
- **Correction:** The failed retry implementation was removed. Existing final-
  solid checks remain strict and fail closed.
- **Prevention:** Put conservative hardware and printable-mesh feasibility into
  bounded pre-CAD candidate scoring. Do not use an open-ended generate, reject,
  and rebuild loop.
- **Evidence:** `FAB-023` records the exact missing optimizer boundary.
- **Status:** Open.

### F-035 — Fabrication convention changed without invalidating old parts

- **Date:** 2026-08-25
- **Context:** FAB-022 shared PCB back-view to outward-pose coordinate repair.
- **Symptom:** A pre-repair planar mechanics manifest could remain `current`
  although regeneration moved its screw holes to the correct physical side.
- **Cause:** The generated-mechanics fingerprint covered authored geometry and
  profile values but did not cover the fabrication coordinate convention.
- **Correction:** Add the coordinate-contract token to the fingerprint, bump
  the planar-parts generator version, and pin the old fixture fingerprint in a
  stale-state regression.
- **Prevention:** A derived-geometry algorithm or coordinate convention change
  must update both its generator version and the source fingerprint policy.
- **Evidence:** `tests/generated-mechanics-contract.test.ts`.
- **Status:** Resolved.

### F-036 — Restoring a partial WLED configuration can remove network settings

- **Date:** 2026-08-25
- **Context:** FIRM-011 one-panel ESP32 smoke setup.
- **Symptom:** The controller worked after initial Wi-Fi setup but became hard
  to find after a partial smoke configuration was restored as `cfg.json`.
- **Cause:** The partial hardware file was treated as a complete WLED backup.
- **Correction:** Apply partial hardware configuration with `POST /json/cfg`,
  then read it back and confirm that Wi-Fi and mDNS identity still work after a
  reboot.
- **Prevention:** Never restore a repository partial configuration as the full
  device `cfg.json`. The future guarded UI setup must preserve network fields.
- **Evidence:** `firmware/README.md` and the successful live configuration at
  `192.168.68.51` on 2026-08-25.
- **Status:** Resolved.

### F-037 — Front-view LED coordinates need one explicit back-view reflection

- **Date:** 2026-08-25
- **Context:** CAL-011 measured 8×8 panel address order.
- **Symptom:** Profile text placed front-view pixel 0 at top-left, but the
  identity address transform still mapped that coordinate to pixel 63.
- **Cause:** The profile and installed transform use PCB back view while pose-
  local LED coordinates use outward/front view; the fixed X reflection was
  missing from the address transform.
- **Correction:** Reflect X once before the optional installed mirror and
  quarter turn. Apply the same rule in mapping and orientation optimization,
  and version the optimization fingerprint contract.
- **Prevention:** Test identity and all eight installed transforms with known
  pixel 0, pixel 7, and pixel 8 front-view coordinates. Include coordinate-
  convention tokens in derived fingerprints.
- **Evidence:** `tests/hardware-mapping.test.ts` and
  `INSTALLED_ADDRESS_COORDINATE_CONTRACT`.
- **Status:** Resolved.

### F-038 — An application-only receipt cannot support a destructive web flash

- **Date:** 2026-08-25
- **Context:** FIRM-012 one-action ESP32 setup.
- **Symptom:** The approved receipt covered only the application at `0x10000`.
  Erasing the chip and writing that file would remove the bootloader and
  partition table and leave the controller unable to boot.
- **Cause:** The command-line PlatformIO upload supplied the other images from
  its build environment, but the browser workflow had no receipt-bound complete
  image.
- **Correction:** The firmware-generation branch now merges the bootloader,
  partition table, boot application, and WLED application into one image at
  offset zero. The receipt binds its size, SHA-256, flash parameters, and
  destructive erase policy. The local endpoint and browser verify those exact
  bytes before serial access.
- **Prevention:** A destructive firmware action must bind every flash region it
  needs. Never infer missing offsets or enable erase for a partial image.
- **Evidence:** `firmware/build-receipt.json`,
  `scripts/esp32-firmware-handler.ts`, and
  `tests/esp32-firmware-handler.test.ts`.
- **Status:** Resolved.

### F-039 — Changing browser flash baud corrupted the physical CP2102 link

- **Date:** 2026-08-26
- **Context:** FIRM-012 physical Chrome Web Serial setup on ESP-WROOM-32.
- **Symptom:** The loader entered download mode but failed flash-chip detection
  with `Invalid head of packet (0x65)` after selecting the CP2102 device.
- **Cause:** The browser loader changed the working 115200-baud ROM connection
  to 460800 baud before flash-chip verification. The same hardware had already
  flashed successfully at the slower rate.
- **Correction:** Keep the complete browser flash at 115200 baud. Do not change
  baud after ROM synchronization on this approved target.
- **Prevention:** Pin and test the browser loader baud as part of the physical
  target contract. Increase it only after a separate physical result.
- **Evidence:** Operator browser trace on 2026-08-26 and
  `tests/esp32-setup.test.ts`.
- **Status:** Human review.

### F-040 — Separate DTR and RTS calls did not reliably enter download mode

- **Date:** 2026-08-26
- **Context:** FIRM-013 Chrome Web Serial setup with a CP2102 ESP32 board.
- **Symptom:** After the stale-port problem cleared, the same button sometimes
  ended with `Failed to connect with the device` before chip detection.
- **Cause:** The pinned esptool-js reset strategy sends DTR and RTS in separate
  Web Serial calls. Chrome/macOS and some reset circuits can observe an
  unintended intermediate signal state.
- **Correction:** Override only the loader reset constructors so each required
  DTR/RTS pair is sent in one `setSignals` call. Hard reset explicitly asserts
  EN low before release. Retain the reviewed timings.
- **Prevention:** Test the exact combined bootloader-entry and hard-reset signal
  sequence. Remove the local override only after the pinned library implements
  and physically verifies the same behavior.
- **Evidence:** Operator browser trace on 2026-08-26, esptool-js issue 222, and
  `tests/esp32-setup.test.ts`.
- **Status:** Human review.

### F-041 — The chip identity gate expected an abbreviated loader label

- **Date:** 2026-08-26
- **Context:** FIRM-013 physical detection of the installed ESP-WROOM-32.
- **Symptom:** The browser reached the ROM loader but refused the device with
  `Expected ESP32, but detected ESP32-D0WDQ6 (revision 1)`.
- **Cause:** The guard test used the abbreviated family label while esptool-js
  returns the classic chip model and revision after successful detection.
- **Correction:** Accept the measured `ESP32-D0WDQ6` description with a numeric
  revision as well as the abbreviated classic label. Continue to reject S2,
  S3, C-series, and other targets.
- **Prevention:** Pin identity tests to the physical loader description, not
  only a synthetic family name.
- **Evidence:** Operator browser trace on 2026-08-26 and
  `tests/esp32-setup.test.ts`.
- **Status:** Human review.

### F-042 — The first post-reset serial reopen can fail on macOS

- **Date:** 2026-08-26
- **Context:** FIRM-013 transition from a verified browser flash to Improv.
- **Symptom:** After flash-chip detection and writing, the workflow failed with
  `Failed to execute 'open' on 'SerialPort': Failed to open serial port`.
- **Cause:** The workflow made one reopen attempt two seconds after the EN
  reset. macOS had not released the CP2102 path for Chrome at that instant.
- **Correction:** Retry the same authorized port every 500 ms with a fixed
  30-attempt bound, then fail with the last error. Do not request another USB
  device or continue without a verified WLED Improv identity.
- **Prevention:** Test retry success and bounded failure. Keep all receipt,
  target, and identity gates after the reopen.
- **Evidence:** Operator browser trace on 2026-08-26 and
  `tests/esp32-setup.test.ts`.
- **Status:** Human review.

### F-043 — Disabling Adalight also removed serial Improv provisioning

- **Date:** 2026-08-26
- **Context:** FIRM-013 one-action ESP32 setup after a verified browser flash.
- **Symptom:** The complete image flashed and passed its SHA-256 check, but the
  next stage stopped with `Improv Wi-Fi Serial not detected`.
- **Cause:** The firmware override used `WLED_DISABLE_ADALIGHT`. In the pinned
  WLED source, the same compile-time gate controls Adalight, serial JSON, and
  Improv packet handling. The approved image therefore had no Improv listener.
- **Correction:** Remove that disable flag, rebuild the complete image, and
  record `improv-v1` as a required target capability in receipt schema 1.2.0.
- **Prevention:** Firmware receipt generation and verification must reject an
  override that disables this gate. The local endpoint and deployment contract
  must also reject a receipt without the serial Improv capability.
- **Evidence:** The operator trace on 2026-08-26,
  `firmware/build-receipt.json`, `scripts/esp32-firmware-handler.ts`, and the
  generation-branch receipt checks.
- **Status:** Human review.

### F-044 — A selected Web Serial port object can become stale after reset

- **Date:** 2026-08-26
- **Context:** FIRM-013 handoff from verified browser flash to serial Improv on
  macOS with a CP2102 adapter.
- **Symptom:** The firmware flashed and verified, but all attempts to reopen the
  selected `SerialPort` object failed after reset.
- **Cause:** macOS and Chrome can re-enumerate the authorized CP2102 after the
  flasher closes it. Retrying only the object returned by the original chooser
  does not adopt the current authorized port object.
- **Correction:** During the bounded handoff, query previously authorized
  ports and use the sole CP2102 match. Continue retrying for one minute and
  allow one USB reconnect without another chooser or another flash.
- **Prevention:** Test that a refreshed authorized CP2102 replaces a stale
  selected object. Do not select among multiple matching adapters.
- **Evidence:** Operator browser trace on 2026-08-26 and
  `tests/esp32-setup.test.ts`.
- **Status:** Human review.

### F-045 — A bare Improv TIMEOUT hides the Wi-Fi failure stage

- **Date:** 2026-08-26
- **Context:** FIRM-013 reached serial Improv after a verified physical flash.
- **Symptom:** The setup modal reported only `TIMEOUT`, with no evidence that
  serial identity had passed or that the selected SSID was visible.
- **Cause:** The controller sent credentials immediately after Improv
  initialization and forwarded the SDK error without stage context.
- **Correction:** Timestamp the activity log, report Improv identity, scan for
  the selected 2.4 GHz SSID across six bounded attempts, report its RSSI, and
  translate provisioning timeout into a network-specific action.
- **Prevention:** Keep serial identity, SSID discovery, credential submission,
  and device read-back as distinct logged gates. Never log the password.
- **Evidence:** Operator browser trace on 2026-08-26 and
  `tests/esp32-setup.test.ts`.
- **Status:** Human review.

### F-046 — Direct browser fetch cannot be the WLED read-back boundary

- **Date:** 2026-08-26
- **Context:** FIRM-013 after Improv found `AZIOT` at -47 dBm and returned a
  device URL four seconds after credentials were sent.
- **Symptom:** The next browser request failed immediately with `Failed to
  fetch`, before the configured HTTP timeout could expire.
- **Cause:** The editor page directly fetched a different private HTTP origin.
  Browser cross-origin and private-network policy can block that response even
  when the local editor host can reach the ESP32.
- **Correction:** Broker only fixed WLED operations through the loopback editor.
  Accept only private IPv4 or the fixed `loo-ume.local` name, reject redirects,
  and bound both request and response bytes and time.
- **Prevention:** Keep Web Serial in the local browser, but perform WLED HTTP
  configuration and exact read-back through the same-origin local service. Do
  not add a general target URL proxy.
- **Evidence:** Operator browser trace on 2026-08-26,
  `scripts/esp32-device-handler.ts`, and its focused policy test.
- **Status:** Human review.

### F-047 — WLED does not persist the smoke bus text label

- **Date:** 2026-08-26
- **Context:** FIRM-013 final one-panel configuration read-back.
- **Symptom:** WLED persisted the correct 64-pixel GPIO16 GRB bus and 1,000 mA
  limit, but the exact comparison failed.
- **Cause:** The authored smoke JSON supplied `FIRM-011 one fused panel` in the
  optional bus `text` field. This WLED build normalized that field to an empty
  string while preserving all functional bus values.
- **Correction:** Store the measured persisted empty string in the canonical
  smoke configuration. Keep exact comparison for every bus field.
- **Prevention:** Compare canonical deployment input with physical WLED
  read-back and record device normalization instead of adding a broad ignored-
  field list.
- **Evidence:** Live `/json/cfg` from `192.168.68.53` on 2026-08-26 and
  `firmware/one-panel-smoke-cfg.json`.
- **Status:** Human review.

### F-048 — A frozen one-shot framebuffer does not survive late panel power

- **Date:** 2026-08-26
- **Context:** FIRM-013 one-panel simulator transfer after verified setup.
- **Symptom:** WLED reported the correct active 64-pixel state, but a panel that
  was connected after setup stayed off.
- **Cause:** The JSON individual-pixel command was sent once. WLED froze that
  segment after it latched the frame while the panel had no power, so the later
  panel connection received no data transition.
- **Correction:** Keep a bounded, single-request live link while the editor is
  open. Send the current first-panel framebuffer through the authoritative
  physical mapping at no more than 10 frames per second, and back off after a
  network error.
- **Prevention:** A hardware preview that permits late panel connection must
  refresh the output. Do not describe one accepted JSON state as a continuing
  framebuffer transport.
- **Evidence:** Live WLED state/config/info at `192.168.68.53` on 2026-08-26 and
  `tests/esp32-setup.test.ts`.
- **Status:** Resolved.

### F-049 — JSON pixel preview freezes when its host disappears

- **Date:** 2026-08-26
- **Context:** FIRM-014 one-panel operation after the live editor link passed.
- **Symptom:** The panel followed the simulator while the laptop was connected,
  but it stopped animating when the laptop was disconnected.
- **Cause:** WLED treats JSON individual-pixel data as a frozen segment. It has
  no finite realtime timeout and is not an autonomous boot animation.
- **Correction:** Save the selected native WLED settings as preset 1 and select
  it for boot. Send exact preview frames through DDP with WLED's bounded
  2.5-second realtime timeout, then verify the preset across a restart.
- **Prevention:** Keep autonomous state and live preview as separate contracts.
  A preview transport must time out to a verified persisted state when its host
  disappears.
- **Evidence:** Pinned WLED `json.cpp`, `e131.cpp`, `udp.cpp`, and the focused
  FIRM-014 setup and device-handler tests.
- **Status:** Resolved. The operator confirmed physical timeout exit and
  autonomous power-cycle playback on the 192-LED project.

### F-050 — A setup mode dropdown did not represent the loaded simulator

- **Date:** 2026-08-26
- **Context:** FIRM-014 physical review with a loaded three-panel project.
- **Symptom:** The UI offered a one-panel configuration choice even though the
  visible simulator contained three panels.
- **Cause:** An internal one-panel/full-install safety distinction was exposed
  as an operator setting, and the setup payload remained hard-coded to 64 LEDs.
- **Correction:** Remove the dropdown. Derive all GPIO outputs, LED count,
  ledmap, animation state, and segmented DDP framebuffer from the loaded
  simulator through the complete 41-panel authority.
- **Prevention:** Hardware setup must copy the authoritative loaded project. Do
  not ask the operator to select a second configuration authority.
- **Evidence:** `createSimulatorSetupConfig()`, dynamic framebuffer tests, and
  the FIRM-014 browser setup journey.
- **Status:** Resolved for the three-panel physical project. Complete
  41-panel observation remains under HW-012 and PROOF-010.

### F-051 — WLED preset storage is eventually consistent

- **Date:** 2026-08-26
- **Context:** FIRM-014 physical three-panel setup.
- **Symptom:** WLED accepted the 192-LED configuration and preset write, but the
  immediate preset read reported that the standalone preset did not match. A
  later `/presets.json` read contained the exact expected preset.
- **Cause:** The preset file was read before WLED finished publishing the saved
  preset.
- **Correction:** After the state write, retry the exact preset and boot-preset
  read-back within a strict 20-second deadline. Do not weaken the field
  comparison.
- **Prevention:** Treat WLED file-backed preset publication as eventually
  consistent and verify the final exact value with a bounded retry.
- **Evidence:** Live `/presets.json`, `/json/state`, `/json/info`, and
  `/json/cfg` from `192.168.68.53`, plus the focused persistence retry test.
- **Status:** Resolved; physical three-panel setup and power-cycle passed.

### F-052 — WLED HTTP can drop requests just after restart discovery

- **Date:** 2026-08-26
- **Context:** FIRM-014 three-panel restart verification.
- **Symptom:** mDNS and IP identity discovery succeeded, then the immediate
  `/json/info` verification request failed while WLED was still recovering.
- **Cause:** Network discovery can succeed before every WLED HTTP endpoint is
  stable after restart.
- **Correction:** Retry the complete exact post-restart snapshot—config,
  firmware identity, state, preset, and ledmap—within a strict 45-second
  deadline. Fully settle one attempt before another starts, and keep the
  browser request timeout longer than the loopback proxy's upstream timeout.
- **Prevention:** Do not treat one successful discovery response as complete
  application readiness after a controller restart.
- **Evidence:** Operator log at 12:37 on 2026-08-26 and the focused transient
  restarted-snapshot regression.
- **Status:** Resolved; physical three-panel restart verification passed.

### F-053 — DDP preview can invalidate standalone restart verification

- **Date:** 2026-08-26
- **Context:** FIRM-014 three-panel standalone playback verification.
- **Symptom:** WLED restored preset 1, but the exact state check found `frz:true`
  instead of the saved `frz:false` state.
- **Cause:** The browser continued to send DDP frames during setup. WLED entered
  realtime mode after restart before the standalone state was verified.
- **Correction:** Suspend the browser-to-WLED live link for the complete setup
  operation. Drain any prior reconnect, preset save, and frame request before
  device mutation. Enable the link only after exact restart verification passes.
- **Prevention:** Do not run a realtime transport while a native controller
  fallback is under restart or persistence verification.
- **Evidence:** Live `/json/state` showed preset 1 with DDP live mode and
  `frz:true`; `/presets.json` retained the intended `frz:false` value.
- **Status:** Resolved; physical DDP exit and power-cycle playback passed.

### F-054 — WLED file reads can recover after its JSON API

- **Date:** 2026-08-26
- **Context:** FIRM-014 three-panel standalone playback verification.
- **Symptom:** WLED identity and JSON endpoints recovered after restart, but
  exact `/ledmap.json` read-back returned HTTP 502 until later.
- **Cause:** WLED network discovery and JSON readiness do not prove that its
  file-system HTTP endpoint is ready.
- **Correction:** Keep the complete exact snapshot retry bounded to 45 seconds.
  Do not weaken or skip ledmap comparison while the file endpoint recovers.
- **Prevention:** Include referenced file readiness in post-restart controller
  verification and allow a separate bounded recovery period.
- **Evidence:** The operator saw HTTP 502 during verification; the same direct
  and proxied ledmap request later returned the exact 192-pixel artifact.
- **Status:** Resolved; physical ledmap recovery and restart proof passed.

### F-055 — One transient mDNS failure disabled live preview after reload

- **Date:** 2026-08-26
- **Context:** FIRM-014 page reload after successful three-panel setup.
- **Symptom:** Simulator effect changes did not reach the physical panels, and
  WLED reported that DDP realtime mode was inactive.
- **Cause:** Automatic reconnect tried `loo-ume.local` once. The loopback proxy
  returned a transient resolution error, and the page silently stopped trying.
- **Correction:** Retry read-only mDNS discovery up to 12 times with a
  two-second delay. Run identity, config, ledmap, and preset checks once.
- **Prevention:** Do not treat one transient local-name failure as proof that a
  previously configured controller is absent.
- **Evidence:** Physical WLED status reported `live:false`; the browser console
  recorded HTTP 400 for the single mDNS request.
- **Status:** Resolved; physical page reload and reconnect passed.

### F-056 — Temporary invalid preset JSON escaped its retry

- **Date:** 2026-08-26
- **Context:** FIRM-014 automatic reconnect after a hard page reload.
- **Symptom:** The simulator worked, but physical panels did not update. The
  browser reported `WLED preset read-back returned invalid JSON`.
- **Cause:** Preset and boot-state reads first ran outside the persistence retry.
  Physical follow-up also found WLED's sparse file form `{ ,"1":...}`, which
  its firmware accepts but standard `JSON.parse` rejects.
- **Correction:** Put both reads, parsing, and exact checks inside a strict
  20-second loop. Normalize only one leading comma after the root brace, then
  require valid JSON and the same exact preset values. Cancel stale project or
  setup work and report each reconnect stage.
- **Prevention:** An eventual-consistency retry must include acquisition and
  parsing, not only the final semantic assertion.
- **Evidence:** Operator console after hard reload and the focused invalid-JSON
  first-read regression.
- **Status:** Resolved; physical page reload and reconnect passed.

### F-057 — Ungamma-corrected DDP made dark simulator pixels visibly blue

- **Date:** 2026-08-26
- **Context:** FIRM-014 physical three-panel live preview.
- **Symptom:** Theater effects looked mostly black in the simulator and during
  native WLED playback, but DDP preview showed every dark LED as dim blue.
- **Cause:** WLED realtime input used its default `no-gc: true` contract, but
  the browser sent the simulator's pre-gamma RGB bytes unchanged. The Theater
  background `#050816` was therefore much brighter than native WLED output.
- **Correction:** Apply WLED's pinned 2.2 color-gamma curve to every DDP channel
  and bind `no-gc: true` in generated/read-back configuration. Keep the saved
  native preset colors unchanged.
- **Prevention:** A realtime framebuffer must state which side owns gamma
  correction and test representative dark and bright channel values.
- **Evidence:** Pinned WLED `colors.cpp`, `FX_fcn.cpp`, `wled.h`, `cfg.cpp`, and
  the focused DDP byte regression.
- **Status:** Resolved; physical DDP color parity passed.

### F-058 — A lost WLED state-write response stopped a valid reconnect

- **Date:** 2026-08-26
- **Context:** FIRM-014 automatic reconnect after loading the three-panel JSON.
- **Symptom:** The panels briefly followed the simulator, then returned to the
  local preset. The log ended with `WLED /json/state: The operation was aborted
  due to timeout`.
- **Cause:** Preset persistence treated a missing HTTP response as proof that
  WLED rejected the write. A controller can complete the flash-backed preset
  mutation after the proxy or browser loses its response.
- **Correction:** Send the state mutation once. If its response is lost, do not
  repeat it. Reconcile the ambiguous result through the existing exact preset
  and boot-preset read-back deadline, and enable DDP only if both match.
- **Prevention:** Do not automatically repeat a non-idempotent or flash-backed
  controller mutation after an ambiguous transport failure. Verify resulting
  state first.
- **Evidence:** Operator log at 14:06 and the focused lost-response regression.
- **Status:** Resolved; physical reconnect passed.

### F-059 — Reconnect logging hid repeated mDNS failures

- **Date:** 2026-08-26
- **Context:** FIRM-014 automatic reconnect review.
- **Symptom:** The page showed one generic waiting message after an mDNS HTTP
  400, so the operator could not tell whether retries continued or which build
  was loaded.
- **Cause:** Discovery logged only the first failure, and the hashed Vite bundle
  name was visible only in DevTools request details.
- **Correction:** Log the exact current module filename in the activity log and
  DevTools console. Log every bounded mDNS attempt and its failure before the
  next delay.
- **Prevention:** A bounded hardware recovery loop must expose its current
  attempt, final cause, and executing build identity.
- **Evidence:** Operator log at 14:10 and focused discovery-log regression.
- **Status:** Resolved.

### F-060 — Immediate API-call preset writes blocked WLED and dropped Wi-Fi

- **Date:** 2026-08-26
- **Context:** FIRM-014 automatic reconnect after WLED rejoined AZIOT.
- **Symptom:** WLED accepted a live frame for about one second, then returned to
  native playback. `/json/state`, `/presets.json`, and `/json/info` timed out,
  and the controller disappeared from the LAN.
- **Cause:** The preset-save payload included `o:true`. Pinned WLED treats a
  non-null `o` as an immediate API-call preset and writes it synchronously. Its
  source warns that this path often corrupts `presets.json`; on the measured
  ESP32 it also blocked HTTP long enough to lose Wi-Fi.
- **Correction:** Omit `o`. Keep `psave`, `ib`, and `sb` so WLED uses its
  asynchronous current-state preset path. Configure `bootps` once through the
  setup config, as corrected by F-062, then require exact eventual preset and
  boot-state read-back before DDP starts.
- **Prevention:** Use the native asynchronous WLED preset contract for normal
  state snapshots. Pin the absence of `o` in the request regression.
- **Evidence:** Pinned WLED `json.cpp` and `presets.cpp`, operator log at 14:21,
  and the exact preset request test.
- **Status:** Resolved; physical reconnect passed.

### F-061 — Exact read-back rejected WLED's native asynchronous segment array

- **Date:** 2026-08-26
- **Context:** FIRM-014 reconnect after the asynchronous preset-save correction.
- **Symptom:** Rainbow saved and survived a power cycle, but reconnect rejected
  the preset 29 times and never enabled DDP.
- **Cause:** The old synchronous API-call preset stored `seg` as one object.
  WLED's correct asynchronous state snapshot stores an array: the active segment
  first, followed by disabled `{stop:0}` slots. The verifier accepted only the
  obsolete object shape.
- **Correction:** Accept the exact active first segment in either historical
  object form or native array form. For the array form, require every trailing
  segment slot to be disabled.
- **Prevention:** Verify WLED storage formats against bytes produced by the
  selected persistence path, not only against mocked request-shaped fixtures.
- **Evidence:** Live preset 1 from `192.168.68.53` and focused object/array/
  additional-active-segment regressions.
- **Status:** Resolved; physical DDP reconnect passed.

### F-062 — Rewriting the boot preset on every effect save dropped Wi-Fi

- **Date:** 2026-08-26
- **Context:** FIRM-014 reopened-page and consecutive-effect review.
- **Symptom:** One effect reached the panels and persisted, then WLED returned
  to local playback and disappeared from the LAN. The same failure reproduced
  after one direct, otherwise valid asynchronous preset request.
- **Cause:** Every state save included `bootps:1`. Pinned WLED removes that field
  from the preset and sets `configNeedsWrite`, so every effect change also wrote
  the controller configuration file. This repeated configuration mutation was
  unnecessary because setup had already set `def.ps=1`.
- **Correction:** Configure boot preset 1 only through the setup config. Remove
  `bootps` from every later state-save payload, including imported state, while
  continuing to require `bootps=1` in device read-back.
- **Prevention:** Separate one-time device configuration from frequent effect
  state persistence. Never attach configuration mutations to a debounced live
  control save.
- **Evidence:** Pinned WLED `presets.cpp`, operator logs at 14:49, the exact
  direct request reproduction, and the request-body regression.
- **Status:** Resolved; physical consecutive effect saves passed.

### F-063 — DDP realtime freeze saved the previous native effect

- **Date:** 2026-08-26
- **Context:** FIRM-014 project reload after live, close-tab, and power-cycle
  behavior passed independently.
- **Symptom:** The new simulator frame appeared for about one second, then WLED
  returned to the earlier native effect. Preset 1 remained `Theater Rainbow`
  although the reopened simulator requested `Rainbow`.
- **Cause:** A prior DDP frame left WLED in realtime mode with `mso:true`, which
  freezes the main segment. The asynchronous state snapshot then captured the
  previous native segment instead of the requested simulator state. Project
  changes also did not wait for an already in-flight DDP request.
- **Correction:** Pause DDP while a preset save is active, drain an in-flight
  frame before save or reconnect, and force `live:false` in every save request
  before applying and snapshotting the native segment.
- **Prevention:** Never snapshot autonomous fallback state while its target
  segment is frozen by realtime transport.
- **Evidence:** Live state/preset comparison after the 14:50 and 14:56 failures,
  pinned WLED `json.cpp`/`udp.cpp`, and the forced-live request regression.
- **Status:** Resolved; physical reopen, mirror, and native fallback passed.

### F-064 — A panel pose edit stopped mirroring on an expected ledmap change

- **Date:** 2026-08-26
- **Context:** FIRM-014 physical live preview after free 6DOF panel edits.
- **Symptom:** Each completed pose edit stopped automatic reconnect with
  `The existing WLED ledmap does not match the loaded simulator.`
- **Cause:** Logical LED order is spatial, so a pose edit correctly produces a
  new ledmap. Reconnect treated every valid map difference as controller drift
  and had no bounded update path.
- **Correction:** After exact device identity, LED count, and bus-config checks,
  upload a valid changed ledmap, activate map 0 through the WLED state API, and
  verify both the active map and exact stored bytes before preset save and DDP.
- **Prevention:** Separate an expected spatial-map update from physical route,
  bus, identity, malformed-map, and transport failures. Mutate only after all
  stable controller contracts pass.
- **Evidence:** Operator log at 15:07 and the focused reconnect map-update,
  activation, exact-read-back, and malformed-map regressions.
- **Status:** Resolved; the operator accepted physical pose-edit mirroring and
  requested integration on 2026-08-27.

### F-065 — Hardware-free browser tests started ESP32 discovery

- **Date:** 2026-08-27
- **Context:** GitHub Actions Chromium smoke after FIRM-014/FIRM-015.
- **Symptom:** Browser journeys logged repeated HTTP 400 errors from
  `/api/esp32-device`, then failed their clean-console assertions and waited for
  reconnect work that no CI controller could satisfy.
- **Cause:** The editor probed `loo-ume.local` on every page load, even when the
  browser origin had never completed ESP32 setup and had no serial permission.
- **Correction:** Enable automatic reconnect only after a durable successful
  setup/link marker or existing permission for the approved CP2102 serial port.
- **Prevention:** Optional hardware discovery must be opt-in and must stay
  inactive in a clean, hardware-free browser profile.
- **Evidence:** GitHub Actions run `33049816046`, local Playwright reproduction,
  and the reconnect-eligibility unit and browser suites.
- **Status:** Resolved.

### F-066 — Hidden tutorial vertices produced invalid bounds

- **Date:** 2026-08-27
- **Context:** UI-020 viewport isolation.
- **Symptom:** Chromium logged `computeBoundingSphere` errors after non-chain
  vertices were masked with non-rendering coordinates.
- **Cause:** The renderer recomputed geometry bounds after applying the mask.
- **Correction:** Keep the valid full-geometry bounds while the temporary mask
  is active; use the selected panel poses to fit the tutorial camera.
- **Prevention:** Do not calculate bounds from temporarily masked position
  buffers. Restore authored positions without changing their saved geometry.
- **Evidence:** The assembly-tutorial Chromium journey completes with no page or
  console errors.
- **Status:** Resolved.

### F-067 — Back-view connector labels used front-side geometry

- **Date:** 2026-08-27
- **Context:** UI-020 physical assembly review.
- **Symptom:** DIN and DOUT labels said `back view`, but the marker and cable
  endpoints were offset along the outward panel normal and appeared in front
  of the PCB.
- **Cause:** `connectorPosition()` used the correct back-view X/Y corner
  convention but applied a positive surface-normal offset.
- **Correction:** Apply the connector surface offset opposite the outward
  normal. Use that shared wiring preview for both normal wiring layers and the
  interactive assembly steps.
- **Prevention:** A connector reference-view label must agree with its signed
  normal offset. Test both the local corner signs and the normal-side sign.
- **Evidence:** The 41-panel wiring contract test now requires both DIN and
  DOUT to have a negative local-normal component.
- **Status:** Resolved.

### F-068 — Wiring curves bowed outside the sculpture

- **Date:** 2026-08-27
- **Context:** UI-020 physical assembly review.
- **Symptom:** Cable endpoints were behind the PCBs, but the curved cable body
  bowed away from the sculpture and was most visible from the outside.
- **Cause:** The Bézier control point used the world origin and a radius larger
  than both endpoints.
- **Correction:** Derive the current sculpture center from panel poses. Put the
  control point 18 mm inside the smaller endpoint radius relative to that
  center.
- **Prevention:** Back-side wiring must test both the endpoint normal sign and
  the curve control-point radius.
- **Evidence:** The focused wiring test requires an 82 mm control radius for
  two 100 mm endpoint radii and an 18 mm inward offset.
- **Status:** Resolved.

### F-069 — Hiding inactive cables removed assembly context

- **Date:** 2026-08-27
- **Context:** UI-020 connection-by-connection soldering workflow.
- **Symptom:** A cable step hid every other cable, and one Previous/Next pair
  also crossed output boundaries. The operator could not see the remaining
  route or use the existing Output rows as the chain authority.
- **Cause:** Tutorial navigation combined chain and cable state, and cable
  focus was implemented as visibility instead of emphasis.
- **Correction:** Use the existing Output rows plus independent chain controls
  to isolate one panel chain. Keep that chain's cables visible, render the
  current connection bright red, mute its other wires, and let wire navigation
  select the owning chain when it crosses an output boundary.
- **Prevention:** Assembly focus must preserve route context. Chain selection
  and solder-connection selection are independent UI states.
- **Evidence:** Focused unit navigation tests and the Chromium tutorial journey
  verify output-row synchronization, bounded wire steps, active cable identity,
  muted cable count, and visibility restoration on exit.
- **Status:** Resolved.

### F-071 — Coplanar LED sprites fought with PCB surfaces

- **Date:** 2026-08-27
- **Context:** Browser panel rendering.
- **Symptom:** LEDs flickered against the PCB plane and remained visible from
  the rear because both surfaces used the same depth.
- **Cause:** Rendered LED positions used the exact mapped PCB-plane positions.
- **Correction:** Offset only the rendered LED sprites 2.4 mm along each
  panel's outward normal. Keep mapping positions and saved poses unchanged.
- **Prevention:** Use a small display-only normal offset for layered visual
  surfaces. Do not alter physical mapping coordinates to fix z-fighting.
- **Evidence:** Focused TypeScript and unit checks plus independent review.
- **Status:** Resolved.

### F-070 — The default browser project showed no panels

- **Date:** 2026-08-27
- **Context:** UI-020 physical assembly workflow.
- **Symptom:** The application loaded the empty pose-only authoring project, so
  the assembly view had no panel sculpture to inspect.
- **Cause:** The registry and browser loader still used the empty placement
  fixture as their default after the physical 41-panel workflow became primary.
- **Correction:** Make the populated 41-panel Schema 2 project the browser and
  registry default. Keep the empty placement fixture as an explicit menu item.
- **Prevention:** The default project must represent the current primary
  operator workflow. Tests pin the populated project source.
- **Evidence:** Registry and project-loader checks plus the focused browser
  tutorial journey.
- **Status:** Resolved.

### F-072 — Assembly isolation ignored the wiring layer switches

- **Date:** 2026-08-27
- **Context:** UI-021 assembly tutorial controls.
- **Symptom:** The DIN/DOUT and panel-wiring checkboxes changed state during
  chain isolation, but the corresponding scene layers stayed visible.
- **Cause:** Tutorial rendering forced both parent layers visible and treated
  the checkbox values only as state to restore after exit.
- **Correction:** Apply both switches immediately during isolation and update
  the tutorial's stored exit state at the same time.
- **Prevention:** Temporary view modes can constrain child content, but active
  global visibility controls must remain authoritative.
- **Evidence:** A focused browser regression toggles both layers during
  isolation and checks effective wire visibility.
- **Status:** Resolved.

### F-073 — Broad browser verification delayed every integration push

- **Date:** 2026-08-27
- **Context:** GitHub Actions run `33072431679` after the populated 41-panel
  project became the default.
- **Symptom:** The Chromium job failed after more than nine minutes. Three
  journeys used an unnecessarily heavy default project or five-second waits
  for real GLB and ZIP work.
- **Cause:** Every push ran the complete browser suite. Some tests also relied
  on an implicit default project and transient activity-log timing.
- **Correction:** Keep one fast push/pull-request type/build gate. Run the full
  browser, Vitest, Manifold, bootstrap, and clean-host suite nightly and on
  explicit manual dispatch.
  Give isolated journeys explicit fixtures and wait for the relevant domain
  state or a bounded operation-specific completion message.
- **Prevention:** Do not make a broad integration journey an automatic push
  gate unless its cost and failure scope are proportionate to normal changes.
- **Evidence:** Local reproduction found 10 passes and three scoped failures;
  the ESP32 and wiring-route focused journeys passed after the test fixes.
- **Status:** Resolved in CI policy; the full suite runs nightly and remains
  available manually.

### F-074 — An extreme camera clipping range caused depth fighting

- **Date:** 2026-08-27
- **Context:** Desktop 3D viewport with the controls beside the sculpture.
- **Symptom:** The desktop camera opened too close and nearby LED, PCB, and
  printable surfaces flickered against each other.
- **Cause:** The camera kept a fixed 0.01–1,000,000 clipping range. This spent
  most depth-buffer precision on empty space, independent of the sculpture and
  current zoom distance.
- **Correction:** Give the side-panel layout more initial framing margin and
  derive near/far clipping from the current camera distance and loaded bounds.
  Keep the mobile margin and unlimited orbit distance.
- **Prevention:** A viewport with unlimited zoom must update its clipping range;
  do not use an extreme fixed near/far ratio as a substitute for zoom freedom.
- **Evidence:** Focused camera-policy tests, TypeScript, and the production Vite
  build.
- **Status:** Resolved.

### F-075 — Concurrent staging removed files from a running LAN preview

- **Date:** 2026-08-27
- **Context:** A focused browser run staged public project files while the
  operator used `npm run lan` from the same checkout.
- **Symptom:** The running Vite server returned its HTML fallback for an
  existing panel-profile JSON URL, and project loading stopped.
- **Cause:** The staging script deleted complete public directories before it
  copied their replacements. Other repository processes could read during that
  gap.
- **Correction:** Keep live public directories in place. Copy each source file
  to a unique sibling and atomically rename it over the destination.
- **Prevention:** Shared-worktree staging must not remove a resource tree that
  another local server can be serving.
- **Evidence:** The authored and staged profile existed with identical sizes;
  the failure occurred while a second staging process ran.
- **Status:** Resolved.

### F-076 — Panel selection did not stop passive camera motion

- **Date:** 2026-08-27
- **Context:** Selecting a panel for pose, connector, or wiring inspection.
- **Symptom:** Slow auto-rotation continued after selection, so the selected
  panel moved while the operator tried to inspect or edit it.
- **Cause:** Selection focus and passive overview motion were independent view
  states.
- **Correction:** Every successful non-null panel selection stops renderer
  auto-rotation and clears the persistent View checkbox. Clearing selection
  does not restart rotation.
- **Prevention:** Direct manipulation or inspection selection must cancel
  passive camera motion without changing saved project data.
- **Evidence:** The focused wiring-route browser journey asserts both the
  checkbox and renderer state after route-row selection.
- **Status:** Resolved.

### F-077 — An initialized submodule blocked automatic worktree relocation

- **Date:** 2026-08-27
- **Context:** Delivery cleanup after moving active work back to the Documents
  repository.
- **Symptom:** `git worktree move` refused a worktree that contained an
  initialized WLED submodule.
- **Cause:** Git does not support moving that worktree shape safely.
- **Correction:** Preserve the worktree and its unique changes. Do not
  force-remove it or manually rewrite submodule Git paths during cleanup.
- **Prevention:** Move or finalize a temporary worktree before initializing a
  submodule. If that is no longer possible, commit and integrate its useful
  changes before any separate, explicit cleanup.
- **Evidence:** Git returned the initialized-submodule worktree-move refusal;
  the affected worktree was retained rather than damaged.
- **Status:** Mitigated; cleanup requires its owner after the work is integrated.

### F-078 — Address-only turns made physical connector views ambiguous

- **Date:** 2026-08-28
- **Context:** Automatic data-route planning and the connection-by-connection
  assembly tutorial.
- **Symptom:** Cable length could be optimized with an installed-address turn
  while the saved pose and tutorial continued to show DIN/DOUT at the old
  physical corners.
- **Cause:** Address calibration was used as a second mechanical orientation
  authority.
- **Correction:** Automatic wiring folds non-mirrored legacy turns into the
  authoritative pose, optimizes physical pose rotation, and writes an identity
  route-optimized address transform. Optimization and tutorial rendering share
  one back-view-to-pose connector function.
- **Prevention:** A transform that moves a physical connector belongs in the
  pose. Address calibration can reorder pixels but must not secretly move DIN
  or DOUT.
- **Evidence:** Exact three-panel optimizer comparison, connector-coordinate
  regression, Schema 2 reload, and mapping tests.
- **Status:** Resolved by WIRE-016.

### F-079 — A one-off width broke workflow action alignment

- **Date:** 2026-08-28
- **Context:** Adding the automatic wiring action to the numbered workflow.
- **Symptom:** **Optimize wiring** was first perceived as inconsistent, then a
  one-off 220 px override made it visibly shorter than **Fabrication settings**
  and the four fabrication actions.
- **Cause:** The first correction ignored the established workflow layout
  contract. Removing it then exposed a CSS cascade error: the later generic
  `.editor-button { width: 100%; }` had equal specificity and overrode
  `.workflow-step__primary`, making the inset button 42 px too wide.
- **Correction:** Put both the inset and remaining width on the existing shared
  direct-child layout rule:
  `.workflow-step > :not(.workflow-step__heading, .workflow-step__hint)`.
  Remove special width selectors from Optimize wiring, Set up ESP32, and Export.
- **Prevention:** Do not calibrate one workflow button by eye. Compare its
  computed width with the existing Fabrication settings and fabrication action
  controls, then reuse the shared direct-child workflow layout.
- **Evidence:** All direct workflow content now uses one layout rule. Nested
  buttons continue to fill their already-inset parent containers.
- **Status:** Resolved.

### F-080 — Documentation typography broke a MadMapper fixture identifier

- **Date:** 2026-08-28
- **Context:** MAD-010/MAD-011 SVG import in MadMapper Demo 6.1.5.
- **Symptom:** Import rejected every fixture as an unknown definition.
- **Cause:** The exporter copied a typographic en dash into an external library
  identifier that requires the exact ASCII `Generic - Pixel RGB` spelling.
- **Correction:** Emit the byte-exact identifier and reject the typographic form
  in focused tests.
- **Prevention:** Treat external library names as exact data, not prose.
- **Evidence:** Operator import result and the MadMapper exporter regression.
- **Status:** Resolved in the exporter; awaiting package retest.

### F-081 — Matrix polygons did not preserve per-panel pixel orientation

- **Date:** 2026-08-28
- **Context:** MAD-010 SVG import in MadMapper Demo 6.1.5.
- **Symptom:** All imported 8 x 8 matrices had the same internal alignment,
  although the sculpture's middle panels have different pose rotations.
- **Cause:** MadMapper does not derive matrix assignation from SVG polygon
  corner order, and its documented SVG contract has no per-instance matrix
  assignation or rotation field.
- **Correction:** Export one independently addressed RGB fixture for every
  physical LED. Derive its footprint from the pose and address it in physical
  wire order.
- **Prevention:** Do not use grouped matrix fixtures when instances require
  different scan directions unless the import format supports that explicitly.
- **Evidence:** Operator import result and focused horizontal, +31.6 degree, and
  -31.6 degree panel-row regressions.
- **Status:** Resolved in the exporter; awaiting package performance review.

### F-082 — Label-sheet geometry must come from the manufacturer template

- **Date:** 2026-08-28
- **Context:** Printing physical panel IDs on HERMA 4385 round labels.
- **Symptom:** Diameter, A4 size, and labels per sheet do not uniquely define
  printer-safe label centers. A centered estimate can miss all 315 die cuts.
- **Cause:** Product summaries omit pitch gaps and safety margins.
- **Correction:** Use the official HERMA 4385 punch template: 15 x 21 labels,
  10 mm diameter, 2.7 mm horizontal and vertical gaps, 11.1 mm side margins,
  and 16.5 mm top and bottom margins. Generate a 100%-scale A4 PDF without
  printed guide circles.
- **Prevention:** Never derive a physical label sheet from count and diameter.
  Pin the manufacturer article and punch geometry, and tell the operator to
  disable page fitting.
- **Evidence:** HERMA article 4385 product page and official `4385_SV.pdf`.
- **Status:** Resolved by LABEL-010.

### F-083 — A 64-pixel setup gate blocked generalized fixtures

- **Date:** 2026-08-28
- **Context:** Backward-compatible explicit emitter geometry for 1×N strips and
  rings.
- **Symptom:** Mapping and wiring accepted a 1×12 fixture, but ESP32 setup
  rejected its output lengths because they were not divisible by 64.
- **Cause:** The device boundary inferred fixture completeness and current from
  the one historical 8×8 panel size.
- **Correction:** Carry `pixelsPerFixture` from the loaded profile grid into the
  setup validator and scale the existing provisional current limit per LED.
  Keep unlimited-current 41-panel authority restricted to the exact legacy
  64-pixel, 2,624-LED, four-output contract.
- **Prevention:** When a source profile owns a dimension, pass that dimension
  through runtime boundaries. Do not rediscover it from a flagship constant.
- **Evidence:** The 1×12 circular mapping reaches exact 492-LED WLED buses; a
  non-legacy 2,624-LED regression retains finite current limits; legacy setup
  tests remain byte-equivalent.
- **Status:** Resolved by FIXTURE-010.

### F-084 — Rectangular display assumptions leaked into fixture capabilities

- **Date:** 2026-08-29
- **Context:** Arbitrary planar carriers and flexible 1×N strip/ring profiles.
- **Symptom:** Explicit emitter positions could map and reach WLED, but the
  viewer still drew a rectangular PCB and rectangular placement/fabrication
  actions appeared available.
- **Cause:** Carrier display geometry and tool capability were inferred from
  `dimensions` instead of represented as an optional profile contract.
- **Correction:** Add validated rectangular, planar-outline, and flexible-path
  carrier kinds. Render the latter two directly, disable incompatible browser
  actions, and repeat the rigid-rectangle gate at CAD entry points.
- **Prevention:** Keep address geometry, display carrier geometry, and
  fabrication support as separate contracts. A new carrier must not inherit a
  tool capability merely because it has a bounding width and height.
- **Evidence:** Focused outline/ribbon geometry, parser, capability, CAD-gate,
  mapping, WLED, and legacy-profile tests.
- **Status:** Resolved by FIXTURE-011.

### F-085 — Numbered presentation implied false workflow dependencies

- **Date:** 2026-08-29
- **Context:** Generalized fixtures that can map, simulate, and configure WLED
  without a placement surface or supported printable-part generator.
- **Symptom:** The sidebar presented every project as a six-step fabrication
  sequence, so valid strip and ring work appeared to depend on irrelevant GLB
  placement and planar fabrication stages.
- **Cause:** Visual numbering described one historical panel workflow instead
  of the loaded profile's actual capabilities.
- **Correction:** Replace numbered steps with always-editable Shape, Fixtures,
  Mapping, Fabrication, Build Hardware, and Export toolboxes. Keep control IDs
  and handlers stable, and use capability gates for unavailable actions.
- **Prevention:** Use section order only for navigation. Never use presentation
  order as a readiness authority; derive readiness from project contracts and
  explicit capabilities.
- **Evidence:** Focused toolbox ownership, overflow, and capability checks.
- **Status:** Resolved by UI-026.

### F-086 — Explicit emitter coordinates do not remove the back-view address reflection

- **Date:** 2026-08-29
- **Context:** Creating the tracked 1×188 flexible LED-ring profile.
- **Symptom:** The first hardware-contract check rejected a corner/direction
  combination, and the next attempt assigned physical address 0 to the DOUT-side
  emitter instead of the explicit DIN-side emitter.
- **Cause:** `localEmitterPositions` uses the outward pose frame, while pixel
  order and installed address transforms remain PCB back-view contracts. The
  hardware compiler must still reflect X exactly once.
- **Correction:** Keep the explicit emitter list in outward row-major order and
  declare the compatible back-view start corner and first-line direction. Prove
  physical address 0 at DIN after the complete hardware mapping compiler, not
  only in the geometry mapping.
- **Prevention:** For every non-rectangular fixture, test an exact DIN emitter,
  DOUT emitter, complete physical permutation, and WLED bus through the final
  hardware contract.
- **Evidence:** `tests/one-metre-ring-demo.test.ts`.
- **Status:** Resolved by FIXTURE-012.

### F-087 — Ring size and strip-facing direction must be explicit

- **Date:** 2026-08-29
- **Context:** First visual review of the flexible LED-ring demo.
- **Symptom:** “One-metre ring” was modeled as a 1,000 mm strip circumference
  with 60 LEDs lying on the hoop face. The intended object was a 1,000 mm
  diameter hoop with the strip LEDs facing radially outward.
- **Cause:** The fixture encoded a path but did not state whether one metre was
  diameter or circumference, and the default flexible-path cross-section used
  the path plane instead of an authored radial frame.
- **Correction:** State the 1,000 mm diameter and approximately 60 LEDs/m
  density explicitly, use 188 emitters, and add a backward-compatible
  `radial-outward` frame whose thickness axis points away from the declared
  center.
- **Prevention:** Every ring fixture must record diameter or circumference,
  emitter density/count, DIN direction, and which carrier surface emits light.
- **Evidence:** The corrected FIXTURE-012 profile, radial-frame geometry test,
  and operator visual review URL.
- **Status:** Resolved by FIXTURE-012.

### F-088 — Fabrication handoff controls must remain in one operator context

- **Date:** 2026-08-29
- **Context:** Organizing printable generation, physical labels, wiring review,
  and ESP32 testing in the browser sidebar.
- **Symptom:** A separate Build Hardware toolbox split one continuous physical
  workflow across two sections and left connector files and panel labels as
  unrelated downloads.
- **Cause:** UI ownership followed implementation subsystems instead of the
  operator's generate, download, assemble, and test sequence.
- **Correction:** Keep one always-editable Fabrication toolbox with four named
  groups. Its fabrication ZIP always includes the HERMA label PDF and adds the
  exact verified connector artifacts displayed in the viewport.
- **Prevention:** When controls form one physical handoff, group them by the
  operator sequence without adding wizard state or duplicating data authority.
- **Status:** Resolved by UI-027.

### F-089 — Playwright reused another worktree's Vite server

- **Date:** 2026-08-29
- **Context:** LIB-011 Project Library browser validation on the shared host.
- **Symptom:** The focused test waited for a new control while its failure
  screenshot showed the older preset UI from a different checkout.
- **Cause:** Local Playwright configuration permits `reuseExistingServer`, and
  another Vite process already owned port 4174.
- **Correction:** Stop the stale server and rerun with `CI=1`, which requires
  Playwright to start the configured server from the current worktree.
- **Prevention:** Before a shared-host browser check, confirm the port owner or
  disable server reuse. Do not accept a browser result from an unknown process.
- **Evidence:** The reused-server run timed out on `#open-project-library`; the
  fresh-server rerun passed the complete API-backed Chromium journey.
- **Status:** Resolved; prevention rule added to `AGENTS.md`.

### F-090 — New browser module was absent from the Node TypeScript project

- **Date:** 2026-08-29
- **Context:** LIB-012 Project Library mutation client extraction.
- **Symptom:** Focused Vitest checks passed, but `npm run build:desktop` failed
  with TS6307 for `web/src/ProjectLibraryClient.ts`.
- **Cause:** `tsconfig.node.json` lists each Node-tested browser module
  explicitly, and the new module was not in that list.
- **Correction:** Add the module to the explicit include list and rerun the
  complete desktop build.
- **Prevention:** Update `tsconfig.node.json` with every new `web/src/` module
  imported by Node-side tests or scripts.
- **Evidence:** The first build failed at TypeScript; the corrected desktop
  TypeScript and Vite build passed.
- **Status:** Resolved; prevention rule added to `AGENTS.md`.

### F-091 — LAN preview rejected its own Project Library request

- **Date:** 2026-08-29
- **Context:** Operator-approved LIB-012 LAN review.
- **Symptom:** Vite served the page on the LAN, but `/api/project-library`
  returned HTTP 403 when the request used the LAN address as its Host.
- **Cause:** The shared handler was loopback-only and the LAN launcher did not
  provide an explicit reviewed exception.
- **Correction:** `npm run lan` now sets a narrow Project Library LAN-mode flag;
  the Vite adapter passes it to the shared handler. Normal Vite and desktop
  startup remain loopback-only.
- **Prevention:** Verify the important API endpoints with the printed LAN Host
  before giving an operator a LAN review URL.
- **Evidence:** The first Host-specific probe returned 403. The corrected
  handler test and LAN Host probe return 200.
- **Status:** Resolved by the LIB-012 LAN review correction.

### F-092 — Whole-scene thumbnail bounds made the sculpture too small

- **Date:** 2026-08-29
- **Context:** LIB-014 framed viewport thumbnails.
- **Symptom:** The first real 41-panel PNG showed a small sculpture surrounded
  by excessive empty space.
- **Cause:** Thumbnail framing included wiring/controller and interaction
  helper bounds that the main viewport does not use for its camera fit.
- **Correction:** Use the renderer's authoritative LED mapping sphere, with the
  authoring-surface bounds only as the mechanics-free fallback. Render the
  visible scene, but do not let helper geometry control the camera.
- **Prevention:** A viewport-derived preview must use the same framing authority
  as the viewport. Inspect one dense and one empty project before publication.
- **Evidence:** The corrected 41-panel render fills the 480 x 300 card, while
  the empty project frames its complete authoring surface.
- **Status:** Resolved by LIB-014.
### F-093 — Dependency symlink was removed while Vite was still running

- **Date:** 2026-08-29
- **Context:** LIB-014 LAN visual review from a sibling worktree that shares the
  main worktree's installed dependencies through a temporary symlink.
- **Symptom:** Vite showed an import-analysis overlay because it could not
  resolve `manifold-3d` from `src/cad/ManifoldRuntime.ts`.
- **Cause:** The task-local `node_modules` symlink was removed after server
  startup. Vite still resolves lazy imports while it serves requests.
- **Correction:** Restore the exact dependency symlink and keep it until the
  review server stops.
- **Prevention:** Treat a shared dependency link as a live server dependency,
  not startup-only setup. Remove it only after stopping Vite.
- **Evidence:** The failing overlay named `manifold-3d`; after restoration, the
  exact `/@fs/.../ManifoldRuntime.ts` request returned transformed JavaScript
  with the dependency resolved.
- **Status:** Resolved for the active LAN review; cleanup is deferred until the
  server stops.

### F-094 — Project-package export changed beyond the focused ZIP assertions

- **Date:** 2026-08-29
- **Context:** LIB-015 ran the broader portable-project browser journey after
  LIB-014 added package manifests and rendered thumbnails to normal downloads.
- **Symptom:** The browser correctly exported `manifest.json` and
  `thumbnail.png`, but the older exact-file assertion rejected both entries.
- **Cause:** LIB-014 verified package units and the Project Library journey but
  did not run the separate portable folder/ZIP browser journey that asserts the
  complete downloaded file set.
- **Correction:** Update only the normal project-package expectation; keep the
  assembly-package expectation unchanged. Rerun the complete portable journey.
- **Prevention:** When the normal project ZIP wrapper changes, run both package
  unit tests and `tests/browser/portable-project.spec.ts`. Do not infer the
  assembly-package contents from the project-package contract.
- **Evidence:** The corrected portable folder and ZIP journey passed in
  Chromium with exact assets, manifest, and PNG thumbnail.
- **Status:** Resolved during LIB-015.

### F-095 — The sculpture registry count did not follow the ring demo

- **Date:** 2026-08-29
- **Context:** Selective Project Library integration onto the current `main`.
- **Symptom:** The full verifier found 14 authored sculptures, while the exact
  registry-count assertion still expected 13.
- **Cause:** The flexible-ring demo changed the registry without changing its
  matching count assertion.
- **Correction:** Update the assertion to the 14-entry authored registry and
  generate one library ZIP and thumbnail for every current registry entry.
- **Prevention:** A tracked demo addition must update both the authored registry
  check and the generated Project Library in the same verified integration.
- **Evidence:** The registry and Project Library tests both cover all 14 demos.
- **Status:** Resolved during Project Library integration.

### F-096 — Fabrication package was absent from the Node TypeScript project

- **Date:** 2026-08-29
- **Context:** Full verification after selective Project Library integration.
- **Symptom:** All 462 unit tests passed, then `tsc -b` rejected
  `web/src/FabricationPackage.ts` because the Node project did not list it.
- **Cause:** The current-main fabrication change added a tested browser module
  but did not extend the explicit `tsconfig.node.json` include list.
- **Correction:** Add only `web/src/FabricationPackage.ts` to that list.
- **Prevention:** Add each new browser module imported by Node-side tests to the
  explicit Node TypeScript project in the same change.
- **Evidence:** The subsequent Node and browser TypeScript builds pass.
- **Status:** Resolved during Project Library integration.

### F-097 — MadMapper and the local preview competed for one Art-Net socket

- **Date:** 2026-08-29
- **Context:** LIVE-013 same-computer MadMapper preview on macOS.
- **Symptom:** MadMapper reported that it could not open Art-Net on the selected
  network interface when the LOO/UME preview already listened on UDP 6454.
- **Cause:** Both applications tried to bind `127.0.0.1:6454`.
- **Correction:** Keep both applications on `127.0.0.1:6454` and enable UDP
  address reuse in the receiver. MadMapper uses the corresponding shared-port
  socket options.
- **Prevention:** Same-computer UDP tools that use a fixed protocol port must
  prove compatible shared-socket behavior with a packet sent by the first
  bound socket. A second bind alone does not prove delivery.
- **Evidence:** A focused handler test opens a MadMapper-shaped reusable socket,
  starts LOO/UME on the same address and port, and receives the packet that the
  first socket sends. The pinned Node 22.23.2 runtime passed the same macOS
  socket test.
- **Status:** Resolved and confirmed in macOS Human Review.

### F-098 — Case-only documentation paths collided on macOS

- **Date:** 2026-08-29
- **Context:** Fresh macOS clone of `codex/madmapper-preview`.
- **Symptom:** Git warned that `docs/ARCHITECTURE.md` and
  `docs/architecture.md` collided, so only one file could exist in the working
  tree.
- **Cause:** The obsolete lowercase file remained as a three-line redirect
  after the uppercase architecture document became canonical.
- **Correction:** Remove `docs/architecture.md`. Keep the complete
  `docs/ARCHITECTURE.md` document and its existing references.
- **Prevention:** Do not retain aliases that differ from a canonical path only
  by letter case. Case-insensitive filesystems cannot represent both paths.
- **Evidence:** The Git tree has one case-insensitive match for the architecture
  document, and all repository references use the uppercase path.
- **Status:** Resolved on the MadMapper preview branch.

### F-099 — A secondary macOS loopback address required a terminal setup step

- **Date:** 2026-08-29
- **Context:** LIVE-011 through LIVE-013 local MadMapper preview on macOS.
- **Symptom:** Starting the preview returned HTTP 409 with
  `bind EADDRNOTAVAIL 127.0.0.2:6454`, although UDP port 6454 was free.
- **Cause:** The clean macOS `lo0` interface had only `127.0.0.1`. The preview
  assumed that any address in `127.0.0.0/8` was immediately bindable, but macOS
  requires the selected secondary address to be assigned to `lo0` first.
- **Correction:** Bind the preview to the existing `127.0.0.1:6454` address and
  share the fixed Art-Net port through address reuse. The operator now configures
  MadMapper and presses Start without changing macOS network settings.
- **Prevention:** A normal operator workflow must not require an undocumented
  interface alias or administrator command. Test same-computer transport from a
  clean macOS `lo0` state and use shared-port behavior when both applications
  support it.
- **Evidence:** `/sbin/ifconfig lo0` listed only `127.0.0.1`; `lsof -nP
  -iUDP:6454` found no owner; the browser and host reported the exact failed
  bind at `127.0.0.2:6454`.
- **Status:** Resolved and confirmed with all 16 universes on macOS.

### F-100 — The MadMapper ZIP required 16 manual unicast routes

- **Date:** 2026-08-29
- **Context:** LIVE-013 local MadMapper preview Human Review.
- **Symptom:** One manually entered Art-Net route produced no preview, and the
  operator would have to add universes 1 through 16 one row at a time.
- **Cause:** The complete-frame receiver correctly waits for every exported
  universe, but the MadMapper package did not contain the deterministic unicast
  routing configuration needed to send all of them.
- **Correction:** Generate `artnet-unicast-loopback.csv` with one active,
  non-remapped `127.0.0.1` row for every exported universe, add it to the ZIP,
  and reference its Import action in `SETUP.pdf`.
- **Prevention:** When an external application supports configuration import,
  package repeated deterministic settings instead of requiring manual entry.
- **Evidence:** The focused package test checks the MadMapper CSV header and all
  16 consecutive loopback routes.
- **Status:** Resolved; the operator imported and used the generated table.

### F-101 — Symmetric LED float ordering changed the golden mapping on macOS

- **Date:** 2026-08-29
- **Context:** Focused MadMapper package verification on pinned Node 22.23.2 for
  macOS.
- **Symptom:** The current authored project generated mapping fingerprint
  `ce395bed`, while tests and checked mapping artifacts require `73b36d49`.
- **Cause:** Logical LED indices sort on exact computed `v` and `u` floats.
  Symmetric positions differed from the checked artifact by approximately
  `1e-16`, which reordered 29 tied logical positions.
- **Correction:** Use one documented cross-platform deterministic position key,
  then deliberately regenerate and review every mapping-dependent artifact.
  Do not update one expected fingerprint in isolation.
- **Prevention:** Never use unquantized derived floating-point values as an
  address-authority sort key when builds must be byte-identical across systems.
- **Evidence:** Direct comparison found 29 ledmap differences in tied symmetric
  positions; the existing package, exporter, assembly-manual, and golden
  mapping tests fail on the same `ce395bed` versus `73b36d49` mismatch.
- **Status:** Open as `MAP-021`; not changed during LIVE-013 review.

### F-102 — The preview rejected MadMapper's padded ArtDMX universes

- **Date:** 2026-08-29
- **Context:** LIVE-013 local MadMapper preview Human Review with MadMapper Demo
  6.1.5.
- **Symptom:** MadMapper sent universes 1 through 16, but LOO/UME counted every
  packet as rejected and completed no preview frame.
- **Cause:** MadMapper sends a standard 512-channel payload for each ArtDMX
  universe. The assembler required the payload to equal only the used RGB byte
  count: 510 bytes for full 170-pixel universes and fewer for the final partial
  universe.
- **Correction:** Accept an ArtDMX payload when it contains at least the needed
  bytes, then copy only the needed RGB prefix and ignore trailing DMX padding.
- **Prevention:** Protocol receivers must accept valid unused channel padding.
  Test with the exact full-universe packet size emitted by the target sender,
  not only minimal synthetic packets.
- **Evidence:** A loopback header capture received valid ArtDMX protocol 14
  packets for universes 1 through 16 with 512-byte payloads. The live status
  showed 39,564 received and 39,564 rejected packets before the capture.
- **Status:** Resolved and confirmed with live MadMapper output.

### F-103 — MadMapper Demo blackout looked like a preview transport failure

- **Date:** 2026-08-29
- **Context:** LIVE-013 sustained local preview with MadMapper Demo 6.1.5.
- **Symptom:** The working 3D preview suddenly appeared to stop or black out.
- **Cause:** MadMapper Demo deliberately blacks out DMX lighting output every
  30 seconds.
- **Correction:** Use live LOO/UME frame statistics to distinguish a demo
  blackout from transport loss. Use a licensed MadMapper build for sustained
  continuity and FPS acceptance.
- **Prevention:** Do not use MadMapper Demo as evidence for uninterrupted DMX
  output. Record address and pose observations separately from sustained-output
  observations.
- **Evidence:** While the visible output appeared stopped, completed frames
  increased from 1,713 to 1,815 with no incomplete frames. The official
  MadMapper Demo limitations state that DMX output blacks out every 30 seconds.
- **Status:** External demo limitation understood; transport remains healthy.

### F-104 — MadMapper browser ZIP assertion omitted the new routing table

- **Date:** 2026-08-29
- **Context:** Selective MadMapper preview integration onto the Project Library
  `main`.
- **Symptom:** The browser downloaded the correct enhanced ZIP, but the older
  exact-file assertion rejected `artnet-unicast-loopback.csv`.
- **Cause:** The stabilization commit updated the unit package contract but the
  browser download contract existed only on the newer main branch.
- **Correction:** Add the routing CSV to the browser ZIP expectation and rerun
  the complete browser download journey.
- **Prevention:** When a package gains a file, update every exact package
  contract across unit and browser tests during integration.
- **Evidence:** Unit and browser MadMapper ZIP checks both require the routing
  table after the correction.
- **Status:** Resolved during MadMapper preview integration.
### F-105 — Photographs are not dimensional or fabrication evidence

- **Date:** 2026-08-29
- **Context:** Creating a Schema 2 fixture from two photographs of a wedge LED
  PCB without a ruler, drawing, part number, or measured sample.
- **Symptom:** The legacy profile contract required measured physical
  corrections and a three-hole orientation even though neither fact existed
  for the photographed board.
- **Cause:** One proven rectangular PCB's evidence rules were treated as if
  they described every future carrier.
- **Correction:** Keep the approved PCB facts unchanged, permit explicitly
  provisional correction evidence, and add a pose-local explicit connector
  convention for non-legacy carriers. Mark every inferred wedge-panel value as
  provisional, require measured corrections at every fabrication entry point,
  and use a planar carrier so incompatible placement and fabrication tools stay
  disabled.
- **Prevention:** A photo-derived fixture must state which values are inferred.
  Do not claim measurements, screw fit, keep-outs, address order, RGB order, or
  fabrication readiness until direct evidence exists. Prove mapping, WLED, and
  portable reload separately from physical fit.
- **Evidence:** `sculptures/photo-wedge-panel/` and
  `tests/photo-wedge-panel-demo.test.ts`.
- **Status:** Resolved by FIXTURE-013.

### F-106 — A reference rendering does not establish installed panel poses

- **Date:** 2026-08-29
- **Context:** Reconstructing a complete repeated-panel sculpture from one
  perspective rendering.
- **Symptom:** The image shows the intended 30-face visual form but does not
  provide exact centers, rotations, radius, seams, or scale.
- **Cause:** A perspective view is useful visual evidence but is not a measured
  pose or mechanical assembly contract.
- **Correction:** Use a deterministic 30-direction rhombic-triacontahedron
  study at an explicitly estimated 270 mm center radius. Keep every pose and
  the shared panel profile provisional, then prove only load, mapping, routing,
  WLED configuration, portable reload, and Project Browser availability.
- **Prevention:** Do not extract manufacturing poses from one rendering. A
  photo reconstruction must identify its mathematical approximation and keep
  placement and fabrication evidence provisional until drawings or direct
  measurements replace it.
- **Evidence:** `sculptures/photo-wedge-panel/sculpture-30-panel.json` and the
  30-panel regression in `tests/photo-wedge-panel-demo.test.ts`.
- **Status:** Resolved by FIXTURE-014.
