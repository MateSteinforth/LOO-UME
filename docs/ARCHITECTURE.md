# Architecture

## System shape

WLED Orbital Lab is a browser editor for pose-first, panel-based LED sculptures.
The strongest implemented data flow is independent of fabrication:

```text
Schema 2 sculpture JSON + panel hardware profile
                |
                v
       authoritative panel poses
        /          |           \
  3D/LED view   logical map   draft/authored wiring
                    \           /
                     physical map
                          |
                     WLED ledmap
```

Fabrication is a separate, optional branch with two supported routes:

```text
(no mechanics fields) ----------> complete pose-first interface, no CAD
manualMechanics ----------------> verified wrappers around parts/*.scad
mechanicalShell + closures -----> planar validation -> generated SCAD/STL
```

Schema 2 pose-only projects are valid JSON. They load, edit, simulate, map,
wire, save, and reopen without a placeholder shell. When panels form an
unambiguous closed exposed-edge graph, local 3D-part generation can detect and
persist the missing gap connectivity without a pre-authored mechanical shell.

The implemented locally hosted fabrication route extends that lifecycle without
adding another pose authority:

```text
referenced GLB -> automatic placement -> manual pose edits
                                      |
                               Generate 3D Parts
                                      |
 panel poses + profile -> panel outlines -> detect or reuse corner-only gap cycles
                                      |
                    validated closed boundary -> Three.js preview
                                      |
                       validated printable part generation
                                      |
                 referenced exact STL files -> Three.js
```

The GLB is still only a placement surface. The generated boundary comes from
panel outlines and planar gap caps. Detection welds exact panel corners, removes
oppositely wound shared edges, and traces each unambiguous exposed-edge cycle.
The generator may assume users arrange panels so each gap is a flat simple
N-gon, but it validates that assumption and refuses ambiguous, invalid, or
non-manifold results. The GLB does not supply or suggest gap topology.

## Simulator-to-hardware boundary

The browser currently proves a logical-to-physical permutation in memory. It
does not yet prove an ESP32 installation. The 41-panel project stores an
authored assumed route with chain lengths `11/10/10/10` and assumed GPIOs
16–19. Each panel stores an assumed identity installed-address transform in a
back-view frame. Panel pixel order is provisional, and RGB/GRB color order is
not part of the project contract.
Schema 2 can now represent draft, authored, requires-review, measured, and
hardware-verified wiring. The last state defines a structured `PROOF-010`
receipt but cannot activate until that task provides an acceptance validator.
No current project contains measured route facts or a receipt. The current
measured-fact checks are intentionally not hardware readiness; physical
calibration, device read-back, and PWR-010 also remain required.

The WLED review deployment is generated from the same hardware mapping. It
contains an exact four-bus configuration fragment and the ledmap. A canonical
manifest hashes the exact bytes and records the source-project hash and pinned
target. Its own exact-byte SHA-256 is the external deployment identity. The
review bundle cannot set hardware readiness.

The target hardware-parity flow keeps sculpture JSON as the authority and makes
the simulator a faithful view of it:

```text
authoritative panel poses + measured panel profile
                         |
confirmed ordered route + installed orientation
                         |
logical LED index -> ledmap -> global WLED physical index
                         |
four bus ranges -> GPIO -> panel DIN-to-DOUT chain
                         |
pinned firmware/config read-back -> 2,624-pixel bench proof
```

Installed addressing does not introduce another pose. The pose basis still
defines display-local coordinates and world positions. A separate measured
back-view address transform maps those local coordinates to PCB wire
coordinates with discrete quarter turns and optional mirroring. The existing
geometry/mechanical rotation is not reused for this purpose.

The WLED bus contract must define the four contiguous global address ranges,
GPIOs, lengths, LED type/color order, disabled bus reversal, level shifting,
and power-domain assignment. A production bundle is valid only when its
project, route, mapping, bus configuration, firmware revision, and exact-file
hashes agree. A later edit marks the affected approval stale; it does not
replace the confirmed route.

Static address and RGB parity are the first proof target. The browser runs a
limited deterministic subset of WLED effects, so static parity does not prove
identical timing, networking, audio input, or all native WLED effects.

