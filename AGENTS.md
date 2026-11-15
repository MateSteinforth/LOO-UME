# Agent project guide

This repository is a pose-first editor and fabrication toolkit for panel-based
LED sculptures. The browser application is **LOO/UME**, a generative sculpture
compiler. These rules apply to all agents and all hosts.

## Startup reading

Read this file and `TASKS.md`. Then read only what the task needs:

| Work                                         | Read                                                 |
| -------------------------------------------- | ---------------------------------------------------- |
| Any code change                              | Relevant sections of `docs/ARCHITECTURE.md`          |
| Geometry, panels, CAD                        | `docs/PANEL_SYSTEM.md`, `docs/MECHANICS_WORKFLOW.md` |
| Addressing, wiring, WLED                     | `docs/LED_MAPPING.md`                                |
| Structure                                    | `docs/STRUCTURAL_WORKFLOW.md`                        |
| Firmware                                     | `firmware/AGENTS.md`                                 |
| Build, test, release commands                | `docs/DEVELOPMENT.md`                                |
| Shell tools, tests, patches, model selection | The applicable section of `docs/AGENT_NOTES.md`      |
| A subsystem or tool that failed before       | Search `FAILURES.md` and its archive by keyword      |
| A new repository                             | `docs/AGENTIC_WORKFLOW_BOOTSTRAP.md`                 |

Do not read the files in `docs/archive/` from start to end. Search them.

## Sources of truth

- Authored projects: `sculptures/*/sculpture.json`. Schema 2 is the only
  active format. Schema 1 inputs exist only in Git history.
- Reusable PCB facts: `catalog/panels/ws2812b-8x8-66x65.json`.
- Carrier kinds, validation, rigid-tool capability gates:
  `src/sculpture/PanelCarrier.ts`. Browser carrier geometry:
  `web/src/PanelCarrierGeometry.ts`.
- Schema 2 runtime contract and mapping compiler:
  `src/sculpture/PanelAssembly.ts` (`createPanelAssemblyMapping()`).
  `src/sculpture/Definition.ts` keeps only shared panel-profile and wiring
  types and profile validation.
- Structural input, normalization, warnings, fingerprints:
  `src/sculpture/StructuralDesign.ts`.
- Printable-part compiler: `src/cad/CompilePanelBoundaryBundle.ts` and
  `src/cad/GeneratePanelClosureSolids.ts`, with pinned `manifold-3d` 3.5.1.
- Structural analysis and connector compilation:
  `src/structure/StructuralPipeline.ts`, `src/cad/CompileStructuralArtifacts.ts`.
- Editor mutations and mechanical invalidation:
  `src/sculpture/SculptureEditor.ts`.
- Browser orchestration: `web/src/main.ts`. Mapping and wiring: `web/src/`.
- Generated STL, PNG, ledmap, panel-map, and `build/` files are artifacts, not
  authored truth. A portable project can reference GLB/STL assets by safe
  relative path and SHA-256. Those assets are derived; the sculpture JSON is
  the project authority.
- Tracked-build exceptions. Rebuild and commit each one when its pinned source
  or compiler changes, and keep its checksum and build receipt synchronized:
  - `web/public/wasm/wled-engine.js` and `wled-engine.wasm` (tests and the
    viewer work directly after checkout);
  - the native files under `toolchains/bootstrap/bin/` (the approved
    Linux/macOS trust root);
  - `touchdesigner/loo_ume_ddp.tox` (made by TouchDesigner 2025.31550) and
    its JSON receipt.
- `./bootstrap.sh setup` is the supported clean-checkout path on Linux x86-64
  and macOS. It installs pinned Node/npm below `.tools/` from
  `toolchains/bootstrap/install-manifest.json`, then builds and verifies the
  desktop and Manifold path. It needs no administrator access and no global
  Node.

## Architectural guardrails

Poses, editing, and the viewer:

- Panel poses are authoritative. A mechanical face, GLB, or surface attachment
  can constrain editing but must not silently replace a saved pose.
- Mapping, wiring, and simulation must continue after a panel edit, also when
  printable mechanics are stale or unavailable.
- Keep both panel edit modes. Surface mode constrains translation to the
  active surface, or to saved local XY without a surface. Free 6DOF mode
  writes one independent right-handed pose and removes its stale surface
  attachment.
- The viewport does not rotate automatically. Operators keep direct orbit and
  zoom control. Panel selection leaves the selected panel stationary.
- Keep emitter/address geometry separate from carrier display geometry and
  fabrication capability. Missing carrier data means the legacy rigid
  rectangle. Planar outlines and flexible paths can map, wire, simulate, and
  configure WLED, but must not enter rectangle-only placement or CAD paths.

