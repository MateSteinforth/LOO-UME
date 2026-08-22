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

**Decision.** The editor starts with an empty 66 mm-edge Archimedean placement
surface rather than the flagship 41-panel sculpture. The current default is the
pose-only rhombicosidodecahedron; the cuboctahedron remains a registered
authoring project.

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

**Status.** Superseded for generic panel-outline generation by D19 and D20.
The managed OpenSCAD path remains applicable only to the physically tested
manual `parts/*.scad` route.

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

## D17 — `main` is the integration baseline

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

## D18 — Browser, helper, and mesh-kernel proofs are different contracts

**Decision.** A Playwright journey through real controls proves operator UI
behavior. A Vitest or generator helper with a deterministic fake renderer
proves JSON, topology, hashing, and staging contracts. Generic printable-part
geometry is proved by Manifold STLs. OpenSCAD proofs apply only to changes in
the manual `parts/*.scad` route.

**Evidence.** `tests/browser/mechanics-free-authoring.spec.ts`,
`tests/browser/portable-project.spec.ts` (fake STL renderer for fixtures),
`tests/browser/generate-parts.spec.ts`, and Manifold CI in
`.github/workflows/render.yml`.

**Consequence.** Do not treat TEST-010 or TEST-011 as the complete
arbitrary-project acceptance path. `UI-010` uses the real **Generate 3D Parts**
control with Manifold. Do not treat helper CAD tests as physical-fit evidence.

## D19 — Generic CAD kernel is pinned `manifold-3d` 3.5.1

**Decision.** The generic panel-outline solids kernel is pinned to npm
package `manifold-3d` version `3.5.1` (Apache-2.0) from
https://github.com/elalish/manifold. CAD-030 only loads the WASM and proves a
boolean in tests. Generic panel generation now writes Manifold STLs
(`CAD-032` / `CAD-033`). Generic generation does not execute OpenSCAD; the
manual `parts/*.scad` route remains separate.

**Evidence.** `package.json`, `src/cad/ManifoldRuntime.ts`,
`tests/manifold-runtime.test.ts`, and operator approval of `CAD-030` on
2026-08-20.

**Consequence.** Do not float the Manifold version. WASM objects must be
`delete()`d. Do not feed Manifold the manual `parts/*.scad` route in this
epic. Do not describe an export as hardware-ready because the kernel changed.

## D20 — Generic generation does not execute OpenSCAD

**Decision.** Generic panel-outline parts use Manifold only. The desktop
generator and generic CI job do not install, probe, or render OpenSCAD.

**Evidence.** Operator instruction on 2026-08-20; generic pipeline tests reject
leftover `generate:sculpture` OpenSCAD rendering. Separate OpenSCAD tests cover
only the retained manual-part toolchain.

**Consequence.** Do not restore OpenSCAD as a dependency of generic generation.
Manual `parts/*.scad` remain authored sources and use a separate render path.

## D12 — A folder is the native portable project; ZIP is transport

**Decision.** A portable project consists of one authoritative
`sculpture.json` and its referenced assets at safe relative paths. Folder and
ZIP operations preserve those paths and exact bytes. Every referenced GLB and
STL is SHA-256 verified before use or export; missing or mismatched bytes fail
closed. Browser object URLs are runtime adapters and never become saved project
data.

**Evidence.** `web/src/PortableProject.ts`,
`web/src/GeneratedMechanicsAssets.ts`, `src/sculpture/GeneratedMechanics.ts`,
`scripts/editor-pipeline-handler.ts`, `tests/portable-project.test.ts`, and
`tests/browser/portable-project.spec.ts`; commits `0df76c7`, `5fa1b60`,
`e729e90`, and `ab9a96a`.

**Consequence.** Do not add a database, `localStorage`, absolute asset paths,
URL fetching during export, or a second archive-specific project model. ZIP
resource limits remain required hardening under `SEC-010`; they must preserve
this folder-first contract.

