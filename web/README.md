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

Prerequisites are Git, Node.js 22, npm, Python 3, and enough disk space
for a project-local Emscripten SDK.

```bash
git submodule update --init --depth 1
npm run setup:wled
npm ci
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

The compiler version is pinned in `wasm/emscripten-version.txt`; the emsdk
installer checkout is pinned independently in `wasm/emsdk-revision.txt`.

## Local production host

The production interface is served from this computer rather than deployed to
a hosted generation service. OpenSCAD is required for printable-part
generation, but its binary is not stored in the repository. Automatic
repository-local setup covers the declared Linux and macOS targets and provides
a Windows x86-64 candidate. Use the Bash commands below on Linux or macOS:

```bash
npm ci
npm run setup:openscad
npm run desktop
```

In PowerShell on Windows x86-64, run:

```powershell
npm.cmd ci
npm.cmd run setup:openscad
npm.cmd run desktop
```

The setup command selects one declared host target and installs it in `.tools`.
Linux uses OpenSCAD 2021.01 from the official AppImage and a pinned Debian
`libgpg-error0` companion. macOS uses the official universal 2026.06.12
snapshot at
`https://files.openscad.org/snapshots/OpenSCAD-2026.06.12.dmg`. The DMG is
64,447,344 bytes and has SHA-256
`555be2ed313e67657b3d8ba3e1de0acd6141b982fd458776c52d3eda748f57c4`.
The Windows candidate pins the official stable portable ZIP at
`https://files.openscad.org/OpenSCAD-2021.01-x86-64.zip`: 21,884,613 bytes,
SHA-256
`fb0caabf5bbc89f8f2f80c10b79ae64d697aaff6efd58b2756f5d6270edb7ba7`.
It uses `openscad.com`. The matching source archive has SHA-256
`d938c297e7e5f65dbab1461cac472fc60dfeaa4999ea2c19b31a4184f2d70359`,
tag `openscad-2021.01`, and commit
`41f58fe57c03457a3a8b4dc541ef5654ec3e8c78`. The license is
GPL-2.0-or-later with the OpenSCAD CGAL exception.

The committed `toolchains/openscad-distributions.json` manifest records source
and license metadata, exact sizes, and checksums. The snapshot does not publish
a verified exact source revision. The manifest does not claim one.

The command does not need administrator access or change `PATH`. Windows setup
does not use an installer, system application directory, profile, or registry.
It extracts and validates the portable payload in repository-local staging.
macOS does not copy into `/Applications` or use Rosetta. Every target records
the selected target, version, executable, and artifacts in a receipt, publishes
the verified install atomically, and reuses a valid install. A failed setup is
safe to retry.

The command runs a fresh `build:desktop` before `start:desktop`, then prints the
loopback URL, normally `http://127.0.0.1:4173/`. The server binds only to
`127.0.0.1`. Choose another port or executable at startup when needed:

```bash
ORBITAL_LAB_PORT=4300 OPENSCAD=/absolute/path/to/openscad npm run desktop
```

Startup requires OpenSCAD 2021.01 on Linux and Windows, and 2026.06.12 on
macOS. It uses an explicit `OPENSCAD` override first, then the valid
receipt-backed managed tool for the current target, then the system OpenSCAD
command on `PATH`. The shared
`/api/generator-status` response reports the selected tool, detected
availability, and repair guidance; the browser uses that response instead of a
build-mode flag. If the binary is absent or the version is wrong, the server
still serves the complete editor and only printable generation is disabled.
Run `npm run setup:openscad` or repair the selected tool, then restart the
desktop command to refresh the startup status.

Node.js, npm, and the other project dependencies are not installed by this
command. Linux also needs `dpkg-deb`. Clean Windows Server 2022 and 2025 x64
runners provide surrogate proof only; they do not prove Windows PC support.
INSTALL-015 is blocked on short-lived Windows 10 Enterprise LTSC 2021 and
Windows 11 Enterprise 25H2 x86-64 non-N virtual machines. Windows N/KN and
Windows ARM64 are excluded. INSTALL-011 tracks the all-dependency clean-clone
bootstrap. INSTALL-012 tracks proof on every declared supported target.

