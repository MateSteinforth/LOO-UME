# Failure-learning log

This file records reusable lessons from work that went wrong or nearly went
wrong. Its purpose is to change future agent behavior, not to preserve every
error message. Read it during task startup and update it in the same change that
reveals a durable lesson.

## How to use this log

### F-159 — A package build did not prove Mac launch readiness

- **Date:** 2026-09-05
- **Symptom:** macOS rejected review 25 as damaged.
- **Cause:** The workflow disabled signing and checked only package inventory and firmware integrity.
- **Correction:** Apply an explicit ad-hoc signature with review entitlements. Verify the signature and launch the application extracted from the DMG.
- **Prevention:** Require both checks before publication. Distinguish launch checks from Apple notarization and download approval.
- **Evidence:** Run `33952253932` reported that signing was skipped. DEV-025 adds the missing checks.
- **Status:** Run `33952586743` passed signature verification and launched the editor extracted from the DMG on Apple Silicon.

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

### F-163 — Scheduled regression did not match deferred work

- **Date:** 2026-09-05
- **Symptom:** Daily clean-checkout emails reported failure after setup succeeded.
- **Cause:** The job ran the complete suite, including explicitly deferred P2 geometry failures. Broad browser regression had similar failures.
- **Correction:** CI-027 separates focused daily checks from optional full regression. No test failure becomes a successful result.
- **Prevention:** Keep the CI scope and task deferrals consistent. Run full regression explicitly when repairing the deferred defects.
- **Evidence:** Scheduled run `33951147725`; managed-runtime setup and 510 fast and host tests passed locally.
- **Related correction:** Manual branch runs must use `origin/main` as their fallback comparison ref. Checkout does not create a local `main` branch.

### F-162 — A dependency link blocked Vite WASM requests

- **Date:** 2026-09-05
- **Symptom:** Browser generation failed because Vite rejected a WASM path outside the integration worktree.
- **Cause:** `node_modules` linked to another worktree. Module resolution used that worktree's absolute paths.
- **Correction:** Remove only the dependency link. Run `npm ci` inside the active worktree before browser checks.
- **Prevention:** Do not share `node_modules` through a link for Vite browser checks.
- **Evidence:** INT-026 browser output identified the external `manifold.wasm` path.

### F-156 — Test expectations depended on changed fixture details

- **Date:** 2026-09-05
- **Context:** DEV-020 development-check review.
- **Symptom:** Tests failed on signed zero, old firmware hashes, and optimizer
  fixtures that no longer needed a resize.
- **Cause:** Assertions repeated mutable receipt values or depended on incidental
  numeric and fixture details.
- **Correction:** Compare coordinates with a tolerance. Bind deployment hashes
  to the receipt. Use a load that requires resizing. Verify tie selection with
  an exhaustive cost comparison. The focused tests pass.
- **Prevention:** Keep integrity checks at the artifact authority. Other tests
  must assert contract relationships and exercise their stated conditions.
- **Evidence:** `tests/wled-deployment.test.ts`, `tests/truss-optimizer.test.ts`,
  and `tests/installed-address-transform-optimizer.test.ts`.
- **Status:** Resolved.

### F-157 — A nested npm test alias discarded Vitest arguments

- **Date:** 2026-09-05
- **Context:** DEV-020 test selection and report collection.
- **Symptom:** Reporter arguments became npm configuration warnings and never
  reached Vitest.
- **Cause:** The `test` script invoked another npm script without forwarding arguments.
- **Correction:** Invoke Vitest directly from `test`. Keep separate test-group commands.
- **Prevention:** Verify argument forwarding with an actual selected-file or reporter run.
- **Evidence:** `package.json` and the DEV-020 JSON test report.
- **Status:** Resolved.

### F-158 — A fabrication package contains preview and printable STLs

- **Date:** 2026-09-05
- **Context:** DEV-020 structural worker browser verification.
- **Symptom:** A one-part package test counted two STL files.
- **Cause:** The assertion counted the assembly preview as a printable part.
- **Correction:** Count printable files under `structure/parts/`. Check the
  assembly preview separately. The structural browser check passes.
- **Prevention:** Use artifact roles or their defined paths when counting parts.
- **Evidence:** `tests/browser/generate-parts.spec.ts`.
- **Status:** Resolved.

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
- **Evidence:** The removed retry implementation and strict final-solid tests
  define the known limitation.
- **Status:** Deferred. It is not an active task unless the 30-panel automatic
  connector path is required.

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
- **Status:** Resolved by FIRM-015.

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
- **Status:** Resolved for the three-panel physical project. The operator
  retired the complete 41-panel observation plan on 2026-09-03.

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

### F-082 — Label stock geometry and printer registration are separate

- **Date:** 2026-08-28
- **Context:** Printing physical panel IDs on HERMA 4385 round labels.
- **Symptom:** The first physical print put the text approximately 4 mm to the
  right of the sticker centres, although the PDF declared 100% A4 output.
- **Cause:** LABEL-010 treated the template geometry as the complete print
  contract. It did not distinguish physical stock dimensions from printer
  registration.
- **Correction:** Record the measured 12 mm left, 11 mm right, and 15 mm
  top/bottom stock margins. Fit the 14 horizontal gaps across the 15 labels to
  exactly 37/14 mm each. An attempted −4 mm printer correction was removed;
  the remaining asymmetry describes the measured stock. Keep the PDF at 100%
  scale and omit guide circles.
- **Prevention:** Never bake a printer displacement into label-stock document
  geometry. A measured stock asymmetry is valid, but an arbitrary printer
  offset is not. Printer registration belongs in the printer workflow. Disable
  page fitting and require a physical reprint when stock geometry changes.
- **Evidence:** HERMA article 4385, its punch template, and the operator's
  2026-08-30 physical print measurement.
- **Status:** Resolved in LABEL-011; the operator confirmed the corrected
  physical print on 2026-08-30.

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
  groups. Its fabrication ZIP is the complete current manufacturing handoff;
  F-110 defines its verified geometry, label, and manual contents.
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

### F-107 — A local build directory is not sufficient launch-freshness evidence

- **Date:** 2026-08-29
- **Context:** Adding one-command local launch and update behavior.
- **Symptom:** Reusing any existing `dist/` directory can start code from an
  older checkout, while rebuilding on every launch makes a normal restart
  unnecessarily slow.
- **Cause:** Generated output existence does not bind that output to the clean
  source revision that created it.
- **Correction:** Record the target tuple and clean Git commit only after locked dependency
  installation, desktop build, and production Manifold proof all pass. Reuse
  the build only when the checkout is still clean, HEAD matches the receipt,
  and required dependency and output files exist. Rebuild modified checkouts
  without recording reusable evidence.
