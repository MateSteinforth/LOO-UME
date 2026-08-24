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

### F-023 — Restricted `/tmp` tests cannot bind loopback servers

- **Date:** 2026-08-22
- **Context:** Full TRUSS-013 verification in a temporary Git worktree.
- **Symptom:** Local editor server tests failed with `listen EPERM` on
  `127.0.0.1`; handler tests then timed out while waiting for the same socket.
- **Cause:** The restricted sandbox blocked loopback listeners. The truss tests
  and all other non-server tests passed in that run.
- **Correction:** Repeat the unchanged `npm test` command with approved host
  execution so the test-only loopback servers can bind.
- **Prevention:** In a `/tmp` worktree, treat `listen EPERM` on loopback as a
  sandbox boundary. Do not change server code or test timeouts before repeating
  the exact suite with approved loopback access.
- **Evidence:** The subsequent unchanged full suite passed all 296 tests.
- **Status:** Resolved.

### F-024 — Bridge-free removal can retain a structure that is too flexible

- **Date:** 2026-08-22
- **Context:** TRUSS-014 removal of low-load candidates from the 41-panel
  candidate graph.
- **Symptom:** The reduced graph stayed connected and had no bridge, but its
  displacement utilization was about 39 even at the maximum member diameter.
- **Cause:** Graph redundancy proves alternate paths, not adequate 3D stiffness
  or strength.
- **Correction:** Test every removal proposal with a maximum-diameter capacity
  solve. Restore the shortest candidates in stable order until stress,
  buckling, and displacement can pass.
- **Prevention:** Never accept structural member removal from connectivity
  checks alone. Require both redundant topology and numerical capacity.
- **Evidence:** `tests/truss-optimizer.test.ts` and decision D20.
- **Status:** Resolved.

### F-025 — Collision-free truss axes do not prove collision-free printed solids

- **Date:** 2026-08-22
- **Context:** TRUSS-015 conversion of candidate members and hubs into printable
  Manifold volumes.
- **Symptom:** A small bracket offset passed hub-centre and member-axis checks,
  but the generated hub sphere entered the PCB envelope.
- **Cause:** Candidate checks treated nodes and members as points and lines.
  Printable hubs, bosses, and struts have nonzero radius.
- **Correction:** Intersect each final bracket and strut solid with every nearby
  oriented PCB envelope and reject any positive collision volume.
- **Prevention:** Keep fast point/segment checks during candidate generation,
  but require solid-volume keep-out checks before mesh publication.
- **Evidence:** `tests/structural-solids.test.ts` with a 1 mm bracket offset.
- **Status:** Resolved.

### F-026 — Atomic publication must not accept an arbitrary output directory

- **Date:** 2026-08-22
- **Context:** TRUSS-016 complete-directory publication.
- **Symptom:** The first publisher could rename and replace any existing path
  except the filesystem root, including a repository or unrelated data folder.
- **Cause:** Atomic replacement safety was implemented without a narrow output
  ownership contract.
- **Correction:** Accept one safe direct child of an explicit artifact root.
  Before replacement, require a real directory whose manifest, artifact hashes,
  formats, paths, and complete file list validate as this generator's output.
- **Prevention:** A staging-and-rename strategy is not safe by itself. Prove
  ownership and exact scope before moving or deleting an existing destination.
- **Evidence:** `tests/structural-artifacts.test.ts` covers unrelated-directory
  refusal and restoration after an injected final-promotion failure.
- **Status:** Resolved.

### F-027 — Project replacement must clear generated object URLs

- **Date:** 2026-08-22
- **Context:** TRUSS-018 browser reopen of generated structural projects.
- **Symptom:** In-memory URLs from project A could override the same structural
  paths imported with project B and cause false SHA-256 failures. The old URLs
  also stayed allocated until another generation run.
- **Cause:** Portable-bundle replacement disposed only portable URLs. The
  structural loader merged still-live generated URLs after the new bundle URLs.
- **Correction:** Revoke and clear every generated URL before a local, remote,
  folder, or ZIP project replaces the active project.
- **Prevention:** Treat object URLs as project-owned resources. Dispose all URL
  namespaces at the same project-replacement boundary, and test two projects
  that use the same asset path with different verified bytes.
