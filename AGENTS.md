# Codex project guide

This repository is a pose-first editor and fabrication toolkit for panel-based
LED sculptures. The browser application is **WLED Orbital Lab**. Start with
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); use
[`docs/PANEL_SYSTEM.md`](docs/PANEL_SYSTEM.md) for geometry work and
[`docs/LED_MAPPING.md`](docs/LED_MAPPING.md) for addressing or wiring work.
To establish this workflow in another repository, follow
[`docs/AGENTIC_WORKFLOW_BOOTSTRAP.md`](docs/AGENTIC_WORKFLOW_BOOTSTRAP.md).

## Sources of truth

- Authored projects: `sculptures/*/sculpture.json` (active format: Schema 2).
- Reusable PCB facts: `catalog/panels/ws2812b-8x8-66x65.json`.
- Runtime Schema 2 contract and mapping compiler: `src/sculpture/PanelAssembly.ts`.
- Editor mutations and mechanical invalidation: `src/sculpture/SculptureEditor.ts`.
- Browser orchestration: `web/src/main.ts`; mapping and wiring are under
  `web/src/`.
- Physically tested manual CAD: the three canonical files under `parts/`.
  Never make numbered copies; Git is the version history.
- Generated STL, PNG, ledmap, panel-map, and `build/` files are artifacts, not
  authored geometry or mapping truth. The portable project format may reference
  GLB/STL assets by safe relative path and SHA-256; those files are still
  derived assets, while the main sculpture JSON remains the project authority.
- `web/public/wasm/wled-engine.js`, `wled-engine.wasm`, and the three native
  files under `toolchains/bootstrap/bin/` are deliberate tracked-build
  exceptions. The WASM files make ordinary tests and the viewer work directly
  after checkout. The bootstrap files supply the approved Linux/macOS trust
  root. Rebuild and recommit an artifact whenever its pinned source or compiler
  changes, and keep its checksum and build receipt synchronized.

Schema 1 (`src/sculpture/Definition.ts`, `schemas/sculpture.schema.json`, the
legacy migration fixture, and old mapping/CAD tests) is retained legacy code.
Do not build new features on it. The current browser path loads Schema 2 and
uses `createPanelAssemblyMapping()`.

## Architectural guardrails

- Panel poses are authoritative. A mechanical face, GLB, or surface attachment
  may constrain editing but must not silently replace a saved pose.
- Mapping, wiring, and simulation must continue after a panel edit even when
  printable mechanics are stale or unavailable.
- Keep the primary operator workflow state-aware and artifact-complete. Prefer
  one action that changes from build to download over separate sequential
  buttons, and keep raw/debug exports under Advanced when one self-contained
  project or assembly package is the normal handoff.
- Schema 2 mechanics are optional. Omitting `manualMechanics`,
  `mechanicalShell`, and `closures` is the implemented mechanics-free state:
  load GLB, place/edit panels, simulate, map, wire, save, and reload before any
  mechanics exist.
- GLBs are authoring surfaces only. The general generator starts from
  authoritative panel outlines, closes each gap with a validated flat N-gon,
  builds a closed boundary, and only then creates printable parts. It does not
  turn arbitrary GLB triangles directly into printable material.
- The first boundary generator supports layouts in which every cap is a flat
  simple N-gon. It validates planarity, topology, winding, intersections, and
  manifold closure and rejects invalid layouts clearly.
- After successful generation, the viewer loads the exact referenced STL parts.
  A panel edit makes those parts stale without disabling the rest of the
  interface. See `docs/MECHANICS_WORKFLOW.md`.
- Preserve manual mechanics. The generic planar generator does not reproduce
  the 41-panel U-frame structure.
- Never change proven panel angles, triangle handedness `-1`, the 0.20 mm
  hole-edge correction, or the 0.50 mm surface-flush correction without an
  explicit new physical result.
- Printable material must not intersect PCB envelopes or obstruct DIN, DOUT,
  V+, or V-. Keep centre structures within the pentagon boundary and outside
  filler surfaces flat-printable.