- **Prevention:** A launcher can skip a build only with source-bound freshness
  evidence. Do not infer freshness from `dist/` timestamps or existence alone.
- **Evidence:** `bootstrap.sh` `install_and_build_if_required()` and the
  INSTALL-014 bootstrap regression.
- **Status:** Resolved by INSTALL-014.

### F-108 — Numeric XYZ fields hid the controller's scene-object behavior

- **Date:** 2026-08-29
- **Context:** Editing the schematic controller after panel placement.
- **Symptom:** The operator had to copy long suggested XYZ values into a form,
  while panels could be selected and transformed directly in the 3D view.
- **Cause:** The controller was rendered as a mesh but was not registered as an
  editor pick target. Its saved contract also had no orientation.
- **Correction:** Make the controller body and label selectable, attach the
  existing translation and rotation controls, and save a right-handed pose.
  Transform local pin offsets with the same pose before cables are built. Bind
  optimizer evidence to the pose and invalidate it when the controller moves.
- **Prevention:** A persistent object that is visibly placed in the editor must
  use direct scene selection when its transform is editable. A rotated visual
  must not leave its functional connection points or optimization evidence in
  the old frame. Scene picking must use effective ancestor visibility and the
  nearest hit, not object-type priority.
- **Evidence:** UI-029 controller-pose runtime, wiring, renderer, portable
  reload, and focused browser regressions.
- **Status:** Resolved by UI-029.

### F-109 — Requiring a clean checkout blocked normal application updates

- **Date:** 2026-08-29
- **Context:** Updating a local LOO/UME installation that also contains saved
  project files or deliberate local edits.
- **Symptom:** `./bootstrap.sh update` stopped at the clean-checkout guard even
  when the operator only wanted new application functionality without losing
  local work.
- **Cause:** INSTALL-014 treated every tracked or untracked path as unsafe
  update state instead of separating fast-forward history safety from local
  working-tree preservation.
- **Correction:** Keep the main-branch, canonical-origin, and fast-forward
  gates. Temporarily stash tracked and untracked changes, fast-forward, then
  restore them before launch. Leave ignored `projects/local/` ZIPs in place.
  Stop before launch and retain the recovery stash if restoration conflicts.
- **Prevention:** An application updater must preserve user data independently
  of source history checks. Never discard, reset, or overwrite local files to
  make an update clean.
- **Evidence:** INSTALL-015 executable temporary-repository regression covers
  tracked edits, untracked ZIPs, ignored library ZIPs, fast-forward, exact
  restoration, and the conflict recovery path.
- **Status:** Resolved by INSTALL-015.

### F-110 — A fabrication download must be a complete manufacturing handoff

- **Date:** 2026-08-29
- **Context:** Downloading files for physical construction from the Fabrication
  toolbox.
- **Symptom:** **Download fabrication ZIP** could contain only the HERMA label
  PDF, or that PDF plus the currently displayed structural connector set. The
  operator still had to find planar parts and the assembly manual elsewhere.
- **Cause:** UI-027 unified the control location but retained separate package
  ownership for labels, planar mechanics, structural connectors, and the
  wiring manual.
- **Correction:** Build one deterministic fabrication ZIP from the current
  verified planar and structural in-memory assets, then add the HERMA label PDF
  and a wiring-derived manufacturing manual PDF.
- **Prevention:** A control named fabrication download must contain the complete
  current manufacturing handoff. Never include stale geometry, and never make
  the operator discover required print or assembly files through another
  package.
- **Status:** Resolved by UI-030.

### F-111 — Editing a bundled project must not edit tracked installation data

- **Date:** 2026-08-29
- **Context:** Making bundled Project Library examples behave like normal files.
- **Symptom:** Bundled cards were read-only. Direct rename, delete, or overwrite
  would make the installation dirty and could block or conflict with updates.
- **Cause:** The library exposed the storage location as the edit policy instead
  of separating the visible library entry from its Git-managed source ZIP.
- **Correction:** Keep bundled ZIPs immutable. Materialize renamed or overwritten
  content below ignored `projects/local/`, and persist bundled deletions as local
  hide records. Gate every mutation with the opened package revision.
- **Prevention:** User-facing file operations on shipped examples must use a
  local overlay. Never mutate or remove tracked demo files at runtime.
- **Evidence:** LIB-016 handler regressions cover bundled rename, delete, and
  overwrite while the original demo bytes remain present.
- **Status:** Resolved by LIB-016.

### F-112 — A missing generated-parts manifest reopened unsafe quarter turns

- **Date:** 2026-08-30
- **Context:** Re-optimizing wiring for the physically fabricated 41-panel
  rhombicosidodecahedron.
- **Symptom:** Automatic wiring could rotate a panel by 90 or 270 degrees, so
  its saved DIN/DOUT pose no longer matched the already-printed construction.
- **Cause:** The post-fabrication 0/180-degree gate inferred physical parts only
  from `generatedMechanics` or `generatedStructure`. Older fabricated projects
  can have neither manifest.
- **Correction:** Add an optional saved `wiring.panelRotationConstraint` and a
  Developer utilities button that sets it to `half-turns-only`. Combine this
  operator gate with the existing generated-manifest gate. In the explicit
  manual/no-manifest mode, use current saved poses as fabricated authority and
  discard assumed legacy address-only turns before the 0/180-degree search.
- **Prevention:** Do not infer all physical lifecycle state from derived-asset
  manifests. When older real hardware is authoritative, provide a persistent,
  explicit operator constraint. A manual override may strengthen an automatic
  safety gate but must never weaken a manifest gate.
- **Status:** Implemented by WIRE-017; focused operator review remains pending.

### F-113 — Mounting-hole names concealed a transposed PCB pattern

- **Date:** 2026-08-30
- **Context:** Checking the optimized 41-panel wiring against already-printed
  U-frame parts before PCB installation.
- **Symptom:** The virtual profile showed two columns of three holes, while the
  printed U-frame pilots did not align with that pattern.
- **Cause:** The profile coordinates followed the legacy `middle-left` and
  `middle-right` ID words instead of the photographed PCB and original printed
  CAD. The real board has three columns and two rows.
- **Correction:** Keep the stable IDs for compatibility, but move their
  authoritative coordinates to top-middle and bottom-middle. Use the shared
  back-view X reflection to cut all six holes into the virtual PCB. Anchor the
  diagonal connector assignment to physical SQ-05: with the three-hole
  reference at the top in back view, DIN is bottom-right and DOUT is top-left.
  The remaining four holes match the printed U-frame plus bridge and remain
  invariant under 180-degree rotation.
