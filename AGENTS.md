# Codex project guide

This repository is a pose-first editor and fabrication toolkit for panel-based
LED sculptures. The browser application is **LOO/UME**, a generative sculpture
compiler. Start with
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); use
[`docs/PANEL_SYSTEM.md`](docs/PANEL_SYSTEM.md) for geometry work and
[`docs/LED_MAPPING.md`](docs/LED_MAPPING.md) for addressing or wiring work.
To establish this workflow in another repository, follow
[`docs/AGENTIC_WORKFLOW_BOOTSTRAP.md`](docs/AGENTIC_WORKFLOW_BOOTSTRAP.md).

## Sources of truth

- Authored projects: `sculptures/*/sculpture.json` (active format: Schema 2).
- Reusable PCB facts: `catalog/panels/ws2812b-8x8-66x65.json`.
- Carrier kinds, validation, and rigid-tool capability gates:
  `src/sculpture/PanelCarrier.ts`; browser carrier geometry is derived in
  `web/src/PanelCarrierGeometry.ts`.
- Runtime Schema 2 contract and mapping compiler: `src/sculpture/PanelAssembly.ts`.
- Structural input, normalization, warnings, and fingerprints:
  `src/sculpture/StructuralDesign.ts`.
- Generic printable-part compiler: `src/cad/CompilePanelBoundaryBundle.ts`,
  `src/cad/GeneratePanelClosureSolids.ts`, and pinned `manifold-3d` 3.5.1.
- Structural analysis and printable connector compilation:
  `src/structure/StructuralPipeline.ts` and
  `src/cad/CompileStructuralArtifacts.ts`.
- Editor mutations and mechanical invalidation: `src/sculpture/SculptureEditor.ts`.
- Browser orchestration: `web/src/main.ts`; mapping and wiring are under
  `web/src/`.
- Printable geometry: panel poses and the panel profile compile through pinned
  `manifold-3d` in `src/cad/CompilePanelBoundaryBundle.ts` and
  `src/cad/GeneratePanelClosureSolids.ts`.
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
- `./bootstrap.sh setup` is the supported clean-checkout path on Linux x86-64
  and macOS. It uses `toolchains/bootstrap/install-manifest.json` to install
  pinned Node/npm below `.tools/`, then builds and verifies the desktop and
  Manifold path without administrator access or a global Node installation.
- When the pinned Node archive changes, keep `bin/node` and the real npm/npx
  CLI target files in the manifest executable list. Safe extraction normalizes
  regular-file modes; listing only the npm symlinks leaves nested npm commands
  unable to run.

Schema 2 is the only active sculpture format. `src/sculpture/Definition.ts`
retains shared panel-profile and wiring types plus profile validation; sculpture
loading and mapping use `PanelAssembly.ts` and `createPanelAssemblyMapping()`.
Historical Schema 1 inputs are available only through Git history.

## Architectural guardrails

- Panel poses are authoritative. A mechanical face, GLB, or surface attachment
  may constrain editing but must not silently replace a saved pose.
- Mapping, wiring, and simulation must continue after a panel edit even when
  printable mechanics are stale or unavailable.
- Keep emitter/address geometry separate from carrier display geometry and
  fabrication capability. Missing carrier data means the legacy rigid
  rectangle. Planar outlines and flexible paths may map, wire, simulate, and
  configure WLED, but must not enter rectangle-only placement or CAD paths.
- Keep the primary operator workflow state-aware and artifact-complete. Prefer
  one action that changes from build to download over separate sequential
  buttons, and keep raw/debug exports under Advanced when one self-contained
  project or assembly package is the normal handoff.
- Present operator areas as always-editable capability toolboxes, not numbered
  gates. A profile can disable an unsupported placement or fabrication action,
  but it must not block independent mapping, simulation, hardware, or export.
- Schema 2 mechanics are optional. Omitting `mechanicalShell` and `closures`
  is the implemented mechanics-free state:
  load GLB, place/edit panels, simulate, map, wire, save, and reload before any
  mechanics exist.
