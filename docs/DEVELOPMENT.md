# Development

This document is the development entry point for LOO/UME. The root README is
for application users.

## Supported checkout

The supported checkout platforms are Linux x86-64 and macOS. The bootstrap
installs pinned Node.js and npm below `.tools/`.

```bash
git clone https://github.com/MateSteinforth/LOO-UME.git
cd LOO-UME
./bootstrap.sh launch
```

The first launch installs locked dependencies. It builds the application and
checks the Manifold desktop path. Later launches reuse only a verified current
build.

The bootstrap does not need administrator access or a global Node.js
installation.

Use this command to update a clean `main` checkout:

```bash
./bootstrap.sh update
```

The update accepts only the approved origin and a fast-forward change. It
preserves tracked and untracked local changes during the update.

Use the managed runtime for another npm command:

```bash
./bootstrap.sh npm <arguments>
```

Use setup without application launch when automation needs preparation only:

```bash
./bootstrap.sh setup
```

## Development servers

Start the browser development server:

```bash
npm run dev:web
```

Start the local production host:

```bash
npm run desktop
```

Start the Electron application from the checkout:

```bash
npm run electron
```

For repeated Electron development, use:

```bash
npm run dev:electron
```

This command stages sculpture assets once and starts an owned Vite server.
Renderer changes use Vite hot updates. Main-process changes rebuild the Electron
bundle and restart only Electron. Failed builds keep the previous application
open. Close the application or press `Ctrl+C` to stop the managed processes.
Development uses separate Electron user data below `build/electron-development/`.
The Vite library uses this worktree's `projects/local/` directory.
Set `LOO_UME_ELECTRON_DEV_PORT` to change the default port, 5173.
If another process owns the port, the command stops without using that process.
Firmware setup still requires the separate packaged review path or a selected
verified image. Development does not stage firmware automatically.
Vite uses browser storage for reconnect authorization. It does not expose the
packaged desktop authorization endpoint. Keep the development port unchanged to
retain the browser storage origin. Use packaged review to test desktop reconnect persistence.

For ESP32 review on macOS, build and open a local packaged Electron
application:

```bash
./bootstrap.sh review-electron
```

This command downloads the receipt-bound firmware when necessary. It creates
an application below `build/local-electron-review/`. It does not create a DMG.
The review application uses separate local data. It does not show public update notices.
Keep the command terminal open to see Electron device logs.

After a task-branch update, pull that branch. Run the same command again.

Start a trusted local-network review server:

```bash
npm run lan
```

This command selects the first free port at or above 4175. Stop it with
`Ctrl+C`.

Create a temporary phone review link:

```bash
npm run preview:phone
```

Call this URL a review link. Do not call it a deployment.

## Verification

Pushes and pull requests run the locked install, runtime integrity check,
TypeScript, and production build. Nightly checks verify clean setup, fast and host
tests, printable prism generation, and five browser journeys. Mac setup runs on Apple Silicon only.

To run all geometry and browser tests in CI, start **Verify Manifold application**
manually with **full_regression** enabled. These tests include the deferred P2
failures in REVIEW-020. The default manual run uses the same focused checks as
the nightly run. Test failures still fail their job; no check uses `continue-on-error`.

Use the narrowest command that covers a change:

```bash
npm test
npm run test:editor
npm run test:placement
npx tsc -b
npm run build:web
npm run test:browser
```

### Fast source checks

Use these commands during development:

```bash
npm run format
npm run check:fast
npm run lint:typed
npm run typecheck:watch
```

`format` writes formatting only to changed source files. `check:fast` checks
their formatting and syntax rules, then runs the complete TypeScript check.
These commands do not stage assets or build the application.
`lint:typed` checks promise handling and exhaustive switches with TypeScript
information. Explicit `void` remains permitted for existing intentional background
work. It does not handle a rejection. Handle errors in new background operations.

Source selection includes committed branch changes since `main`, working-tree
changes, and new files. Set `CHECK_BASE` to another Git base when necessary.
Pass `-- --all` to a formatting or lint command to check all source files.
Generated assets, firmware receipts, and vendor files are outside formatting scope.
Existing files enter formatting coverage when changed. A full formatting check
can report older files that have not yet entered this coverage.

Fast ESLint results use a content cache below `.cache/`. Typed lint does not
reuse file-only results because dependency type changes can affect unchanged files.
CI checks complete lint coverage and changed-file formatting before its build.
Keep editor formatting separate from lint. Do not run a formatter through ESLint.