- **Prevention:** Never infer physical geometry from a mounting-hole ID. Compare
  the complete coordinate set with the PCB evidence and printed pilot set, and
  render actual openings before accepting a post-fabrication orientation rule.
- **Evidence:** Flagship PCB photographs, historical `pentagon_u.scad` pilot
  coordinates, the panel-profile regression, and the 41-panel wiring test.
- **Status:** Implemented by WIRE-017; visual and physical fit review pending.

### F-114 — Electrical address evidence was 180-degree ambiguous without a mechanical reference

- **Date:** 2026-08-30
- **Context:** Comparing the virtual SQ-05 DIN/DOUT labels with the physical PCB
  after the numbered address test had already established straight row order.
- **Symptom:** The virtual back view placed DIN top-right and DOUT bottom-left,
  but physical SQ-05 with its three-hole reference at the top has DIN
  bottom-right and DOUT top-left.
- **Cause:** The address walk was recorded relative to an unanchored panel
  orientation. Rotating the PCB 180 degrees preserves the measured straight
  walk but swaps both named connector corners relative to the mounting holes.
- **Correction:** Store the mounting-pattern reference with the measured pixel
  order, connector corners, and blocked holes. Regenerate the physical poses,
  route, ledmap, WLED deployment, and tutorial from that complete contract.
- **Prevention:** A physical pixel-order test must photograph or record one
  asymmetric mechanical reference. Pixel 0 and DOUT alone do not distinguish
  two panel orientations separated by 180 degrees.
- **Status:** Resolved by WIRE-017.

### F-115 — A browser tab cannot own the local server lifecycle

- **Date:** 2026-08-30
- **Context:** Making the local editor feel like an installed Mac application.
- **Symptom:** Closing the browser left the production server running, while a
  launcher that started another server could collide with the old port.
- **Cause:** The default browser does not provide a reliable signal when one
  LOO/UME tab closes. It cannot be the process owner.
- **Correction:** Keep one launcher-owned PID, readiness URL, and log. Reopen
  the current URL when that server is healthy, and provide explicit stop,
  status, and update actions. Route managed update restarts through the same
  launcher boundary.
- **Prevention:** Never infer server lifetime from browser-tab lifetime. A
  browser-based local application needs a separate process owner and exact
  stale-PID checks.
- **Status:** Implemented by INSTALL-016; native Mac review remains pending.

### F-116 — A reusable stale-lock path can delete a new owner's lock

- **Date:** 2026-08-30
- **Context:** Serializing Mac application copy, first install, and managed
  server launch.
- **Symptom:** Two launchers recovering one stale lock could both continue.
- **Cause:** One process checked that a shared lock path was stale, but another
  process replaced that path before the first process removed it.
- **Correction:** Give every contender a unique, atomically published PID
  claim. Remove stale claims only by their unique paths and elect the earliest
  live claim before changing shared application state.
- **Prevention:** Do not implement stale recovery as check-then-delete on a
  reusable lock path. A recovery-safe lock must identify one immutable claim.
- **Status:** Resolved by INSTALL-016; forced concurrent recovery is covered.

### F-117 — Cable-first assembly made PCB contacts difficult to reach

- **Date:** 2026-08-30
- **Context:** Physical assembly and soldering of the first 41-panel data chain.
- **Symptom:** The operator assembled the complete chain before soldering, so
  neighboring panels and printed parts obstructed access to PCB contacts.
- **Cause:** The tutorial focused on one cable at a time but did not show all
  solder and screw work for one panel before advancing.
- **Correction:** Add panel navigation. Highlight the selected panel, both of
  its incident data cables, and printable closures that identify that panel in
  their screw-tab ownership. Keep other selected-chain geometry visible but
  muted.
- **Prevention:** A physical assembly tutorial must group operations by the
  part whose contacts can become inaccessible. Do not infer printable-part
  ownership when a combined artifact has no panel association.
- **Evidence:** UI-032 focused navigation/unit checks and the dedicated
  Chromium assembly-tutorial journey.
- **Status:** Implemented by UI-032; physical second-chain review remains.

### F-118 — A wrong installed route must not require pose edits or resoldering

- **Date:** 2026-08-31
- **Context:** Review of physical panel order after partial 41-panel assembly.
- **Symptom:** A panel can be installed at a different chain position or with a
  different address orientation than the saved route. Rebuilding the physical
  assembly is not always necessary.
- **Cause:** The editor had no bounded way to identify one physical address
  block and relate it to one virtual panel after assembly.
- **Correction:** Add a transactional physical route review. Light one fixture
  block with a DIN-to-DOUT gradient, accept the expected panel or select the
  actual panel, and adjust only its installed address transform. Apply one
  complete unique assignment and synchronize the exact regenerated ledmap.
- **Prevention:** Keep physical chain identity, installed address calibration,
  and world pose as separate authorities. Never repair an address mismatch by
  moving a panel pose, changing GPIOs, or weakening fabrication evidence.
- **Evidence:** CAL-012 unit and focused Chromium review journeys.
- **Status:** Implemented by CAL-012; physical 41-panel review remains.

### F-119 — Visible PCB apertures are not automatic mounting authority

- **Date:** 2026-09-02
- **Context:** Creating a reusable panel profile from one KiCad screenshot of a
  custom diamond-shaped LED PCB.
- **Symptom:** The profile contract required six legacy rectangular mounting
  records, but the image visibly contained nine circular board apertures.
- **Cause:** The historical mounting contract combines display, connector
  blocking, and rectangular fabrication facts. Forcing nine image-derived
  circles into that contract would invent mechanical and manufacturing facts.
- **Correction:** Add optional validated circular apertures to the planar
  carrier display contract. Use them for board triangulation and visualization,
  while the unchanged mounting contract remains compatibility-only and
  provisional. Keep rectangular-only fabrication disabled.
- **Prevention:** Separate visible carrier cutouts from measured mounting and
  fabrication authority. A photograph or CAD screenshot can support a visual
  fixture, but it cannot prove tolerances, connector functions, or printable
  attachment geometry.
- **Status:** Implemented by FIXTURE-015; source measurements and electrical
  facts remain provisional.

### F-120 — Address optimization can break a non-square face fit

- **Date:** 2026-09-02
- **Context:** Placing the clipped golden-rhombus PCB on all 30 faces of a
  rhombic triacontahedron.
- **Symptom:** An unrestricted quarter-turn wiring search can exchange the
  panel's long and short diagonals. DIN/DOUT may improve, but the physical PCB
  edges no longer match the polyhedron face edges.