- **Evidence:** `tests/browser/structural-generation.spec.ts` changes a
  same-path report and its manifest hash before ZIP reopen.
- **Status:** Resolved.

### F-028 — 3MF placement must use exported vertex precision

- **Date:** 2026-08-22
- **Context:** TRUSS-019 structural trial at translated arbitrary world poses.
- **Symptom:** A valid analyzed mesh failed its 3MF positive-octant check by a
  few micrometres after vertex serialization.
- **Cause:** The build translation came from Manifold's bounding box, while the
  3MF coordinates came from Float32 mesh vertices. Their rounded minima could
  differ.
- **Correction:** Calculate the shared 3MF translation from the exact mesh
  vertex values that the exporter serializes.
- **Prevention:** Derive format-level bounds and transforms from the format's
  actual coordinate precision, not a higher-precision upstream summary.
- **Evidence:** The translated `structural-two-panel-spatial-trial` headless and
  browser generation checks.
- **Status:** Resolved.

### F-029 — Browser generation must not depend on a loopback-only service

- **Date:** 2026-08-22
- **Context:** TRUSS-020 LAN review of the two-panel structural trial.
- **Symptom:** The browser received HTTP 403 from `/api/generator-status`, and
  the structural generation button did nothing because it was disabled.
- **Cause:** The in-browser structural action was gated by the status of an
  optional file-writing service that deliberately accepts loopback requests
  only.
- **Correction:** Keep browser-native structural generation independent of the
  service status, and skip the service request on non-loopback browser hosts.
- **Prevention:** Treat browser Manifold execution and the loopback file-writing
  fallback as separate capabilities. Test LAN-host discovery without a fetch.
- **Evidence:** `tests/generator-status.test.ts` and the structural browser
  journey.
- **Status:** Resolved.

### F-030 — Start a LAN preview only after final asset staging

- **Date:** 2026-08-22
- **Context:** TRUSS-020 LAN preview restart in a host with concurrent agent
  worktrees.
- **Symptom:** One preview reached an older worktree on port 4175. After moving
  to port 4181, the registry loaded but the selected sculpture returned Vite's
  HTML fallback and failed JSON parsing with `Unexpected token '<'`.
- **Cause:** An older host process already owned port 4175. On port 4181, a
  commit hook restaged and recreated nested `web/public` directories after Vite
  started, so the running server did not serve the recreated nested assets.
- **Correction:** Preserve the unrelated process, select unused port 4181,
  complete staging first, restart Vite, and verify the page plus every JSON
  dependency used by the trial.
- **Prevention:** Start or restart Vite only after the last build, commit hook,
  or staging command. Before sharing a LAN URL, check the status and content
  type of the registry, exact sculpture, and referenced panel profile. A Vite
  ready message or page-only HTTP 200 is insufficient.
- **Evidence:** After the post-staging restart, port 4181 returns HTTP 200 with
  `application/json` for the registry, two-panel fixture, and panel profile.
- **Status:** Resolved.

### F-031 — The truss model must not use unprinted panel interfaces

- **Date:** 2026-08-22
- **Context:** TRUSS-022 through TRUSS-024 modular panel-pair connectors.
- **Symptom:** The first local-cell model distributed panel loads and supports
  through every eligible hole, but CAD printed only the anchors reserved by a
  connector cell. Analysis-only panel ties also counted as printed mass and
  member self-weight.
- **Cause:** Candidate anchor discovery, panel-rigidity approximation, and
  printable bracket ownership did not have an explicit interface boundary.
- **Correction:** Keep load and support hubs only for anchors reserved by a
  printable connector. Require an authored individual support anchor to be
  reserved, constrain panel supports through the active bracket interface, and
  mark PCB-rigidity members as analysis-only with zero print mass/self-weight.
- **Prevention:** Every external solver load or constraint must resolve to a
  printed interface. Every non-printed stiffness element must have explicit
  analysis-only provenance and must not enter fabrication material totals.
- **Evidence:** Candidate, solver, optimizer, structural pipeline, solid, and
  independent-review checks cover active anchors and analysis-only members.
- **Status:** Resolved.

### F-032 — Apply exact hardware voids after implicit blending

