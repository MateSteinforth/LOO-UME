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

[**Download LOO/UME for Mac**](https://github.com/MateSteinforth/LOO-UME/releases/latest/download/LOO-UME-Mac-Launcher.zip)

Open `LOO UME.app` once from the downloaded ZIP. It copies itself to
`~/Applications`, downloads the
approved `main` checkout into
`~/Library/Application Support/LOO-UME/application`, runs the verified setup,
and opens the browser editor. A Terminal window shows download, setup, server,
and ready messages; detailed setup output is streamed there. The first launch
needs an internet connection and can take several minutes. Later launches show
the same status window and reuse the verified installation.

The application also installs an optional command link at
`~/.local/bin/looume`. If that directory is already in the user's shell path,
the diagnostic commands are:

```bash
looume
looume --update
looume --status
looume --stop
```

The icon is the normal operator path; these commands are diagnostic
alternatives. **Update** in the editor uses the same canonical-main,
fast-forward-only update gate. Project Library data stays in the managed
checkout and survives updates. The unsigned review launcher can require
right-click **Open** on first use; a notarized public release remains separate
work.

To remove the managed installation, open `Uninstall LOO UME.command` from the
downloaded launcher folder. It stops the owned server, copies the local Project
Library to a timestamped folder in `~/Documents`, and removes the managed app,
checkout, logs, and command link. It does not remove other exported files.

Every push to canonical `main` builds the `.icns`, validates and ad-hoc signs
the application bundle, and publishes a uniquely versioned GitHub Release with
`LOO-UME-Mac-Launcher.zip` and its SHA-256 file. An explicit version tag such
as `mac-launcher-v1.0.0` publishes the same permanent release format. A manual
run produces review artifacts without creating a release.

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
DDP. The three-panel path is physically confirmed. Complete 41-panel address
parity, Art-Net, Ethernet, and audio-reactive behavior remain unproved or
unimplemented.

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

`LOO UME.app` is the normal Mac operator path. `./bootstrap.sh launch` remains
the normal clean-checkout developer path. Its first
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