- **Cause:** The address optimizer treats 0, 90, 180, and 270-degree rotations
  as equivalent before fabrication. That assumption is valid for square
  carriers, not for a non-square carrier constrained to one face shape.
- **Correction:** Save the half-turn-only rotation constraint in the sculpture
  before optimization. Generate exact face frames first, then let the optimizer
  use only 0 or 180 degrees. Prove that every shared edge still coincides and
  that another optimization pass changes no pose or route.
- **Prevention:** Derive allowed physical rotations from the placement and
  carrier symmetry. Never optimize connector distance with a rotation that
  invalidates the mechanical face fit.
- **Status:** Implemented by FIXTURE-016; physical PCB dimensions remain
  provisional.

### F-121 — Panel edit hitboxes appeared as transparent quadrilaterals

- **Date:** 2026-09-02
- **Context:** Visual review of the 30-panel image-derived rhombic
  triacontahedron.
- **Symptom:** Faint rectangular quadrilaterals extended beyond the clipped
  diamond PCBs.
- **Cause:** Panel selection used a width-by-height box with 2.5 percent
  opacity. The box was intended as an edit hit target, but its corners became
  visible outside a non-rectangular carrier.
- **Correction:** Keep panel edit targets visible to raycasting but disable
  their color writes and set their opacity to zero. The exact carrier remains
  the only visible panel geometry and the existing selection focus shows the
  selected panel.
- **Prevention:** Interaction geometry must not write to the framebuffer.
  Rendered carrier geometry and edit hit geometry have separate authority.
- **Status:** Resolved in FIXTURE-016.

### F-122 — A successful manual launcher build was not a downloadable release

- **Date:** 2026-09-02
- **Context:** First operator test of the self-installing Mac launcher.
- **Symptom:** The workflow passed and produced a ZIP under Actions artifacts,
  but no Mac download appeared on the repository Releases page.
- **Cause:** `workflow_dispatch` intentionally uploaded a temporary artifact;
  only an explicit version-tag push ran the release job.
- **Correction:** Package and publish a unique permanent launcher release after
  every push to canonical `main`. Keep manual runs artifact-only and retain
  explicit version-tag releases. Put the stable latest-release asset URL near
  the start of the README.
- **Prevention:** Distinguish workflow artifacts from release assets in the
  operator path. A promised download must be created by an automatic publishing
  event and linked from the primary documentation.
- **Status:** Implemented by INSTALL-017; first automatic macOS run remains CI
  evidence after integration.

### F-123 — Finder launch hid installer progress and server state

- **Date:** 2026-09-02
- **Context:** Operator test of the first Mac launcher artifact.
- **Symptom:** Opening the icon appeared to do nothing. Opening it again later
  gave no visible indication that installation, startup, or failure was active.
- **Cause:** Finder ran the shell executable without a terminal. Notifications
  covered only selected stages, while detailed setup went to a background log.
- **Correction:** Hand normal icon launch to one visible Terminal session,
  stream the managed setup log, and show a final ready or failure message. Add
  a packaged uninstaller that preserves local projects before removing managed
  paths.
- **Prevention:** A long first-launch installer must have one persistent,
  operator-visible progress surface and one bounded removal path.
- **Status:** Implemented by INSTALL-017; native Finder review remains pending.

### F-124 — Removal left a server without its ownership record

- **Date:** 2026-09-02
- **Context:** Native removal and immediate reinstall of the Mac launcher.
- **Symptom:** The removal Terminal ended with `zsh: killed`. Reinstall then
  rejected port 4173 even though its LOO/UME readiness endpoint was active.
  Git also printed only its first clone line to the file log.
- **Cause:** The command file executed a quarantined nested app executable
  directly, while the working install path explicitly used `/bin/sh`; macOS
  killed that direct invocation before the first progress message. The managed
  PID record did not survive, so the remaining server became an orphan. Its
  listener PID can also occur more than once in `lsof` output. The launcher
  interpreted a duplicate as multiple processes and skipped safe recovery. Git
  clone progress was redirected away from the visible installer Terminal.
- **Correction:** Run the packaged and installed uninstall scripts explicitly
  through `/bin/sh`. Recover an orphan only when one unique listening PID has the exact
  managed checkout command path and the endpoint returns the LOO/UME readiness
  contract; accept repeated records of that same PID. Recreate the PID record
  before reuse or removal. Run Git clone with forced progress directly in the
  visible Terminal.
- **Prevention:** Ownership recovery must combine process identity and an
  application-specific readiness response. Never adopt a port from HTTP
  response alone. Removal must stop if an active port cannot be owned or stays
  active. Never hide a long first-install operation from the operator's
  progress surface.
- **Status:** Implemented by INSTALL-017; native uninstall and reinstall review
  remains pending.

### F-125 — Terminal handoff used an expired App Translocation path

- **Date:** 2026-09-02
- **Context:** Native launch immediately after a successful command-file
  removal.
- **Symptom:** Terminal tried to execute the launcher below `/private/var/.../
AppTranslocation/...` and `/bin/sh` reported that the file did not exist.
- **Cause:** Finder handed the downloaded quarantined app to a temporary mount.
  The launcher opened Terminal before copying itself, and macOS removed the
  mount before the Terminal command started. A separate developer checkout also
  owned port 4173, which the managed application correctly refused to kill.
- **Correction:** Copy the wrapper to `~/Applications` before Terminal handoff
  and run the stable installed path. When a different process owns the default
  port, preserve it and store the next free port for every later managed launch.
- **Prevention:** Never pass an App Translocation path to an asynchronous
  process. Persist a selected local port instead of killing or adopting a
  different checkout.
- **Status:** Implemented by INSTALL-017; native review remains pending.

### F-126 — GitHub review artifact required two ZIP extractions

- **Date:** 2026-09-02
- **Context:** Repeated native review of a branch-built Mac launcher.
- **Symptom:** The Actions download was a ZIP containing the signed launcher
  ZIP, so the operator had to extract twice.
- **Cause:** GitHub always packages workflow artifacts as ZIP files. The inner
  archive was still required because it preserves the executable modes and app
  bundle metadata that a raw artifact directory does not preserve.
- **Correction:** Keep the Actions artifact as verification evidence, and make
  each manually dispatched run publish a unique prerelease with the verified
  launcher ZIP as a direct asset. Do not mark that prerelease as latest.
- **Prevention:** Use workflow artifacts for job transfer and evidence. Use a
  release asset when the operator needs the packaged file without an additional
  wrapper archive.
- **Status:** Implemented by INSTALL-017; first direct review release remains
  CI evidence.

