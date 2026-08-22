# LED mapping and wiring

> **Assembly baseline:** the current authored 11/10/10/10 route and generated
> ledmap are mapping-ready under the saved snake, RGB, GPIO, and optimized-turn
> assumptions. They can guide staged assembly while their fingerprints match
> the project. Start with one fused panel, then one output. Do not describe the
> build as measured, electrically approved, or hardware-verified.

The operator authorized a concrete assumed prototype baseline on 2026-08-20.
See [`PROTOTYPE_HARDWARE.md`](PROTOTYPE_HARDWARE.md). It selects the controller,
GPIOs, and a limited power topology, but it does not convert the authored
assumed route or unmeasured panel facts into measured evidence.

## Three orders, one contract

The current mapping pipeline separates three concepts:

1. **Panel-local coordinates** identify an emitter by panel ID and `(x, y)` in
   the 8 × 8 grid.
2. **Logical index** is effect/simulator order. LED world positions are projected
   equirectangularly, then sorted by `v`, `u`, and a deterministic tie-breaker:
   north to south, then longitude.
3. **Physical index** is wire order. It is assigned from output number, panel
   chain position, and within-panel pixel order.

For every LED, `createPanelAssemblyMapping()` records panel ID, panel-local X/Y,
world X/Y/Z, equirectangular U/V, logical index, and physical index. The hardware
contract replaces initial panel-major physical indices with routed wire indices.
A WLED ledmap is exactly:

```text
map[logicalIndex] = physicalIndex
```

