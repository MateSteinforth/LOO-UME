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

Fabrication is a separate, optional branch. Three routes share the same panel
poses and hardware profile:

```text
(no mechanics fields) ----------> complete pose-first interface, no CAD
manualMechanics ----------------> verified wrappers around parts/*.scad
mechanicalShell + closures -----> planar validation -> Manifold STL parts
structuralDesign ----------------> anchors -> truss -> analysis -> optimization
```

The structural branch implements the Schema 2 input contract, pose/profile
normalization, preview support policy, deterministic candidate graph, linear 3D
truss analysis, bounded load-path optimization, artifact manifest, and stale
fingerprint. Printable Manifold solids and export remain the ordered
`TRUSS-015` through `TRUSS-018` tasks. It does not replace the two existing
fabrication routes.

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

The GLB is only a placement surface. Printable generation uses panel poses and
the hardware profile only. It puts flat caps on the holes between panel
outlines. A leftover JSON mechanical shell is not generate input. Detection
welds exact panel corners, removes oppositely wound shared edges, and traces
each unambiguous exposed-edge cycle. The generator may assume each hole is a
flat simple N-gon, but it validates that assumption and refuses ambiguous,
invalid, or non-manifold results. The GLB does not supply or suggest gap
topology.

## Simulator-to-hardware boundary

The browser currently proves a logical-to-physical permutation in memory. It
does not yet prove an ESP32 installation. The 41-panel project stores an
authored assumed route with chain lengths `11/10/10/10` and assumed GPIOs
16–19. Each panel stores a route-optimized assumed quarter turn in a back-view
frame; mirroring is false. Panel pixel order is the assumed snake and WLED color
order is the assumed RGB contract.
Schema 2 can now represent draft, authored, requires-review, measured, and
hardware-verified wiring. The last state defines a structured `PROOF-010`
receipt but cannot activate until that task provides an acceptance validator.
No current project contains measured route facts or a receipt. The current
Mapping readiness is separate from electrical approval. Voltage, temperature,
and device read-back do not change the simulator-to-controller permutation.

The WLED review deployment is generated from the same hardware mapping. It
contains an exact four-bus configuration fragment and the ledmap. A canonical
manifest hashes the exact bytes and records the source-project hash and pinned
target. Its own exact-byte SHA-256 is the external deployment identity. The
review bundle cannot set hardware readiness.

The target hardware-parity flow keeps sculpture JSON as the authority and makes
the simulator a faithful view of it:

```text
authoritative panel poses + selected panel profile assumptions
                         |
confirmed ordered route + installed orientation
                         |
logical LED index -> ledmap -> global WLED physical index
                         |
four bus ranges -> GPIO -> panel DIN-to-DOUT chain
                         |
pinned firmware/config identity -> optional address diagnostic
```

Installed addressing does not introduce another pose. The pose basis still
defines display-local coordinates and world positions. A separate assumed
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
| `src/sculpture/StructuralDesign.ts` | Validate optional structural inputs and derive sorted panels, eligible anchors, supports, load points, warnings, and structural fingerprints | No second panel schema; blocked holes and GLB triangles are excluded |
| `src/structure/CandidateTruss.ts` | Put one bracket and rear hub at every eligible anchor, add local ties and collision-checked inter-panel candidates, then prove connectivity and redundant paths | Candidate members avoid expanded PCB envelopes and deterministic length limits; rejected candidates remain diagnostic evidence |
| `src/structure/TrussSolver.ts` | Compile normalized supports and loads onto candidate hubs, assemble and solve the linear 3D axial stiffness model, and select governing member cases | Three translational DOFs per node; N/mm/MPa units; singular systems fail before results are published |
| `src/structure/TrussOptimizer.ts` | Remove low-load or long-compression candidates, preserve redundant stable paths, round member diameters, reapply self-weight, and retain an objective trace | Bounded iterations report converged, infeasible, or iteration-limit status; no failed optimization can become printable geometry |
| `src/sculpture/SculptureEditor.ts` | Add/move/rotate/delete/seed and mechanics invalidation | Editing does not require successful CAD |
| `src/sculpture/MechanicalShellRegenerator.ts` | Rebuild supported planar topology after edits | Rejects unsafe or ambiguous mechanics |
| `src/sculpture/PanelOutlineBoundary.ts` | Derive exact panel rectangles, detect deterministic unambiguous gap cycles, validate flat caps, and emit a closed boundary | Gap topology stores connectivity only; poses/profile own all coordinates |
| `src/cad/CompilePanelBoundaryBundle.ts` | Compile one validated panel boundary into a complete in-memory asset set | Removes stale shell/closure input before deriving current output |
| `src/cad/GeneratePanelClosureSolids.ts` | Build generic closure solids with pinned Manifold | Active generic mesh kernel; releases WASM objects after use |
| `src/cad/GeneratePanelBoundaryParts.ts` | Detect and persist missing gap topology, then turn the validated boundary into a staged, hash-verified exact STL bundle | Publishes the manifest only after every file validates |
| `src/cad/GeneratePanelClosureCad.ts` | Retained SCAD compatibility emitter | Not the active generic browser or local-service mesh kernel |
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