- The saved route, GPIOs, snake pixel order, RGB color order, and optimized
  installed quarter turns are authorized assumptions. They make the current
  simulator-to-controller mapping ready, but they are not measured facts and
  do not make the complete sculpture electrically ready.
- Use the saved route and generated mapping artifacts for staged physical
  assembly only when their fingerprints match the current project. A pose,
  route, panel-set, profile, or bus edit requires regeneration.
- Printable assembly manuals may use the current automatic draft route when no
  authored route exists. Such a manual must say **DRAFT SUGGESTION**, show
  unknown GPIOs as unassigned, describe current non-optimized panel turns as
  assumptions, and never claim mapping readiness.
- Address parity requires the same authored route, panel addressing, WLED bus
  configuration, RGB order, GPIOs, and deployment identity. Optional device
  evidence is separate from mapping readiness.
- Keep installed address calibration separate from the pose. The pose owns LED
  world positions; a measured back-view quarter-turn/mirror transform may change
  local wire indexing only. Do not reuse an ambiguous mechanical rotation or
  WLED bus reversal as a second addressing authority.
- Do not energize the complete 41-panel sculpture before the power domains,
  injection branches, wire sizes, fuses, voltage drop, and maximum operating
  current pass `PWR-010`. WLED current limiting is secondary protection.
- Do not claim firmware, DDP, Art-Net, networking, Ethernet, or audio-reactive
  behavior: `firmware/` contains instructions only and the browser runs a small
  WLED effect simulator.

## Working safely

- Preserve user changes and comments recording print tests or fit corrections.
- Keep geometry changes small and state their mechanical intent.
- Do not refactor production code during documentation-only work.
- Update the knowledge pages when architecture, invariants, or project status
  changes; avoid chat-history handovers as the only record.
- Use ASD-STE100 simplified technical English for all operator-facing updates,
  questions, and handoffs.
- Record each reusable failure and its verified solution in `FAILURES.md`.
  Promote recurring prevention rules into `AGENTS.md` or the relevant knowledge
  page. Reuse the recorded solution; do not repeat the failed discovery process.
- Treat delivery cleanup as part of every successfully completed task; the
  operator must not need to request it again. After a scoped change is clean and
  verified, commit it on its task branch, push that branch when permitted, and
  move the task to **Ready to Merge**. Do not merge or fast-forward into `main`
  without an explicit operator request. After an authorized integration push
  succeeds, remove any temporary task worktree, delete its merged local task
  branch, and delete a remote task branch only when this task created it and
  repository policy does not require it to remain. If the work ran in a
  separate agent, task, or thread, archive or close it after its handoff is
  captured and its result is integrated.
- Before cleanup, verify that the task worktree is clean, the task branch is
  merged into the intended base, and the integrated commit is present on the
  destination remote. Never delete a dirty worktree, an unmerged branch, another
  task's branch or worktree, or the only copy of useful agent output. Respect
  required approval gates. Never force-push, overwrite unrelated work, or bypass
  a remote-write restriction.
- If a push is blocked because the destination is not verified, report the
  exact commit, ref, and remote URL. Get explicit operator approval, then repeat
  the same push. Do not use an indirect push method.
- `npm run verify` requires the pinned WLED submodule and Emscripten SDK. If it
  reports that either is unavailable, run the applicable setup command or use
  `npm run verify:clean` for the complete clean-checkout path.
- Use the normal repository `apply_patch` helper for file edits first. In this
  Codex environment it can fail with `fs sandbox helper failed` / `bwrap: No
  permissions to create a new namespace` even though approved shell commands
  still work. When that exact failure occurs, use an exact unified diff with
  `git apply --unidiff-zero` as the established fallback. For a newly created
  untracked file, temporarily stage only that exact path so Git has a patch
  base, apply the diff, then immediately run `git restore --staged <path>` and
  verify that no unrelated path was staged. The standalone `patch` utility is
  not installed in the current environment. Do not stop to rediscover or
  discuss this known workaround unless it also fails.
  When the empty new path is staged, generate the fallback diff from that path
  to the intended content, not from `/dev/null`; a new-file patch cannot replace
  an already present empty working-tree path.
