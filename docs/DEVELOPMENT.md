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
TypeScript, and production build. The broad test matrix runs nightly.

Use the narrowest command that covers a change:

```bash
npm test
npm run test:editor
npm run test:placement
npx tsc -b
npm run build:web
npm run test:browser
```

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

Build the universal macOS DMG and update ZIP:

```bash
npm run package:electron:mac
```

Unsigned workflow packages support review only. A public automatic update needs
a Developer ID signature and Apple notarization.

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