1. `web/src/main.ts` starts with the empty 66 mm rhombicosidodecahedron project, or loads
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
5. The standalone wiring-manual entry joins the same mapping-ready contract to
   authoritative poses and the resolved panel profile. It renders print-only
   placement projections and per-output assembly tables; it rejects draft,
   temporary, stale, or non-mapping-ready data.
6. Three.js renders panels, LEDs, surfaces, connectors, wiring, and available
   printable layers. One selected panel ID drives all selection-focused UI.
7. Every edit rebuilds mapping and wiring. Existing generated mechanics become
   `requires-regeneration`; manual mechanics become `requires-review`; a project
   that has never had mechanics remains mechanics-free without a stale status.
8. When the browser discovers an available local generator, **Generate 3D
   Parts** detects `boundaryTopology` when it is absent, persists the detected
   cycles in the generated Schema 2 JSON, validates the complete boundary, and
   only then invokes printable-part CAD. Ambiguous exposed-edge junctions and
   invalid boundaries fail without replacing the last successful bundle.
   Detection saves unambiguous cycles without a confirmation step. The browser
   has no control to accept, reject, reorder, or redraw those cycles.
9. Folder and ZIP project import validate the same relative assets and hashes,
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

Schema 2 also accepts optional `structuralDesign` inputs. The normalizer sorts
panels and profile holes by stable ID, transforms each eligible local hole with
the saved right-handed pose, and derives panel corners and connector load
points from the same pose/profile facts. A structural artifact set uses the
separate `generatedStructure` manifest and cannot coexist with planar generated
mechanics or manually authored mechanics. Its source fingerprint includes the
panel poses, structural inputs, and relevant profile facts.

Candidate generation puts one rear hub behind each eligible screw anchor and
fully ties the hubs on each panel. It considers stable inter-panel hub pairs,
rejects pairs longer than twice the configured unsupported compression length,
and rejects segments that intersect any PCB oriented box plus the measured
surface-flush clearance. The result is accepted only when every hub is
connected and no structural member is a graph bridge.

The truss solver gives each hub three translational degrees of freedom. It
assembles standard axial member stiffness from length, direction, circular
area, and Young's modulus. Constrained degrees of freedom are removed before a
single deterministic Cholesky factorization is reused for all load cases.
Panel and member mass produce gravity nodal loads. Face loads are shared across
one panel's hubs; corner and cable loads use the nearest eligible hub. A small
or non-positive pivot reports insufficient supports or a mechanism.

Optimization uses results from every load case. It removes only inter-panel
candidates that stay below the force threshold in all cases or carry
compression beyond the unsupported-length limit. A removal batch is accepted
only after bridge-free validation and a maximum-diameter capacity solve. The
remaining diameters round up to authored printable increments for stress,
buckling, and displacement, then member self-weight is solved again.

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

Generic printable-part generation uses pinned `manifold-3d` 3.5.1 in Node and
in the browser; it does not install, probe, or execute OpenSCAD.
The local status endpoint reports `generator: "manifold"` and version `3.5.1`.
The browser disables only printable generation when that status is absent,
malformed, or unavailable; pose editing, simulation, mapping, wiring, and
persistence remain usable.

