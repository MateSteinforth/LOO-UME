# Sculpture project format

The active format is Schema 2. A native project folder contains
`sculpture.json` plus optional safe relative GLB and STL assets. ZIP is the
portable container for the same layout.

## Authorities

- Panel poses in `sculpture.json` own geometry and LED world positions.
- The referenced panel profile owns dimensions, pixel grid, mounting holes,
  connectors, corrections, and electrical assumptions.
- `boundaryTopology` stores panel-ID and named-corner connectivity only. It
  contains no duplicate positions or transforms.
- `generatedMechanics` is a derived manifest with source fingerprint, exact
  boundary/part paths, SHA-256 values, generator identity, and validation state.
- Wiring outputs own exact ordered panel IDs after confirmation.

## Asset rules

Asset paths must be portable project-relative paths. Absolute paths, traversal,
reserved names, collisions, missing bytes, and SHA-256 mismatches fail before
rendering or publication. Import and export preserve exact bytes and saved
paths.

A panel, route, panel-set, profile, or bus edit invalidates the matching derived
fingerprint. Stale mechanics are not another geometry authority.

## Printable generation

The browser derives panel outlines from poses, detects or reuses flat gap
cycles, validates the closed boundary, and compiles exact STL bytes with pinned
Manifold. A GLB is a placement surface only.

Use:

```bash
npx tsx scripts/generate-panel-boundary-parts.ts \
  --sculpture sculptures/panel-outline-prism/sculpture.json \
  --output build/panel-outline-prism
```

## Mapping exports

```bash
npm run generate:mapping
npm run generate:mapping:hardware
```

The normal command emits explicit diagnostic files. The hardware command
requires a current mapping-ready route and emits guarded installation files.
Neither command claims electrical approval or hardware verification.

Schema files under `schemas/` support editors and external tools. Runtime
parsing also enforces cross-record invariants that JSON Schema cannot express.