- Before a line-number-only `git apply --unidiff-zero` fallback in a shared
  worktree, read the exact target again. Prefer context hunks when possible.
  Another agent can change line numbers between inspection and application.

- This Codex host has neither Python `yaml`/PyYAML nor Ruby. To validate an
  edited GitHub Actions workflow, run
  `npx --yes yaml-lint .github/workflows/render.yml`. This transient Node-based
  fallback is verified in this environment; do not repeat the missing-parser
  checks.
- `npx tsx -e` compiles evaluation input as CommonJS and cannot directly import
  a TypeScript script that has top-level `await`. For a direct ESM import check,
  use `node --import tsx --input-type=module -e '...'` instead.
- When an `rg` pattern contains Markdown backticks, put the complete shell
  argument in single quotes. Backticks inside double quotes execute as command
  substitutions and can produce false tool failures.
- Windows PowerShell verification must call npm through `npm.cmd`; do not rely
  on the `npm.ps1` shim or its execution policy. Clean checks clear `PATH`, so
  required Windows system tools must use validated absolute paths such as
  `%SystemRoot%\System32\taskkill.exe` with argument arrays and no shell.
- Do not assume that a repository-local GitHub CLI exists under `.tools`. For
  this public repository, use the public GitHub Actions REST API with `curl`
  when `gh` is absent, and parse the saved JSON response with Node.js.
- In Playwright portable-project tests, assert handled import failures in
  `#pipeline-status`; the animation loop can clear `#viewer-error`, and startup
  generator discovery can replace a pipeline message. Use domain-specific
  surface, mapping, asset, and control states for successful import waits.
- WLED engine readiness is not complete editor readiness. Before portable file
  operations, wait for the initial surface state that is set after generator
  discovery and project restoration finish.
- Do not delete a panel that stored `boundaryTopology` still references only to
  make generated mechanics stale in a test. Use a valid pose change or additive
  placement that preserves the saved corner-cycle references.
- Browser and CI tests must not use ignored generated preview output as fixture
  input. Confirm static fixtures are tracked, or build derived fixtures from
  tracked authored sources under the test output directory.
- Do not run `stage:sculptures` while a Vite preview is active. Stop the
  preview before browser tests too, because their web server stages the same
  files. Stage once after all checks, restart the preview, and verify every
  registry source returns JSON. Replacing the public sculpture directory under
  a live Vite process can leave HTTP 200 HTML history fallbacks cached for valid
  JSON paths.

- On the macOS GitHub runners, `lipo -verify_arch` returned a false failure for
  the qualified universal OpenSCAD DMG. Do not use that command as the native
  execution gate. Keep `lipo -archs` as evidence, then use
  `/usr/bin/arch -<architecture>` to run the exact version check and a real STL
  render on each native runner. GitHub Bash steps also start with `-e`; a
  diagnostic collector that must record all failures must use `set +e` first.
- On macOS, do not test `hdiutil` or `ditto` availability by running a help
  command. `ditto -h` can return a nonzero usage status. Use a direct executable
  access check such as Node `fs.access(path, X_OK)` before repository writes.

## Agentic workflow

### Shared repository and model routing

- Assume that Codex, Grok, and other agents can work concurrently. Never
  discard unfamiliar changes or assume exclusive ownership of a branch,
  worktree, file, or remote ref.
- Use `main` only as the integration baseline. Give each substantial
  implementation slice its own branch and worktree. Record that ownership and
  likely file conflicts in `TASKS.md` before code changes start. Run npm, Git
  writes, and tests with that worktree as the explicit working directory.
- Never force-push, reset shared history, delete another agent's branch or
  worktree, or merge into `main` without explicit operator authorization.
- Use GPT-5.6 Luna for bounded inspection, test execution, log review,
  mechanical edits, and first-pass review. Use GPT-5.6 Terra for normal
  implementation and medium-complexity debugging. Reserve GPT-5.6 Sol for
  orchestration, architecture, hard debugging, high-risk refactors,
  geometry, and final review where correctness needs it.