Operator workflow:

- Keep the primary workflow state-aware and artifact-complete. Prefer one
  action that changes from build to download. Keep raw/debug exports under
  Advanced when one self-contained project or assembly package is the normal
  handoff.
- Present operator areas as always-editable capability toolboxes, not numbered
  gates. A profile can disable an unsupported placement or fabrication action.
  It must not block independent mapping, simulation, hardware, or export.

Mechanics and fabrication:

- Schema 2 mechanics are optional. A project without `mechanicalShell` and
  `closures` is the mechanics-free state: load GLB, place and edit panels,
  simulate, map, wire, save, and reload.
- GLBs are authoring surfaces only. The planar closure generator starts from
  authoritative panel outlines, closes each gap with a validated flat N-gon,
  builds a closed boundary, and only then creates printable parts. Do not turn
  GLB triangles directly into printable material.
- The boundary generator supports only layouts in which each cap is a flat
  simple N-gon. It validates planarity, topology, winding, intersections, and
  manifold closure, and rejects invalid layouts clearly.
- The structural route also ignores GLB triangles. It starts from each
  mechanically eligible profile hole, transformed by the authoritative panel
  pose. Blocked DIN/DOUT holes are never structural anchors.
- All printable parts use Manifold, in Node or in the browser. Do not restore
  an OpenSCAD route.
- After generation, the viewer loads the exact referenced STL parts. A panel
  edit makes those parts stale and does not disable the rest of the interface.
- Do not change proven panel angles, triangle handedness `-1`, the 0.20 mm
  hole-edge correction, or the 0.50 mm surface-flush correction without an
  explicit new physical result.
- Printable material must not intersect PCB envelopes or obstruct DIN, DOUT,
  V+, or V-. Keep centre structures within the pentagon boundary. Keep outside
  filler surfaces flat-printable.
- Structural analysis is load-path guidance, not engineering certification.
  The reference-panel support and the material/mass defaults are preview
  assumptions. Keep them prominent until real mounting and material facts
  replace them.

Mapping, wiring, and hardware evidence:

- Measured panel facts: straight row-major pixel order and GRB color order.
  Authorized assumptions: the saved route, the GPIOs, and the optimized
  installed quarter turns. Together they make the simulator-to-controller
  mapping ready. The assumptions are not measured, and the complete sculpture
  is not electrically ready.
- Use the saved route and generated mapping artifacts for physical assembly
  only when their fingerprints match the current project. A pose, route,
  panel-set, profile, or bus edit requires regeneration.
- A printable assembly manual can use the automatic draft route when no
  authored route exists. It must then say **DRAFT SUGGESTION**, show unknown
  GPIOs as unassigned, describe non-optimized panel turns as assumptions, and
  not claim mapping readiness.
- Address parity requires the same authored route, panel addressing, WLED bus
  configuration, GRB order, GPIOs, and deployment identity. Optional device
  evidence is separate from mapping readiness.
- Keep installed address calibration separate from the pose. The pose owns LED
  world positions. A measured back-view quarter-turn/mirror transform can
  change local wire indexing only. Do not use an ambiguous mechanical rotation
  or a WLED bus reversal as a second addressing authority.
- Automatic wiring can use only physical rotations that preserve the carrier
  geometry on its placement face. A non-square face-fitting carrier must use a
  compatible saved rotation constraint. A 90-degree address improvement must
  not break mechanical edge alignment.
- Electrical design, protection, and power approval are outside this
  repository. Operator-authorized power is an external assumption. WLED
  current values are configuration inputs, not approval evidence.
- `firmware/` contains the selected minimum ESP32 target, its exact build
  receipt, and a one-panel smoke configuration. The firmware generation branch
  is not active. The firmware binary is an ignored build artifact. Browser
  flashing, Improv setup, native-preset persistence, bounded DDP, and
  three-panel reconnect/power-cycle behavior have physical evidence. Do not
  extend that evidence to complete 41-panel address parity, Art-Net, Ethernet,
  audio, or another controller target. No complete 41-panel proof is planned.
  The browser effect engine is a separate deterministic subset.

## Working rules

- Other agents can work at the same time. Do not discard unfamiliar changes.
  Do not assume that you own a branch, worktree, file, or remote ref.
- `main` is the integration baseline only. Start each change in a new task
  branch and worktree, in a directory adjacent to the repository, not under
  `/tmp`. Record the owner and the likely file conflicts in `TASKS.md` before
  code changes. Run npm, Git writes, and tests in that worktree.
- Do not force-push, reset shared history, bypass a remote-write restriction,
  or merge into `main` without an explicit operator request.
- Preserve user changes and comments that record print tests or fit
  corrections. Keep geometry changes small and state their mechanical intent.