### F-127 — API-only readiness reopened a missing editor

- **Date:** 2026-09-02
- **Context:** Native Finder reopen after an earlier removal and reinstall.
- **Symptom:** The launcher reported that LOO/UME was already running, but the
  browser opened a plain `Not found.` page. The app was also installed only in
  the personal Applications folder, where the operator did not expect it.
- **Cause:** Managed readiness checked only the in-memory generator API. The
  old process could still answer that API after its checkout and `dist` files
  were removed, so the launcher did not prove that the editor HTML existed.
  Terminal handoff also trusted the current executable path instead of choosing
  the stable installed executable explicitly. A translocated launch could then
  compare as a different source path and repeat the copy/open handoff instead
  of reaching Terminal. The original destination was
  `~/Applications`, not the standard system-wide `/Applications` folder.
- **Correction:** Require both the application-specific API and the LOO/UME
  editor HTML before reuse. Stop and rebuild only a process whose managed PID
  identity is proven when its editor files are absent. Install transactionally
  in `/Applications` through the bounded macOS authorization prompt, migrate
  the old personal copy, recognize the matching installed bundle independent
  of its launch path, and hand Terminal the exact installed executable. After
  the first successful start, tell the operator to delete the downloaded ZIP
  and extracted folder so there is only one launch icon.
- **Prevention:** A local web application is ready only when both its control
  endpoint and its primary UI asset are valid. Never use an App Translocation
  or downloaded executable path for asynchronous relaunch, and state the exact
  final installation location in the visible progress log.
- **Status:** Implemented by INSTALL-018; native system-folder install and
  reopen remain Human Review after a new release is published.

### F-128 — Replacing the app did not update the running installation

- **Date:** 2026-09-02
- **Context:** Native review of a newer downloaded Mac launcher over an
  existing installation.
- **Symptom:** A replacement wrapper could coexist with the old managed server
  and checkout, so opening the new icon did not prove that the running editor
  used the new application version.
- **Cause:** App-bundle replacement and managed-checkout update were separate
  workflows. `install_checkout()` correctly preserved an existing checkout,
  but the launcher then used the ordinary `launch` action and reused its
  already-running server.
- **Correction:** A different app replacement now records a durable pending
  upgrade when a managed checkout exists. The stable installed wrapper invokes
  the existing `looume --update` boundary, which stops the verified server,
  applies the guarded in-place update, and starts one new server. The marker is
  removed only after success. An identical app performs an ordinary reopen.
- **Prevention:** Treat app replacement and service version activation as one
  recoverable transaction. Do not delete the Project Library to obtain a clean
  upgrade, and do not restart or replace an unverified process.
- **Status:** Implemented by INSTALL-018; native replacement over a running
  prior release remains Human Review.

### F-129 — A desktop wrapper can silently fork working hardware paths

- **Date:** 2026-09-02
- **Context:** Packaging the browser editor as an Electron application.
- **Risk:** Reimplementing serial, Art-Net, DDP, project storage, or update
  logic in the renderer can produce a desktop UI that looks correct but has
  different mapping, network, and persistence behavior.
- **Correction:** Keep the compiled browser editor unchanged and host the
  existing Node service modules in the Electron main process. Grant serial
  permission only to the internal loopback origin and approved CP2102 identity.
  Store mutable project and generated data under Electron user data. Use signed
  release artifacts for Electron updates instead of Git mutation.
- **Prevention:** Treat Electron as a process, permission, and packaging
  boundary. Do not add a second mapping or hardware transport authority. Do not
  publish an unsigned application as an update source.
- **Status:** Implemented by INSTALL-019; native signed/notarized Mac release
  evidence remains pending.

### F-130 — Universal Electron merge included both Sharp architectures

- **Date:** 2026-09-02
- **Context:** First unsigned universal-Mac Electron workflow run.
- **Symptom:** Both architecture packages completed, but the universal merge
  stopped on `@img/sharp-darwin-arm64` because the same native file existed in
  both halves without an architecture ownership rule.
- **Cause:** `manifold-3d` exposes optional GLTF tooling through its dependency
  tree. Electron Builder copied the unused Sharp image stack even though the
  desktop fabrication service imports only the root Manifold WASM runtime.
- **Correction:** Exclude `sharp` and its `@img` optional native packages from
  the Electron application. Keep the root `manifold-3d` package unpacked and
  verify the packaged generator-status endpoint before release.
- **Prevention:** Package the minimum runtime dependency surface. Do not use a
  broad universal-merge exception for unused architecture-specific binaries.
- **Status:** Resolved in INSTALL-019; corrected universal packaging and native
  review passed.

### F-131 — Closing the Electron window left a hidden Mac process

- **Date:** 2026-09-02
- **Context:** Native review of the first unsigned Electron DMG.
- **Symptom:** Closing the only window left LOO/UME open. Finder refused to
  remove the application, and a later icon launch did not show a reliable new
  window.
- **Cause:** The Electron lifecycle copied the normal document-based macOS
  convention and kept the application process alive after its last window
  closed. LOO/UME has one editor window and owns local services in that process,
  so the hidden process was not useful or visible.
- **Correction:** Quit on `window-all-closed` on every platform. The existing
  `before-quit` boundary closes the loopback service before process exit. A
  later icon launch starts a fresh process and window.
- **Prevention:** Desktop lifecycle must match the operator-visible ownership
  model. Closing the only LOO/UME window closes the application; do not apply a
  generic platform convention without native workflow evidence.
- **Status:** Resolved in INSTALL-019; native `electron-review-3` close, remove,
  and relaunch behavior passed.

### F-132 — Two Mac installers competed for the primary download

- **Date:** 2026-09-02
- **Context:** Electron native review passed while the README and automatic
  `main` workflow still promoted the older Terminal/browser launcher.
- **Symptom:** The successful Electron application was not the default download,
  and ordinary changes continued to package a second, more complex installation
  path.
- **Cause:** The Electron task added a review and future signed-release path but
  did not complete the free unsigned distribution cutover.
- **Correction:** Make the Electron DMG the primary README installation. Refresh
  one fixed unsigned prerelease asset from canonical `main`, without updater
  metadata. Retain the managed-checkout launcher only for explicit legacy tags
  and manual recovery builds.
- **Prevention:** One operator platform has one primary installation path.
  Compatibility installers must be labelled legacy and must not publish on each
  normal integration.
- **Status:** Resolved in INSTALL-019; canonical-main run 33660397431 published
  the stable unsigned DMG and the legacy launcher did not run.

### F-133 — Per-panel seam correction broke the shared UV atlas