Both the Vite development adapter and production server use the same bounded
local handler for `/api/generator-status` and `/api/editor-pipeline`. Generation
requests must be same-origin and loopback-only. Sculpture JSON, imported assets,
generated files, and OpenSCAD execution stay on this computer. Ctrl-C sends
SIGINT; SIGTERM is also handled. Either signal stops accepting requests, closes
active generator children, and shuts the server down cleanly.

## Sculpture JSON editor

The simulator includes a small pose-first editor in the existing control panel.

The default startup source is the empty 66 mm cuboctahedron authoring project.
It has no initial panels or LEDs; the JSON face graph is immediately available
as a watertight placement canvas. The WLED wrapper keeps a one-pixel backing
buffer while reporting the correct logical count of zero until the first panel
is added.

- **Load JSON file** validates a local sculpture document and resolves its panel
  profile by ID from the staged `catalog/panels` directory.
- **Save JSON** downloads the current authoritative sculpture definition, including
  edits. JSON-shell sessions resume from that file alone. An optional GLB remains a
  separate file referenced by relative path, scale, and SHA-256 hash.
- **Open project folder / ZIP** requires one `sculpture.json`, validates every
  referenced GLB/STL path and SHA-256, rejects missing, duplicate, or unsafe files,
  and serves the imported bytes to the existing loaders through object URLs.
- **Export project folder / ZIP** writes the current JSON plus every referenced
  verified local GLB, boundary, and STL part. It fails instead of fetching a
  missing or external asset into the bundle.
- **Add panel on next surface click** uses the active panel profile dimensions,
  the clicked JSON-shell or GLB triangle and interpolated normal to create an
  authoritative pose
  plus barycentric attachment. The panel appears immediately, can be dragged, and
  joins provisional wiring. It does not invent a mechanical face association.
- **Panel selection** accepts either the visible panel label or the enlarged panel
  surface target. The selected label gains an amber highlight. Dragging still starts
  from the 3D panel target so a label tap cannot accidentally move hardware.
- **Delete selected panel** removes the active panel and rebalances provisional
  wiring. Existing generated mechanics are marked for regeneration; a pose-only
  project remains mechanics-free.
- **Add panel to face** lists only closure faces that can contain the active panel
  profile. It insets the PCB rectangle, partitions the remaining face into printable
  closure sectors, derives a right-handed panel pose, and rebalances provisional
  wiring lengths.
- **Generate CAD + wiring + previews** posts the in-memory JSON to the bounded
  local endpoint shared by Vite development and the production desktop host. It
  generates the compiled assembly, mapping, provisional WLED ledmap, OpenSCAD
  sources, STL files, and PNG previews under an isolated `-editor-preview` ID,
  then reloads the exact STL meshes in Three.js.

Panel-outline projects use the same endpoint to generate a deterministic
boundary and gap-sorted printable closure set. When `boundaryTopology` is
absent, the service welds exact panel corners, detects only unambiguous exposed
edge cycles, assigns stable content-derived gap IDs, and persists those cycles
in the generated JSON. Saved cycles are reused. Open, wrongly wound,
non-manifold, or ambiguous graphs fail with panel/corner context instead of
guessing. The service publishes the files and manifest only after every STL
validates. The browser verifies SHA-256 and parses those exact files for display
and download.

A JSON-shell or GLB surface move or addition marks existing generated mechanics
as requiring regeneration. A pose-only project has no mechanical state to
invalidate and keeps simulation, mapping, wiring, editing, and save enabled. The
simulator omits stale shell, mount, and printable-closure previews. Run matches each pose to exactly one planar JSON boundary face, validates
the complete cleared panel envelope, regenerates the panel opening and coplanar
flat-printable filler part, and only then invokes OpenSCAD. The GLB remains a visual
positioning canvas and is never used as mechanical geometry. Unsupported or unsafe
placements return a panel-specific error instead of emitting misleading parts.

Use `npm run dev:web` for Vite development or `npm run desktop` for the built
production interface and local OpenSCAD host. Generation preserves a referenced
GLB path and hash but does not copy that GLB into the generated output folder;
folder/ZIP export needs the separately loaded, verified bytes. An inset topology
with only three populated neighbors still
uses all four eligible panel holes, but explicitly records that one strip closure
serves two adjacent holes. Existing sculptures retain the stricter one-cap-per-hole
and three-connectors-per-closure defaults.

