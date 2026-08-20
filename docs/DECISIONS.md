# Established architectural decisions

This is a compact decision record, not a wishlist. Entries are limited to
choices visible in current code and Git history. Proposals belong in
[`ROADMAP.md`](ROADMAP.md).

## D1 — Panel poses are authoritative

**Decision.** Schema 2 stores an explicit world position and right-handed local
basis for each panel. LED placement and editor transforms compile from that
pose; a mechanical face or GLB attachment does not replace it.

**Evidence.** `src/sculpture/PanelAssembly.ts`, the pose-first migration, and
commit `4816f34` (regenerate planar shell CAD from panel poses).

**Consequence.** Pose edits must propagate to LEDs, mapping, and wiring. Avoid a
second transform authority.

## D2 — Editing is decoupled from printable-mechanics currency

**Decision.** Mapping/wiring remain usable after an edit. Generated mechanics
become `requires-regeneration`; manual mechanics become `requires-review`, and
stale previews are not shown as valid.

**Evidence.** `markPanelEditConsequences()` in `SculptureEditor.ts` and commit
`0917794` (decouple panel JSON editing from mechanics).

**Consequence.** CAD rejection must not discard a useful pose edit or disable
simulation/mapping.

## D3 — GLBs are authoring surfaces, not printable structure

**Decision.** GLBs support placement and movement. Generic fabrication does not
use GLB triangles as printable structure or as gap-topology input. The current
implementation supports validated explicit planar JSON face graphs and derives
a validated flat-cap boundary from panel outlines.

**Evidence.** `DesignSurface.ts`, `SculptureEditor.ts`,
`MechanicalShellRegenerator.ts`, `PanelOutlineBoundary.ts`,
`GeneratePanelBoundaryParts.ts`, and commit `463f371` (automatic surface panel
placement).

**Consequence.** Do not feed arbitrary GLB triangles to planar CAD or imply
placement guarantees structural feasibility. A generated panel gap must pass
its own planar N-gon and closed-boundary validation. The interface still needs
controls to confirm or correct detected gap cycles.

## D4 — Manual and generic CAD are separate supported routes

**Decision.** The printed 41-panel rhombicosidodecahedron keeps canonical manual
SCAD parts, while supported planar projects use generated closures.

**Evidence.** The mutually exclusive Schema 2 mechanics branches,
`GenerateCad.ts`, `GeneratePanelClosureCad.ts`, the three files under `parts/`,
and commit `031e75b` (restore manual 41-panel sculpture).

**Consequence.** Generic CAD must not silently replace or claim equivalence with
the U-frame/middle-connector system. Changes to either route should not break the
other.

## D5 — Physical corrections and blocked corners are constraints

**Decision.** Mounts use hardware-profile holes, exclude DIN/DOUT-blocked holes,
and preserve measured 0.20 mm hole-edge and 0.50 mm surface-flush corrections.
The tested triangle uses handedness `-1`.

**Evidence.** The panel profile, assertions in `PanelAssembly.ts`, and physical
test comments in `parts/triangle.scad`.

**Consequence.** Changing these requires explicit physical evidence; it is not
code cleanup.

## D6 — Mapping artifacts derive from sculpture JSON

**Decision.** The browser builds panel mapping, provisional routes, physical
mapping, and ledmap from the loaded Schema 2 project. Committed mapping files are
verification snapshots, not normal runtime input.

**Evidence.** `web/src/main.ts`, `createPanelAssemblyMapping()`,
`createHardwareMappingContract()`, and artifact-equivalence tests.

**Consequence.** Fix project/profile data or generator logic instead of patching
generated maps by hand.

## D7 — The browser runs a pinned WLED subset, not firmware

**Decision.** WLED Orbital Lab uses a deterministic portable host containing
selected upstream 1D effect bodies. Upstream synchronization is pinned and
checked; device networking and drivers are outside the simulator.

