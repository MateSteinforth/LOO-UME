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
  surface/mapping/control state for success, prove content hashes once, and use
  automatic additive placement to make the generated mechanics stale validly.
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

### F-014 — Relative `rm` follows the session cwd, not the claimed worktree

- **Date:** 2026-08-20
- **Context:** CAD-036 removal of OpenSCAD tests from `grok/workspace` while
  the session cwd was the Codex worktree.
- **Symptom:** `rm -f tests/open-scad-*.test.ts tests/setup-openscad-*.test.ts`
  deleted Codex files and left the Grok copies in place.
- **Cause:** The command used relative paths without `cd` to the claimed
  worktree.
- **Correction:** Restore the four Codex test files with `git restore`. Delete
  the same paths under `/home/mate/Documents/led-rhombicosidodecahedron-grok`.
- **Prevention:** For every write, delete, or git mutation, use the claimed
  worktree as an absolute path or `cd` into it first. Confirm Codex
  `git status` after a path mistake.
- **Evidence:** F-013 and the restored Codex OpenSCAD tests.
- **Status:** Resolved.

### F-013 — npm install follows the session cwd, not the task worktree

- **Date:** 2026-08-20
- **Context:** CAD-030 pin of `manifold-3d` while Grok's session root was the
  Codex reconstruction worktree.
- **Symptom:** `npm install manifold-3d@3.5.1` changed `package.json` and
  `package-lock.json` in `/home/mate/Documents/led-rhombicosidodecahedron`.
- **Cause:** The command ran without an explicit working directory in the
  isolated CAD-030 worktree.
- **Correction:** Restore the two tracked files in the Codex worktree. Repeat
  the install in `/home/mate/Documents/led-rhombicosidodecahedron-grok-cad-030`
  with Node 22+.
- **Prevention:** For every npm/git write, set the command cwd to the claimed
  task worktree. Confirm `git status` in the other agents' worktrees after a
  path mistake.
- **Evidence:** CAD-030 worktree path and the restored Codex `git status`.
- **Status:** Resolved.
