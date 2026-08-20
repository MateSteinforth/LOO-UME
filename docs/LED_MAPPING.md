# LED mapping and wiring

> **Assembly stop:** the current 11/10/10/10 route and provisional ledmap are
> review data, not build instructions. Do not commit the full DIN-to-DOUT chains
> until `WIRE-010`, `CAL-010`, `HR-014`, and `PWR-010` establish the saved
> route, panel facts, controller buses, and safe power plan.

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

## Provisional wiring model

Schema 2 stores output metadata and `chainLengths`, not explicit ordered panel
IDs. `createProvisionalWiringPreview()` regenerates a deterministic suggestion:

- longitude strategy: sort into longitude sectors, then greedy nearest neighbor;
- face-adjacency strategy: prefer declared neighbors, then greedy distance;
- each route starts near the top under the provisional controller rule.

This is not global optimization; the UI's “optimized wiring” filename is
overstated. Automatic placement assigns new panels to the shortest chain, but
exact route sequences are still regenerated.

The manual 41-panel snapshot currently resolves to:

| Output | Panels | Physical range | GPIO |
| ---: | ---: | ---: | --- |
| 0 | 11 | 0–703 | `null` |
| 1 | 10 | 704–1343 | `null` |
| 2 | 10 | 1344–1983 | `null` |
| 3 | 10 | 1984–2623 | `null` |

The committed fingerprint is `31291c59`. It is FNV-style over only the low 16
bits of each physical index: useful for current artifact drift, not a
cryptographic identity.

## Required production contract

The production mapping must join these facts without an implicit transform:

1. authoritative world pose and logical LED index;
2. confirmed output and ordered panel IDs from controller to DIN to DOUT;
3. installed panel orientation/mirroring and measured local 8 × 8 traversal;
4. global WLED bus start and length, GPIO, LED type, and RGB/GRB color order;
5. source-project, route, ledmap, bus-configuration, and firmware identities;
6. device read-back and a physical diagnostic result.

The current code does not meet this contract. `rotationDegrees` and `mirrored`
can block readiness, but they do not currently transform `panelWireIndex()`.
Color order is absent from the panel/deployment contract. Runtime parsing also
requires provisional controller and wiring states, so a measured fixture cannot
yet represent a valid finished project.

`MAP-021` will not reuse the geometry/mechanical rotation as a hidden address
transform. The pose remains the world-space authority. A separate measured
back-view address transform maps pose-local display coordinates to PCB wire
coordinates with discrete quarter turns and optional mirroring. Color order is
a WLED bus fact. Bus reversal stays false because the authored route and ledmap
already own direction.

The implementation sequence is:

```text
WIRE-010 explicit route
    -> WIRE-013 lifecycle/invalidation
    -> WIRE-011 route editor and confirmation
CAL-010 measured panel facts -> MAP-021 installed address transform
HR-014 controller choice + PWR-010 approved power plan
    -> MAP-030 WLED bus/deployment contract
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

`assessHardwareReadiness()` blocks hardware-ready status until transforms/UVs,
chains, GPIOs, pixel order, and installed rotation/mirroring are measured.
Current flagship data is provisional and GPIOs are unknown. There is also a
model inconsistency: runtime wiring validation requires the controller status
to remain provisional, while readiness requires a measured wiring preview, so
the model cannot reach a clean production-ready state end to end.

The CLI hardware export enforces readiness. The browser currently allows ledmap
and wiring downloads while presenting readiness blockers; treat those files as
review/test artifacts, not controller configuration.

The selected policy for `WIRE-012` is to keep diagnostic artifacts available
with unmistakable names. An installation-ready bundle is blocked until every
mapping, controller, and power prerequisite is current. It remains distinct
from hardware-verified output until deployment read-back, the as-built record,
and `PROOF-010` pass.

`layout/panel-map.json` and `wled/ledmap.provisional.json` are generated
snapshots. The normal browser path rebuilds from sculpture JSON.
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

The first hardware claim is narrower: static address and RGB parity on one
selected pinned WLED target. Matching effect names or WASM frames does not prove
ESP32 driver timing, frame pacing, power behavior, networking, audio, or every
native WLED effect.

## Safe change checklist

- Preserve unique, contiguous logical and physical indices.
- Validate every panel contributes the profile's exact LED count.
- Keep output ranges consistent with route order and chain lengths.
- Regenerate/compare fingerprints after pose, route, pixel-order, rotation, or
  mirroring changes.
- Never upgrade provisional facts to measured without hardware evidence.
- Verify bus start/length, GPIO, LED type, color order, and reversal by device
  read-back after deployment.
- Test one fused, current-limited panel before mass wiring. Record all 64
  addresses and red/green/blue output. Test one representative from every known
  panel batch; divergent or unidentifiable batches need per-panel evidence or
  explicit overrides.
- Do not energize all 2,624 pixels until `PWR-010` is approved. At the current
  conservative 60 mA value, the full-white design load is 157.44 A at 5 V.
- Do not claim DDP/WLED device behavior from the browser simulator.
