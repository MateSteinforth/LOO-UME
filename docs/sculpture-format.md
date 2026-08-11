# Sculpture source format

The canonical authored source for the current sculpture is
`sculptures/rhombicosidodecahedron/sculpture.json`. It references the reusable
66 x 65 mm panel definition in
`catalog/panels/ws2812b-8x8-66x65.json`.

These source documents contain design intent and hardware facts. Expanded
panel transforms, per-LED XYZ/UV coordinates, physical indices, and the WLED
permutation remain generated artifacts in `layout/` and `wled/`.

## Compilation flow

```text
panel profile + sculpture.json
             |
     runtime/schema validation
             +------------------------+
             |                        |
    panel geometry + wiring     opening/interface policy
             |                        |
  panel-map.json + ledmap JSON   generated SCAD + manifest
```

Run the read-only source validation with:

```bash
npm run validate:sculpture
```

Regenerate the expanded artifacts with:

```bash
npm run generate:mapping
```

Generate every currently supported asset with:

```bash
npm run generate:assets
```

The CAD half currently emits a triangle-filler entrypoint and manifest under
`build/generated/`. To render both the canonical and generated printable STL,
compare their deterministic CSG trees, and render the three-panel assembly
preview, install OpenSCAD plus Xvfb and run:

```bash
npm run verify:cad
```

Production hardware export remains guarded:

```bash
npm run generate:mapping:hardware
```

That command refuses to emit `wled/ledmap.json` until the controller GPIOs,
physical chains, DIN/DOUT assignments, panel pixel order, transforms, and
installed orientations are measured.

## Source versus generated data

The source JSON currently selects the vertex-up rhombicosidodecahedron recipe,
the populated faces, centre-panel pose, UV/effect ordering, and provisional
four-output routing policy. The TypeScript compiler expands that compact recipe
into all 41 panel frames and 2,624 LEDs.

`openings.triangleFaces` declares all 20 triangular openings. Its closure names
the printable part, print/assembly modes, tested handedness, print-bed surface,
and each of the three square-panel interfaces. Every interface preserves the
safe mounting-hole end, 14 mm electrical-connector corner clearance, and 0.30
mm PCB-envelope clearance.

The generated triangle entrypoint deliberately includes the existing,
physically tested `parts/triangle.scad` rather than copying its geometry. It
adds assertions that bind the part's public constants to the panel profile and
opening policy: PCB size/thickness, corner-hole inset, pilot and lead-in sizes,
the measured 0.20/0.50 mm fit corrections, handedness, and clearances. This is
the migration seam: JSON selects and verifies the proven CAD template now; a
later template compiler can replace the implementation without changing the
source contract.

The schemas are versioned under `schemas/`. Runtime validation additionally
checks semantic constraints that JSON Schema alone cannot express, including
the panel-profile reference, total routed panel count, unique output indices,
preservation of measured physical-fit corrections, opening/closure counts, and
the ordered set of three triangle interfaces.

This first schema version intentionally supports the migrated sculpture recipe.
Arbitrary face graphs and additional CAD templates remain future schema
variants; generated geometry must continue to pass printable and assembly
renders before replacing a physically tested template.
