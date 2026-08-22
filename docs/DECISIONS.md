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

## D6 — A folder is the native project; ZIP is transport

A portable project is `sculpture.json` plus safe relative, SHA-256-identified
assets. Folder and ZIP import/export use the same validation. Generated assets
are derived; sculpture JSON remains authoritative.

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

The two-domain fused power baseline is an authorized design assumption, not an
approval. Full operation still waits for `PWR-010`.

## D11 — Hash exact deployment bytes

The deployment manifest records fixed paths, byte lengths, SHA-256 values,
source-project identity, mapping fingerprint, and pinned target. Its exact-byte
SHA-256 is the external deployment identity. Credentials never enter it.

## D12 — The browser runs a WLED subset, not firmware

The checked-in WASM host supplies deterministic selected 1D effects for the
editor. It does not implement firmware installation, networking, DDP, Art-Net,
audio input, presets, or complete native WLED behavior.

## D13 — One assembly package is the primary handoff

The main operator path is Open project, edit panels and route, then Build or
Download assembly package. The package joins the authoritative project,
verified assets, printable manual, ledmap, and wiring review from one in-memory
contract. Raw and individual exports remain secondary tools.

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
