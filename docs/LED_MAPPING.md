# LED mapping and wiring

> **Assembly baseline:** the current authored 11/10/10/10 route and generated
> ledmap are mapping-ready under the saved straight-row, GRB, GPIO, and optimized-turn
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
   the active panel profile's `columns × rows` address grid. A profile can
   provide one row-major pose-local XYZ point per grid coordinate; the existing
   pixel-order contract maps those coordinates to wire addresses. Otherwise the
   runtime derives the historical rectangular grid. The current physical panel
   profile is 8 × 8.
2. **Logical index** is effect/simulator order. LED world positions are projected
   equirectangularly. The order key rounds `v` and `u` into one-billionth
   normalized bins. It then uses panel ID, panel-local Y, and panel-local X.
   This key gives north-to-south and then longitude order without raw-float
   comparisons.
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

The active profile's measured order is:

- front view: with the three-hole reference at the top, pixel 0/DIN is at
  bottom-left, every row runs left-to-right, and rows progress upward;
- front view: pixel 56 is top-left and pixel 63/DOUT is top-right;
- back view: pixel 0/DIN is bottom-right, every row runs right-to-left, and
  rows progress upward;
- back view: pixel 56 is top-right and pixel 63/DOUT is top-left.

The numbered one-panel test on 2026-08-25 measured the straight row order. The
physical SQ-05 check on 2026-08-30 anchored that order to the mounting pattern:
three-hole reference at the top, DIN bottom-right and DOUT top-left in back
view. Exact pad centres remain unknown. This correction changes every physical
index, connector-dependent installed turn, and deployment identity.

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
accepts the legacy `PROOF-010` receipt format with deployment identity and exact
evidence hashes. No complete 2,624-pixel proof is planned. A later relevant edit
retains a receipt only as stale evidence under `requires-review`.

## Automatic route optimization

The normal Mapping action uses `balanced-oriented-cable-optimizer`. It chooses
one through four outputs, balanced chain lengths with at most 11 panels per
output, GPIOs 16 through 19, complete panel order, and physical panel local-Z
orientation. Its objective includes controller-pin-to-first-DIN plus every
DOUT-to-next-DIN distance. All panels occur exactly once. Equal results use
stable panel-ID and turn tie-breaks so panel array order cannot change output.

The search is exact on small fixtures and uses deterministic bounded local
improvement for the 41-panel project. It is an optimized route, not a proof of
the mathematical global minimum. The existing drag route editor remains under
**Advanced route editor** for exceptional manual correction.

Panel orientation is pose-owned. The optimizer folds a non-mirrored legacy
address-only turn into the pose, then writes a route-optimized identity address
transform. Before a generated mechanics or structural manifest exists, it can
evaluate 0/90/180/270 degrees. After either manifest exists, even when stale,
it can keep the current pose or add 180 degrees only. A mirrored transform or a
post-fabrication legacy 90-degree address-only turn fails closed.
For an already-built sculpture whose older project has no generated-parts
manifest, **Developer utilities → Restrict wiring rotation to 0/180°** stores
`wiring.panelRotationConstraint: "half-turns-only"`. This operator gate has the
same optimization limit and persists through project export/reload. Removing it
cannot weaken a gate supplied by an existing generated-parts manifest.
When this explicit legacy-project gate is active without a generated-parts
manifest, the current saved poses are the fabricated authority. Optimization
discards assumed address-only quarter turns instead of migrating them into the
pose, then evaluates only 0/180-degree pose deltas. Mirroring still fails closed.

## Browser route editor

The Advanced browser route editor shows each output label, known GPIO or `unknown`,
one-based chain position, predecessor, successor, and back-view DIN/DOUT
direction. A route row selects the same panel in the viewer. Drag rows to change
order; use
the output selector to change an assignment. There are no per-row Select,
Up, or Down buttons. The saved sculpture JSON does not change until
**Regenerate mapping/wiring**.
An operator-confirmed edit changes `routeStrategy` to `manual-authored-route`;
it cannot retain an automatic-optimizer claim after chain membership or order
changes.

