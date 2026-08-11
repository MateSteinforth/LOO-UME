# Automatic rhombicosidodecahedron acceptance sculpture

`sculptures/rhombicosidodecahedron-auto/sculpture.json` is a separate test of
the generic panel-assembly pipeline. It does not replace or modify the existing
manual 41-panel rhombicosidodecahedron and its physically tested U-frame parts.

The JSON is the complete pipeline handoff. It explicitly contains 60 vertices,
62 faces, 30 square-face panel assignments, installed quarter-turns, 32 closure
assignments, mapping policy, four provisional data outputs, and GPIO fields.
No named rhombicosidodecahedron recipe is selected in TypeScript at runtime.

The automatic sculpture deliberately mounts panels only on the 30 square
faces. The same generic closure generator used by the cuboctahedron creates:

- 20 triangular three-tab covers;
- 12 pentagonal five-tab covers;
- 120 tabs centered on the 120 selected usable PCB holes;
- a 1,920-pixel viewer mapping, provisional data routes, and WLED ledmap.

The panel profile excludes the DIN-overlapped bottom-left hole and the
DOUT-overlapped top-right hole. Each square panel uses its remaining four holes
exactly once: the two triangular caps use top-left and bottom-right, matching
the proven diagonal-outward pattern, while the two pentagonal caps use
middle-left and middle-right. These preferences live in this sculpture JSON.

The pentagonal parts are solid five-tab covers, not the U-shaped parts used by
the manual sculpture. This keeps the acceptance fixture within the current
automatic generator's real capabilities.

Generate all JSON, CAD source, wiring, and mapping artifacts with:

```bash
npm run generate:rhombicosidodecahedron:auto
```

With OpenSCAD installed, render all 32 STLs and the assembly previews with:

```bash
npm run verify:rhombicosidodecahedron:auto
```

The generated contract is written under
`build/generated/automatic-rhombicosidodecahedron-30-panel-test/`. Rendered
verification artifacts are written under
`build/verify-panel-assembly/automatic-rhombicosidodecahedron-30-panel-test/`,
and exact STL meshes are staged under `web/public/generated-cad/` for the live
viewer.
