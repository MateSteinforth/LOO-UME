# WLED Orbital Lab

A browser simulator that compiles selected, unmodified WLED C++ effect bodies to
WebAssembly and renders their framebuffer on an arbitrary Three.js LED mapping.

## Architecture

```text
WLED FX.cpp effect bodies
        |
portable Segment compatibility host
        |
Emscripten WebAssembly (packed 0x00RRGGBB framebuffer)
        |
WledEngine.ts direct HEAPU32 view
        |
HardwareMapping shared contract
        |--------------------|
Three.js physical XYZ    WLED ledmap JSON
```

The firmware, networking, and hardware driver layers are intentionally absent.
See [TECH_NOTES.md](../TECH_NOTES.md) for the dependency audit and exact
upstream coupling points.

## Setup

Prerequisites are Git, Node.js 20 or newer, npm, Python 3, and enough disk space
for a project-local Emscripten SDK.

```bash
git submodule update --init --depth 1
npm install
npm run setup:emsdk
npm run dev
```

Open the Vite URL printed by the final command. `npm run dev` rebuilds the
WASM module before starting Vite. Once WASM is already current, use
`npm run dev:web` for a faster UI-only start.

You may use an existing Emscripten installation instead:

```bash
EMCC=/absolute/path/to/emcc npm run build:wasm
npm run dev:web
```

The pinned version is in `wasm/emscripten-version.txt`.

## Build and test

```bash
npm run check:wled
npm run generate:mapping
npm run build
npm test
```

`npm run build` compiles the C++ engine and creates a production Vite bundle
in `dist/`. Every WASM build first verifies that 37 selected function bodies
match the pinned WLED submodule revision. `npm test` rebuilds WASM, then checks
initialization, every registered effect at 2,700 LEDs, framebuffer changes,
deterministic timestamps, resize behavior, out-of-bounds protection, and
mapping invariants.

Every build regenerates `layout/panel-map.json` and
`wled/ledmap.provisional.json`. The browser imports those actual JSON artifacts
at runtime; it does not independently regenerate the sculpture mapping. Startup
validates every logical-to-physical entry and requires matching fingerprints.
The production command `npm run generate:mapping:hardware` refuses to write
`wled/ledmap.json` until all measured-data readiness checks pass.

Generated `web/public/wasm/wled-engine.{js,wasm}` files are ignored. Rebuild
them from the pinned Emscripten version and WLED submodule.

## Reused WLED source

The WLED submodule is pinned at
`d9b9a846561227351ad929e3109781daadb7bed2`.

- `wled00/src/dependencies/fastled_slim/fastled_slim.cpp` is compiled directly.
- Thirty selected 1D effect bodies from `wled00/FX.cpp` are preserved in
  `wasm/src/wled_effects.inc`.
- Fixed-point timing, blend, palette lookup, and the seven standard FastLED
  palette tables follow the current upstream implementations.
- `wasm/compatibility/pgmspace.h` supplies the only platform header shim.

WLED's full `FX_fcn.cpp` is not compiled because its service path pulls in
buses, PSRAM/heap allocation, filesystem maps, transition state, locks, and
firmware globals. The compatibility host models the small effect-facing Segment
surface instead.

## WASM memory

C++ owns a resizable `std::vector<uint32_t>` with packed
`0x00RRGGBB` pixels. `wled_get_pixel_buffer()` exposes its address.
`WledEngine.ts` returns a `Uint32Array.subarray()` over Emscripten's linear
memory, so there is no full framebuffer copy across the JS/WASM boundary.

Resizing can move the vector or grow WASM memory. The wrapper therefore
reacquires the pointer and `HEAPU32` view whenever `pixels` is requested.

## Mapping model

`LedMappingEntry` carries independent `logicalIndex` and `physicalIndex`
fields plus optional panel identity, panel-local pixel coordinates, UV, and XYZ.
The renderer asks the LUT which logical framebuffer value belongs at each
physical XYZ point; it never derives position from the buffer index.