**Evidence.** `wasm/src/wled_engine.cpp`, `wasm/upstream-revision.txt`, and
`scripts/check-wled-sync.mjs`.

**Consequence.** Preserve deterministic time/randomness and source-sync tests.
Do not infer ESP32, DDP, Art-Net, network, preset, or audio support from WASM
effect parity.

## D8 — The default is an empty authoring surface

**Decision.** The editor starts with the empty 66 mm cuboctahedron rather than
the flagship 41-panel sculpture.

**Evidence.** `web/src/main.ts` and commit `9572779`.

**Consequence.** Startup and zero-panel behavior are part of the general editor
contract, not an edge case tied to one sculpture.

## D9 — The pinned browser WASM runtime is checked in

**Decision.** Track `web/public/wasm/wled-engine.js` and
`web/public/wasm/wled-engine.wasm` so the simulator and `npm test` work directly
after checkout. The WLED submodule, source-selection checks, emsdk revision, and
Emscripten version remain the reproducible source of that build.

**Evidence.** `scripts/build-wasm.mjs`, `scripts/check-wled-sync.mjs`,
`wasm/upstream-revision.txt`, `wasm/emsdk-revision.txt`, and
`wasm/emscripten-version.txt`.

**Consequence.** When the pinned source or compiler changes, rebuild and commit
both runtime files with that change. Do not commit the Emscripten SDK, caches,
or other generated build directories.

## D10 — Production mechanics generation is a local loopback service

**Decision.** The production editor is built and served on the user's computer,
and it runs the same bounded generation handler as Vite development. OpenSCAD
is not stored in the repository. The repository can install a managed local
tool on Debian 13 x86-64, Ubuntu 24.04 x86-64, and macOS 15 on native Apple
Silicon arm64 or Intel x86-64. It also provides a Windows x86-64 candidate.
Setup needs no administrator access, manual OpenSCAD install, or `PATH` change;
the macOS targets do not need Rosetta. Runtime
discovery tries explicit `OPENSCAD`, then a valid receipt-backed managed tool
for the current target, then the system command on `PATH`. That command is
`openscad` on Linux and macOS and `openscad.com` on Windows. No sculpture data
or generation job requires a hosted service.

**Evidence.** `scripts/local-editor-server.ts`,
`scripts/editor-pipeline-handler.ts`, `src/cad/OpenScadRuntime.ts`,
`src/cad/OpenScadDistribution.ts`, `scripts/setup-openscad.ts`,
`toolchains/openscad-distributions.json`, `web/src/GeneratorStatus.ts`, and the
desktop/server/status/distribution tests.

**Consequence.** `npm run setup:openscad` installs OpenSCAD 2021.01 for the
declared Linux targets and Windows candidate, and 2026.06.12 for macOS.
The macOS universal DMG is
`https://files.openscad.org/snapshots/OpenSCAD-2026.06.12.dmg`, with exact size
64,447,344 bytes and SHA-256
`555be2ed313e67657b3d8ba3e1de0acd6141b982fd458776c52d3eda748f57c4`.
The manifest records the upstream source repository and the
GPL-2.0-or-later-with-CGAL-exception license. It does not claim an exact macOS
snapshot source revision because upstream does not publish one.

On macOS, setup mounts the DMG read-only, copies only `OpenSCAD.app` into
`.tools`, validates the app tree and native Mach-O slice, and detaches and
removes the temporary mount on success or failure. The receipt records the
target, expected and detected version, artifacts, executable, and library
directories. Staging, receipt validation, atomic publication, and valid-install
reuse make setup safe to retry. Native artifact qualification also proved the
code signature, Gatekeeper acceptance, and DMG notarization. CI proves the
managed process without a system OpenSCAD on native `macos-15` arm64 and
`macos-15-intel` x86-64 runners. It runs setup twice, generates and inspects two
real STLs, starts the production local server, checks its status and static
content, and proves clean shutdown. The `macos-15-intel` label is scheduled to
retire in August 2027. CI must migrate to a supported native Intel runner before
then.

