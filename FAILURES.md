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
- **Context:** Native macOS OpenSCAD qualification and setup preflight.
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
- **Context:** Managed OpenSCAD setup and active-render shutdown on Windows.
- **Symptom:** PowerShell policy can block `npm.ps1`, and a clean verification
  that clears `PATH` cannot find a bare `taskkill` command.
- **Cause:** The first command paths depended on user shell policy and ambient
  host wiring that the clean-host proof intentionally removed.
- **Correction:** Invoke `npm.cmd`. Resolve and validate the absolute
  `%SystemRoot%\System32\taskkill.exe` path, and use argument arrays without a
  shell.
- **Prevention:** Windows setup and verification must use native command entry
  points and validated absolute system-tool paths when `PATH` is not authority.
- **Evidence:** `AGENTS.md` and `scripts/verify-windows-openscad-shutdown.ts`.
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

### F-016 — Full verification requires the pinned Emscripten SDK

- **Date:** 2026-08-21
- **Context:** `HW-017` and `MAP-022` closeout.
- **Symptom:** `npm run verify` completed asset generation, then stopped at
  `build:wasm` because Emscripten 4.0.14 was not installed.
- **Cause:** The checkout has the tracked WASM runtime for ordinary tests, but
  full verification also rebuilds it and therefore needs the pinned SDK.
- **Correction:** Use `npm run setup:emsdk` before `npm run verify`, or use
  `npm run verify:clean` for the complete clean-checkout path. Run the remaining
  focused checks against the tracked WASM when SDK installation is out of scope.
- **Prevention:** Check both the WLED submodule and Emscripten prerequisite
  before starting full verification.
- **Evidence:** The `HW-017`/`MAP-022` verification log and `AGENTS.md`.
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
- **Context:** CAD-036 removed obsolete generic OpenSCAD tests from the Grok
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
- **Correction:** Use one Open project menu, ZIP-first Save, one Build/Download
  assembly action, one Edit/Save route action, and one complete assembly ZIP.
  Keep raw and individual files in compact secondary menus.
- **Prevention:** When several files describe one physical build, export them
  from one current in-memory contract and test exact package contents plus
  reopen. Prefer stateful actions over separate prerequisite/result buttons.
- **Evidence:** `tests/assembly-package.test.ts` and the Playwright generation,
  portable-project, and wiring-route journeys.
- **Status:** Resolved.
