# Panel mapping contract

The authored source now lives in `sculptures/rhombicosidodecahedron/sculpture.json`
and references the reusable panel hardware profile under `catalog/panels/`.
See `docs/sculpture-format.md` for the source-versus-generated contract.

`panel-map.json` and the explicit files under `wled/diagnostic/` are
deterministically compiled by `npm run generate:mapping`. The browser normally
rebuilds the same contract from the current Schema 2 project. The regression
loader rejects a fingerprint or per-LED mismatch. Together these files record:

- geometry and UV logical order;
- four output routes and global WLED address ranges;
- panel-local pixel coordinates;
- logical and physical indices;
- readiness blockers and a versioned deterministic ledmap fingerprint. New
  exports use all 32 index bits; an unlabeled historical map keeps the legacy
  low-16-bit reload rule.

The diagnostic ledmap is not an installation file. Do not upload a file below
`wled/diagnostic/` to production hardware.

`npm run generate:mapping:hardware` writes the guarded WLED configuration,
ledmap, route/mapping manifest, and deployment manifest only when the current
project is mapping-ready. Electrical approval remains separate.