- **Date:** 2026-09-03
- **Context:** MadMapper fixture import for the 41-panel sculpture.
- **Symptom:** Upper and lower fixture bands shifted left of the middle band,
  large black areas appeared, and the imported map was not 2:1.
- **Cause:** The exporter projected every LED fixture corner independently,
  moved seam-crossing corners around each panel anchor, and then cropped the SVG
  to those out-of-range bounds. The intended 4096 x 2048 atlas became a shifted
  5327 x 1871 document.
- **Correction:** Center one equal square on every existing LED UV coordinate,
  choose one deterministic longitude seam for all LEDs, and retain the fixed
  4096 x 2048 viewBox.
- **Prevention:** A spherical fixture atlas must keep one global projection
  frame. Test its exact aspect ratio, fixture bounds, and equal fixture size.
- **Evidence:** `tests/madmapper-export.test.ts` and the operator's MadMapper
  screenshot from 2026-09-03.
- **Status:** Resolved by MAD-012.

### F-134 — An unsigned DMG cannot promise automatic replacement

- **Date:** 2026-09-03
- **Context:** Free Electron application updates on macOS.
- **Symptom:** A canonical-main push refreshed the unsigned DMG, but the
  installed application could not discover or install that build through the
  signed Electron updater.
- **Cause:** The mutable unsigned prerelease deliberately omits the signed
  updater feed, while the application checks that separate release channel.
- **Correction:** Publish bounded numeric-version and checksum metadata beside
  the unsigned DMG. A packaged free build can offer the exact approved download
  URL, but the operator replaces the application manually.
- **Prevention:** Label free unsigned updates as download-and-replace. Never
  present an unsigned package as a verified automatic installation.
- **Evidence:** `electron/DesktopUpdateHandler.ts`,
  `scripts/create-electron-unsigned-update.ts`, and the Electron release tests.
- **Status:** Resolved by INSTALL-020.

### F-135 — Fixed-size LED fixtures left most of the atlas unassigned

- **Date:** 2026-09-03
- **Context:** Operator review of the corrected 4096 x 2048 MadMapper atlas.
- **Symptom:** LED positions and latitude bands aligned, but equal 28 x 28
  fixture squares left large black holes between panels and near both poles.
- **Cause:** The export treated each UV point as the center of a fixed display
  footprint. A spherical nearest-LED atlas needs a complete partition instead.
- **Correction:** Clip one planar Voronoi cell for each seam-adjusted LED center
  against the atlas and every other LED's perpendicular bisector.
- **Prevention:** Test total cell area, common neighbor edges, atlas bounds, and
  division of both horizontal image edges. Fixed fixture size is not sufficient
  evidence for a complete atlas.
- **Evidence:** `tests/madmapper-export.test.ts` and the rendered MAD-013 atlas.
- **Status:** Superseded by MAD-014 after native review found F-136.

### F-136 — MadMapper converted Voronoi polygons to overlapping rectangles

- **Date:** 2026-09-03
- **Context:** Operator review of the MAD-013 fixture SVG in MadMapper.
- **Symptom:** The SVG polygons did not overlap, but MadMapper showed many
  overlapping rectangular fixtures.
- **Cause:** The exporter declared each arbitrary polygon as `fixture_quad`.
  MadMapper used the polygon bounds for the rectangular fixture.
- **Correction:** Partition the complete atlas into axis-aligned rectangles.
  Keep each LED center in its assigned rectangle.
- **Prevention:** Test the geometry that the target application creates. For a
  quad fixture, test rectangular bounds and interior overlap after SVG rounding.
- **Evidence:** `web/src/MadMapperExport.ts`,
  `tests/madmapper-export.test.ts`, and the operator's MadMapper screenshot.
- **Status:** Resolved by MAD-014; native MadMapper review passed.

### F-137 — The managed sandbox blocked the tsx command pipe

- **Date:** 2026-09-03
- **Context:** MAP-021 mapping-artifact regeneration in a temporary worktree.
- **Symptom:** `npm run generate:mapping:hardware` failed before generation.
  The tsx command could not open its pipe below `/tmp/tsx-1000/`.
- **Cause:** The managed sandbox did not permit the tsx command IPC listener.
- **Correction:** Run the same script with `node --import tsx`.
- **Prevention:** If the tsx pipe fails with `EPERM`, use the direct Node loader.
  Do not treat this host restriction as a mapping failure.
- **Evidence:** `scripts/generate-mapping.ts` regenerated fingerprint
  `524500f5` with the direct loader.
- **Status:** Mitigated.

### F-138 — Raw display coordinates caused a false mapping parity failure

- **Date:** 2026-09-03
- **Context:** MAP-021 Linux and macOS mapping-artifact verification.
- **Symptom:** Both systems produced fingerprint `524500f5`, but macOS changed
  the last digit of 13 `v` values in `layout/panel-map.json`.
- **Cause:** Platform math libraries can give different final bits for
  transcendental results. These raw values do not control the new order key.
- **Correction:** Compare generated address artifacts and golden fingerprints.
  Do not compare unrounded display coordinates for address parity.
- **Prevention:** Keep raw geometry unchanged. Use the stable order key for
  address decisions and use address artifacts for cross-platform checks.
- **Evidence:** GitHub workflow run 33735439353 produced the same tests and
  fingerprint on Ubuntu and macOS. Only raw `v` JSON values differed.
- **Status:** Resolved by MAP-021.

### F-139 — A temporary worktree did not contain the Playwright browser

- **Date:** 2026-09-03
- **Context:** TD-010 focused Chromium package review.
- **Symptom:** Playwright could not find its browser below the temporary
  worktree's `.tools/playwright/` path.
- **Cause:** The shared browser installation exists only in the main checkout.
  The temporary worktree did not include that ignored directory.
- **Correction:** Link the main checkout's verified `.tools` directory into the
  temporary worktree. Then run the test with `CI=1`.
- **Prevention:** Before a worktree browser test, check both `node_modules` and
  `.tools/playwright`. Link the verified shared directories when necessary.
- **Evidence:** The focused Chromium test passed after the `.tools` link.
- **Status:** Resolved.

### F-140 — WLED readiness removed valid simulator output

- **Date:** 2026-09-03
- **Context:** TD-010 complete package review with a 30-panel project.
- **Symptom:** The complete ZIP did not contain the `touchdesigner/` folder.
- **Cause:** TouchDesigner package generation required a physical WLED
  deployment identity, although simulator DDP input did not require it.
- **Correction:** Generate TouchDesigner files for every complete logical map
  with 1 through 2,624 LEDs. Report simulator-only status independently.
- **Prevention:** Do not use physical output readiness to block an independent
  simulator input or package artifact.