- **Date:** 2026-08-22
- **Context:** TRUSS-026 through TRUSS-029 cap-derived implicit connectors.
- **Symptom:** A pilot or nut-path probe could remain inside material after the
  implicit envelope grew past the former bracket surface.
- **Cause:** Cutters sized for an explicit bracket did not extend through the
  additional signed-distance blend around the load-path skeleton.
- **Correction:** Build and unite the complete body first. Then apply pilot,
  lead-in, nut-pocket, cable, and orientation operations. Open a shallow nut
  pocket with a separate lateral insertion slot; do not extend its depth axis.
- **Prevention:** Probe every required hardware void in the final solid, not
  only in an intermediate shoe. Also probe material immediately beyond a
  depth-limited pocket. Keep exact functional depth separate from lateral
  access travel.
- **Evidence:** Structural-solid tests probe all pilots, nut pockets, cable
  voids, and material beyond the configured pocket depth.
- **Status:** Resolved.

### F-033 — A surface loft must leave each PCB along its rear normal

- **Date:** 2026-08-22
- **Context:** TRUSS-030 cap-surface lofts between arbitrarily oriented panels.
- **Symptom:** A direct linear loft passed the two-panel solid tests but entered
  the target PCB envelope in the three-panel spatial trail.
- **Cause:** Straight interpolation between differently oriented shoe profiles
  can approach an end profile through the PCB plane. Valid end sections alone
  do not make the volume between them PCB-safe.
- **Correction:** Use a cubic center path with control points behind both
  panels. The loft leaves and approaches each screw shoe along that panel's
  rear normal before it bends across the gap.
- **Prevention:** Test a sharply turned multi-panel trail and intersect the
  complete final loft with every oriented PCB envelope. Do not validate only
  the endpoint shoes or a near-coplanar two-panel fixture.
- **Evidence:** The spatial-trail Chromium generation now emits two loft bodies
  with no PCB collision; focused solid tests retain the explicit collision
  rejection case.
- **Status:** Resolved.

### F-034 — Dispose partial Manifold lofts at the function that owns them

- **Date:** 2026-08-22
- **Context:** Independent review of TRUSS-030 multi-station loft generation.
- **Symptom:** A failed pad, second section, or later station could leave prior
  Manifold objects outside the outer generator cleanup lists.
- **Cause:** Nested constructors accumulated temporary pads, sections, and loft
  segments locally, but only the completed top-level solids had outer ownership.
- **Correction:** Each nested construction function now disposes every local
  object on failure. Successful hull operations consume and dispose their exact
  input arrays before ownership moves to the caller.
- **Prevention:** Give every WASM object one explicit owner immediately. A
  function that accumulates objects before it can return must clean its partial
  collection in its own failure path.
- **Evidence:** Independent re-review confirmed pad, section, and accumulated
  segment cleanup with no remaining P1/P2 finding.
- **Status:** Resolved.

### F-035 — Advisory truss convergence must not gate ribbon fabrication

- **Date:** 2026-08-22
- **Context:** Operator testing of arbitrary layouts after TRUSS-030.
- **Symptom:** Valid nearest-hole ribbons were blocked by residual-tolerance
  errors or displacement utilization above one, although their shape did not
  use optimized circular member sections.
- **Cause:** The pipeline retained the earlier rod/strut dependency in which a
  converged optimization authorized CAD. The later loft architecture made that
  dependency false but did not remove the gate.
- **Correction:** Generate ribbon CAD directly from validated candidate panel
  pairs and anchors. Run optimization as an advisory branch. Store singular,
  numerical, infeasible, and iteration-limit outcomes as prominent report and
  analysis diagnostics without fabricating member-result claims.
- **Prevention:** A stage can gate fabrication only when its result changes or
  validates the fabricated geometry. Test identical ribbon meshes across
  converged and failed advisory-analysis states.
- **Evidence:** Pipeline tests cover converged, singular, numerical-residual,
  and displacement-infeasible states; all produce the same ribbon mesh while
  failed analysis remains explicit.
- **Status:** Resolved.

### F-036 — Graph connectivity is not sufficient evidence for a printable junction

- **Date:** 2026-08-22
- **Context:** TRUSS-032 local merges for three or more nearby panels.
- **Symptom:** Treating every connected pair cell as one junction would turn a
  long panel trail into one sculpture-sized printed part.