The browser discovers actual generator status and disables only printable
generation when OpenSCAD is unavailable. Setup or repair requires a restart
because discovery happens at startup. The server binds to loopback, requires
same-origin generation requests, and handles SIGINT/SIGTERM by closing the
listener and active child processes. Packaging must not silently introduce a
remote service or stored OpenSCAD binary.

The Windows x86-64 candidate pins the official portable OpenSCAD 2021.01 ZIP
(21,884,613 bytes; SHA-256
`fb0caabf5bbc89f8f2f80c10b79ae64d697aaff6efd58b2756f5d6270edb7ba7`)
and uses `openscad.com`. Setup is repository-local and atomic, with no
administrator, installer, registry, profile, or `PATH` change. Source is tag
`openscad-2021.01`, commit `41f58fe57c03457a3a8b4dc541ef5654ec3e8c78`,
under GPL-2.0-or-later with the OpenSCAD CGAL exception. Windows Server CI is
surrogate proof only. Windows client qualification is deferred. The candidate
code and checks remain, but Windows does not block INSTALL-011 or INSTALL-012.
Those tasks cover the complete bootstrap and proof on the required Linux and
macOS targets.

## D11 — Reviewed native files provide the bootstrap trust root

**Decision.** The repository tracks one small stage-zero executable for Linux
x86-64, macOS arm64, and macOS x86-64. Git plus the standard POSIX shell select
the native file. Reviewed source, deterministic build instructions, build
receipt, and SHA-256 values stay with the binaries. Windows is not a current
stage-zero target.

**Evidence.** `bootstrap.sh`, `toolchains/bootstrap/`,
`scripts/build-bootstrap.sh`, and the native Linux/macOS workflow jobs.

**Consequence.** These files may supply verified HTTPS, bounded safe archive
handling, and atomic publication without a preinstalled download, hash, or
archive utility. They are a deliberate tracked-binary exception, but they are
not a complete installer. The operational manifest and base-toolchain setup
remain incomplete until Node.js/npm and an approved relocatable Python supply
are pinned for all three targets. That Python supply is an open product
decision (`HR-013`); it is not implied by this bootstrap-binary decision.

## D12 — `main` is the integration baseline

**Decision.** Substantial implementation work uses a dedicated branch and
worktree. Finished work stops at **Ready to Merge**. Merge or fast-forward
into `main` only after explicit operator authorization. Concurrent agents
must not force-push, reset shared history, or delete another agent's branch
or worktree.

**Evidence.** Operator instruction on 2026-08-20; `TASKS.md` lifecycle;
`AGENTS.md` working-safely and agentic-workflow rules.

**Consequence.** Successful closeout commits and, when permitted, pushes the
task branch, then waits. Automatic integration into `main` is not allowed.
`TASKS.md` records owning branch, worktree, and likely file conflicts for
every **In Progress** or **Ready to Merge** task.

## D13 — Browser, helper, and OpenSCAD proofs are different contracts

**Decision.** A Playwright journey through real controls proves operator UI
behavior. A Vitest or generator helper with a deterministic fake renderer
proves JSON, topology, hashing, and staging contracts. Only a real OpenSCAD
render proves printable-part geometry.

**Evidence.** `tests/browser/mechanics-free-authoring.spec.ts`,
`tests/browser/portable-project.spec.ts` (fake STL renderer for fixtures),
`CI-010`, and managed OpenSCAD verification in `.github/workflows/render.yml`.

**Consequence.** Do not treat TEST-010 or TEST-011 as the complete
arbitrary-project acceptance path. `UI-010` still requires the real
**Generate 3D Parts** control and OpenSCAD. Do not treat helper CAD tests as
physical-fit or CI real-render evidence.

Remaining proposals and product decisions belong in [`ROADMAP.md`](ROADMAP.md);
the full implemented fabrication workflow is recorded in
[`MECHANICS_WORKFLOW.md`](MECHANICS_WORKFLOW.md).