Physical power is a separate safety boundary. At the conservative profile value
of 60 mA per pixel, 2,624 pixels can require 157.44 A at 5 V. Full-sculpture
operation waits for a measured and approved injection, wire, fuse, supply,
voltage-drop, and current-limit plan. Software brightness limiting is not the
primary over-current protection.

The selected prototype baseline is in
[`PROTOTYPE_HARDWARE.md`](PROTOTYPE_HARDWARE.md). It fixes one board, four
GPIOs, bus limits, level shifting, and a two-domain fused power topology. Its
panel order, color order, and installed transforms remain assumed until direct
tests replace them. These assumptions do not bypass the measured-data or proof
gates.

## Subsystems


| Area | Responsibility | Boundary |
| --- | --- | --- |
| `sculptures/` | Authored Schema 2 projects and one legacy migration fixture | Project truth; do not hand-edit derived maps instead |
| `catalog/` | Reusable panel dimensions, grid, holes, connectors, corrections, electrical facts | Hardware truth shared by projects |
| `src/sculpture/PanelAssembly.ts` | Schema 2 parsing, pose compilation, face graph, LED geometry | Active model; poses remain authoritative |
| `src/sculpture/SculptureEditor.ts` | Add/move/rotate/delete/seed and mechanics invalidation | Editing does not require successful CAD |
| `src/sculpture/MechanicalShellRegenerator.ts` | Rebuild supported planar topology after edits | Rejects unsafe or ambiguous mechanics |
| `src/sculpture/PanelOutlineBoundary.ts` | Derive exact panel rectangles, detect deterministic unambiguous gap cycles, validate flat caps, and emit a closed boundary | Gap topology stores connectivity only; poses/profile own all coordinates |
| `src/cad/GeneratePanelBoundaryParts.ts` | Detect and persist missing gap topology, then turn the validated boundary into a staged, hash-verified exact STL bundle | Publishes the manifest only after every file validates |
| `src/cad/GeneratePanelClosureCad.ts` | Generic flat closures from compiled planar faces | Reused by explicit shells and panel-gap generation; not a GLB generator |
| `scripts/editor-pipeline-handler.ts` | Shared status and bounded generation HTTP handler | Used unchanged by Vite development and production hosting; loopback and same-origin only |
| `scripts/local-editor-server.ts` | Serve the built UI and generated assets on `127.0.0.1` | Local production host; owns startup and clean shutdown |
| `src/cad/GenerateCad.ts`, `parts/` | Legacy-typed wrappers around tested manual parts | Separate from generic CAD |
| `web/src/PortableProject.ts` | Shared folder/ZIP validation, object-URL resolution, and self-contained export | Never rewrites saved asset paths or fetches missing export bytes |
| `web/src/` | UI, Three.js rendering, placement, mapping, routing, export | `main.ts` owns most application state |
| `tests/browser/` | Playwright Chromium journeys through real operator controls | Uses the checked-in WLED WASM; it does not rebuild the SDK |
| `wasm/` | Deterministic portable subset of WLED 1D effects | Simulator only, not firmware |
| `scripts/` | Validation, staging, mapping, CAD, WASM, verification | Development/build tooling |
| `layout/`, `wled/`, `artifacts/` | Committed generated snapshots | Regression/review artifacts |
| `firmware/` | Constraints for future firmware | No buildable firmware exists |

## Browser lifecycle and data flow

1. `web/src/main.ts` starts with the empty 66 mm cuboctahedron project, or loads
   a registered, URL, or local Schema 2 sculpture. Mechanics fields may be
   omitted; a missing or invalid optional GLB only disables surface placement.
2. `LoadPanelAssemblyProject.ts` resolves the panel profile and the handwritten
   runtime parser validates input. JSON Schema files are not the runtime loader.
3. `createPanelAssemblyMapping()` expands each pose into panel metadata and LED
   positions. It uses compiled mechanics when current, but falls back to poses
   for manual or stale mechanics.