The implemented data ownership, regeneration algorithm, blocking checks,
fixture behavior, and verification record are documented in
[Editor and planar mechanical regeneration](../docs/editor-mechanical-regeneration.md).
The next editor task—manual rotation of the selected panel around its saved
local-Z normal—is described in
[the local-Z rotation handover](../docs/handover-panel-local-z-rotation.md).

`tests/panel-boundary-parts-e2e.test.ts` covers GLB placement, panel edits,
generation-time gap detection from a project with no `boundaryTopology`,
persisted cycles, exact parts, folder/ZIP reopen, and current/stale state without
injecting topology in the test.

## Build and test

From a fresh clone, the single complete command is:

```bash
npm run verify:clean
```

It initializes the pinned WLED submodule, runs `npm ci`, installs the pinned
project-local Emscripten SDK, regenerates assets, builds WASM, runs every Vitest
test, type-checks, and creates the Vite production bundle in `dist/`. For an
already prepared checkout, use `npm run verify`; it performs the same build and
verification phases without dependency or SDK installation.

`npm test` is intentionally the fast command. It uses the checked-in WASM
runtime and neither builds WASM nor downloads Emscripten. `npm run test:full`
rebuilds WASM with the installed pinned SDK and then runs `npm test`. Every WASM
build first verifies the compiler version and that 37 selected function bodies
match the pinned WLED submodule revision. The WASM tests cover initialization,
every registered effect at 2,700 LEDs, framebuffer changes, deterministic
timestamps, resize behavior, out-of-bounds protection, and mapping invariants.

Every build regenerates `layout/panel-map.json` and
`wled/ledmap.provisional.json`. The browser imports those actual JSON artifacts
at runtime; it does not independently regenerate the sculpture mapping. Startup
validates every logical-to-physical entry and requires matching fingerprints.
The production command `npm run generate:mapping:hardware` refuses to write
`wled/ledmap.json` until all measured-data readiness checks pass.

The built `web/public/wasm/wled-engine.{js,wasm}` runtime is checked in so
`npm test` works without a compiler setup. Rebuild and recommit it whenever
the pinned engine sources or Emscripten version change.

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

The panel JSON now defines a provisional back-view row snake: pixel 0 is
bottom-left beside DIN, the first row runs left-to-right, and rows alternate
upward. For an 8 x 8 panel this derives pixel 56 at top-right and pixel 63 at
top-left; DOUT is independently at top-right. GPIO and chain order remain
readiness blockers. Explicit panel-assembly orientation propagates directly from each panel pose's
right-handed orthonormal basis. Non-2,624 LED counts retain
`createUniformSphereMapping()` as a clearly labelled fallback.

UV values are present as equirectangular coordinates. A later 2D view can render
the same entries at `(u, v)` while using the same logical and physical indices.
The renderer can consume measured canonical panel data without changing the WASM
effect engine.

### Wiring preview layers

The generated wiring is data-only and assumes the controller is near the
sculpture top. The panelized view has independently hideable DIN/DOUT markers,
within-panel direction arrows, panel-to-panel routes, and one toggle for each
of four output routes. The connector direction comes from the reusable panel
profile: DIN is bottom-left and DOUT is top-right when viewed from the back
with the three
mounting holes vertical. The marker inset remains schematic until the exact pad
centres are measured. The current 11/10/10/10 panel grouping is a generated
geographic design used by both the layer UI and provisional WLED map. GPIO
assignments are deliberately `null`, and panel wiring is marked `provisional`
rather than measured.

`tests/hardware-mapping.test.ts` loads the same two JSON files as the browser,
sends a logical frame through the ledmap, and verifies that every resulting
physical color equals the color placed by Three.js. It also corrupts one map
entry and verifies that the runtime loader rejects the mismatch. Once pixel-zero
corners, GPIOs, installed orientation, and chain order are bench-verified,
those measured values replace the
provisional fields and unlock the production exporter.

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
7. Run `npm run verify`.

Do not patch the WLED submodule. Hardware, networking, filesystem, and ESP32
services belong outside this WASM target.

## Future adapters

`wled_set_audio()` already accepts volume, peak, and FFT bins, but no
audio-reactive effect consumes them yet. DDP/Art-Net output can later read the
same packed framebuffer used by Three.js. Both should remain adapters around the
engine rather than platform emulation inside it.
