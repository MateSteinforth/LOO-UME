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
2. `createPanelAssemblyMapping()` expands authoritative poses into panels, LED
   world positions, logical indices, and mapping metadata.
3. `createProvisionalWiringPreview()` uses the saved route or creates a labelled
   draft suggestion. Confirming a route writes exact ordered panel IDs.
4. `createHardwareMappingContract()` compiles physical indices and the WLED
   ledmap from the same current project.
5. `preflightPanelBoundaryParts()` is the shared browser/CLI fit gate. It
   derives or reuses corner-only gap cycles and validates the closed boundary,
   PCB envelopes, and compiled closure topology before Manifold or publication.
   `compilePanelBoundaryBundle()` then compiles the exact STL bytes.
6. `runStructuralPipeline()` derives eligible anchors from the same poses and
   profile, runs advisory load-path analysis, and compiles either modular
   connector ribbons or LED-surface bridges into exact STL/3MF assets.
7. The assembly package joins project JSON, verified GLB/STL bytes, printable
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

`web/src/main.ts` coordinates loading, editing, rendering, mapping, wiring,
generation, and export. Focused modules own portable projects, assembly-package
bytes, renderer state, route editing, mapping, and Manifold runtime handling.
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

The browser proves a logical-to-physical permutation in memory. It does not yet
prove an installed ESP32 sculpture. The 41-panel project stores an authored
assumed route with chain lengths `11/10/10/10`, GPIOs 16–19, RGB order, snake
pixel order, and route-optimized installed quarter turns.

Installed address calibration is separate from pose. Poses own LED world
positions. A back-view quarter-turn/mirror transform changes only local wire
indexing. Bus reversal is false so route and ledmap remain the direction
authorities.

Mapping readiness is separate from electrical approval. A production bundle
must bind the current project, route, ledmap, WLED bus fragment, target identity,
and exact file hashes. Hardware-verified state remains blocked until accepted
`PROOF-010` evidence exists.

At 60 mA per pixel, 2,624 pixels can require 157.44 A at 5 V. Full-sculpture
operation waits for the `PWR-010` supply, injection, wire, fuse, voltage-drop,
and current-limit plan. Software brightness limiting is secondary protection.

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
| `tests/browser/` | Real Chromium operator journeys |
| `wasm/` | Deterministic subset of WLED 1D effects, not firmware |
| `firmware/` | Future constraints only; no buildable firmware |

## Verification boundaries

- Vitest covers Schema 2 parsing, editing, placement, mapping, wiring, boundary
  validation, structural analysis/connectors, Manifold solids, exact asset
  handling, local hosting, and WASM.
- Playwright covers real authoring, project portability, route editing,
  in-browser part generation, package contents, and ZIP reopen.
- CI verifies stage-zero binaries and the same restricted-PATH clean setup on
  Linux x86-64 plus native macOS arm64 and x86-64 runners. It also verifies
  WLED WASM, TypeScript, Vite, Chromium journeys, and real Manifold STL output.

These checks do not prove physical fit, electrical safety, firmware behavior,
network transport, or full native WLED effect parity.