4. `createProvisionalWiringPreview()` uses a current persisted route when one
   exists, otherwise derives a labelled draft route from chain lengths and panel
   positions. A stale saved route remains evidence under `requires-review`; an
   incomplete stale route uses a temporary draft preview.
   `WiringRouteEditor.ts` keeps route changes in browser-only working state. An
   explicit confirmation writes the exact panel order and a new route revision;
   it does not create measured, GPIO, or hardware-ready facts.
   `createHardwareMappingContract()` assigns physical indices and builds the
   WLED ledmap.
5. Three.js renders panels, LEDs, surfaces, connectors, wiring, and available
   printable layers. One selected panel ID drives all selection-focused UI.
6. Every edit rebuilds mapping and wiring. Existing generated mechanics become
   `requires-regeneration`; manual mechanics become `requires-review`; a project
   that has never had mechanics remains mechanics-free without a stale status.
7. When the browser discovers an available local generator, **Generate 3D
   Parts** detects `boundaryTopology` when it is absent, persists the detected
   cycles in the generated Schema 2 JSON, validates the complete boundary, and
   only then invokes printable-part CAD. Ambiguous exposed-edge junctions and
   invalid boundaries fail without replacing the last successful bundle.
   Detection saves unambiguous cycles without a confirmation step. The browser
   has no control to accept, reject, reorder, or redraw those cycles.
8. Folder and ZIP project import validate the same relative assets and hashes,
   then expose GLB/STL bytes through browser object URLs. Folder/ZIP export uses
   only verified in-memory bytes. JSON, ledmap, and wiring remain client-side
   downloads. Local CAD writes an isolated preview under `build/`.

There is no database or browser `localStorage`. Persistence is loaded or
downloaded JSON, optional GLB references, generated downloads, and development
artifacts.

The portable project contract is a main `sculpture.json` plus relative,
hash-checked GLB and STL assets in a folder. Schema 2 can reference a boundary
mesh and ordered exact printable STL parts together with the canonical
panel/profile fingerprint that produced them. Fingerprint comparison is the one
current/stale authority and panel edits do not stop the pose-first application.
The browser sends one bounded multipart generation request with the JSON and
only the referenced, verified GLB bytes. The JSON field is limited to 5 MB and
the complete multipart request is limited to 64 MB. Before rendering or
staging, the server verifies the GLB SHA-256 and rejects missing, tampered, or
reserved paths. It copies the GLB to its unchanged safe relative path, verifies
the staged copy, validates every STL and hash, writes JSON last, and publishes
the complete folder by atomic directory replacement. The generated folder opens
directly and can become a ZIP without external asset injection.
Three.js loads those referenced bytes after SHA-256 verification. The browser
imports and exports the same layout as either a folder or ZIP without changing
saved paths and without a database or `localStorage`. See
[`MECHANICS_WORKFLOW.md`](MECHANICS_WORKFLOW.md).

Schema 2 accepts `boundaryTopology` as stable panel-ID/named-corner cycles. If
the field is absent, local generation detects deterministic cycles for an
unambiguous exposed-edge graph and saves them in the generated project. The
field contains no vertex positions or transforms. The browser derives and
validates the zero-thickness mesh on demand and displays it as a boundary
preview.

## Local desktop host

### Stage-zero bootstrap trust boundary

The repository contains one small native stage-zero executable for each
required target: Linux x86-64, macOS arm64, and macOS x86-64. These files are
an intentional tracked-binary exception. Their reviewed source, deterministic
build instructions, build receipt, sizes, and SHA-256 values are stored beside
them under `toolchains/bootstrap/`. Git and the standard POSIX shell are the
trust root for selecting and starting the exact native file.
A binary cannot independently prove the integrity of its own bytes.

The boundary covers hostile networks, replaced or truncated cache data, unsafe
archive metadata, and partial or concurrent runs. It does not cover a
compromised reviewed Git commit, a privileged host attacker, or a defect in an
upstream tool that passed all declared checks.

The stage-zero program supplies certificate-validated HTTPS, exact size and
SHA-256 checks, bounded archive handling, safe portable paths, and atomic
publication. Archive paths use printable ASCII and case-insensitive collision
checks. Relative symbolic links and hard links are accepted only when their
resolved targets stay inside the extracted tree. Escaping links, link cycles,
special files, duplicate paths, and unsafe path forms are rejected.