A draft or temporary draft suggestion must first enter **Edit suggested
route**. This prevents the geographic heuristic from becoming an assembly route
by accident.
**Regenerate mapping/wiring** stores exact `panelIds`, derives the output
`chainLengths`, sets `status: authored`, clears stale proof evidence, resets
physical-chain calibration to provisional, and increments `routeRevision`
(first revision is `1`). It does not create GPIO, measured, optimized, or
physical claims.

When a panel-set edit makes a stored route stale, the editor shows the saved
route evidence separately and starts with the temporary current-panel draft.
The operator can use it only after **Edit suggested route** and **Regenerate
mapping/wiring**.

## Interactive data-chain tutorial

The browser **Fabrication** assembly control derives every connection label from
the same Schema 2 wiring preview used by the normal wiring layers. **Isolate
chain** starts with the first panel of the first output. Panel and wire controls
move through their respective route items and continue across the remaining
outputs. Separate Previous/Next chain controls select an output without showing
redundant output checkboxes and preserve the active panel-or-wire mode. Only the
selected chain remains visible. The active panel's incident connections or the
selected wire are bright red; its other cables are muted gray for context. The tutorial never
moves the camera; the operator keeps orbit and unlimited zoom control. A schematic
controller sits above the sculpture and labels each output pin. DIN, DOUT, and
cable endpoints are behind each PCB in the profile's back-view convention.
Cable curves move inward from those endpoints, toward the sculpture interior.
Panel labels keep their panel IDs and sit on the same back-side DIN point used
by the green wiring marker. The tutorial is view-only: it does not change
poses, routes, mapping, mechanics, or saved project data. The viewport does not
rotate automatically, so back-side DIN/DOUT labels stay stationary during
review.

Authored routes are shown as saved data routes. Draft and review-required
routes remain inspectable but keep a visible warning that mapping/wiring must be
regenerated or reviewed before physical assembly. Missing GPIOs remain
explicitly unassigned.
The tutorial describes data cables only; it does not infer a power-distribution
route that is absent from Schema 2.
Current referenced printable assets remain visible during chain isolation. A
Schema 2 project with no `generatedMechanics` or `generatedStructure` references
has no printable geometry for the tutorial to show. The 41-panel project is
currently in that pose-and-wiring-only state.

Panel navigation is the default physical-build view. Previous/Next panel walks
the saved route across every nonempty output. It keeps the complete selected
chain visible, colors only the current panel normally, and mutes the other chain
panels. Both data cables incident to that panel are bright red: its incoming
controller-or-panel cable and, except at the end of a chain, its outgoing cable.
Printable closures carry the panel IDs from their screw-tab connectors. A
closure attached to the current panel stays in its normal material; other
selected-chain closures are gray and translucent. A combined STL with no
reliable per-panel ownership stays visible and is not presented as a specific
panel attachment. Wire navigation remains available for one-cable-at-a-time
inspection. Neither mode changes saved project or fabrication data.

The persistent **View** section owns the DIN/DOUT and panel-wiring layers. The
**Fabrication** owns the complete fabrication ZIP, chain/wire isolation, and ESP32 setup
below its optional part generators. The tutorial and ESP32 controls are not
gated by printable-part generation and do not lock the other project controls.
MadMapper export belongs to Mapping because it consumes the address contract,
not a fabricated assembly. The populated 41-panel project is the default
browser project; empty authoring projects remain available in the project
selector.

## Printable panel labels

**Download fabrication ZIP** writes one current Schema 2 panel ID per label on
the calibrated HERMA 4385 A4 grid. The physical sheet has 315 removable white
paper labels: 15 columns by 21 rows and 10 mm diameter. The operator measured
a 12 mm left margin, an 11 mm right margin, and 15 mm top/bottom margins. The
fitted pitch gives a 2.64 mm horizontal gap and a 2.85 mm vertical gap. These
stock dimensions are part of the PDF; printer displacement is not. Print at
**100%** or **Actual size**. Do not use **Fit to page**. The PDF continues to another sheet when a
project has more than 315 panels. Apply each printed ID at the DIN end of its
matching physical PCB; the simulator uses the same DIN anchor.