The leftover generic OpenSCAD sculpture path is rejected. Manual
`parts/*.scad` sources remain authored truth and keep their separate OpenSCAD
render route.

The server accepts loopback hosts only, and generation additionally requires a
same-origin request. Project data, assets, generated output, and Manifold
compilation remain on the local computer. Ctrl-C/SIGINT and SIGTERM close the
HTTP listener, with a bounded forced-stop fallback.

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

## Current milestone status

The integrated baseline combines the pose-first editor and portable folder/ZIP
contract with generic Manifold generation and the exact authored wiring route.
The default pose-only rhombicosidodecahedron GLB is a placement surface;
printable generic parts derive from authoritative panel outlines and are built
with pinned `manifold-3d` 3.5.1. The manual `parts/*.scad` route remains
separate because it contains the physically tested U-frame structure.

Schema 2 stores the exact ordered route, GPIOs, RGB/snake assumptions, and
route-optimized installed quarter turns. The simulator, wiring-manual export,
WLED bus contract, and generated ledmap share that mapping authority.

Automatic installation is incomplete. The committed stage-zero binaries are
the present trust root. Node.js/npm and relocatable Python acquisition wait
for the Python provider decision in `HR-013`, so `INSTALL-011B`,
`INSTALL-011C`, and `INSTALL-012` are blocked rather than Ready work.

## Verification boundaries

The repository has three verification layers, and they prove different things:

- Vitest covers the active Schema 2 model, editing, placement, mapping/wiring,
  boundary validation, CAD staging, portable-project handling, local hosting,
  Manifold solids, mapping/wiring, portable assets, and the deterministic WLED
  host. Manual SCAD remains outside generic generation.
- Playwright Chromium has four operator journeys: mechanics-free authoring,
  portable folder/ZIP round-trip, authored wiring-route confirmation, and real
  **Generate 3D Parts** Manifold STL export.
- CI rebuilds the pinned WLED runtime, runs TypeScript and Vite checks, and
  generates the prism fixture with Manifold. Canonical manual SCAD rendering
  remains a separate verification route.

Automatic installation is incomplete. The committed stage-zero binaries are
the present trust root, but base-toolchain acquisition waits for the Python
provider decision in `HR-013`.

## Current architectural seams

- Generic printable-part generation uses pinned `manifold-3d` 3.5.1 in the
  local pipeline and in the browser. OpenSCAD is reserved for the separate
  manual `parts/*.scad` route.
- Schema 1 remains in `Definition.ts`, its JSON Schema/migration fixture,
  procedural mapping, manual CAD types, generated-artifact loader, and tests.
  The browser normal path is Schema 2; legacy code is not the extension point.
- Manual and generic CAD coexist intentionally, but the manual wrapper still
  depends on Schema 1 types.
- Runtime Schema 2 validation is handwritten and shallow for nested manual
  mechanics; authored JSON can avoid some editor-regeneration fit checks.
- Large browser files combine UI state, rendering, and interaction concerns
  (`web/src/main.ts` is about 1,800 lines, `SphereRenderer.ts` about 1,200,
  `SurfacePlacementController.ts` about 800). Split them only as a
  behavior-preserving refactor with appropriate tests (`ARCH-010`), and not
  while `UI-010` is in progress.
- Mapping and wiring operate while hardware-readiness data is provisional. See
  [`LED_MAPPING.md`](LED_MAPPING.md) before changing exports. Runtime wiring
  validation currently requires controller status to remain provisional, so a
  measured production-ready state is not reachable end to end.
- Automatic gap detection deliberately rejects touching cycles whose welded
  junction has more than one incoming or outgoing cap edge. Correction tools
  for those ambiguous arrangements are not implemented. The browser also has
  no confirmation or correction control for an unambiguous detected cycle.
- The desktop package does not install or bundle OpenSCAD for generic
  generation. Generic generation uses Manifold 3.5.1; manual SCAD authoring is
  a separate workflow.
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
- Automatic surface placement sits panels on connected planar mesh faces with
  those face normals. It does not yet preflight complete panel footprints for
  overlap (`PLACE-010`).

See [`ROADMAP.md`](ROADMAP.md) for gaps and proposed sequencing, and
[`DECISIONS.md`](DECISIONS.md) for choices supported by code and history.