### Test selection

```bash
npm run test:fast
npm run test:geometry
npm run test:host
npm run test:watch
npm test -- tests/generation-client.test.ts
```

The fast group excludes geometry integration and host lifecycle checks.
The geometry group includes Manifold and complete geometry compiler journeys.
The host group includes local services, setup, packaging, and process lifecycle.
`npm test` and `test:unit` still run all three groups. Arguments pass directly
to Vitest. The watch command runs the fast group and updates affected tests.
Use `npm run test:geometry -- --watch` for repeated geometry changes.
Do not remove clearance or mapping tests to shorten a general development check.

Browser tests always start their own server. They do not reuse an unknown
listener on port 4174. Stop another server on that port before browser checks.
Keep one browser worker until tests that share UDP receivers have separate ownership.

Run the normal complete verifier:

```bash
npm run verify
```

Run the same verifier after a clean dependency install:

```bash
npm run verify:clean
```

The normal verifier uses the checked-in WLED simulator. It does not need a WLED
checkout, Python, or Emscripten.

## Electron packaging

Apple Silicon (`arm64`) is the only required Mac target. Do not build Intel or universal Mac packages.

Build the Apple Silicon macOS DMG and update ZIP:

```bash
npm run package:electron:mac
```

Review packages use an ad-hoc signature. This signature does not identify an Apple-approved developer.
The workflow verifies the signature and launches the application extracted from the DMG on Apple Silicon.
macOS can still require approval in System Settings under Privacy & Security.
A public automatic update needs a Developer ID signature and Apple notarization.

The earlier managed-checkout launcher remains a recovery path. Ordinary `main`
pushes do not publish it.

## Generated artifacts

Write disposable output below `build/`. Do not use ignored preview output as a
test fixture.

Compile one deterministic Manifold fixture:

```bash
npx tsx scripts/generate-panel-boundary-parts.ts \
  --sculpture sculptures/panel-outline-prism/sculpture.json \
  --output build/panel-outline-prism
```

Generate diagnostic mapping files:

```bash
npm run generate:mapping
```

Generate guarded hardware installation files:

```bash
npm run generate:mapping:hardware
```

## WLED maintenance

Normal development uses the checked-in WLED simulator files. Reproducible
simulator rebuilds belong on `generate/wled-simulator`.

The firmware generation branch is no longer active. `main` keeps the selected
target, exact build receipt, browser setup path, and smoke configuration.

Do not create a new firmware build path without an explicit task and reviewed
toolchain inputs.

## Sources of truth

- `sculptures/*/sculpture.json` contains authored projects.
- `catalog/panels/` contains reusable fixture facts.
- `src/sculpture/PanelAssembly.ts` owns the Schema 2 runtime and mapping.
- `src/sculpture/SculptureEditor.ts` owns editor changes and invalidation.
- `src/cad/` contains the Manifold geometry compilers.
- `web/src/main.ts` owns browser orchestration.
- `TASKS.md` contains current task state.
- `AGENTS.md` contains recurring repository work rules.

## Technical documentation

- [Architecture](ARCHITECTURE.md) describes subsystem boundaries and data flow.
- [Software architecture](software.md) describes controller and software
  contracts.
- [Panel system](PANEL_SYSTEM.md) describes fixture geometry and fabrication
  limits.
- [LED mapping](LED_MAPPING.md) describes addressing, wiring, and transport.
- [Mechanics workflow](MECHANICS_WORKFLOW.md) describes printable-part
  generation.
- [Structural workflow](STRUCTURAL_WORKFLOW.md) describes structural analysis
  and connector output.
- [Connector design process](CONNECTOR_DESIGN_PROCESS.html) shows the current
  connector design routes.
- [Prototype hardware](PROTOTYPE_HARDWARE.md) describes hardware assumptions.
- [ESP32 setup and maintenance](../firmware/README.md) describes the selected
  firmware and physical checks.
- [Project format](sculpture-format.md) describes portable project authority.
- [Decisions](DECISIONS.md) records durable technical decisions.
- [Roadmap](ROADMAP.md) records product direction.
- [Agentic workflow bootstrap](AGENTIC_WORKFLOW_BOOTSTRAP.md) describes the
  reusable repository workflow.

Directory README files contain local maintenance notes. Read the applicable
file before you change its subsystem.
