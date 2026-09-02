# Durable decisions

## D1 — Panel poses are authoritative

Saved Schema 2 poses define panel geometry and LED world positions. A GLB,
mechanical face, or surface attachment may constrain editing but cannot silently
replace a pose.

## D2 — Editing is independent of printable-mechanics currency

Mapping, wiring, simulation, and persistence continue when mechanics are absent
or stale. A relevant edit invalidates the generated fingerprint and hides stale
printable assets without disabling the rest of the editor.

## D3 — GLBs are placement surfaces, not printable material

Printable geometry derives from authoritative panel outlines. Gap detection
welds exposed corners, traces unambiguous cycles, validates flat simple N-gons,
and proves a closed two-manifold boundary before solid construction.

## D4 — Manifold is the only printable-parts kernel

Generic and flagship printable geometry compile with pinned `manifold-3d`
3.5.1. The browser is the primary execution path. The bounded local handler is
only a fallback for a Manifold runtime-load failure. Geometry errors do not fall
back to another kernel.

This decision supersedes the former manual and generated SCAD routes. The
repository does not install, probe, execute, or publish through that retired
toolchain.

## D5 — Physical corrections and connector clearances are constraints

The measured 0.20 mm hole-edge and 0.50 mm surface-flush corrections remain in
the panel profile. Printable material must not enter PCB envelopes or obstruct
DIN, DOUT, V+, V-, or blocked mounting holes. Change measured corrections only
after a new physical result.

## D6 — ZIP is the operator project and library format

One `.loo.zip` format is used for demo, local-library, backup, and transfer
projects. It contains a versioned manifest, authoritative `sculpture.json`, an
embedded thumbnail, and safe relative SHA-256-identified assets. The local
library is a folder of these ZIPs; import and export copy the same validated
format without conversion. Repository-authored demo JSON remains the reviewable
source for deterministic tracked demo ZIPs. Generated assets are derived, and
the sculpture JSON inside each package remains the project authority. Desktop
and Vite development hosts enumerate and serve exact validated demo/local ZIP
bytes through one loopback-only handler; a static host exposes tracked demos
only and does not become writable. Local mutations require an exact prior
revision or an explicit create-only precondition, and package replacement is
atomic. The project filename is the library label; package metadata and the
authoritative sculpture name stay inside the unchanged ZIP format.
Rendered thumbnails use the same package schema: new packages reference an
embedded `thumbnail.png`, while existing `thumbnail.svg` packages remain valid.
The browser captures one mapping-framed render during Save or Export without
moving the active camera. Tracked demo PNGs are derived with the same renderer
and then embedded by the fast deterministic demo-package generator.

## D7 — Mapping artifacts derive from sculpture JSON

Logical order, exact output routes, installed address transforms, GPIOs, bus
configuration, and ledmap bytes must agree with the current authored project.
A pose, route, panel-set, profile, or bus edit requires regenerated identities.

## D8 — Installed address calibration is not a second pose

The pose owns display-local coordinates and world positions. The separate
back-view installed transform applies optional mirroring and discrete quarter
turns only to local wire indexing. WLED bus reversal remains false.

## D9 — Hardware parity is evidence-gated

Mapping-ready assumptions do not become measured facts. A hardware-verified
state requires accepted `PROOF-010` evidence bound to the exact deployment,
device read-back, as-built route, and parity record. Electrical approval remains
separate.

## D10 — Use one conservative prototype contract

The assumed first target is ESP32-DevKitC V4 with ESP32-WROOM-32E-N4, pinned
WLED commit `d9b9a846561227351ad929e3109781daadb7bed2`, GPIOs 16–19, four RGB
WS281x buses, no bus reversal, and route-optimized panel quarter turns.

Electrical design is an external operator responsibility. The saved WLED
current values are operating assumptions and do not constitute approval.

## D11 — Hash exact deployment bytes

The deployment manifest records fixed paths, byte lengths, SHA-256 values,
source-project identity, mapping fingerprint, and pinned target. Its exact-byte
SHA-256 is the external deployment identity. Credentials never enter it.

## D12 — The browser runs a WLED subset, not firmware