- GLBs are authoring surfaces only. The planar closure generator starts from
  authoritative panel outlines, closes each gap with a validated flat N-gon,
  builds a closed boundary, and only then creates printable parts. It does not
  turn arbitrary GLB triangles directly into printable material.
- The structural route also ignores GLB triangles. It starts from every
  mechanically eligible profile hole transformed by the authoritative panel
  pose. Blocked DIN/DOUT holes are never structural anchors.
- The first boundary generator supports layouts in which every cap is a flat
  simple N-gon. It validates planarity, topology, winding, intersections, and
  manifold closure and rejects invalid layouts clearly.
- All printable parts use Manifold in Node or directly in the browser. Do not
  restore an OpenSCAD route.
- After successful generation, the viewer loads the exact referenced STL parts.
  A panel edit makes those parts stale without disabling the rest of the
  interface. See `docs/MECHANICS_WORKFLOW.md`.
- Never change proven panel angles, triangle handedness `-1`, the 0.20 mm
  hole-edge correction, or the 0.50 mm surface-flush correction without an
  explicit new physical result.
- Printable material must not intersect PCB envelopes or obstruct DIN, DOUT,
  V+, or V-. Keep centre structures within the pentagon boundary and outside
  filler surfaces flat-printable.
- Structural analysis is load-path guidance, not engineering certification.
  A reference-panel support and material/mass defaults are preview assumptions
  that must remain prominent until real mounting and material facts replace
  them.
- Keep both panel edit modes. Surface mode constrains translation to the active
  surface, or to saved local XY without a surface. Free 6DOF mode writes one
  independent right-handed pose and removes its stale surface attachment.
- The viewport does not rotate automatically. Operators keep direct orbit and
  zoom control, and panel selection leaves the chosen panel stationary.
- The saved route, GPIOs, and optimized installed quarter turns are authorized
  assumptions. The straight row-major pixel order and GRB color order are
  measured panel facts. Together these facts and assumptions make the current
  simulator-to-controller mapping ready. The route, GPIOs, and installed turns
  are not measured, and the complete sculpture is not electrically ready.
- Use the saved route and generated mapping artifacts for staged physical
  assembly only when their fingerprints match the current project. A pose,
  route, panel-set, profile, or bus edit requires regeneration.
- Printable assembly manuals may use the current automatic draft route when no
  authored route exists. Such a manual must say **DRAFT SUGGESTION**, show
  unknown GPIOs as unassigned, describe current non-optimized panel turns as
  assumptions, and never claim mapping readiness.
- Address parity requires the same authored route, panel addressing, WLED bus
  configuration, GRB order, GPIOs, and deployment identity. Optional device
  evidence is separate from mapping readiness.
- Keep installed address calibration separate from the pose. The pose owns LED
  world positions; a measured back-view quarter-turn/mirror transform may change
  local wire indexing only. Do not reuse an ambiguous mechanical rotation or
  WLED bus reversal as a second addressing authority.
- Electrical design, protection, and power approval are outside this
  repository. Treat operator-authorized power as an external assumption. WLED
  current values are configuration inputs, not electrical approval evidence.
- `firmware/` contains the selected minimum ESP32 target, its exact build
  receipt, and a one-panel smoke configuration. WLED build tooling stays on
  `generate/wled-firmware`; its binary is an ignored build/release artifact.
  Browser flashing, Improv setup, native-preset persistence, bounded DDP, and
  three-panel reconnect/power-cycle behavior have physical evidence. Do not
  extend that evidence to complete 41-panel address parity, Art-Net, Ethernet,
  audio, or another controller target. The browser effect engine remains a
  separate deterministic subset.

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
- `git worktree move` refuses a worktree with an initialized submodule. Do not
  force-remove it or manually rewrite submodule Git paths. Preserve the dirty
  worktree in place until its owner commits or discards the unique changes.
- If a push is blocked because the destination is not verified, report the
  exact commit, ref, and remote URL. Get explicit operator approval, then repeat
  the same push. Do not use an indirect push method.
