# WLED Orbital Lab

WLED Orbital Lab is a pose-first browser editor and fabrication toolkit for
panel-based LED sculptures. Schema 2 sculpture JSON owns panel poses. Mapping,
wiring, simulation, and save/reopen continue when printable mechanics are
missing or stale.

Printable boundary and part STL files compile with pinned `manifold-3d` 3.5.1.
The design GLB is a placement surface only. Printable material derives from
panel outlines and validated flat gap caps.

## Start

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run desktop
```

The local production server listens on `127.0.0.1:4173` by default. Use
`ORBITAL_LAB_PORT` to select another port.

For a temporary phone review link:

```bash
npm run preview:phone
```

This is a review link, not a deployment.

## Main workflow

1. Open a Schema 2 JSON, folder, or project ZIP.
2. Load a referenced GLB when surface placement is needed.
3. Place and edit panels. Saved poses remain authoritative.
4. Edit or confirm the wiring route.
5. Build the assembly package. The browser validates panel-gap topology and
   compiles exact boundary and part STLs with Manifold.
6. Download the package with project JSON, referenced assets, printable manual,
   ledmap, and wiring review.

The browser runs a deterministic subset of WLED effects. It does not contain
production firmware, networking, DDP, Art-Net, or audio-reactive behavior.

## Verification

```bash
npm test
npm run test:editor
npm run test:placement
npx tsc -b
npm run build:web
npm run test:browser
```

`npm run verify` checks the exact byte lengths and SHA-256 values of the
checked-in WLED simulator, then runs the normal tests and builds. It does not
need Python, Emscripten, or a WLED source checkout. `npm run verify:clean`
proves the same path after a clean `npm ci`.

Simulator rebuild tools and pinned sources live only on the long-lived
`generate/wled-simulator` branch. A reviewed rebuild moves only the two runtime
files and `web/public/wasm/runtime-integrity.json` back to `main`.

To compile a deterministic Manifold fixture directly:

```bash
npx tsx scripts/generate-panel-boundary-parts.ts \
  --sculpture sculptures/panel-outline-prism/sculpture.json \
  --output build/panel-outline-prism
```

## Sources of truth

- `sculptures/*/sculpture.json`: authored projects.
- `catalog/panels/ws2812b-8x8-66x65.json`: reusable panel facts.
- `src/sculpture/PanelAssembly.ts`: Schema 2 runtime contract and mapping.
- `src/sculpture/SculptureEditor.ts`: editor mutations and invalidation.
- `src/cad/CompilePanelBoundaryBundle.ts`: boundary and exact STL bundle.
- `src/cad/GeneratePanelClosureSolids.ts`: printable Manifold solids.
- `web/src/main.ts`: browser orchestration.
- `TASKS.md`: persistent work state.

Read `docs/ARCHITECTURE.md` before changing subsystem boundaries,
`docs/PANEL_SYSTEM.md` for geometry, and `docs/LED_MAPPING.md` for addressing or
wiring. Multi-agent rules and execution modes are in `AGENTS.md`.

Do not energize the complete 41-panel sculpture until `PWR-010` has approved
power domains, injection, wire sizes, fuses, voltage drop, and maximum current.
