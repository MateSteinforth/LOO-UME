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
use GLB triangles as printable structure; the current implementation derives
from a validated explicit planar JSON face graph, and the planned UI-driven
path derives a validated flat-cap boundary from panel outlines.

**Evidence.** `DesignSurface.ts`, `SculptureEditor.ts`,
`MechanicalShellRegenerator.ts`, and commit `463f371` (automatic surface panel
placement).

**Consequence.** Do not feed arbitrary GLB triangles to planar CAD or imply
placement guarantees structural feasibility. A generated panel gap must pass
its own planar N-gon and closed-boundary validation.

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
2021.01 is a system prerequisite: discovery tries explicit `OPENSCAD`, then the
system `openscad` on `PATH`, then an already-present repository `.tools` AppRun
only as a developer compatibility fallback. The application neither installs
nor bundles OpenSCAD. No sculpture data or generation job requires a hosted
service.

**Evidence.** `scripts/local-editor-server.ts`,
`scripts/editor-pipeline-handler.ts`, `src/cad/OpenScadRuntime.ts`,
`web/src/GeneratorStatus.ts`, and the desktop/server/status tests.

**Consequence.** The browser discovers actual generator status and disables only
printable generation when OpenSCAD is unavailable. Installation or repair
requires restart because discovery happens at startup. The server binds to
loopback, requires same-origin generation requests, and handles SIGINT/SIGTERM
by closing the listener and active child processes. Packaging must not silently
introduce a remote service or bundled OpenSCAD binary.

Remaining proposals and product decisions belong in [`ROADMAP.md`](ROADMAP.md);
the full implemented fabrication workflow is recorded in
[`MECHANICS_WORKFLOW.md`](MECHANICS_WORKFLOW.md).
