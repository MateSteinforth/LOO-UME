# JSON-driven polyhedral LED sculptures

A pose-first design, visualization, validation, and fabrication pipeline for
building physical LED sculptures from reusable panel hardware. A sculpture is
authored as JSON, previewed and edited in the browser, compiled into deterministic
LED and wiring maps, and regenerated as mechanically validated OpenSCAD, STL, and
preview artifacts.

The project began as a single 41-panel rhombicosidodecahedron. That sculpture is
now the flagship design and physical reference for a more general system that can
describe multiple polyhedra, place panels on their surfaces, preserve tested
mechanical constraints, and produce printable closure geometry for supported
planar layouts.

| Automatic 30-panel rhombicosidodecahedron | Six-panel cuboctahedron | Six-panel truncated octahedron |
| --- | --- | --- |
| ![Generated rhombicosidodecahedron assembly](artifacts/sculptures/automatic-rhombicosidodecahedron-30-panel-test/previews/assembly.png) | ![Generated cuboctahedron assembly](artifacts/sculptures/cuboctahedron-six-panel-prototype/previews/assembly.png) | ![Generated truncated-octahedron assembly](artifacts/sculptures/truncated-octahedron-six-panel-test/previews/assembly.png) |

## What the platform does

- Defines sculptures, planar mechanical shells, panel profiles, poses, and
  surface attachments in runtime-validated JSON.
- Treats explicit right-handed panel bases as authoritative, so editor changes
  propagate to every LED, mounting hole, connector, and DIN/DOUT position.
- Provides browser authoring for adding, selecting, moving, rotating, and
  deleting panels on JSON surfaces, with optional GLB meshes used only as visual
  placement canvases.
- Generates visualizer mappings and provisional WLED wiring for arbitrary panel
  assemblies.
- Regenerates printable planar closures and rejects panels whose complete PCB
  envelope and clearance do not fit the containing face.
- Verifies authored and generated mechanics with TypeScript tests, schema
  round-trips, OpenSCAD rendering, and byte-equivalence checks for established
  sculptures.

The original rhombicosidodecahedron remains fully represented:

- 30 LED panels occupy its square faces.
- 11 additional LED panels sit in pentagonal openings.
- The north-pole pentagonal opening is intentionally unpopulated.
- 20 identical triangle fillers close the triangular openings.