This agrees with the [official WLED mapping contract](https://kno.wled.ge/advanced/mapping/):
the array position is the natural/logical LED address and the stored value is
the remapped physical address. A correct ledmap is only one layer. WLED
[LED settings](https://kno.wled.ge/features/settings/) separately define each
bus start index, length, GPIO, color order, and reversal. All layers must agree
with the physical chain.

Mapping and wiring rebuild from Schema 2 poses after every edit; CAD success is
not a prerequisite.

## Panel-local wire order

The active profile's working order is, viewed from the back:

- pixel 0 at bottom-left beside DIN;
- first row left-to-right;
- rows progress upward and alternate direction;
- pixel 56 at top-right, pixel 63 at top-left;
- DOUT at top-right.

The code/profile still mark this order `provisional` pending a numbered physical
panel test. DIN/DOUT corner assignment itself is measured, but exact pad centres
are unknown. Changing this convention changes every physical index and the
ledmap fingerprint.

## Draft and authored wiring routes

Schema 2 output metadata can include an ordered `panelIds` list. A route is
**authored** only when every output has that list. Each output list must match
its `chainLengths` entry, each panel ID must exist, and all lists together must
cover every panel exactly once. The list order is controller to DIN to DOUT and
the browser mapping, wiring preview, and WLED ledmap use it without sorting or
optimization.

Older projects without `panelIds` remain **draft** projects.
`createProvisionalWiringPreview()` regenerates their deterministic suggestion:

- longitude strategy: sort into longitude sectors, then greedy nearest neighbor;
- face-adjacency strategy: prefer declared neighbors, then greedy distance;
- each route starts near the top under the provisional controller rule.

This is not global optimization. A draft suggestion is review data, not an
assembly instruction. Wiring lifecycle states are `draft`, `authored`,
`requires-review`, `measured`, and `hardware-verified`. A panel-set edit
preserves the saved `panelIds` as historical route evidence and sets
`requires-review`. If that route no longer covers the current panel set, the
preview uses a clearly labelled temporary draft route so mapping and simulation
continue. Pose edits also set `requires-review` without changing `panelIds`.

The legacy `measured` and `hardware-verified` lifecycle states remain available
for optional evidence. They do not gate `mappingReady`. `hardware-verified`
defines a passed `PROOF-010` receipt with the deployment identity plus SHA-256 values for
device read-back, the as-built record, and the parity proof. Runtime activation
of that state is rejected until `PROOF-010` supplies its acceptance validator.
A later relevant edit retains a receipt only as stale evidence under
`requires-review`.

## Browser route editor

The browser route editor shows each output label, known GPIO or `unknown`,
one-based chain position, predecessor, successor, and back-view DIN/DOUT
direction. A route row selects the same panel in the viewer. Drag rows to change
order; use
the output selector to change an assignment. There are no per-row Select,
Up, or Down buttons. The saved sculpture JSON does not change until **Save
route**.

A draft or temporary draft suggestion must first enter **Edit suggested
route**. This prevents the geographic heuristic from becoming an assembly route
by accident.
**Save route** stores exact `panelIds`, derives the output `chainLengths`,
sets `status: authored`, clears stale proof evidence, resets physical-chain
calibration to provisional, and increments `routeRevision` (first revision is
`1`). It does not create GPIO, measured, optimized, or physical claims.

When a panel-set edit makes a stored route stale, the editor shows the saved
route evidence separately and starts with the temporary current-panel draft.
The operator can use it only after Edit suggested route and Save route.

## Printable assembly-manual export

The **Export individual files** menu can write one
self-contained HTML file for the current Schema 2 wiring preview. It uses the
current in-memory model, embeds the A4 print CSS, and does not depend on a
popup. Open the downloaded file in a browser and select **Print / Save PDF**. A
directly opened standalone page still loads and revalidates its Schema 2
source. Mapping-ready routes retain their ready label. Draft and temporary
suggestions export as explicit **DRAFT SUGGESTION** manuals; they show missing
GPIOs as unassigned and current non-optimized panel turns as assumptions. The
assembly package contains the same `assembly-manual.html` together with the
project, verified GLB/STL assets, ledmap, and wiring review. The export
derives panel count, output count, output labels and colors, GPIOs, routes,
transforms, and address ranges from the current contract. It does not contain
a hard-coded flagship route.

The A4 landscape export contains a control cover, front/right/top placement
projections from the authoritative panel poses, and one or more detailed sheets
for each GPIO output. Long chains continue on additional sheets without
splitting a panel row. Each output section gives the exact
controller-to-DIN-to-DOUT order,
back-view installed turn, visible connector corners, predecessor and successor,
physical LED range, and a check box for every panel. Use at least two placement
views because an orthographic view can contain normal overlaps.

In the manual, green marks DIN and orange marks DOUT. Connector corners are
profile facts; exact pad centres in the small PCB diagrams are schematic. Use
**Print / Save PDF**, then print with A4 landscape, background graphics enabled,
and browser headers and footers disabled. The page labels the saved snake, RGB,
GPIO, route, mapping fingerprint, and orientation fingerprint. It is a mapping
assembly aid. It is not an electrical approval or a power-distribution plan.

The manual 41-panel snapshot currently resolves to:

| Output | Panels | Physical range | GPIO |
| ---: | ---: | ---: | --- |
| 0 | 11 | 0–703 | 16 |
| 1 | 10 | 704–1343 | 17 |
| 2 | 10 | 1344–1983 | 18 |
| 3 | 10 | 1984–2623 | 19 |

This is the saved route revision 1. The route and GPIO assignments are
prototype assumptions. They are authored, but they are not measured.

The route-optimized fingerprint is `bc5054d1`. It is FNV-style over only the low 16
bits of each physical index: useful for current artifact drift, not a
cryptographic identity.

## Required production contract

The production mapping must join these facts without an implicit transform:

1. authoritative world pose and logical LED index;
2. confirmed output and ordered panel IDs from controller to DIN to DOUT;
3. tool-selected panel orientation and the assumed local 8 × 8 snake;
4. global WLED bus start and length, GPIO, LED type, and RGB color order;
5. source-project, route, ledmap, bus-configuration, and firmware identities;
6. exact source and generated-artifact identities.

The installed address transform compiles before `panelWireIndex()`. The WLED
deployment contract fixes RGB order 1. The Schema and types define measured and
hardware-verified wiring lifecycle states. The parser accepts measured wiring, but rejects
hardware-verified activation until `PROOF-010` supplies an acceptance validator.
No authored sculpture contains measured route, controller, or proof facts yet.

`installedAddressTransform` does not reuse the geometry/mechanical rotation as
a hidden address transform. The pose remains the world-space authority. The
separate back-view transform maps pose-local display coordinates to PCB wire
coordinates. It applies optional horizontal mirroring first, then zero to three
clockwise quarter turns. Existing projects without this field use an assumed
identity transform; legacy `rotationDegrees` and `mirrored` values are never
inferred. A measured calibration requires an explicit measured transform on
every panel. Color order is a WLED bus fact. Bus reversal stays false because
the authored route and ledmap already own direction. The assumed WLED fragment
records type 22, RGB order 1, RMT driver 0, GPIO, global start, length, current
limits, and power-domain labels for all four outputs.

A panel pose or panel-set edit keeps the quarter-turn and mirror values, but
changes their status to assumed and changes the global installed-orientation
calibration to provisional. This makes invalidation explicit and prevents stale
measurement status from silently passing readiness.

`npm run optimize:wiring-orientation` evaluates four non-mirrored quarter turns
per panel and uses dynamic programming to minimize the complete set of
DOUT-to-next-DIN distances on each saved output. Equal-distance solutions use
the lexicographically lowest turn sequence. The current route estimate changes
from 3,429.5 mm at identity to 1,245.8 mm after optimization. The estimate uses
profile connector corners, not unknown pad-centre offsets.

The implementation sequence is:

```text
WIRE-010 explicit route
    -> WIRE-013 lifecycle/invalidation
    -> WIRE-011 route editor and confirmation
MAP-021 installed address transform -> CAL-010 physical measurement
HR-014 controller choice + PWR-010 approved power plan
    -> MAP-030 WLED bus/deployment contract (assumed review files exist)
    -> WIRE-012 guarded production bundle
    -> FIRM-011 device deployment
    -> DIAG-010 deterministic frame delivery
    -> HW-012 as-built record
    -> PROOF-010 all-address bench proof
```

A saved screenshot or wiring overlay is not authoritative. The overlay must be
regenerated from the saved route and deployment contract. Pose, panel-set,
profile, route, or bus changes mark dependent approvals stale and require new
hashes and proof.

Deployment hashes cover the exact emitted bytes. A versioned canonical manifest
lists each path, byte length, and SHA-256, then supplies the root deployment
identity. The manifest does not list itself; its exact-byte SHA-256 is recorded
in the external deployment receipt. This avoids a recursive hash and avoids
treating differently formatted but untracked JSON as the same deployed
artifact.

## Readiness and exports

`assessHardwareReadiness()` exposes `currentChecksPass` for the existing
transforms/UVs, chains, GPIOs, pixel order, and installed-address checks. It is
not electrical approval. `mappingReady` depends only on a complete authored
route, assigned GPIOs, complete snake order, and route-optimized transforms.
Draft, requires-review, and inactive hardware-verified routes report a
lifecycle blocker. The flagship route, GPIOs, and optimized address transforms
are authored assumptions. Pixel traversal is snake, color order is RGB, and the
tool selects installed quarter turns. Voltage, temperature, and device
read-back do not participate in mapping readiness.

The JSON Schema requires `panelIds` for explicit non-draft lifecycle states and
requires the shaped proof receipt for `hardware-verified`. Exact all-output
coverage, unique cross-output panel membership, current-panel correspondence,
chain-length agreement, stale-route fallback, and accepted-proof activation are
cross-record runtime invariants enforced by the parser and preview.

The CLI distinguishes mapping readiness from electrical approval. The browser
and CLI use the same exact-byte export policy and produce equivalent address,
route, target, and current-limit artifacts from the same project state.

The selected policy for `WIRE-012` is to keep assumption-labelled artifacts
available with unmistakable names. Mapping-ready output requires current route,
orientation, snake, RGB, GPIO, and target identities. Electrical protection and
the optional hardware-verified evidence lifecycle are separate.

`layout/panel-map.json` and the files under `wled/diagnostic/` are generated
review snapshots. `npm run generate:mapping:hardware` is the explicit guarded
CLI route for `wled/cfg.json`, `wled/ledmap.json`, the route/mapping manifest,
and the deployment manifest. The normal browser path rebuilds from sculpture
JSON. A mapping-ready assembly package contains the same installation bytes;
draft or stale packages contain only `.diagnostic.json` mapping files.
`loadGeneratedHardwareMappingContract()` remains for regression tests and
artifact validation.

## WLED and transport boundary

The browser runs a deterministic WASM effect host, not full WLED firmware. It
uses logical framebuffer order and the ledmap contract to relate that to
physical wiring. The host contains 30 selected 1D effects, eight palettes, one
Segment-like state, explicit time, and seeded randomness. WLED is pinned at
`d9b9a846561227351ad929e3109781daadb7bed2`.

No current code sends pixels to hardware. DDP, Art-Net, Wi-Fi, Ethernet, ESP32
drivers, presets, multiple/2D segments, audio-reactive effects, and firmware
configuration are absent. A C++ audio setter exists, but JS does not expose it
and selected effects do not use it. `firmware/` contains guidance only; board,
GPIO, network, microphone, usermod, and binary build decisions are open.

The mapping claim is static address and RGB parity for the selected pinned WLED
target. Matching effect names or WASM frames does not prove
ESP32 driver timing, frame pacing, power behavior, networking, audio, or every
native WLED effect.

## Safe change checklist

- Preserve unique, contiguous logical and physical indices.
- Validate every panel contributes the profile's exact LED count.
- Keep output ranges consistent with route order and chain lengths.
- Regenerate/compare fingerprints after pose, route, pixel-order, rotation, or
  mirroring changes.
- Never upgrade provisional facts to measured without hardware evidence.
- Regenerate the exact-byte manifest after a route, orientation, snake, RGB, or
  bus change.
- Test one fused, current-limited panel before mass wiring. Record all 64
  addresses and red/green/blue output. Test one representative from every known
  panel batch; divergent or unidentifiable batches need per-panel evidence or
  explicit overrides.
- Do not energize all 2,624 pixels until `PWR-010` is approved. At the current
  conservative 60 mA value, the full-white design load is 157.44 A at 5 V.
- Do not claim DDP/WLED device behavior from the browser simulator.
