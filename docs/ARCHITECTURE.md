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
  3D/LED view   logical map   provisional wiring
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
wire, save, and reopen without a placeholder shell. Generic 3D-part generation
stays disabled until supported generation input exists.

The remaining UI-driven fabrication target extends that lifecycle rather than
adding another pose authority:

```text
referenced GLB -> automatic placement -> manual pose edits
                                      |
                               Generate 3D Parts
                                      |
 panel poses + profile -> panel outlines + accepted corner-only gap cycles
                                      |
                    validated closed boundary -> Three.js preview
                                      |
                       validated printable part generation
                                      |
                 referenced exact STL files -> Three.js
```

The GLB is still only a placement surface. The generated boundary comes from
panel outlines and planar gap caps. The first generator may assume users arrange
panels so each gap is a flat simple N-gon, but it must validate that assumption
and refuse invalid or non-manifold results.
## Subsystems


| Area | Responsibility | Boundary |
| --- | --- | --- |
| `sculptures/` | Authored Schema 2 projects and one legacy migration fixture | Project truth; do not hand-edit derived maps instead |
| `catalog/` | Reusable panel dimensions, grid, holes, connectors, corrections, electrical facts | Hardware truth shared by projects |
| `src/sculpture/PanelAssembly.ts` | Schema 2 parsing, pose compilation, face graph, LED geometry | Active model; poses remain authoritative |
| `src/sculpture/SculptureEditor.ts` | Add/move/rotate/delete/seed and mechanics invalidation | Editing does not require successful CAD |
| `src/sculpture/MechanicalShellRegenerator.ts` | Rebuild supported planar topology after edits | Rejects unsafe or ambiguous mechanics |
| `src/sculpture/PanelOutlineBoundary.ts` | Derive exact panel rectangles, validate accepted flat cap cycles, and emit a deterministic closed boundary | Gap topology stores connectivity only; poses/profile own all coordinates |
| `src/cad/GeneratePanelClosureCad.ts` | Generic flat closures from compiled planar faces | Not an arbitrary curved/GLB generator |
| `src/cad/GenerateCad.ts`, `parts/` | Legacy-typed wrappers around tested manual parts | Separate from generic CAD |
| `web/src/` | UI, Three.js rendering, placement, mapping, routing, export | `main.ts` owns most application state |
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
4. `createProvisionalWiringPreview()` derives deterministic routes from chain
   lengths and panel positions. `createHardwareMappingContract()` assigns
   physical indices and builds the WLED ledmap.
5. Three.js renders panels, LEDs, surfaces, connectors, wiring, and available
   printable layers. One selected panel ID drives all selection-focused UI.
6. Every edit rebuilds mapping and wiring. Existing generated mechanics become
   `requires-regeneration`; manual mechanics become `requires-review`; a project
   that has never had mechanics remains mechanics-free without a stale status.
7. JSON, ledmap, and wiring downloads are client-side files. Local development
   CAD writes an isolated preview under `build/`; it does not replace canonical
   sculpture JSON.

There is no database or browser `localStorage`. Persistence is loaded or
downloaded JSON, optional GLB references, generated downloads, and development
artifacts.

The portable project contract is a main `sculpture.json` plus relative,
hash-checked GLB and STL assets in a folder. Schema 2 can reference a boundary
mesh and ordered exact printable STL parts together with the canonical
panel/profile fingerprint that produced them. Fingerprint comparison is the one
current/stale authority and panel edits do not stop the pose-first application.
Folder asset loading, exact-STL display, and optional ZIP transport remain later
milestones. See
[`MECHANICS_WORKFLOW.md`](MECHANICS_WORKFLOW.md).

Schema 2 may now accept `boundaryTopology` as stable panel-ID/named-corner
cycles. It contains no vertex positions or transforms. The browser derives and
validates the zero-thickness mesh on demand and displays it as a boundary preview.

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
- The current generic CAD path starts from a pre-authored planar boundary. The
  target UI flow instead creates the boundary from panel outlines and validated
  flat N-gon gap caps before reusing the downstream printable-part constraints.

See [`ROADMAP.md`](ROADMAP.md) for gaps and proposed sequencing, and
[`DECISIONS.md`](DECISIONS.md) for choices supported by code and history.