The default `createPanelizedSculptureMapping()` generator creates 41
explicit 8 x 8 panel grids: 30 `SQ-*` square-face panels and 11
`PC-*` pentagon-centre panels. The icosahedron-derived face-normal frame is
vertex-up, and the north-pole pentagon is intentionally unpopulated. Square and
pentagon face planes use separate physical distances derived from the 66 mm
common polyhedron edge.

Each square PCB is rendered at 66 x 65 mm with its 66 mm axis parallel to the
shared pentagon edge. Northern centre PCBs present their top edge toward the
polar neighboring edge; southern PCBs present their bottom edge toward it. This
keeps the centre-board horizontal axis level around both latitude rings. The
canonical 66 x 65 mm envelope, 0.70 mm recess, 9.62/-7.04 mm offset, and 234
degree relative placement remain the mechanical basis.

Logical index is independent from physical wire index. Entries are sorted
by equirectangular `v`, then `u`, so WLED 1D effects such as Scan progress
from global north to south. `HardwareMapping.ts` assigns physical indices from
the four displayed routes and emits the exact WLED convention
`map[logicalIndex] = physicalIndex`. The renderer and exported map therefore
share one routing contract and fingerprint.

The current contract still assumes provisional top-left, non-serpentine
row-major order within each panel. Actual pixel-zero corner, serpentine
direction, GPIO, chain order, installed rotation, and mirroring remain readiness
blockers. Non-2,624 LED counts retain `createUniformSphereMapping()` as a
clearly labelled fallback.

UV values are present as equirectangular coordinates. A later 2D view can render
the same entries at `(u, v)` while using the same logical and physical indices.
The renderer can consume measured canonical panel data without changing the WASM
effect engine.

### Wiring preview layers

The panelized view has independently hideable DIN/DOUT markers, within-panel
direction arrows, panel-to-panel routes, and one toggle for each of four output
routes. The free connector diagonal is derived from the canonical mechanical
clearances: top-left and bottom-right in panel-local coordinates. The marker
inset and the assignment of DIN versus DOUT to those two endpoints remain
provisional until checked on the physical PCB. The current 11/10/10/10 panel
grouping is a generated geographic design used by both the layer UI and
provisional WLED map. GPIO assignments are deliberately `null`, and panel
wiring is marked `provisional` rather than measured.

`tests/hardware-mapping.test.ts` loads the same two JSON files as the browser,
sends a logical frame through the ledmap, and verifies that every resulting
physical color equals the color placed by Three.js. It also corrupts one map
entry and verifies that the runtime loader rejects the mismatch. Once pixel-zero corners, DIN/DOUT assignment, GPIOs, installed
orientation, and chain order are bench-verified, those measured values replace
the provisional fields and unlock the production exporter.

## Adding or updating effects

1. Update the WLED submodule to the desired reviewed revision.
2. Put the reviewed full commit hash in `wasm/upstream-revision.txt`.
3. Copy changed bodies verbatim from `wled00/FX.cpp` and add only the
   Segment/math dependencies they
   require to the isolated compatibility host.
4. Add the effect name and function to `EFFECTS` in
   `wasm/src/wled_engine.cpp`.
5. Add every copied effect/helper name to `VERIFIED_FUNCTIONS` in
   `scripts/check-wled-sync.mjs`.
6. Record new upstream assumptions in `TECH_NOTES.md`.
7. Run `npm run check:wled && npm test && npm run build`.

Do not patch the WLED submodule. Hardware, networking, filesystem, and ESP32
services belong outside this WASM target.

## Future adapters

`wled_set_audio()` already accepts volume, peak, and FFT bins, but no
audio-reactive effect consumes them yet. DDP/Art-Net output can later read the
same packed framebuffer used by Three.js. Both should remain adapters around the
engine rather than platform emulation inside it.