The checked-in WASM host supplies deterministic selected 1D effects for the
editor. It does not implement firmware installation, networking, DDP, Art-Net,
audio input, presets, or complete native WLED behavior. A separate local-host
hardware path now performs receipt-verified ESP32 flashing, Improv provisioning,
native preset persistence, exact read-back, and bounded DDP preview.

## D13 — One assembly package is the primary handoff

The main operator path remains fully editable through the Shape, Fixtures,
Mapping, and Fabrication toolboxes. Their order is not a
readiness gate. Project-file open, library save, backup, and transfer actions
share the Project Library dialog; quick Save stays in the Project toolbar. The panel-closure package joins the
authoritative project, verified assets, printable manual, ledmap, and wiring
review from one in-memory contract. The project ZIP is the primary editable
handoff; raw files remain secondary tools.

## D14 — `main` is the integration baseline

Substantial tasks use isolated branches and worktrees. Completed work stops at
Ready to Merge unless the operator explicitly authorizes integration. Never
rewrite shared history or discard unfamiliar worktree changes.

## D15 — Execution mode follows demonstrated risk

FAST is the default for clear low-risk work. STANDARD adds a short plan and
risk-based independent review for substantial normal features. QUALITY is for
architecture, geometry, conflict resolution, high-risk changes, ambiguity, or
repeated failure. Escalate Luna to Terra to Sol only when evidence requires it,
and stop when acceptance criteria and relevant checks pass.

## D16 — Normal main does not rebuild the WLED simulator

The checked-in WLED JavaScript and WASM files are the normal runtime on `main`.
Running, testing, or installing the editor must not require Python, Emscripten,
or a WLED source checkout. A dedicated generation branch preserves the pinned
source, compiler, reproducible rebuild procedure, checksums, and receipt. A
reviewed artifact update can move exact rebuilt bytes back to `main`.

## D17 — The 41-panel authority is Schema 2

The current 41-panel sculpture JSON contains the project needed for the physical
build. No old Schema 1 project must remain runnable. Retire the migration fixture
and procedural Schema 1 mapping dependencies without changing the Schema 2
poses, route, mapping, or generated deployment artifacts.

## D18 — Hide stale mechanics and keep the boundary contract small

After a relevant edit, stale generated parts stay hidden until regeneration.
Do not add a stale-part inspection toggle. Authoritative JSON poses and topology
plus exact STL output are sufficient; add another boundary asset format only
when a concrete workflow proves that it is necessary.

## D19 — Preserve evidence labels in the approved panel profile

The operator approved the existing panel profile for the current 41-panel
build. Keep its present dimensions, connector orientation, and physically tested
corrections. Approval does not convert fields marked provisional or unknown into
measured evidence. Electrical approval and device parity remain separate gates.

## D20 — Structural generation is an additive pose-derived route

Structural inputs use the same Schema 2 panel poses and resolved profile. They
do not create another geometry authority and do not convert GLB triangles into
printable material. Load-path analysis is advisory, not certification. Ribbon
or bridge fabrication succeeds only when its independent hardware, PCB,
Manifold, and print-envelope checks pass.

## D21 — Keep two modular connector surface styles

Connector ribbons use eligible screw-shoe pairs and pose-derived lofts. LED-
surface bridges use the same eligible anchors but span complete panel edges at
the LED-emitter plane. The two primary generation buttons select the style.
Detailed neighbor, bed, split, and pair controls stay under **Fabrication
settings**.

## D22 — Surface and free-3D editing are separate modes

Surface mode preserves constrained surface translation, saved local-XY movement
without a surface, and local-Z rotation. Free 6DOF mode exposes local XYZ
translation and rotation. A completed free transform saves one normalized,
right-handed pose and removes the obsolete surface attachment.

## D23 — Structural download follows the verified viewport set

Only one structural download action is shown. It creates a deterministic ZIP
from the current hash-verified structural artifact set displayed in Three.js.
Generating the other style replaces the current set; stale assets stay hidden
and cannot be downloaded.

## D24 — Convert back-view hardware coordinates before fabrication

