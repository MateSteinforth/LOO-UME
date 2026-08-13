# LED mapping and wiring

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

## Safe change checklist

- Preserve unique, contiguous logical and physical indices.
- Validate every panel contributes the profile's exact LED count.
- Keep output ranges consistent with route order and chain lengths.
- Regenerate/compare fingerprints after pose, route, pixel-order, rotation, or
  mirroring changes.
- Never upgrade provisional facts to measured without hardware evidence.
- Do not claim DDP/WLED device behavior from the browser simulator.