- **Cause:** A graph records load-path adjacency but does not record whether two
  connection regions occupy the same physical gap.
- **Correction:** Compare pose-derived nearest-hole connection-region centers.
  Group only pair cells that share a panel and fall inside the documented local
  distance. Require at least three panels and share anchors only within that
  group.
- **Prevention:** Every multi-cell merge needs a spatial-locality test and a
  negative trail fixture. Do not infer printable part boundaries from graph
  connectivity alone.
- **Evidence:** Candidate and solid tests distinguish one three-panel junction
  from two independent three-panel-trail ribbons.
- **Status:** Resolved.

### F-037 — Manifold Boolean slivers must be simplified before mesh rejection

- **Date:** 2026-08-23
- **Context:** Complex arbitrary-pose ribbon and multi-panel junction output.
- **Symptom:** Valid `NoError` Manifold solids failed with “contains a
  degenerate triangle” on complex panel sets.
- **Cause:** Overlapping loft Boolean operations produced extremely thin faces.
  One reproduced doubled area was `8.23e-11 mm²`: nonzero, but below the fixed
  mesh gate. A Manifold round trip alone did not remove the sliver.
- **Correction:** Simplify each completed printable component with a documented
  0.001 mm tolerance before extracting and validating its mesh. Keep the strict
  triangle, topology, hardware-void, PCB, and print-envelope checks after this
  operation.
- **Prevention:** Run printable generation across the complete arbitrary-pose
  41-panel project, not only small fixtures. Treat Boolean cleanup as a final
  solid operation and keep its tolerance far below functional dimensions.
- **Evidence:** The 40-cell complex fixture now returns 37 valid printable
  parts. Its regression checks every exported triangle above the gate; focused
  hardware-void, STL, 3MF, and pipeline tests also pass.
- **Status:** Resolved.

### F-038 — Analysis clearances must not become unrequested ribbon holes

- **Date:** 2026-08-23
- **Context:** Visual review of arbitrary-pose cap-surface ribbons.
- **Symptom:** Hexagonal pockets and their lateral tunnels intersected the
  screw paths, and DIN/DOUT clearance cylinders made round holes in the ribbon.
- **Cause:** Early bracket-and-strut hardware features were carried into the
  later one-piece loft geometry although the ribbon requires only screw holes.
- **Correction:** Subtract only corrected screw pilots and lead-ins from ribbon
  solids. Keep DIN/DOUT locations for cable-load analysis without CAD bores.
- **Prevention:** Treat analysis load points and fabrication voids as separate
  contracts. A ribbon-hole regression must require empty nut/cable void sets.
- **Evidence:** `tests/structural-solids.test.ts`, the two-panel generated STL,
  and the real-browser generation journey.
- **Status:** Resolved.

### F-039 — Engraving must target a guaranteed boundary plane

- **Date:** 2026-08-23
- **Context:** TRUSS-033 arbitrary-pose ribbon labels.
- **Symptom:** A label cutter intersected material but produced no visible text;
  its probe remained solid.
- **Cause:** The nominal rear shoe plane was enclosed by the hull toward the
  next loft station, so subtraction made an internal cavity. Export rounding
  also collapsed some engraving triangles only after Float32 conversion.
- **Correction:** Engrave the guaranteed-flat panel-facing endpoint plane.
  Round labeled solids to exported Float32 coordinates, set the existing 0.001
  mm tolerance, simplify, and then apply the strict triangle gate.
- **Prevention:** A label test must probe the recess and material below it; an
  isolated exact-STL render must show readable surface text. Validate the same
  coordinate precision that export uses.
- **Evidence:** `tests/structural-solids.test.ts` and the isolated two-panel STL
  render.
- **Status:** Resolved.

### F-040 — Coplanar full-edge stations can export zero-area triangles

- **Date:** 2026-08-24
- **Context:** TRUSS-034 full-edge LED-surface bridges.
- **Symptom:** A valid parallel-panel Manifold solid exported a triangle whose
  three vertices were exactly collinear on the flat bridge back face.
- **Cause:** Complete, parallel 65 mm edges produced coplanar ruled stations,
  and a fixture apron ended exactly on the bridge top and back faces. Boolean
  tessellation kept redundant collinear vertices at that coincident transition
  even after the standard tolerance and simplification pass.