Linux CI rebuilds all three targets and checks the committed bytes. Each Linux
or macOS runner also starts its exact committed native executable. Windows is
not a current stage-zero target and does not gate this work.

The committed executables do not yet make a complete installation claim. The
operational dependency manifest must still pin the Node.js/npm and approved
relocatable Python artifacts before the base-toolchain installer can ship.

`npm run desktop` performs a fresh production web build and starts
`scripts/local-editor-server.ts` on `127.0.0.1:4173` by default.
`ORBITAL_LAB_PORT` selects another port. The host serves the built interface,
generated assets, `/api/generator-status`, and `/api/editor-pipeline`; the Vite
plugin adapts the same `createEditorPipelineHandler()` during development.

OpenSCAD is required but is not stored as an application binary in the
repository. `npm run setup:openscad` provides automatic repository-local setup
for the declared Linux and macOS targets and a Windows x86-64 candidate. Linux
uses OpenSCAD 2021.01 from the official AppImage and a
pinned `libgpg-error0` companion. macOS uses the official universal OpenSCAD
2026.06.12 snapshot. `toolchains/openscad-distributions.json` pins the declared
targets, URLs, exact sizes, SHA-256 checksums, source metadata, and license
references. The upstream macOS snapshot does not publish a verified exact
source revision, so the manifest does not claim one.
The Windows candidate uses
`https://files.openscad.org/OpenSCAD-2021.01-x86-64.zip`, size 21,884,613
bytes, SHA-256
`fb0caabf5bbc89f8f2f80c10b79ae64d697aaff6efd58b2756f5d6270edb7ba7`,
and executable `openscad.com`. Its source maps to tag `openscad-2021.01`,
commit `41f58fe57c03457a3a8b4dc541ef5654ec3e8c78`, and the
GPL-2.0-or-later-with-CGAL-exception license.

Setup does not need administrator access or a `PATH` change. Windows extracts
and validates the portable payload in repository-local staging. It does not use
an installer, system application directory, profile, or registry. The macOS
path rejects Rosetta, mounts the DMG read-only, and copies only
`OpenSCAD.app`. Setup records the selected target, version, artifacts, and
executable in its receipt. It verifies the staged tool before atomic
publication, reuses a valid target-specific install, and is safe to retry.

Startup probes an explicit `OPENSCAD` executable first. Without that override,
it prefers the valid receipt-backed managed tool for the current target and
then falls back to the system OpenSCAD command on `PATH`: `openscad` on Linux
and macOS, or `openscad.com` on Windows. Runtime version policy is 2021.01 for
Linux and the Windows candidate, and 2026.06.12 for macOS. The selected
result is published through the status endpoint. The browser disables only
printable generation when status is absent, malformed, unavailable, or
version-mismatched; pose editing, simulation, mapping, wiring, and persistence
remain usable. After setup or repair, restart the server because status and the
resolved executable belong to the startup runtime. Windows Server 2022 and
2025 x64 CI is surrogate proof only. Windows client qualification is deferred.
The Windows candidate code and checks remain, but Windows does not block the
INSTALL-011 bootstrap or INSTALL-012 required-target proof.

The server accepts loopback hosts only, and generation additionally requires a
same-origin request. Project data, assets, generated output, and OpenSCAD remain
on the local computer. Ctrl-C/SIGINT and SIGTERM close the HTTP listener and
active generator processes, with a bounded forced-stop fallback.

## Rendering and simulation

`SphereRenderer.ts` uses Three.js/WebGL, instanced LED sprites, solid PCB depth,
CSS2D labels/delete control, and separate surface, panel, closure, connector,
and wiring layers. Display modes include WLED color, logical index, and physical
index. A Fibonacci sphere is the fallback for arbitrary panel-free LED counts.

`WledEngine.ts` wraps `wasm/src/wled_engine.cpp`: 30 selected 1D effects,
eight palettes, one Segment-like state, explicit time, seeded randomness,
guarded writes, and a zero-copy `0x00RRGGBB` buffer. It excludes networking,
drivers, presets, multiple segments, 2D/audio effects, DDP, Art-Net, and firmware
configuration.