Panel-profile mounting-hole IDs and coordinates remain measured PCB back-view
facts. The shared conversion mirrors profile-local X when those facts enter the
right-handed pose whose normal points outward through the LEDs. It applies to
compiled planar-closure holes, eligible structural screw anchors, and blocked
DIN/DOUT points.
The renderer applies the same conversion when it cuts mounting holes from the
virtual PCB surface. Stable legacy IDs do not override their measured 3-column
x 2-row coordinates.
The generated-mechanics fingerprint includes this fabrication-coordinate
contract. Parts made before the conversion become stale and must regenerate.
Final ribbon and LED-surface bridge solids must fail if they enter a
conservative DIN/DOUT clearance cylinder; the generator does not cut a bore to
hide the collision. This fabrication-contract revision invalidates all older
generated structural artifacts without changing panel poses or addressing.

## D25 — Preflight ZIP resource use before extraction

Portable ZIP import has fixed limits for archive bytes, entry count, individual
and total expansion, and compression ratio. It rejects unsupported or
inconsistent central-directory contracts before decompression. Streaming local
entries must match that inspected directory before bytes enter project buffers.

## D26 — Hardware diagnostics light one pixel at a time

The diagnostic plan is bound to the exact deployment identity and mapping
fingerprint. Each frame records output, GPIO, panel, local coordinate, logical
index, physical index, and one RGB channel. Requests use the pinned WLED JSON
individual-LED contract, stay below 1,024 bytes, use brightness 32, and change
only one visible pixel. The sender retries only transient transport or HTTP
failures and requires an explicit confirmation flag. Generated frames are test
instructions, not hardware evidence.

## D27 — Standalone playback and live preview are separate contracts

The setup derives one configuration from the loaded simulator; it does not ask
the operator to choose an internal deployment mode. It supports the complete
41-panel authority as four contiguous outputs and 2,624 mapped pixels.
The setup saves the selected native WLED animation as preset 1 and selects it
for boot. Exact simulator pixels are temporary DDP realtime
data, not persisted state. WLED must use a finite 2.5-second realtime timeout so
loss of the editor, host, network, or laptop returns the panel to the saved
native animation. Setup must restart the device and verify its preset, boot
selection, state, bus, and identity before it succeeds.

## D28 — Electrical approval is external to the compiler

The operator owns power-system design and approval outside this repository.
The compiler copies authored GPIO, bus, LED-count, and WLED current values and
does not treat them as electrical safety evidence or a software blocker.

## D29 — Push and pull-request CI is a fast build gate

Normal pushes and pull requests install locked dependencies, verify the
checked-in WLED runtime, type-check the application, and build the production
browser bundle. Full Vitest, Chromium, Manifold-generation, stage-zero, and
clean Linux/macOS setup checks run nightly at 02:17 UTC and remain available
through the GitHub Actions **Run workflow** action. This keeps normal
implementation fast without deleting the broader tests or depending on a
person to remember the periodic run.

## D30 — Panel selection stops automatic rotation

Superseded by D34.

Slow auto-rotation is a passive overview aid. A successful panel selection from
the viewport, a label, or the route editor stops it and synchronizes the View
checkbox. The application does not resume rotation automatically when selection
clears. This keeps the editing target stationary without changing project data.

## D31 — Automatic wiring owns physical panel orientation

The normal Mapping action jointly chooses balanced chain membership/order,
GPIOs, and local-Z panel orientation. It writes physical rotation into the
authoritative pose and leaves the installed-address transform at optimized
identity, so connector rendering and fabrication cannot disagree with mapping.
Before any generated-part manifest or explicit operator gate exists, all four
quarter turns are eligible. A mechanics/structural manifest, including when
stale, or `wiring.panelRotationConstraint: "half-turns-only"` limits choices to
the current pose and a 180-degree turn. Manual route editing is an Advanced
exception, not the normal workflow.
For an older fabricated project with the manual gate but no generated manifest,
the current saved poses are explicit fabrication authority. The optimizer
discards assumed legacy address-only turns before applying the limited search.

## D32 — Export a supported MadMapper information package

The MadMapper handoff contains a generated 6.1+ SVG fixture atlas, readable
address files, an importable loopback Art-Net unicast routing CSV, mapping
manifest, and generated setup PDF. The routing CSV activates every exported
universe at `127.0.0.1` without remapping. It does not generate MadMapper's
undocumented native project format. Schema 2, the mapping contract, and mapping
fingerprint remain the authorities.

