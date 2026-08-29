# Architecture

## System shape

LOO/UME is a generative sculpture compiler and browser editor for pose-first,
panel-based LED sculptures.
Schema 2 sculpture JSON and the selected panel profile are the authorities.

```text
Schema 2 JSON + panel profile
             |
       panel poses
       /    |    \
    view  mapping  wiring
       \    |    /
      assembly package
        /         \
 planar closure  structural connectors
        \         /
       exact Manifold assets
```

Fabrication is optional. A project without `mechanicalShell`, `closures`, or
generated assets can load, edit, simulate, map, wire, save, and reopen. A panel
edit marks derived mechanics stale but does not stop those functions.

## Authoritative data flow

1. `parsePanelAssemblyDefinition()` is the central deep Schema 2 runtime
   validator. `LoadPanelAssemblyProject.ts` is the thin CLI file adapter, while
   browser and portable-project adapters use the same profile-resolving loader.
2. `panelEmitterLocalPositions()` normalizes an optional row-major pose-local
   grid-coordinate emitter list or derives the legacy rectangular grid.
   `createPanelAssemblyMapping()` expands those positions through authoritative
   poses into LED world positions, logical indices, and mapping metadata.
   The separate optional carrier contract affects display geometry and tool
   capability only; it does not become a second address authority.
3. `optimizeAutomaticWiring()` can write a deterministic balanced route, GPIO
   set, and physical local-Z panel orientation. `createProvisionalWiringPreview()`
   uses that saved route or creates a labelled legacy draft suggestion.
4. `createHardwareMappingContract()` compiles physical indices and the WLED
   ledmap from the same current project.
5. `createMadMapperFixtureBundle()` derives the supported SVG fixture atlas and
   patch manifest from a mapping-ready hardware contract.
   `createMadMapperPackageZip()` adds the readable CSV and draft settings PDF;
   final network values remain evidence-gated.
6. `preflightPanelBoundaryParts()` is the shared browser/CLI fit gate. It
   derives or reuses corner-only gap cycles and validates the closed boundary,
   PCB envelopes, and compiled closure topology before Manifold or publication.
   `compilePanelBoundaryBundle()` then compiles the exact STL bytes.
7. `runStructuralPipeline()` derives eligible anchors from the same poses and
   profile, runs advisory load-path analysis, and compiles either modular
   connector ribbons or LED-surface bridges into exact STL/3MF assets.
8. The assembly package joins project JSON, verified GLB/STL bytes, printable
   manual, ledmap, and wiring review. Project ZIP remains the normal save form.

There is no database or browser local storage. Persistence uses project JSON,
safe relative asset references, SHA-256 values, downloaded folders, and ZIPs.
Before extraction, ZIP import reads the bounded central directory and rejects
excessive archive bytes, entry count, per-entry expansion, total expansion,
suspicious compression ratios, ZIP64, multi-disk, encrypted, or inconsistent
entries. Streaming extraction checks local entries against that preflight
before it buffers their bytes.

`bootstrap.sh` selects a reviewed native stage-zero executable. The strict
install manifest pins official Node.js archives by target, byte size, SHA-256,
and extracted-tree identity. It installs Node/npm and dependencies only below
the repository, then proves the production desktop and Manifold path.

## Geometry and fabrication boundary

Panel poses remain authoritative. A GLB can constrain placement but is not
printable material and cannot replace a saved pose. Printable generation:

```text
poses + panel outline
        |
exposed-edge gap detection
        |
flat simple N-gon caps
        |
planarity / winding / intersection / manifold validation
        |
pinned manifold-3d 3.5.1
        |
boundary.stl + exact part STLs
```

`GeneratePanelClosureSolids.ts` owns the printable solid construction.
`CompilePanelBoundaryBundle.ts` owns the in-memory boundary and asset contract.
`GeneratePanelBoundaryParts.ts` writes a verified bundle through a temporary
directory and atomic publication. The browser uses the same in-memory compiler.

The first generator supports layouts where each detected gap is a flat simple
N-gon. Ambiguous junctions, invalid caps, intersections, or non-manifold
boundaries fail before asset publication. Printable material must stay outside
PCB envelopes and keep DIN, DOUT, V+, V-, and blocked mounting holes clear.

Fabrication converts measured back-view hardware coordinates into the outward
pose frame before planar or structural hole allocation. The structural route
does not use GLB triangles. It derives eligible mounting holes and DIN/DOUT
clearance volumes from panel poses and the selected profile. Its axial truss
results guide
load paths but are not engineering certification. Printable ribbon and bridge
solids still require exact hardware-clearance, PCB-envelope, Manifold, and
print-envelope checks. See `docs/STRUCTURAL_WORKFLOW.md`.

## Browser and local host