- **Evidence:** `tests/touchdesigner-package.test.ts` and
  `tests/complete-project-package.test.ts` cover simulator-only packages.
- **Status:** Resolved by TD-010.

### F-141 — A Linux host cannot create a verified TouchDesigner component

- **Date:** 2026-09-03
- **Context:** TD-010 native `.tox` package creation.
- **Symptom:** The repository could generate component source but not a native
  `.tox` artifact.
- **Cause:** TouchDesigner 2025.31550 supports Windows and macOS. Derivative
  supplies native component creation only with the TouchDesigner application.
- **Correction:** Generate the component with the repository builder in
  TouchDesigner 2025.31550. Record its build, size, and SHA-256 checksum.
- **Prevention:** Do not synthesize or rename a file as `.tox`. Validate each
  native component with its target TouchDesigner build before packaging.
- **Evidence:** Derivative `.tox`, Component, App Class, and release
  documentation.
- **Status:** Resolved by the verified TouchDesigner 2025.31550 artifact.

### F-142 — The TouchDesigner component required an external Resolution TOP

- **Date:** 2026-09-03
- **Context:** TD-010 native component review.
- **Symptom:** A connected 16:9 TOP produced no DDP frame.
- **Cause:** The sender rejected input that was not exactly 2:1. The component
  did not normalize its own image.
- **Correction:** Put a centered 1280 x 640 Fit TOP inside the component.
- **Prevention:** A reusable output component must own its required input
  normalization when one deterministic conversion exists.
- **Evidence:** The operator connected the source directly and confirmed DDP.
  The verified native artifact is 2,966 bytes and has receipt checksum
  `7779c60e5229f731060e7f4e94e6122fb111ba0337dd917b5a6bf945c997b040`.
- **Status:** Resolved by the regenerated TouchDesigner component.

### F-143 — Art-Net required an unnecessary receive action

- **Date:** 2026-09-03
- **Context:** TD-010 external simulator input review.
- **Symptom:** DDP started automatically, but Art-Net required a button action.
- **Cause:** The first Art-Net workflow kept a manual session control after the
  receiver became a permanent simulator input.
- **Correction:** Start Art-Net automatically when the physical mapping becomes
  ready. Restart it after project, mapping, and physical-review changes.
- **Prevention:** Equivalent permanent input services must use one automatic
  lifecycle unless a protocol constraint requires operator control.
- **Evidence:** The browser test verifies automatic Art-Net reception without a
  receive button.
- **Status:** Resolved by TD-010.

### F-144 — The Mac application omitted the ESP32 image

- **Date:** 2026-09-03
- **Context:** FIRM-015 ESP32 setup from the Electron application.
- **Symptom:** Firmware status returned `ENOENT` for the complete flash image.
- **Cause:** Electron packaged the firmware receipt but omitted the ignored
  `build/firmware/` image.
- **Correction:** Stage the release image before packaging. Verify its receipt
  before and after Electron packaging.
- **Prevention:** Make Electron packaging fail when the receipt-bound image is
  missing or different.
- **Evidence:** `tests/electron-release-workflow.test.ts` and the Electron
  package inventory check.
- **Status:** Resolved by FIRM-015.

### F-145 — A firmware rebuild changed the receipt hash

- **Date:** 2026-09-03
- **Context:** FIRM-015 recovery of a deleted firmware build output.
- **Symptom:** The pinned source and tools produced the correct image size but
  a different SHA-256 value.
- **Cause:** The pinned WLED UI generator adds `WEB_BUILD_TIME` to the compiled
  image. A later build therefore has different bytes.
- **Correction:** Bind the new complete image to a new receipt hash. Publish
  those exact bytes as a permanent release asset.
- **Prevention:** Publish each receipt-bound image before removal of its build
  worktree. Do not use a later rebuild for an earlier receipt.
- **Evidence:** `wled/upstream/tools/cdata.js`, `firmware/build-receipt.json`,
  and the `esp32-firmware-improv-v1` release asset.
- **Status:** Resolved by FIRM-015.

### F-146 — Electron rejected the connected CP2102

- **Date:** 2026-09-03
- **Context:** FIRM-015 review DMG serial-device selection.
- **Symptom:** Web Serial reported that the operator selected no port. Electron
  did not show the application device dialog.
- **Cause:** Electron supplied decimal USB identifiers as strings. The desktop
  policy read all unmarked strings as hexadecimal values.
- **Correction:** Read decimal strings as decimal values. Continue to accept
  numeric and explicit hexadecimal values.
- **Prevention:** Test Electron's decimal-string representation for the CP2102
  vendor and product identifiers.
- **Evidence:** `electron/SerialPolicy.ts`, `tests/electron-desktop.test.ts`, and
  the Electron SerialPort contract.
- **Status:** Resolved by FIRM-015.

### F-147 — Electron hid the selected port from `getPorts()`

- **Date:** 2026-09-03
- **Context:** FIRM-015 review DMG after successful CP2102 selection.
- **Symptom:** Setup rejected the selected CP2102 because `getPorts()` returned
  no authorized ports immediately after selection.
- **Cause:** The workflow required the selected port to appear again in
  Electron's authorized-port list.
- **Correction:** Trust the filtered `requestPort()` result after its USB
  identity check. Use `getPorts()` only for later reconnect attempts.
- **Prevention:** Do not require immediate discovery of a port that
  `requestPort()` already returned and verified.
- **Evidence:** Operator review on Electron DMG 19 and
  `tests/esp32-setup.test.ts`.
- **Status:** Resolved by FIRM-015.

### F-148 — The first serial open can fail after selection

- **Date:** 2026-09-03
- **Context:** FIRM-015 Electron review after successful CP2102 selection.
- **Symptom:** The first `SerialPort.open()` call failed on macOS.
- **Cause:** The setup made one immediate open attempt after the application
  selection dialog closed.
- **Correction:** Retry the same verified port every 500 ms with a fixed
  20-attempt limit. Report a possible competing serial application.
- **Prevention:** Keep initial-open retry separate from post-reset reconnect.
  Never select a different device during either retry.
- **Evidence:** Operator review on Electron DMG 20 and
  `tests/esp32-setup.test.ts`.
- **Status:** Human review.

### F-149 — DMG-only hardware review made correction cycles slow

- **Date:** 2026-09-03
- **Context:** FIRM-015 repeated macOS Web Serial review.
- **Symptom:** Each serial correction required a GitHub DMG build and manual
  application replacement.
- **Cause:** The repository had no command for a local packaged Electron
  application with the verified firmware resource.