- Do not refactor production code during documentation-only work.
- Update the knowledge pages when architecture, invariants, or project status
  change. A chat handover must not be the only record.
- `README.md` is for application users. Checkout, build, test, release, and
  architecture guidance belongs in `docs/DEVELOPMENT.md`.
- Use ASD-STE100 simplified technical English for all operator-facing
  updates, questions, and handoffs.
- Build macOS packages for Apple Silicon (`arm64`) only.
- `npm run verify` uses the checked-in WLED simulator and verifies its
  integrity receipt. Do not add a WLED checkout, Python, or Emscripten to
  normal `main` setup. Simulator rebuilds belong on `generate/wled-simulator`;
  move only reviewed runtime bytes and their receipt back to `main`.

## Task workflow

Lifecycle: **Backlog → Ready → In Progress → Blocked or Human Review → Ready
to Merge → Done**. Use stable task IDs in commits and handoffs. Keep at most
one implementation slice In Progress.

Execution modes. Start with FAST. Escalate only because of demonstrated
complexity, uncertainty, failure, conflict, or risk.

- **FAST**: clear, low-risk work. Execute directly, run only relevant checks,
  no critic or research agent. The orchestrator inspects the diff.
- **STANDARD**: a substantial normal feature. Brief plan, Standard-tier
  implementation, Light-tier inspection and tests, independent review when it
  adds evidence.
- **QUALITY**: architecture, high-risk changes, complex geometry, ambiguous
  defects, major refactors, repeated failed approaches. Deep-tier
  orchestration. Add a critic or broader verification only when it decreases
  a real risk.

Model tiers (Light, Standard, Deep) are defined for each host in
`docs/AGENT_NOTES.md`. Do not use the Deep tier for routine execution.

The orchestrator owns scope, integration, verification, and the final report:

1. **Orient.** Do the startup reading. Inspect `git status` and the relevant
   code. Existing worktree changes belong to the user.
2. **Frame.** Write explicit acceptance criteria. Identify the sources of
   truth and guardrails. Select the smallest coherent slice, the mode, and
   the narrowest meaningful verification. Update `TASKS.md` only at
   meaningful state changes.
3. **Split only clean seams.** Delegate only bounded, independently checkable
   work. Give each agent the paths, constraints, expected output, and
   verification target. No concurrent edits to one file or subsystem; the
   orchestrator owns shared files.
4. **Integrate.** An agent report is evidence, not acceptance. Inspect each
   diff and run the checks in the integrated worktree.
5. **Learn.** Record a reusable mistake, failed assumption, tool failure, or
   user correction in `FAILURES.md` during the same task, and correct the
   workflow or the guidance. Do not log ordinary exploration, transient
   errors, secrets, blame, or raw output. Reuse a recorded solution; do not
   repeat the failed discovery.
6. **Close.** Inspect the final diff. Verify the acceptance criteria. Commit
   on the task branch, push it when permitted, and move the task to **Ready
   to Merge**. Report the changes, the checks, the commit, and the remaining
   uncertainty. Do not call a partial or unverified result complete. When
   acceptance passes, stop; record polish as a separate task.

A delegated agent returns: changed files, checks and results, assumptions or
risks, and any proposed `FAILURES.md` lesson. A blocked agent reports the
exact blocker and does not expand its scope.

Cleanup is part of each completed task; the operator must not need to request
it. After an authorized integration push succeeds:

- Verify first: the task worktree is clean, the branch is merged into the
  intended base, and the integrated commit is on the destination remote.
- Then remove the temporary worktree and delete the merged local branch.
  Delete a remote task branch only when this task created it. Archive or close
  a separate agent or thread after its handoff is recorded.
- Do not delete a dirty worktree, an unmerged branch, another task's branch or
  worktree, or the only copy of useful output.

## Verification

During development: `npm run check:fast`, `npm run lint:typed`, and the
relevant `test:fast`, `test:geometry`, or `test:host` group. Format and lint
select changed files; set `CHECK_BASE` for another base and use `-- --all`
before handoff. Cached typed-lint results are not proof after dependency type
changes. `npm run dev:electron` gives renderer hot updates.

```bash
npm test               # all Vitest tests; uses the checked-in WASM runtime
npm run test:editor
npm run test:placement
npm run verify:wasm    # checked-in runtime size and SHA-256
npm run verify         # assets, runtime integrity, tests, TypeScript, Vite
npm run verify:clean   # npm ci, then verify; no simulator toolchain
```

After a geometry change, compile the changed printable parts with Manifold and
inspect the STLs: holes, PCB poses, panel angles, envelopes, connector
corners, and flat print surfaces.