The label PDF contains IDs only. Its ZIP also contains a printable manufacturing
manual derived from the current route, every current verified planar STL, and
the complete verified structural connector package displayed in the viewport.
Stale or unavailable geometry is omitted. The export does not modify the project,
infer a route, or claim connector pad-centre measurements. The sheet contract
comes from the
[official HERMA 4385 product page](https://www.herma.de/buero-zuhause/produkt/abloesbare-etiketten-a4-4385/)
and its manufacturer punch template.

## Printable assembly-manual export

After **Generate panel closures** succeeds, the same button downloads an
assembly package that contains a self-contained `assembly-manual.html`. The
manual uses the current in-memory Schema 2 model, embeds the A4 print CSS, and
does not depend on a popup. Open it in a browser and select **Print / Save
PDF**. Mapping-ready routes retain their ready label. Draft and temporary
suggestions export as explicit **DRAFT SUGGESTION** manuals; they show missing
GPIOs as unassigned and current non-optimized panel turns as assumptions. The
package also contains the project, verified GLB/STL assets, ledmap, and wiring
review. The export
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
and browser headers and footers disabled. The page labels the saved pixel and color order,
GPIO, route, mapping fingerprint, and orientation fingerprint. It is a mapping
assembly aid. It is not an electrical approval or a power-distribution plan.

The current 41-panel wiring manual resolves to:

| Output | Panels | Physical range | GPIO |
| -----: | -----: | -------------: | ---- |
|      0 |     11 |          0–703 | 16   |
|      1 |     10 |       704–1343 | 17   |
|      2 |     10 |      1344–1983 | 18   |
|      3 |     10 |      1984–2623 | 19   |

This is the saved route revision 1. The route and GPIO assignments are
prototype assumptions. They are authored, but they are not measured.

New artifacts label their fingerprint as `fnv1a32-u32le-v2`. The FNV-style
input includes all four little-endian bytes of each physical index, so indices
that differ above bit 15 cannot alias for that reason. A panel map without a
version label loads through the historical `fnv1a32-u16le-v1` rule; new exports
always write the v2 label. This remains a drift identity, not a cryptographic
identity.

## Required production contract

The production mapping must join these facts without an implicit transform:

1. authoritative world pose and logical LED index;
2. confirmed output and ordered panel IDs from controller to DIN to DOUT;
3. tool-selected panel orientation and the active profile's assumed local
   pixel order;
4. global WLED bus start and length, GPIO, LED type, and RGB color order;
5. source-project, route, ledmap, bus-configuration, and firmware identities;
6. exact source and generated-artifact identities.

The installed address transform compiles before `panelWireIndex()`. The WLED
deployment contract fixes measured GRB order 0. The Schema and types define
measured and legacy hardware-verified wiring states. The parser accepts measured
wiring. It accepts hardware-verified activation only with the legacy
`PROOF-010` receipt format. No complete physical proof is planned.

`installedAddressTransform` does not reuse the geometry/mechanical rotation as
a hidden address transform. The pose remains the world-space authority. The
separate back-view transform maps pose-local front-view coordinates to PCB wire
coordinates. It first applies the fixed front-to-back X reflection, then an
optional installed horizontal mirror, then zero to three clockwise quarter
turns. Existing projects without this field use an assumed
identity transform; legacy `rotationDegrees` and `mirrored` values are never
inferred. A measured calibration requires an explicit measured transform on
every panel. Color order is a WLED bus fact. Bus reversal stays false because
the authored route and ledmap already own direction. The assumed WLED fragment
records type 22, measured GRB order 0, RMT driver 0, GPIO, global start, length, current
limits, and power-domain labels for all four outputs.

A panel pose or panel-set edit keeps the quarter-turn and mirror values, but
changes their status to assumed and changes the global installed-orientation
calibration to provisional. This makes invalidation explicit and prevents stale
measurement status from silently passing readiness.

### Physical route review

The Mapping toolbox can review an already assembled route through a current
WLED link. The tool suspends normal DDP output and sends one complete physical
panel block at a time. All other LEDs stay black. Pixel 0 is green at DIN, and
the low-brightness gradient ends in purple at DOUT. The matching virtual panel
shows the same diagnostic frame and the proposed DIN direction in both review modes.
The tool refreshes the diagnostic frame every 250 ms after the previous send
completes. This keeps WLED in realtime mode while the operator inspects a panel.
The tool stops refreshes and waits for the pending send before applying mapping
changes or resuming normal output. The diagnostic frame does not change GPIOs.

When no controller is connected, the same **Review physical wiring** action
automatically uses virtual-only mode. It shows the diagnostic pixels only on
the virtual sculpture. Virtual-only mode cannot apply changes, write a ledmap,
or change project data. It is a rehearsal tool, not physical address evidence.

The operator can confirm the expected panel or click the panel that is actually
lit. A different choice swaps complete panel assignments so every physical
slot stays unique, then waits for orientation confirmation. The rotation
buttons change only the explicit back-view
installed-address transform. Square fixtures use 90-degree steps. Non-square
fixtures use 180-degree steps because a quarter turn cannot preserve their
address grid. Mirrored input is rejected; the review does not infer a mirror.

The review is transactional. Cancel sends the current simulator frame again
and does not change project data. Apply requires every slot to be confirmed,
shows the proposed route and orientation changes, and preserves panel poses,
mechanics, fabrication data, controller pose, GPIOs, and panel-profile facts.
It writes a new authored route revision with manual measured address
transforms, regenerates the ledmap, uploads and activates map 0, and reads the
exact map back before DDP resumes. This is address evidence. It is not power,
connector, controller-position, or complete hardware proof.
If an upload or activation result is ambiguous, the review stays frozen. Cancel
and Escape stay disabled, the old project cannot resume, and the operator must
retry exact activation and read-back. The retry reuses the same reviewed target
and does not create another project mutation.

The legacy maintenance command `npm run optimize:wiring-orientation` evaluates
four non-mirrored address-only quarter turns
per panel and uses dynamic programming to minimize the complete set of
DOUT-to-next-DIN distances on each saved output. Equal-distance solutions use
the lexicographically lowest turn sequence. The current route estimate changes
from 2,795.8 mm at identity to 1,245.8 mm after optimization. The estimate uses
profile connector corners, not unknown pad-centre offsets. New browser-created
routes use the pose-owned optimizer above instead.

The implementation sequence is:

```text
WIRE-010 explicit route
    -> WIRE-013 lifecycle/invalidation
    -> WIRE-011 route editor and confirmation
MAP-021 installed address transform -> CAL-010 physical measurement
HR-014 controller choice + operator-owned external power plan
    -> MAP-030 WLED bus/deployment contract (assumed review files exist)
    -> WIRE-012 guarded production bundle
    -> FIRM-011 device deployment
    -> optional DIAG-010 deterministic frame delivery
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

### Replacement output GPIOs

**Developer utilities** shows one GPIO field for each current output. It accepts
only unique pins from this ESP32-WROOM output list: 4, 13, 14, 16, 17, 18, 19,
21, 22, 23, 25, 26, 27, 32, and 33. It rejects flash pins, input-only pins,
unsafe boot pins, duplicate pins, and missing values.

Applying the change preserves panel order, address order, output lengths, panel
poses, and fabrication data. It saves the new GPIOs in the project. Manuals,
exports, WLED bus configuration, and reconnect checks use the saved values.
Run ESP32 setup once after each GPIO change. Later Electron starts can reconnect
without another flash or setup.

After a verified desktop connection, LOO/UME saves a startup project ZIP in
application data. The next start restores this project before it checks WLED.
Older installations have no startup copy. Open the saved project with the
installed GPIOs once to reconnect and create that copy.
Configuration errors identify differing fields, including each output GPIO.
The application does not change WLED buses to match an unrelated startup project.

On 2026-09-05, device read-back confirmed GPIOs 16, 17, 21, and 22, with
704/640/640/640 LEDs. The active segment covered indices 0 through 2623.
The operator reported output only from GPIOs 16 and 17, including direct-pin tests.
These settings do not prove an electrical signal. The pinned Core-3 shared RMT
driver can ignore initialization errors. A pin test must separate GPIO selection
from output position before the project records damaged pins or a firmware cause.

`assessHardwareReadiness()` exposes `currentChecksPass` for the existing
transforms/UVs, chains, GPIOs, pixel order, and installed-address checks. It is
not electrical approval. `mappingReady` depends only on a complete authored
route, assigned GPIOs, complete panel order, and one accepted installed-address
authority per panel. An accepted transform is either route-optimized or an
explicit measured manual transform from physical route review.
Draft, requires-review, and inactive hardware-verified routes report a
lifecycle blocker. The flagship route, GPIOs, and optimized address transforms
are authored assumptions. Pixel traversal is measured straight row-major,
color order is measured GRB, and the tool selects installed quarter turns.
Voltage, temperature, and device
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
orientation, pixel order, color order, GPIO, and target identities. Electrical protection and
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

`npm run diagnostics:hardware` writes an identity-bound plan of 7,872 WLED
JSON frames. Each low-brightness frame lights only one logical pixel and one
RGB channel, while its record names the expected output, GPIO, panel, local
coordinate, and physical index. Supplying `--host`, a bounded frame range, and
`--confirm-one-pixel-output` sends those exact bytes to `/json/state` with
bounded transient retries. Do this only after the fused-panel FIRM-011 smoke
test passes. A generated or sent frame is not observed hardware evidence.

The local editor now has receipt-bound setup for a loaded one-to-41-panel
sculpture and exact HTTP read-back. FIRM-014 adds a segmented
1-to-2,624-pixel DDP preview and saves a native WLED boot preset as its fallback.
The operator physically confirmed the DDP-to-native fallback and autonomous
power-cycle playback on the 192-LED three-panel project. Direct WLED Art-Net
and Ethernet remain absent. LOO/UME now receives complete MadMapper Art-Net
frames locally. LOO/UME also receives complete logical DDP frames on UDP port
4048 from local or LAN senders. The newest external frame controls the virtual
sculpture. When WLED connects, LOO/UME forwards the visible logical frame
through WLAN DDP. WLED applies the installed ledmap one time. The queue keeps
the latest frame during backpressure. The operator accepts this behavior as a
working assumption.

The complete project package contains `loo_ume_ddp.tox`. This component accepts
one TOP. An internal Fit TOP center-crops the image to 2:1 at 1280 x 640. Its
configuration lists pose-derived UV samples in logical LED order. The component
sends bounded RGB DDP packets to the simulator. LOO/UME
mirrors the visible frame to a connected sculpture. The component uses
TouchDesigner NumPy and Python sockets. It needs no external plugin. Its status
table reports the target, fingerprint, frame rate, and replaced frames. The
component needs 1 through 2,624 mapped LEDs. It does not require a physical WLED
deployment identity. The configuration reports simulator-only status when
physical output is not ready.

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
- Regenerate the exact-byte manifest after a route, orientation, pixel order, color order, or
  bus change.
- Test one fused, current-limited panel before mass wiring. Record all 64
  addresses and red/green/blue output. Test one representative from every known
  panel batch; divergent or unidentifiable batches need per-panel evidence or
  explicit overrides.
- Treat electrical design and approval as an external operator responsibility;
  WLED current values are not electrical approval evidence.
- Do not claim DDP/WLED device behavior from the browser simulator.