## D13 — Hardware parity is an evidence-gated deployment contract

**Decision.** The operator confirmed on 2026-08-20 that the physical 41-panel
build must reproduce the simulator's spatial LED result. Sculpture JSON remains
authoritative; the simulator must display its persisted, explicitly confirmed
route and measured addressing facts. A heuristic route is a draft. An
installation-ready export is blocked until the saved route, installed panel
transforms, pixel and color order, WLED buses/GPIOs, power limit, and firmware
identity agree. Hardware-verified status additionally requires deployed hashes,
device read-back, the as-built record, and bench proof.

**Evidence.** `createPanelAssemblyMapping()`,
`createHardwareMappingContract()`, the current parity tests in
`tests/hardware-mapping.test.ts`, the provisional limitations in
`docs/LED_MAPPING.md`, and the operator's physical-build direction. The official
[WLED mapping contract](https://kno.wled.ge/advanced/mapping/) defines the map
array position as the natural/logical index and its value as the remapped
physical index. WLED bus start, length, GPIO, color order, and reversal remain
separate [LED settings](https://kno.wled.ge/features/settings/).

**Consequence.** Do not wire from a screenshot, nearest-neighbor suggestion,
`layout/panel-map.json`, or `wled/ledmap.provisional.json`. Diagnostic exports
may remain clearly labelled. An installation-ready bundle needs stable hashes
and an install/read-back checklist; it is not hardware-verified before that
checklist and the bench proof pass. Static address/RGB proof comes before any
claim of effect timing, transport, network, or audio parity. Full-sculpture
operation also requires the separately approved `PWR-010` protection plan.

## D14 — Installed address calibration is not a second pose

**Decision.** The saved panel pose continues to define panel geometry and LED
world positions. Physical addressing uses a separate measured transform from
pose-local display coordinates to PCB wire coordinates. Its frame is the panel
profile's marked back view and its square-panel operations are discrete quarter
turns plus optional mirroring. It changes local-to-wire indexing only; it never
moves a panel or an LED in the sculpture.

**Evidence.** The pose basis drives LED world positions in
`createPanelAssemblyMapping()`. `installedAddressTransform` now maps those
unchanged display-local coordinates into PCB coordinates before
`panelWireIndex()`. The compiler tests all eight square transforms against all
16 supported pixel-order combinations. Reusing the legacy mechanical fields
would permit a physically wrong but internally valid map.

**Consequence.** Schema 2 uses back view, mirror first, then zero to three
clockwise quarter turns. Missing fields migrate to assumed identity and never
infer from legacy `rotationDegrees` or `mirrored`. Measured orientation requires
an explicit measured transform for every panel. Existing geometry/mechanical
rotation stays unchanged. Color order and WLED bus reversal are not part of
this transform; `MAP-030` records color order and fixes bus reversal to false so
direction has one authority.

## D15 — Use one conservative assumed prototype contract

**Decision.** The first physical build uses an Espressif ESP32-DevKitC V4 with
an ESP32-WROOM-32E-N4 module, the repository-pinned WLED commit
`d9b9a846561227351ad929e3109781daadb7bed2`, and its `esp32dev` build. GPIOs
16, 17, 18, and 19 drive four WS281x RGB buses through one 5 V SN74AHCT125.
The assumed color order is RGB. Bus reversal is false. The assumed back-view
panel order is the current row snake. `MAP-022` selects each installed quarter
turn from route geometry without mirroring.

The power baseline uses two independent 5 V / 40 A positive-rail domains.
Outputs 0 and 1 use domain A; outputs 2 and 3 use domain B. Grounds join at one
star point. Each output has a 14 A WLED limit and a 15 A fused 12 AWG trunk.
Each panel receives a separate 18 AWG power pair through a 5 A positive fuse.
Panel pads do not carry accumulated chain current. Unrestricted full white is
not an approved mode.

**Evidence.** Espressif documents GPIOs 16–19 as input/output pins on the
DevKitC V4 when it has a WROOM module; GPIOs 16 and 17 are not available on a
WROVER module. The pinned WLED WROOM build supports up to eight RMT channels;
this contract uses four. The same source defines WS281x RGB type 22, RGB order
1, per-bus `maxpwr`, and explicit `rev`. It requires global
`hw.led.maxpwr: 0` to activate the per-bus limits. WLED documentation
recommends an SN74AHCT125 level shifter and rates
four ESP32 outputs of up to 800 pixels each as very good performance. The
longest planned output is 704 pixels.

**Consequence.** These choices are authorized build assumptions, not measured
facts. They drive the mapping configuration and assembly labels. Mapping
readiness does not depend on voltage, temperature, or device read-back. A user
correction can replace RGB, snake order, or an address transform. Electrical
protection remains separate from the address and color contract.

## D16 — Hash exact provisional WLED deployment bytes

**Decision.** The assumed WLED review deployment consists of the exact
`cfg.provisional.json` and `ledmap.provisional.json` bytes. A versioned canonical
manifest records each fixed path, byte length, and SHA-256 plus the source
project hash, mapping fingerprint, and pinned target. The manifest does not list
itself. Its exact-byte SHA-256 is the external review deployment identity.

**Evidence.** WLED consumes JSON bytes, while a semantic JSON hash could hide a
format or emitted-file change. Exact-byte hashes detect both data and formatting
drift. Excluding the manifest from its file list avoids a recursive identity.
Golden and tamper tests cover all bus fields, changed routes, stale ledmaps,
modified files, and a contradictory re-hashed bus configuration.

**Consequence.** The generated files are non-secret and reproducible, but their
status is `assumed-mapping-ready`. The external identity is the manifest
SHA-256. Credentials never enter this bundle.

## D17 — Structural generation is an additive pose-derived route

**Decision.** Structural inputs are optional fields in Schema 2. All panel
centres, axes, corners, PCB dimensions, and mounting anchors derive from the
existing panel poses and resolved hardware profile. The structural route does
not read GLB triangles as material and does not add another panel schema.

**Evidence.** `src/sculpture/StructuralDesign.ts`,
`schemas/panel-assembly.schema.json`, and
`tests/structural-design.test.ts` validate the input, transform every eligible
profile hole, exclude blocked holes, resolve supports and loads, and create the
structural source fingerprint.

**Consequence.** `generatedStructure` is a separate derived artifact manifest
and is mutually exclusive with planar or manually authored generated parts.
Missing structural values use named preview defaults. Missing supports select
the first panel in stable ID order and must emit a prominent preview-only
warning. Structural results are load-path guidance, not engineering
certification.

## D18 — Candidate structure grows from every eligible screw anchor

**Decision.** Each eligible normalized hole gets one exact screw bracket and
one rear structural hub. Hubs on a panel form a complete local tie graph.
Inter-panel hub pairs become candidates only when they satisfy a deterministic
length limit and do not intersect an expanded PCB oriented box. An accepted
candidate graph must be connected and have no graph bridge.

**Evidence.** `src/structure/CandidateTruss.ts` and
`tests/candidate-truss.test.ts` cover stable IDs, shuffled inputs, every
eligible bracket, blocked holes, PCB collision, near-coincident hubs,
disconnection, duplicate and zero-length edges, attachment feasibility, and
redundant paths.

**Consequence.** The structure starts at the existing profile holes instead of
caps or a second panel schema. Rejected edge diagnostics explain when length or
PCB clearance prevents a load path. Graph redundancy guides later
optimization; it does not certify a printed assembly.

Remaining proposals and product decisions belong in [`ROADMAP.md`](ROADMAP.md);
the full implemented fabrication workflow is recorded in
[`MECHANICS_WORKFLOW.md`](MECHANICS_WORKFLOW.md).
