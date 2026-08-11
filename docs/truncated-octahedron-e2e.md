# Truncated-octahedron acceptance sculpture

`sculptures/truncated-octahedron/sculpture.json` is the third independent test
of the generic panel-assembly pipeline. The JSON is the complete handoff: 24
vertices, 14 faces, six square-face panel assignments, eight hexagonal closure
assignments, installed quarter-turns, mapping policy, wiring, and GPIO fields.

Every geometric edge is 66 mm. The six square faces carry the 66 x 65 mm LED
panels. Each automatically generated hexagonal closure uses three rounded tabs
centered on mechanically eligible PCB holes. Across each panel, its four
usable holes attach to four different hexagonal caps; the DIN and DOUT corner
holes remain unused. A truncated octahedron also has 12 edges
where two hexagons meet. Those are generated as clean butt seams without direct
fasteners; the CAD manifest and generated mapping both report this limitation.

## Run this sculpture

Install the Node dependencies once:

```bash
npm ci
```

Generate the compiled assembly, mapping, wiring, provisional WLED ledmap, and
OpenSCAD sources:

```bash
npm run generate:truncated-octahedron
```

The generated contract appears under
`build/generated/truncated-octahedron-six-panel-test/`.

With OpenSCAD, Xvfb, and Xauth installed, render all eight printable STLs, a
closure detail, and the complete assembly preview:

```bash
npm run verify:truncated-octahedron
```

Rendered verification artifacts appear under
`build/verify-panel-assembly/truncated-octahedron-six-panel-test/`. Exact STLs
are also staged under `web/public/generated-cad/` for the visualizer.

Run the complete project pipeline and regression suite with:

```bash
npm test
```

Start the local visualizer with:

```bash
npm run dev:web -- --host 0.0.0.0 --port 5174
```

Then open:

```text
http://localhost:5174/?sculptureJson=./sculptures/truncated-octahedron/sculpture.json
```