- **Correction:** Add `./bootstrap.sh review-electron`. Build and open a local
  packaged application without creating a DMG.
- **Prevention:** Use the local packaged application for macOS hardware review.
  Use a DMG only for final delivery review.
- **Evidence:** `bootstrap.sh`, `scripts/launch-local-packaged-electron.sh`, and
  `tests/bootstrap-install.test.ts`.
- **Status:** Resolved by FIRM-015.

### F-150 — Local packaged review was not isolated

- **Date:** 2026-09-04
- **Context:** FIRM-015 local packaged Electron hardware review.
- **Symptom:** The review showed a public update notice and only a generic
  serial-open error.
- **Cause:** Local review used the production version, update checks,
  single-instance lock, and application data. The launch command hid main-process
  device logs.
- **Correction:** Give local review separate application data. Start its exact
  packaged executable in the terminal. Disable public update checks in this mode.
  Report the selected port path, USB driver, permission result, and bounded
  renderer port state.
- **Prevention:** A local packaged review must not share a single-instance lock
  with the installed application. Keep its main-process logs visible.
- **Evidence:** `electron/main.ts`, `web/src/Esp32Setup.ts`, and
  `scripts/launch-local-packaged-electron.sh`.
- **Status:** Resolved by FIRM-015.

### F-151 — Electron denied the selected port during open

- **Date:** 2026-09-04
- **Context:** FIRM-015 local packaged Electron hardware review.
- **Symptom:** Electron selected the approved CP2102. Each serial-open attempt
  then failed with `NetworkError`.
- **Cause:** The custom device-permission handler received an empty device
  object during `open()`. The handler denied each request before macOS access.
- **Correction:** Remove the custom device-permission handler. Use Electron's
  window-lifetime grant after the filtered selection callback.
- **Prevention:** Do not add a device-permission handler when filtered explicit
  selection gives the required device boundary.
- **Evidence:** Operator logs showed one approved selection followed by twenty
  permission denials with no repeated USB identity.
- **Status:** Resolved by FIRM-015.

### F-152 — A retained `portId` did not correct serial permission

- **Date:** 2026-09-04
- **Context:** FIRM-015 repeated local packaged Electron hardware review.
- **Symptom:** The approved selection contained a `portId`. All later
  permission checks still contained an empty device object and failed.
- **Cause:** Electron did not supply the selected identity to the custom
  device-permission handler during `SerialPort.open()`.
- **Correction:** Let Electron retain its default window-lifetime permission.
  Keep CP2102 filtering in the explicit `select-serial-port` callback.
- **Prevention:** Verify the complete request, selection, permission, and open
  sequence. Do not infer later handler data from the selection object.
- **Evidence:** Operator logs from commit `3651577` show the selected `portId`
  followed by twenty empty permission objects and denials.
- **Status:** Resolved by FIRM-015.

### F-153 — Post-setup DDP output made Electron unresponsive

- **Date:** 2026-09-04
- **Context:** FIRM-015 physical setup of 2,624 LEDs.
- **Symptom:** Setup completed and live output started. Electron then showed a
  persistent wait cursor and remained slow after ESP32 disconnection.
- **Cause:** Each complete frame created six UDP sockets in Electron's main
  process. A failed destination also caused repeated send attempts.
- **Correction:** Reuse one UDP socket for complete frames. Stop the stale live
  link after its first failed frame.
- **Prevention:** Bound network resources per frame. A stopped link must not
  continue background send attempts.
- **Evidence:** Chrome remained responsive with the network broker in a separate
  Node process. Electron slowed after setup and reported a DDP timeout.
- **Status:** Resolved by FIRM-015.

### F-154 — Fast Electron review rejected a missing data directory

- **Date:** 2026-09-04
- **Context:** FIRM-015 unpackaged Electron review.
- **Symptom:** Electron stopped before startup with an `app.setPath()` argument
  conversion failure.
- **Cause:** The fast command supplied a new absolute user-data path before its
  directory existed.
- **Correction:** Create the directory before `app.setPath()`.
- **Prevention:** Create and validate each custom Electron data directory before
  setting the application path.
- **Evidence:** The main-process exception identified the exact user-data path
  and `electron/main.ts` call.
- **Status:** Resolved by FIRM-015.

### F-155 — A started DDP sender did not prove physical output

- **Date:** 2026-09-04
- **Context:** FIRM-015 post-setup review.
- **Symptom:** The task record claimed that DDP output passed before the
  physical sculpture was connected.
- **Cause:** The review treated a successful sender start as physical reception
  evidence.
- **Correction:** Record sender operation and physical LED reception separately.
  Keep FIRM-015 in Human Review until the connected sculpture shows the frame.
- **Prevention:** Do not infer physical output from a successful network send.
- **Evidence:** The operator confirmed application responsiveness and stated
  that physical sculpture connection is the next test.
- **Status:** Human review.

### F-160 — A random Electron port lost automatic ESP32 reconnect

- **Date:** 2026-09-04
- **Context:** LIVE-021 physical sculpture review after an Electron restart.
- **Symptom:** WLED remained available, but LOO/UME showed
  `Sculpture mirror waits for ESP32` and sent no physical frames.
- **Cause:** Electron selected a new loopback port after each start. Browser
  storage and Web Serial permission used the complete origin, including that
  port, so the new page had no reconnect authorization.
- **Correction:** Store successful setup authorization in Electron application
  data. Read that state through a loopback-only same-origin endpoint.
- **Prevention:** Do not keep application-lifetime state in storage that a
  random server origin controls.
- **Evidence:** The restarted application used the current bundle but reported
  no ESP32 connection. The random-port persistence regression covers two
  server ports and one application-data file.
- **Status:** Resolved by LIVE-022; physical reconnect review remains.

### F-161 — Fixed output GPIOs blocked recovery from damaged pins

- **Date:** 2026-09-04
- **Context:** LIVE-021 physical mapping review after level-shifter soldering.
- **Symptom:** Two data outputs did not operate after a possible short on GPIO
  18 and GPIO 19. The editor could only restore GPIOs 16 through 19.
- **Cause:** Automatic wiring selected a fixed default GPIO set. The interface
  had no guarded method to replace one damaged output pin.
- **Correction:** Add one output field for each current chain. Accept only
  unique approved ESP32-WROOM output pins. Save the values in the project.
- **Prevention:** Keep default hardware values editable through a bounded safe
  list when equivalent controller pins exist.
- **Evidence:** Unit tests preserve routes and addresses. The browser test saves
  GPIOs 21, 22, 25, and 26 and rejects a duplicate.
- **Status:** Resolved by LIVE-023; physical replacement-pin review remains.