`web/src/main.ts` coordinates editing, rendering, mapping, wiring, generation,
and export. `ProjectLoader.ts` owns the stateless registry and Schema 2 loading
adapter; it returns the existing project and mapping/wiring contract without
owning application state. Other focused modules own portable projects,
assembly-package bytes, renderer state, route editing, mapping, and Manifold
runtime handling.
`AssemblyTutorial.ts` is a stateless view model over `WiringPreview`; it adds no
saved route or tutorial state. `SphereRenderer.ts` applies its temporary panel
visibility mask, reuses the normal back-side connector and cable layers, shows
one bright-red solder connection while muting the other selected-chain cables,
keeps referenced printable assets
visible, and does not mutate the user-controlled camera. Cable curves use a
control point inside the endpoint radius relative to the current sculpture
center. The
controller is a schematic near-top placement derived from the complete current
route; it is not a second saved wiring authority.
The populated 41-panel Schema 2 project is the browser default. Empty authoring
projects remain explicit registry choices.
The sidebar has no wizard state or numbered progression. Project and View remain
available, followed by always-editable Shape, Fixtures, Mapping, Fabrication,
Build Hardware, and Export toolboxes. Animation controls stay in View because
they remain useful throughout the work. Mapping owns route optimization, its
advanced editor, and the mapping-ready MadMapper ZIP. Build Hardware owns ESP32
setup and the connection-by-connection assembly tutorial. Each loaded fixture
profile controls which placement and fabrication actions are enabled; mapping,
simulation, hardware setup, and export do not wait for an irrelevant fabrication
step.
The renderer offsets LED sprites 2.4 mm along each panel's outward normal. This
is a display-only separation from the PCB plane; it does not change mapping or
saved panel poses. The transparent WebGL canvas uses the viewer's radial and
linear CSS gradient as its world backdrop.
Selecting a panel through the viewport, its label, or a route row stops slow
auto-rotation and clears the matching View checkbox. This is view state only;
selection and rotation never change a saved pose.
Surface mode keeps the established constrained move and local-Z rotation.
Free 6DOF mode uses local translation and rotation controls, writes one
right-handed pose, and removes the old surface attachment. Structural downloads
ZIP the same hash-verified connector asset set shown in the viewport.

Manifold normally runs in the browser. The local server and Vite adapter share
`createEditorPipelineHandler()`, which is a bounded loopback/same-origin fallback
for a Manifold runtime-load failure. Geometry and validation errors do not use
the fallback. The JSON field is limited to 5 MB and the complete multipart
request to 64 MB.

The server verifies referenced GLB bytes and safe relative paths before staging.
It writes all STL files, verifies hashes and mesh structure, writes JSON last,
and publishes the completed directory atomically.

## Simulator-to-hardware boundary

The browser proves a logical-to-physical permutation in memory. The
receipt-bound browser flash, Improv setup, one-panel smoke test, and three-panel
DDP/preset/reconnect/power-cycle path have physical evidence. They do not prove
the complete 41-panel sculpture. The 41-panel project stores an authored assumed
route with chain lengths `11/10/10/10`, GPIOs 16–19, measured GRB
order, measured straight row-major pixel order, and route-optimized installed
quarter turns.

New automatic routes rotate the authoritative panel pose around local Z so the
viewport and assembly tutorial show physical DIN/DOUT locations. The resulting
installed-address transform is route-optimized identity; it is not a second
mechanical orientation authority. Legacy address-only turns remain loadable and
are folded into the pose by explicit optimization. Bus reversal is false.

The optimizer uses one to four balanced outputs with at most 11 panels each and
assigns GPIOs 16–19 in output order. If no generated-part manifest exists, it
may evaluate all four quarter turns. Once `generatedMechanics` or
`generatedStructure` exists, including a stale manifest, the durable gate allows
only the current pose or a 180-degree turn. This prevents a stale fingerprint
from reopening 90-degree choices after fabrication.

Mapping readiness is separate from electrical approval. A production bundle
must bind the current project, route, ledmap, WLED bus fragment, target identity,
and exact file hashes. Complete hardware-verified state remains blocked until
accepted `PROOF-010` evidence exists for all 2,624 addresses.

The local editor serves the receipt-bound flash image and brokers the later
WLED HTTP configuration/read-back calls. The browser supplies only the private
IPv4 address returned by the verified Improv session and a fixed WLED operation.
The loopback handler rejects public targets, arbitrary paths, redirects, and
oversized request or response bodies. This same-origin boundary avoids browser
cross-origin/private-network restrictions without making a general LAN proxy.

For a loaded sculpture of one to 41 complete 8x8 panels on up to four outputs,
the editor derives LED count, GPIOs, ledmap, current values, and animation directly
from the current simulator. There is no separate configuration choice. It saves
the selected native WLED
effect, palette, speed, intensity, colors, and brightness as preset 1 and makes
it the boot preset. The setup config writes the boot-preset selection once.
Later preset writes omit both WLED's immediate API-call flag and the boot-preset
field, so they use only its asynchronous state-save path; exact eventual read-
back still requires boot preset 1. The editor pauses DDP, drains an in-flight
frame, and sends `live:false` before the snapshot so WLED cannot save a frozen
realtime segment instead of the selected native effect.
It restarts WLED and verifies the config, preset, state,
device identity, and boot-preset selection before setup succeeds. Because HTTP
can recover after discovery, this complete snapshot has a bounded retry. Later
control changes update the same standalone preset.
The browser suspends DDP for the complete setup operation. This prevents a live
frame from freezing WLED realtime state before the native preset is verified.
It also drains prior reconnect, preset-save, and frame requests before flashing.

