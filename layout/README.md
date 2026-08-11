# Panel mapping contract

The authored source now lives in `sculptures/rhombicosidodecahedron/sculpture.json`
and references the reusable panel hardware profile under `catalog/panels/`.
See `docs/sculpture-format.md` for the source-versus-generated contract.

panel-map.json is deterministically compiled by npm run generate:mapping.
It and wled/ledmap.provisional.json are imported directly by the browser at
runtime. The loader rejects a fingerprint or per-LED mismatch. Together they
form the complete mapping contract:

- geometry and UV logical order;
- four output routes and global WLED address ranges;
- panel-local pixel coordinates;
- logical and physical indices;
- readiness blockers and a deterministic ledmap fingerprint.

The current file is explicitly provisional. It assumes top-left, non-serpentine
row-major order inside each 8 x 8 panel only so the end-to-end mapping can be
tested. Do not upload wled/ledmap.provisional.json to production hardware.

npm run generate:mapping:hardware writes wled/ledmap.json only when the
canonical data is measured and every readiness blocker is cleared. It currently
fails deliberately.
