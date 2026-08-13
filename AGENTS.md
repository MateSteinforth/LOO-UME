# Codex project guide

This repository is a pose-first editor and fabrication toolkit for panel-based
LED sculptures. The browser application is **WLED Orbital Lab**. Start with
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); use
[`docs/PANEL_SYSTEM.md`](docs/PANEL_SYSTEM.md) for geometry work and
[`docs/LED_MAPPING.md`](docs/LED_MAPPING.md) for addressing or wiring work.

## Sources of truth

- Authored projects: `sculptures/*/sculpture.json` (active format: Schema 2).
- Reusable PCB facts: `catalog/panels/ws2812b-8x8-66x65.json`.
- Runtime Schema 2 contract and mapping compiler: `src/sculpture/PanelAssembly.ts`.
- Editor mutations and mechanical invalidation: `src/sculpture/SculptureEditor.ts`.
- Browser orchestration: `web/src/main.ts`; mapping and wiring are under
  `web/src/`.
- Physically tested manual CAD: the three canonical files under `parts/`.
  Never make numbered copies; Git is the version history.
- Generated STL, PNG, ledmap, panel-map, and `build/` files are artifacts, not
  authored geometry or mapping truth.

Schema 1 (`src/sculpture/Definition.ts`, `schemas/sculpture.schema.json`, the
legacy migration fixture, and old mapping/CAD tests) is retained legacy code.
Do not build new features on it. The current browser path loads Schema 2 and
uses `createPanelAssemblyMapping()`.

## Architectural guardrails

- Panel poses are authoritative. A mechanical face, GLB, or surface attachment
  may constrain editing but must not silently replace a saved pose.
- Mapping, wiring, and simulation must continue after a panel edit even when
  printable mechanics are stale or unavailable.
- Today the Schema 2 parser still requires exactly one of `manualMechanics` or
  `mechanicalShell` + `closures`. Mechanics-optional projects are a target,
  not yet valid input.
- GLBs are authoring surfaces only. Generic printable geometry is derived from
  a supported planar JSON face graph, never directly from arbitrary GLB mesh
  triangles.
- Preserve manual mechanics. The generic planar generator does not reproduce
  the 41-panel U-frame structure.
- Never change proven panel angles, triangle handedness `-1`, the 0.20 mm
  hole-edge correction, or the 0.50 mm surface-flush correction without an
  explicit new physical result.
- Printable material must not intersect PCB envelopes or obstruct DIN, DOUT,
  V+, or V-. Keep centre structures within the pentagon boundary and outside
  filler surfaces flat-printable.
- Current wiring, GPIOs, installed rotations/mirroring, and within-panel pixel
  order are provisional. Do not describe an export as hardware-ready.
- Do not claim firmware, DDP, Art-Net, networking, Ethernet, or audio-reactive
  behavior: `firmware/` contains instructions only and the browser runs a small
  WLED effect simulator.

## Working safely

- Preserve user changes and comments recording print tests or fit corrections.
- Keep geometry changes small and state their mechanical intent.
- Do not refactor production code during documentation-only work.
- Update the knowledge pages when architecture, invariants, or project status
  changes; avoid chat-history handovers as the only record.

## Verification

Use the narrowest relevant checks, then broaden when risk warrants it:

```bash
npm test                         # Vitest only; does not build WASM
npm run test:editor
npm run test:placement
npx tsc -b
npm run check:wled
npm run test:full                # regenerates assets and builds WASM first
```

After geometry changes, render every changed printable part with OpenSCAD and
inspect assembly mode where provided. Confirm holes, PCB poses, panel angles,
envelopes, connector corners, and flat print surfaces. If OpenSCAD cannot run,
say so explicitly; static inspection is not a successful render.

For a phone review link, run `npm run preview:phone` from the repository root.
It creates a temporary Cloudflare quick-tunnel URL and verifies the public HTML,
sculpture JSON, JavaScript, and WLED WASM endpoints. Call it a review link, not a
deployment; do not substitute a `localhost` URL.