FIRM-014 implements the exact loaded framebuffer as a separate DDP preview. The
loopback host accepts only 1 to 2,624 RGB pixels, splits frames into WLED's
1,440-channel DDP packets, and sends them only to a private IPv4 address on
fixed DDP port 4048. WLED is
configured with a 2.5-second realtime timeout so it can resume the saved native
animation if the browser, host, network, or laptop stops sending frames. The
editor keeps one request in flight, updates at no more than 10 frames per
second, and backs off after a network error. The sender applies the pinned WLED
2.2 color-gamma curve because realtime input is configured with `no-gc: true`;
native and DDP pixels therefore use the same output color pipeline. This is a
bounded test-sculpture link for the loaded sculpture.
After a page reload, the link reconnects only if the fixed mDNS name, private
IP, MAC, ESP32 identity, LED count, and complete persisted loaded bus set still
match. Automatic discovery starts only after this browser origin completed a
successful setup/link or still has permission for the approved CP2102. A
hardware-free browser does not probe `loo-ume.local`. A panel pose edit
intentionally changes the spatial ledmap but not the
physical route or bus layout. After identity and bus verification, reconnect
uploads that valid changed map, activates map 0 through the WLED state API,
verifies the active map and exact stored bytes, and only then updates the
standalone preset and resumes DDP. Invalid map JSON and all other contract
mismatches still stop without a controller mutation.
The operator physically confirmed on the 192-LED three-panel project that WLED
leaves DDP realtime mode and runs the saved native animation. A USB power cycle
also restored the same animation without the simulator.

`src/wled/DiagnosticFrames.ts` derives deterministic low-brightness, one-pixel
frames from the same deployment identity and mapping contract. Its bounded HTTP
adapter transports exact WLED JSON requests; it does not create observation
evidence or a second mapping authority.

Electrical design and protection are external operator responsibilities. WLED
current values are copied operating assumptions, not electrical approval.

## Subsystems

| Area | Responsibility |
| --- | --- |
| `sculptures/` | Authored Schema 2 projects and their referenced design assets |
| `catalog/` | Reusable panel dimensions, holes, connectors, corrections, and electrical assumptions |
| `src/sculpture/PanelAssembly.ts` | Schema 2 parser, pose compilation, mapping geometry |
| `src/sculpture/SculptureEditor.ts` | Panel mutations and derived-state invalidation |
| `src/sculpture/PanelOutlineBoundary.ts` | Gap detection and closed-boundary validation |
| `src/cad/CompilePanelBoundaryBundle.ts` | Boundary and exact Manifold STL bundle |
| `src/cad/GeneratePanelClosureSolids.ts` | Printable Manifold solids |
| `src/cad/GeneratePanelBoundaryParts.ts` | Atomic file publication |
| `src/sculpture/StructuralDesign.ts` | Structural inputs, defaults, warnings, fingerprints |
| `src/structure/StructuralPipeline.ts` | Candidate, advisory solve/optimization, and structural composition |
| `src/cad/CompileStructuralArtifacts.ts` | Exact structural STL, preview, and 3MF bundle |
| `web/src/` | Browser editor, renderer, mapping, wiring, project and package export |
| `scripts/editor-pipeline-handler.ts` | Bounded local fallback handler |
| `scripts/esp32-firmware-handler.ts` | Loopback-only, receipt-gated complete ESP32 image endpoint |
| `scripts/esp32-device-handler.ts` | Loopback-only, bounded private WLED HTTP and 1-to-2,624-pixel segmented DDP broker |
| `tests/browser/` | Real Chromium operator journeys |
| `wasm/` | Deterministic subset of WLED 1D effects, not firmware |
| `firmware/` | ESP32 receipt, setup procedure, and smoke configuration; WLED build tooling and binaries stay off-main |
| `src/wled/` | Guarded deployment identity and deterministic diagnostic frame transport |

## Verification boundaries

- Vitest covers Schema 2 parsing, editing, placement, mapping, wiring, boundary
  validation, structural analysis/connectors, Manifold solids, exact asset
  handling, local hosting, and WASM.
- Playwright covers real authoring, project portability, route editing,
  in-browser part generation, package contents, and ZIP reopen.
- Each push and pull request runs one fast gate: locked dependency install,
  checked-in WLED WASM verification, TypeScript, and the Vite production build.
- A nightly GitHub Actions schedule runs the full suite at 02:17 UTC. The
  **Run workflow** action can also start it on demand. It adds Vitest, Chromium
  journeys, real Manifold STL output, stage-zero binary checks, and
  restricted-PATH clean setup on Linux x86-64 and native macOS arm64 and
  x86-64 runners.

These checks do not prove physical fit, electrical safety, firmware behavior,
network transport, or full native WLED effect parity.