The source geometry was migrated from the project's
[ChatGPT design conversation](https://chatgpt.com/share/6a78d835-25d0-83ed-a959-b31c6b7b4f29).
Git history is the version history; do not create numbered copies such as
`triangle_v2.scad`.

## Browser software and hardware proposal

The repository does not contain production ESP32 firmware or implemented
network or audio transport. The current hardware proposal uses one ESP32-class
controller and four data outputs for all 2,624 WS2812B pixels. The exact board,
GPIO assignments, physical chains, and installed panel orientations are not yet
verified. See [docs/software.md](docs/software.md) for the proposal, current
mapping behavior, power-safety rules, and remaining implementation work.

The browser application includes **WLED Orbital Lab**, a standalone simulator
that runs genuine WLED C++ effect bodies in
WebAssembly and renders 2,624 LEDs as 30 square-face 8 x 8 panels plus 11
pentagon-centre 8 x 8 panels, leaving the north-pole pentagon open. The
displayed four-output route now generates the simulator's physical indices and
a fingerprint-matched provisional WLED map. Hardware export stays locked until
the remaining panel and wiring facts are bench-verified.

![Earlier WLED Orbital Lab 42-panel prototype](docs/assets/wled-orbital-lab.png)

_This screenshot predates the open-pole correction; the live simulator now uses
the 41-panel vertex-up layout._

See [web/README.md](web/README.md) for setup, build, test, architecture, WASM
memory, mapping, and upstream-update instructions. Investigation details and
current limitations are recorded in [TECH_NOTES.md](TECH_NOTES.md).

### Run the local desktop editor

OpenSCAD is required for printable-part generation, but its binary is not
stored in this repository. The current required targets are Debian 13 x86-64,
Ubuntu 24.04 x86-64, and macOS 15 on Apple Silicon arm64 or Intel x86-64. The
repository also retains a Windows x86-64 candidate. On Linux or macOS, install
the dependencies, set up the managed tool, then build and start locally:

```bash
npm ci
npm run setup:openscad
npm run desktop
```

In PowerShell on Windows x86-64, use the Windows command shims:

```powershell
npm.cmd ci
npm.cmd run setup:openscad
npm.cmd run desktop
```

`npm run setup:openscad` selects the host target and installs it in `.tools`.
Linux uses OpenSCAD 2021.01 from the official AppImage plus a pinned
`libgpg-error0` companion. macOS uses the official universal
`OpenSCAD-2026.06.12.dmg` snapshot. The macOS artifact URL is
`https://files.openscad.org/snapshots/OpenSCAD-2026.06.12.dmg`; its exact size
is 64,447,344 bytes and its SHA-256 is
`555be2ed313e67657b3d8ba3e1de0acd6141b982fd458776c52d3eda748f57c4`.
The Windows candidate uses the official stable portable archive
`https://files.openscad.org/OpenSCAD-2021.01-x86-64.zip`. This ZIP is
21,884,613 bytes and has SHA-256
`fb0caabf5bbc89f8f2f80c10b79ae64d697aaff6efd58b2756f5d6270edb7ba7`.
It runs `openscad.com`, the command-line launcher in the portable package.
The matching source archive is
`https://files.openscad.org/openscad-2021.01.src.tar.gz`. It has SHA-256
`d938c297e7e5f65dbab1461cac472fc60dfeaa4999ea2c19b31a4184f2d70359`,
tag `openscad-2021.01`, and commit
`41f58fe57c03457a3a8b4dc541ef5654ec3e8c78`. Its license is
GPL-2.0-or-later with the OpenSCAD CGAL exception.

The committed `toolchains/openscad-distributions.json` manifest records the
targets, sources, licenses, sizes, and checksums. The upstream macOS snapshot
does not publish a verified exact source revision, so the manifest records the
source repository and license but does not claim a revision.

Setup does not need administrator access, change user or machine `PATH`, write
an uninstall registry entry, or install OpenSCAD in a system application
directory. Windows setup extracts the portable ZIP into a repository-local
staging directory and validates the required payload before it runs
`openscad.com`. On macOS, setup rejects Rosetta, mounts the DMG read-only,
copies only `OpenSCAD.app` into its staging directory, and cleans up the
mount. A target-specific receipt records the selected target, expected version,
executable, and artifacts. Valid receipt-backed installs are reused.
Replacements are verified and published atomically, so a failed setup is safe
to retry.

`npm run desktop` creates a fresh production web build before starting the
loopback server. Open the printed URL, normally `http://127.0.0.1:4173/`. Set
`ORBITAL_LAB_PORT` to choose another port and `OPENSCAD` to use an explicit
OpenSCAD executable:

```bash
OPENSCAD=/absolute/path/to/openscad ORBITAL_LAB_PORT=4300 npm run desktop
```

The server first uses an explicit `OPENSCAD` override. Without an override, it
prefers the receipt-backed managed tool for the current target and then falls
back to the system OpenSCAD command on `PATH`. The required version is 2021.01
on Linux and Windows, and 2026.06.12 on macOS. A missing or wrong-version tool
disables only **Generate 3D Parts**. Run setup or repair the selected tool, then
restart the desktop command so the startup probe runs again.
Sculpture data, assets, and OpenSCAD stay on this computer; there is no hosted
generation service. Stop with Ctrl-C; SIGINT and SIGTERM close the HTTP server
and active generator processes cleanly.

The Windows candidate has surrogate proof on clean x64 Windows Server 2022 and
Windows Server 2025 runners. This is not Windows PC support proof. Client
qualification is deferred. The candidate code and checks remain, but Windows
does not block INSTALL-011 or INSTALL-012. Node.js and npm must already be
available. Linux also needs `dpkg-deb`. INSTALL-011 and INSTALL-012 track the
all-dependency bootstrap and proof on the required Linux and macOS targets.

## Canonical sculpture description

The compact authored source is
[`sculptures/rhombicosidodecahedron/sculpture.json`](sculptures/rhombicosidodecahedron/sculpture.json).
It references the reusable 66 x 65 mm panel hardware profile under `catalog/`.
The expanded 2,624-LED panel map and WLED ledmap are deterministic generated
artifacts rather than hand-authored sources. The same JSON now declares the 20
triangular openings and 11 populated pentagonal openings, including the
triangle filler, pentagon U-frame, middle connector, and their explicit panel
interfaces. Generated OpenSCAD entrypoints verify the existing tested parts
instead of duplicating them. See
[`docs/sculpture-format.md`](docs/sculpture-format.md) for the source contract,
validation command, and compilation flow.

The first independent recipe is the six-panel cuboctahedron. It compiles six
panel placements, eight integrated triangular closures, 24 real-hole tabs, a 384-LED
visualizer/WLED mapping, and prototype printable CAD from one JSON file. See
[`docs/cuboctahedron-e2e.md`](docs/cuboctahedron-e2e.md) for its generated
artifacts and physical-validation boundary.

## Browser sculpture authoring

WLED Orbital Lab now starts with an empty watertight cuboctahedron authoring
project whose six square faces are exactly 66 mm per side. Panels can be added,
selected, dragged, deleted, saved, and regenerated from the JSON shell without
a GLB. An optional GLB remains a positioning canvas only and never becomes
printable geometry.

The selected-panel transform gizmo moves a panel across local surface XY and
rotates it around its local Z axis without changing its centre offset, outward
normal, attachment triangle, or proven face angles. Run validates panel
envelopes against the stable planar JSON boundary, regenerates current topology,
and emits OpenSCAD, STL meshes, exact previews, wiring, and updated JSON. See
[docs/editor-mechanical-regeneration.md](docs/editor-mechanical-regeneration.md)
for the implemented mechanical contract and
[docs/pose-first-schema.md](docs/pose-first-schema.md) for the authoritative
pose model.

### General project workflow

Mechanics-free authoring is implemented: load a referenced GLB, place panels
automatically, edit them by hand, and use the full simulator/mapping interface
before mechanics exist. A missing optional GLB does not invalidate saved poses.
**Generate 3D Parts** detects unambiguous gaps between panel outlines, persists
their stable topology, validates flat N-gon caps and one closed boundary,
generates printable parts, and loads the exact emitted STL files in Three.js.

The portable project contract is a folder containing `sculpture.json` plus
safe relative, SHA-256-identified GLB and STL assets. Schema 2 defines generated
boundary and ordered exact-part references plus canonical current/stale
fingerprinting. Folder and ZIP import/export, boundary generation, exact-STL
display, and reopen are implemented. During browser generation, one bounded
multipart request contains the JSON and only the referenced, verified GLB. The
JSON field is limited to 5 MB and the complete request is limited to 64 MB. The
server verifies the GLB before rendering, copies it to its unchanged safe
relative path, verifies the staged copy, and atomically publishes it with the
STLs and JSON. The generated folder opens directly and can become a ZIP without
external asset injection. Missing, tampered, or reserved asset paths fail
before rendering. The GLB remains an authoring surface and does not drive gap
topology or printable geometry.

The editor does not yet let the user inspect, confirm, reorder, or redraw
candidate gap topology. An ambiguous layout stops with an error until this UI
path is implemented. The complete workflow is specified in
[`docs/MECHANICS_WORKFLOW.md`](docs/MECHANICS_WORKFLOW.md).

## Canonical printable parts

| Source | Quantity | Purpose |
| --- | ---: | --- |
| `parts/triangle.scad` | 20 | Triangle filler with three PCB-safe mounts |
| `parts/pentagon_u.scad` | 11 installed | Pentagon U-frame holding an additional LED panel |
| `parts/middle_panel_connector.scad` | 11 installed | Rounded connector between the centre and outer panels |

Each source defaults to `mode = "print"`. Change the mode locally to inspect
its assembly/preview geometry, but do not commit a mode change unless it is an
intentional project change.

## Latest prototype renders

These previews and STL downloads always point to the current successful build
from `main`.

| Triangle filler | Pentagon U-frame | Middle-panel connector |
| --- | --- | --- |
| [![Triangle filler render](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/download/latest-prototype/triangle.png)](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/download/latest-prototype/triangle.stl) | [![Pentagon U-frame render](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/download/latest-prototype/pentagon_u.png)](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/download/latest-prototype/pentagon_u.stl) | [![Middle-panel connector render](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/download/latest-prototype/middle_panel_connector.png)](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/download/latest-prototype/middle_panel_connector.stl) |
| [Download STL](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/download/latest-prototype/triangle.stl) | [Download STL](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/download/latest-prototype/pentagon_u.stl) | [Download STL](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/download/latest-prototype/middle_panel_connector.stl) |

## Known physical constraints

- PCB: 66 x 65 x 0.8 mm
- Corner-hole centres: 8 mm from the PCB edges
- Middle hole on a 66 mm edge: 25 mm from an outer hole
- Fasteners: M2
- Printed pilot: 1.6 mm
- Screw lead-in: 3.2 mm diameter x 0.7 mm deep
- Square/pentagon inside dihedral: 148.282526 degrees
- Small fold angle: 31.717474 degrees

See [refs/pcb_dimensions.md](refs/pcb_dimensions.md) and [AGENTS.md](AGENTS.md)
before changing geometry.

## Feature-focused tests

Automatic placement has a fast test path that does not generate CAD assets,
STLs, previews, or invoke OpenSCAD:

```bash
npm run test:placement
```

For the wider browser editor tests, including existing mechanical-regeneration
contracts that emit temporary OpenSCAD source, run:

```bash
npm run test:editor
```

`npm test` runs the complete Vitest suite without building or downloading
anything first. It uses the checked-in
`web/public/wasm/wled-engine.{js,wasm}` runtime. `npm run test:full` rebuilds
that runtime with an already installed pinned Emscripten SDK and then runs the
same suite.
Use `npm run verify` for the normal prepared-checkout verification: it regenerates
assets, builds WASM, runs all Vitest tests, runs `npx tsc -b`, and builds Vite. Printable geometry remains a separate,
explicit verification step through `npm run verify:cad` and
`npm run verify:processed-sculptures`.

## Clean checkout verification

A clean clone needs Git, Node.js 22, npm, Python 3, network access, and space for
the project-local Emscripten SDK. From the repository root, run:

```bash
npm run verify:clean
```

That command initializes and verifies the pinned WLED submodule, runs `npm ci`,
checks out the pinned emsdk installer revision, installs Emscripten 4.0.14,
regenerates repository assets, builds WASM, runs every Vitest test, runs
`npx tsc -b`, and builds the Vite application. It does not require generated
files from another checkout. The rebuilt
`web/public/wasm/wled-engine.{js,wasm}` files must match the committed runtime;
changes are committed together with the pinned source or compiler update. CI
executes the same essential sequence from `actions/checkout` with submodules
enabled.

For a checkout whose submodule, npm dependencies, and Emscripten SDK are already
prepared, run `npm run verify`. Neither `npm test` nor `npm run verify` downloads
the SDK.

## Build locally

Install the npm dependencies. Linux rendering also needs Xvfb and xauth. On a
required Linux or macOS target, acquire the target-specific managed OpenSCAD
tool before you generate assets. The retained Windows x86-64 candidate uses the
`npm.cmd` forms shown above.

```bash
npm ci
npm run setup:openscad
npm run generate:assets
```

Verify that all three generated parts have the same CSG trees as their tested
sources, render their printable STLs, and create triangle and populated-pentagon
assembly previews with:

```bash
npm run verify:cad
```

Compile any explicit panel-assembly JSON, or regenerate all three processed
sculptures and their versioned printable meshes and preview renders:

```bash
npm run generate:sculpture -- --sculpture sculptures/cuboctahedron/sculpture.json
npm run verify:processed-sculptures
```

Verified snapshots are organized under
`artifacts/sculptures/<sculpture-id>/{3d,previews}`. The simulator reads
`sculptures/manifest.json` to populate its sculpture dropdown.

The canonical parts can still be rendered directly:

```bash
mkdir -p build
openscad -o build/triangle.stl parts/triangle.scad
openscad -o build/pentagon_u.stl parts/pentagon_u.scad
openscad -o build/middle_panel_connector.stl parts/middle_panel_connector.scad
```

Generated STL and PNG files belong in `build/` and are intentionally ignored.
GitHub Actions renders all three models on every push and pull request and
publishes the generated files as workflow artifacts. A separate CAD-contract
job regenerates the JSON-driven entrypoints, checks all three CSG pairs, and
renders the triangle and populated-pentagon assemblies before publishing is
allowed. Successful builds on
`main` also replace the assets in the single rolling
[Latest Prototype](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/tag/latest-prototype)
release. That stable page shows the current PNG previews and STL downloads;
Git history remains the version history.

## Physical iteration workflow

1. Print the current model and record the physical fit result.
2. Discuss one focused correction and change the canonical source file.
3. Wait for the OpenSCAD workflow to succeed.
4. Inspect the previews on the **Latest Prototype** release from a phone.
5. If the edit is correct, download and print the current STL; otherwise,
   correct the source and render again.
6. Repeat without creating numbered source or generated-file copies.