- `npm run verify` uses the checked-in WLED simulator and verifies its exact
  integrity receipt. Do not add a WLED checkout, Python, or Emscripten to normal
  `main` setup. Simulator rebuilds belong on `generate/wled-simulator`; move
  only reviewed runtime bytes and their synchronized receipt back to `main`.
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
- On a shared multi-worktree host, do not let Playwright reuse an unknown server
  on port 4174. Confirm its owning worktree or run the targeted check with
  `CI=1` so Playwright starts the configured server from the current worktree.
- `tsconfig.node.json` has an explicit web-module list. When a Node-side test or
  script imports a new file under `web/src/`, add that file to the list before
  the production TypeScript build.

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
  geometry, and final review where correctness needs it. Escalate from Luna to
  Terra to Sol only when the task shows that the cheaper model is insufficient.
  Do not use Sol for routine execution.
- Parallelize only independent seams. Do not assign concurrent edits to the
  same file or subsystem unless one orchestrator coordinates the overlap.
- Use a separate review or test pass when the scope or risk justifies it.
  A FAST task can become **Ready to Merge** after the orchestrator inspects the
  diff and the focused checks pass. Agent reports are evidence, not proof that
  the integrated worktree is correct.

### Execution modes

- **FAST** is the default for clear, low-risk work. Execute directly, do not add
  a critic or research agent by default, run only relevant checks, and update
  documentation only when durable behavior changes.
- **STANDARD** is for a substantial normal feature. Use a brief plan, Terra for
  implementation by default, Luna for bounded inspection or testing, and an
  independent review or test pass when it adds useful evidence. Update
  `TASKS.md` at meaningful state changes.
- **QUALITY** is for architecture, high-risk changes, complex geometry,
  ambiguous defects, major refactors, or repeated failed approaches. Use Sol
  for orchestration and add a bounded critic, independent work, or broader
  verification only when each item reduces a real risk.

Escalate from FAST to STANDARD to QUALITY only because of demonstrated
complexity, uncertainty, failure, conflict, or risk. When the acceptance
criteria and relevant checks pass, stop. Record optional polish, cleanup, or
optimization as a separate task instead of expanding the current slice.

An agent assigned as orchestrator owns the result end to end. It may divide the
work, but it remains responsible for scope, architectural consistency,
integration, verification, and the final report. Use this operating loop:

1. **Orient.** Read this file, `docs/ARCHITECTURE.md`, `TASKS.md`, and
   `FAILURES.md`, then the domain guide named at the top of this file. Inspect
   `git status` and the relevant code before proposing changes. Treat existing
   worktree changes as user-owned unless the task proves otherwise.
2. **Frame the outcome.** Turn the request into explicit acceptance criteria,
   identify the source-of-truth files and guardrails involved, choose the
   smallest coherent vertical slice and execution mode, and choose the
   narrowest meaningful verification. Reconcile substantial work with
   `TASKS.md`, record a short plan for work with more than one substantive
   step, and update the board only at meaningful state changes.
3. **Split only clean seams.** When agent delegation is available and allowed,
   delegate only bounded, independently checkable work when this improves
   speed, cost, or specialization. Give each agent the relevant paths,
   constraints, expected output, and verification target. Avoid concurrent
   edits to the same file; the orchestrator owns shared files and final
   integration. Keep the critical path moving locally while agents work.
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
npm run verify:wasm              # exact checked-in runtime size and SHA-256
npm run verify                   # assets, runtime integrity, tests, TypeScript, and Vite
npm run verify:clean             # npm ci, then npm run verify; no simulator toolchain
```

After geometry changes, compile the changed printable parts with
Manifold and inspect the STLs. Confirm holes, PCB poses, panel angles,
envelopes, connector corners, and flat print surfaces.

For a phone review link, run `npm run preview:phone` from the repository root.
It creates a temporary Cloudflare quick-tunnel URL and verifies the public HTML,
sculpture JSON, JavaScript, and WLED WASM endpoints. Call it a review link, not a
deployment; do not substitute a `localhost` URL.

For review from another device on the same LAN, run `npm run lan` from the
repository root. It binds Vite to all interfaces, selects the first free port at
or above 4175, and prints the LAN URL. Use this command directly; do not rebuild
the host and port command by hand.
