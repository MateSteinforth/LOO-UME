# LOO/UME

LOO/UME is a generative sculpture compiler: a pose-first browser editor and fabrication toolkit for
panel-based LED sculptures. Schema 2 sculpture JSON owns panel poses. Mapping,
wiring, simulation, and save/reopen continue when printable mechanics are
missing or stale.

The project registry includes a one-metre-diameter flexible LED-ring demo with
one 188-emitter strip fixture at approximately 60 LEDs/m and one GPIO 16 output. It exercises flexible carrier
display, mapping, wiring, simulation, WLED setup, and export without enabling
rectangular placement or fabrication tools.

Printable boundary and part STL files compile with pinned `manifold-3d` 3.5.1.
The design GLB is a placement surface only. Printable material derives from
panel outlines and validated flat gap caps.

## Start

### Mac application

[**Download LOO/UME for Mac (universal DMG)**](https://github.com/MateSteinforth/LOO-UME/releases/download/electron-macos-unsigned/LOO-UME-Electron-universal.dmg)

Open the DMG and drag **LOO UME** into **Applications**. This free build is not
signed by Apple, so the first launch requires Control-click **LOO UME**, select
**Open**, and confirm **Open**. If macOS still blocks it, use **System Settings
→ Privacy & Security → Open Anyway**. The application then opens its own editor
window; no Terminal or separate browser is required. Closing the last window
quits LOO/UME and its local services. Open the Applications icon to start a new
session. Project Library files stay outside the replaceable application bundle.

Each application-changing push to canonical `main` refreshes this fixed unsigned
DMG link. Documentation-only and test-only changes do not rebuild the package.
An installed free build checks the version metadata published beside that DMG.
When a newer build exists, **Download update** opens the fixed GitHub download.
Quit LOO/UME, open the new DMG, and replace the application in Applications.
The free build does not install or relaunch itself.

#### Legacy browser launcher

The earlier managed-checkout launcher is retained for recovery and compatibility
only. It starts a background browser service through Terminal and is no longer
the recommended installation. Its tagged or manually triggered workflow can
still build `LOO-UME-Mac-Launcher.zip`; ordinary `main` pushes do not publish it.
The `looume` command and `Uninstall LOO UME.command` apply only to that legacy
installation, not to the Electron DMG.

### Developer checkout

After cloning the repository on Linux x86-64 or macOS, start LOO/UME with:

```bash
./bootstrap.sh launch
```

The first launch installs pinned Node.js and npm under `.tools/`, installs
locked dependencies, builds the application, verifies the Manifold desktop
path, starts the loopback server, and opens the browser. Later launches reuse a
current clean build only after its complete output hash manifest passes. This
does not need administrator access or a global Node.js installation. The
bootstrap accepts only pinned official archives with
exact size, SHA-256, and extracted-tree identities.

To fast-forward `main` from the approved GitHub repository and launch the
updated application, use:

```bash
./bootstrap.sh update
```

Update temporarily stores tracked and untracked local changes, applies the
verified fast-forward, and restores those files before launch. Ignored project
ZIPs and Project Library overrides under `projects/local/` remain in place. If a local source edit conflicts
with the new version, update stops before launch and retains the recovery stash;
resolve the reported Git conflict manually. Update still refuses a non-main
branch, an unapproved remote, or divergent history. Use
`./bootstrap.sh npm <arguments>` for other npm commands with the managed runtime.
The loopback desktop UI also checks for a newer `origin/main` revision. When
one exists, its **Update** notice applies this same guarded operation and
restarts the local application.

The Project Library shows the newest project first. **Save** overwrites the
currently opened library project only after confirmation. Rename or delete also
works for bundled examples: LOO/UME records an ignored local override and keeps
the tracked example unchanged, so a later application update stays safe.

The local production server listens on `127.0.0.1:4173` by default. Use
`ORBITAL_LAB_PORT` to select another port.

To build and open the Electron desktop application from a checkout, use:

```bash
npm run electron
```

Electron embeds the same editor and local services. Art-Net still listens on
loopback for MadMapper or TouchDesigner, DDP still targets the private WLED
address, and Web Serial still requires selection of the approved CP2102 device.
Projects are stored outside the replaceable application bundle. Closing the
Electron window quits the application and its local services; open the icon to
start a new session. On macOS,
`npm run package:electron:mac` creates the DMG and update ZIP. Unsigned manual
workflow packages are for review only; in-application desktop updates require a
Developer-ID-signed and notarized `electron-v*` release.

For a laptop or phone on the same local network, run:

```bash
npm run lan
```

This starts Vite on all network interfaces. It uses the first free port at or
above 4175 and prints the LAN URL. Stop it with `Ctrl+C`. To start the search
at another port, use `npm run lan -- 4180`.

For a temporary phone review link:

```bash
npm run preview:phone
```

This is a review link, not a deployment.

## Main workflow

Project and View remain available above six always-editable toolboxes. They are
not ordered gates; use only the tools supported by the loaded fixture:

- **Shape:** load an optional watertight GLB placement surface.
- **Fixtures:** place and edit pose-authoritative panels, strips, or rings.
- **Mapping:** optimize balanced outputs, GPIOs, fixture order, and physical
   DIN/DOUT orientation. Manual route editing remains under **Advanced route
   editor**; the MadMapper package is available here.
- **Fabrication:** generate supported planar closures, connector ribbons, or
  LED-surface bridges; download one handoff with all current verified print
  files, a manufacturing manual, and the HERMA 4385 panel-label PDF; isolate
  each data connection; and flash/configure the approved ESP32 from the loaded
  simulator contract.
- **Export:** download the editable project ZIP and referenced verified assets.

The browser runs a deterministic subset of WLED effects. Through the local
host it can flash the receipt-bound ESP32 image, configure WLED, persist the
selected native animation, and mirror the mapped framebuffer through bounded
WLAN DDP. The three-panel native path is physically confirmed. LOO/UME can now
send complete MadMapper frames through the same WLAN DDP path. This MadMapper
path still needs a three-panel physical review. Complete 41-panel address
parity and audio-reactive behavior remain unproved. Direct WLED Art-Net over
Ethernet is not planned.

## Verification

Pushes and pull requests run only the locked install, checked-in WLED runtime
verification, TypeScript, and production build. The broad Vitest, Chromium,
Manifold, bootstrap, and clean-host matrix runs nightly at 02:17 UTC and is
also available through GitHub Actions **Run workflow**.

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

The Electron DMG is the normal Mac operator path. `./bootstrap.sh launch`
remains the clean-checkout developer path. Its first
run includes the production desktop-start and two-STL Manifold proof before the
browser opens. `./bootstrap.sh setup` remains available for installation
automation that must prepare without starting the server.

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

Electrical design, protection, and approval are external operator
responsibilities. Repository WLED current values are operating assumptions.