The SVG uses one fixture group for each panel and one independently addressed
`Generic - Pixel RGB` fixture for each physical LED. Every fixture footprint
comes from its pose-derived LED position and panel axes. Art-Net addresses
follow physical wire order over 16 universes. This makes MadMapper perform the
complete realtime spatial-to-wire mapping because its documented SVG contract
has no per-instance matrix-assignation field. WLED realtime ledmap processing
stays disabled for direct Art-Net, while native WLED effects can continue to use
the installed ledmap. `LIVE-010` must prove the path on Ethernet hardware.

## D33 — Preview MadMapper through a bounded loopback Art-Net receiver

LOO/UME can show the physical MadMapper patch on its pose-derived 3D sculpture
without an ESP32. The desktop service receives ArtDMX only on
`127.0.0.1:6454`, shares that fixed Art-Net port through address reuse,
assembles complete consecutive-universe frames, and streams them to its
same-origin browser through framed binary HTTP. This avoids a new WebSocket
dependency, avoids exposing a UDP listener to the LAN, and avoids a macOS
loopback alias or administrator action.

The browser converts physical Art-Net indices to the current logical renderer
indices with the same mapping contract used by the SVG export. Preview is
temporary display state: project changes stop it, signal timeout restores the
native simulation, and no received frame changes authored project data.

## D34 — Use manual viewport orbit and a selectable controller pose

The viewport does not rotate automatically. The operator has direct orbit and
zoom control without a separate animation switch. The schematic controller has
an optional saved right-handed world pose. When this pose is absent, LOO/UME
uses the deterministic suggested position and world orientation. Clicking the
controller body or label selects it and attaches translation and rotation
controls. The saved pose controls the rendered controller, output pins, cable
routes, and wiring optimization costs.

## D35 — Preserve local work across application updates

The local updater keeps the existing main-branch, canonical-origin, and
fast-forward-only trust boundary. A dirty working tree is not itself unsafe:
the updater temporarily stores tracked and untracked changes, applies the
verified application update, then restores those changes before launch.
Ignored project-library ZIPs remain in place. A restore conflict stops before
launch and retains the recovery stash.

The production loopback server can check `origin/main` and expose the same
operation through an Update button. Update mutation requires a same-origin
POST to the loopback server. LAN preview and static hosting cannot apply it.

## D36 — Keep the Mac application as a thin managed-checkout launcher

The Mac application does not embed a second browser or fork the editor. Its
first launch installs a canonical `main` checkout below Application Support and
then delegates setup, launch, and update to the existing verified boundaries.
This keeps Web Serial and all other Chromium behavior in the operator's normal
browser and preserves the repository updater.

One launcher script owns the background server PID and readiness URL. The app
can therefore reopen an existing editor, stop its server, and retain process
ownership after an in-editor update. The release workflow publishes the small
launcher automatically after every canonical `main` update and for explicit
version tags. Each publication is bound to a commit contained in `origin/main`
and uses a unique release tag; manual workflow runs remain temporary review
artifacts. An ad-hoc signature is review evidence only; signed and notarized
public distribution requires a separate Apple credential decision.

Finder launch uses a visible Terminal progress session because browser and
notification-only startup did not show whether a long first installation was
working. Uninstall is a separate command file in the release. It preserves the
local Project Library in Documents before it removes managed files.

## D37 — Reuse the editor and local services inside Electron

The Electron application is a packaging boundary, not a second editor. It
serves the existing production browser build from an ephemeral loopback port
and reuses the project-library, fabrication, Art-Net, WLED HTTP, and DDP service
modules. The renderer has no Node integration. Web Serial permission stays in
the Electron main process and accepts only the approved CP2102 identity.

Electron updates are release-artifact updates, not Git checkout updates. Only a
Developer-ID-signed and notarized `electron-v*` tag contained in canonical
`main` can publish the latest update feed. Manual workflow runs build an
unsigned review package only. Mutable projects and generated files stay in the
application user-data directory and are not part of the replaceable bundle.

The Electron window owns the desktop session. Closing the last window quits
the application and its loopback services on macOS as well as other platforms.
This differs from the normal document-based Mac convention because LOO/UME has
no useful hidden state after its only editor window closes.