- Parallelize only independent seams. Do not assign concurrent edits to the
  same file or subsystem unless one orchestrator coordinates the overlap.
- Require a separate review pass before an implementation task can become
  **Ready to Merge**. Agent reports are inputs to that review, not proof that
  the integrated worktree is correct.

An agent assigned as orchestrator owns the result end to end. It may divide the
work, but it remains responsible for scope, architectural consistency,
integration, verification, and the final report. Use this operating loop:

1. **Orient.** Read this file, `docs/ARCHITECTURE.md`, `TASKS.md`, and
   `FAILURES.md`, then the domain guide named at the top of this file. Inspect
   `git status` and the relevant code before proposing changes. Treat existing
   worktree changes as user-owned unless the task proves otherwise.
2. **Frame the outcome.** Turn the request into explicit acceptance criteria,
   identify the source-of-truth files and guardrails involved, and choose the
   narrowest meaningful verification. Reconcile the work with `TASKS.md`,
   record a short plan for work with more than one substantive step, and keep
   both current.
3. **Split only clean seams.** When agent delegation is available and allowed,
   delegate only bounded, independently checkable work. Give each agent the
   relevant paths, constraints, expected output, and verification target.
   Avoid concurrent edits to the same file; the orchestrator owns shared files
   and final integration. Keep the critical path moving locally while agents
   work.
4. **Integrate deliberately.** Agent reports are evidence, not acceptance.
   Review their diffs and assumptions, reconcile them with the architecture,
   run the required checks in the integrated worktree, and correct any overlap
   or drift. Never claim a delegated result that the orchestrator has not
   inspected.
5. **Learn while working.** When a mistake, failed assumption, tool failure, or
   user correction yields a reusable lesson, add or update an entry in
   `FAILURES.md` during the same task. Fix the underlying workflow or canonical
   guidance as well when practical; the log is not a substitute for a fix.
6. **Close the loop.** Review the final diff for accidental changes, verify the
   acceptance criteria, commit and push the task branch when permitted, then
   move the task to **Ready to Merge**. Integrate into `main` only after an
   explicit operator request. After integration, safely clean up the task
   branch, worktree, and separate agent or thread as required by **Working
   safely**. Report what changed, what was tested, the task commit, and any
   remaining uncertainty. Do not describe a partial or unverified result as
   complete.

Delegated agents should return a compact handoff containing changed files,
checks run and their results, assumptions or unresolved risks, and any proposed
`FAILURES.md` lesson. If an agent is blocked, it should report the exact blocker
and useful evidence rather than expanding scope on its own.

### Failure-learning discipline

Log incidents that can prevent future wasted work: incorrect architectural or
environment assumptions, changes that caused a regression, missed constraints,
integration collisions, misleading verification, repeated tool failures, and
user corrections. Do not log ordinary exploration, transient errors with no
reusable lesson, secrets, blame, or large raw command output. Prefer one updated
entry over duplicates, link to durable evidence where available, and turn a
recurring lesson into a rule or automated check.

## Verification

Use the narrowest relevant checks, then broaden when risk warrants it:

```bash
npm test                         # all Vitest tests; uses the checked-in WASM runtime
npm run test:editor
npm run test:placement
npm run test:full                # builds WASM with the installed pinned SDK, then tests
npm run verify                   # assets, WASM, Vitest, TypeScript, and Vite
npm run verify:clean             # submodule, npm ci, pinned SDK, then npm run verify
```

After generic geometry changes, compile the changed printable parts with
Manifold and inspect the STLs. Confirm holes, PCB poses, panel angles,
envelopes, connector corners, and flat print surfaces. For changes to the
physically tested manual `parts/*.scad` route, render every changed part with
OpenSCAD and inspect the assembly mode where provided.

For a phone review link, run `npm run preview:phone` from the repository root.
It creates a temporary Cloudflare quick-tunnel URL and verifies the public HTML,
sculpture JSON, JavaScript, and WLED WASM endpoints. Call it a review link, not a
deployment; do not substitute a `localhost` URL.