- **Correction:** Add a deterministic 0.02 mm sinusoidal crown only inside the
  bridge and recess fixture aprons 0.03 mm into the sheet so they overlap in
  volume instead of sharing a face. Keep the endpoint ridges exactly on the
  profile LED planes. Apply the strict Float32 triangle gate after the crown
  and Manifold cleanup.
- **Prevention:** Surface-bridge tests must include parallel, orthogonal,
  arbitrary, local-junction, and long-trail layouts. Do not use only visibly
  twisted examples to validate ruled-surface tessellation.
- **Evidence:** `tests/structural-solids.test.ts` covers parallel, reversed,
  orthogonal, two reproduced close arbitrary poses, local-junction, and
  long-trail layouts and checks the exact exported meshes.
- **Status:** Resolved.

### F-041 — Edge-wrap fixtures must clear every nearby PCB

- **Date:** 2026-08-24
- **Context:** TRUSS-034 screw fixtures that wrap from the rear shoe to the
  front LED-plane ridge.
- **Symptom:** A valid three-panel local junction put part of one panel's broad
  wrap diaphragm into a differently oriented neighboring PCB envelope.
- **Cause:** A fixture can remain behind its own PCB but enter another close
  panel when the panels meet at an arbitrary angle.
- **Correction:** Trim the completed positive sheet and fixture union against
  every PCB envelope with 0.15 mm clearance, discard only isolated trim chips
  below 2 mm3, and then repeat the exact PCB collision and one-component
  checks. Do not reject the untrimmed intermediate sheet.
- **Prevention:** Validate fixtures against all normalized panels, not only the
  two panels owned by their connector cell. Keep PCB trimming separate from
  screw, label, cable, and hardware void semantics.
- **Evidence:** The exact formerly rejected two-panel pose, local three-panel
  junction, trail, and twelve-panel spiral Manifold regressions pass.
- **Status:** Resolved.

### F-042 — TransformControls does not cancel a drag on pointer cancellation

- **Date:** 2026-08-24
- **Context:** TRUSS-035 free 3D panel gizmos on touch and pointer devices.
- **Symptom:** A cancelled gizmo drag could leave the preview uncommitted,
  OrbitControls disabled, and the transform control in its dragging state.
- **Cause:** Three.js `TransformControls` listens for pointer down, move, and up
  but does not register a pointer-cancel listener. Its temporary move listener
  and drag state therefore survive a browser cancellation unless the host
  handles it.
- **Correction:** On pointer cancellation, reset the attached object to its
  drag-start transform, end the transform without a commit, reconnect the
  control to remove its temporary listener, and restore camera controls. Keep
  TransformControls listeners before editor listeners after reconnection.
- **Prevention:** Every pointer-driven editor control must define commit and
  cancel paths. A cancel must restore both model preview and control state; a
  pointer-up-only implementation is incomplete.
- **Evidence:** `web/src/SurfacePlacementController.ts`, focused editor tests,
  Chromium editor journey, and independent TRUSS-035 review.
- **Status:** Resolved.

### F-043 — Asset staging can race a live Vite review page

- **Date:** 2026-08-24
- **Context:** TRUSS-035 verification while the LAN review server remained
  open for operator testing.
- **Symptom:** The browser reported `Unexpected token '<'` while parsing JSON;
  Vite had returned its HTML fallback for the sculpture manifest.
- **Cause:** `npm run verify` runs the staging script, which removes and copies
  `web/public/sculptures`. A live page can reload during that short replacement
  interval and request `sculptures/manifest.json` before it is restored.
- **Correction:** Finish staging and verification before starting the review
  server. If staging ran while Vite was live, restart Vite; its static-file
  middleware can keep returning the HTML fallback even after the files exist
  again. Then check the manifest, default sculpture, panel profile,
  generator-status, JavaScript, and WASM routes on the actual review port.
- **Prevention:** Do not treat a live Vite server as stable while asset staging
  is active. Start it after verification when practical, or validate all review
  endpoints again before telling the operator to test.
- **Evidence:** Before restart, the restored default sculpture and panel-profile
  files existed on disk but returned `text/html`. After restart, host requests
  to all six review endpoints returned HTTP 200 with their correct content
  types.
- **Status:** Mitigated.