## Verification boundaries

The repository has three verification layers, and they prove different things:

- Vitest covers the active Schema 2 model, editing, placement, mapping/wiring,
  boundary validation, CAD staging, portable-project handling, local hosting,
  managed OpenSCAD, and the deterministic WLED host. Most CAD tests use a
  deterministic renderer so geometry contracts can run without OpenSCAD.
- Playwright Chromium has two real operator journeys. One covers mechanics-free
  JSON/GLB authoring, placement, editing, simulation, mapping, wiring, and save.
  The other covers folder/ZIP controls, exact GLB/STL transport, staleness,
  invalid assets, reopen, and object-URL cleanup.
- CI rebuilds and tests the pinned WLED runtime, runs TypeScript and Vite checks,
  validates managed OpenSCAD on the declared platforms, and renders canonical
  manual parts. It also uses real managed OpenSCAD for a generic boundary-parts
  smoke render. The dedicated `CI-010` journey remains open because CI does not
  yet combine automatic-topology coverage, invalid-input rejection before
  OpenSCAD, every exact part, and retained failure evidence in one contract.

The two browser journeys do not yet prove the complete arbitrary-project flow
through the **Generate 3D Parts** control. `UI-010` remains the vertical slice
that must join real placement/editing, automatic topology, local OpenSCAD,
exact-part display, ZIP export, and reopen without injected topology or assets.

Automatic installation is also incomplete. The committed stage-zero binaries
are the present trust root, but base-toolchain acquisition waits for the Python
provider decision in `HR-013`. `INSTALL-011B`, `INSTALL-011C`, and
`INSTALL-012` are therefore blocked rather than available implementation work.

## Current architectural seams

- Schema 1 remains in `Definition.ts`, its JSON Schema/migration fixture,
  procedural mapping, manual CAD types, generated-artifact loader, and tests.
  The browser normal path is Schema 2; legacy code is not the extension point.
- Manual and generic CAD coexist intentionally, but the manual wrapper still
  depends on Schema 1 types.
- Runtime Schema 2 validation is handwritten and shallow for nested manual
  mechanics; authored JSON can avoid some editor-regeneration fit checks.
- Large browser files combine UI state, rendering, and interaction concerns.
  Split them only as a behavior-preserving refactor with appropriate tests.
- Mapping and wiring operate while hardware-readiness data is provisional. See
  [`LED_MAPPING.md`](LED_MAPPING.md) before changing exports.
- Automatic gap detection deliberately rejects touching cycles whose welded
  junction has more than one incoming or outgoing cap edge. Correction tools
  for those ambiguous arrangements are not implemented. The browser also has
  no confirmation or correction control for an unambiguous detected cycle.
- The desktop package does not bundle OpenSCAD. Managed setup covers the
  current required Linux and native macOS targets. Windows x86-64 remains a
  candidate, and its client qualification is deferred. It does not block the
  INSTALL-011 bootstrap or INSTALL-012 proof for required targets.
- macOS proof uses native `macos-15` and `macos-15-intel` CI runners. The Intel
  runner label is scheduled to retire in August 2027, so CI must move to a
  supported native Intel label before that date.
- Playwright Chromium now operates the real local JSON and GLB controls,
  automatic placement, panel selection and deletion, WLED play/pause, mapping
  and wiring controls, and saved JSON. It also fails on browser page or console
  errors. A second real-browser journey operates folder and ZIP import and
  export, verifies exact GLB/STL bytes and hashes, checks current and stale
  mechanics, rejects missing or tampered assets, reopens the exported ZIP, and
  verifies object-URL release when a project is replaced.
- ZIP import validates paths and hashes but does not yet enforce entry-count,
  per-entry size, aggregate uncompressed-size, or compression-ratio limits
  before buffering the archive (`SEC-010`).
- Automatic surface placement distributes panel centers but does not preflight
  complete panel footprints for overlap (`PLACE-010`).

See [`ROADMAP.md`](ROADMAP.md) for gaps and proposed sequencing, and
[`DECISIONS.md`](DECISIONS.md) for choices supported by code and history.
