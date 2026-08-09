# LED Rhombicosidodecahedron

Version-controlled OpenSCAD sources for a 42-panel LED sculpture based on a
rhombicosidodecahedron:

- 30 LED panels occupy the square faces.
- 12 additional LED panels sit in the pentagonal openings.
- 20 identical triangle fillers close the triangular openings.

The source geometry was migrated from the project's
[ChatGPT design conversation](https://chatgpt.com/share/6a78d835-25d0-83ed-a959-b31c6b7b4f29).
Git history is the version history; do not create numbered copies such as
`triangle_v2.scad`.

## Canonical printable parts

| Source | Quantity | Purpose |
| --- | ---: | --- |
| `parts/triangle.scad` | 20 | Triangle filler with three PCB-safe mounts |
| `parts/pentagon_u.scad` | 12 | Pentagon U-frame holding an additional LED panel |
| `parts/middle_panel_connector.scad` | 12 | Rounded connector between the centre and outer panels |

Each source defaults to `mode = "print"`. Change the mode locally to inspect
its assembly/preview geometry, but do not commit a mode change unless it is an
intentional project change.

## Latest prototype renders

These previews and STL downloads always point to the current successful build
from `main`.

| Triangle filler | Pentagon U-frame | Middle-panel connector |
| --- | --- | --- |
| [![Triangle filler render](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/download/latest-prototype/triangle.png)](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/download/latest-prototype/triangle.stl) | [![Pentagon U-frame render](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/download/latest-prototype/pentagon_u.png)](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/download/latest-prototype/pentagon_u.stl) | [![Middle-panel connector render](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/download/latest-prototype/middle_panel_connector.png)](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/download/latest-prototype/middle_panel_connector.stl) |
| [Download STL](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/download/latest-prototype/triangle.stl) | [Download STL](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/download/latest-prototype/pentagon_u.stl) | [Download STL](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/download/latest-prototype/middle_panel_connector.stl) |

## Known physical constraints

- PCB: 66 x 65 x 0.8 mm
- Corner-hole centres: 8 mm from the PCB edges
- Middle hole on a 66 mm edge: 25 mm from an outer hole
- Fasteners: M2
- Printed pilot: 1.6 mm
- Screw lead-in: 3.2 mm diameter x 0.7 mm deep
- Square/pentagon inside dihedral: 148.282526 degrees
- Small fold angle: 31.717474 degrees

See [refs/pcb_dimensions.md](refs/pcb_dimensions.md) and [AGENTS.md](AGENTS.md)
before changing geometry.

## Build locally

Install OpenSCAD, then run:

```bash
mkdir -p build
openscad -o build/triangle.stl parts/triangle.scad
openscad -o build/pentagon_u.stl parts/pentagon_u.scad
openscad -o build/middle_panel_connector.stl parts/middle_panel_connector.scad
```

Generated STL and PNG files belong in `build/` and are intentionally ignored.
GitHub Actions renders all three models on every push and pull request and
publishes the generated files as workflow artifacts. Successful builds on
`main` also replace the assets in the single rolling
[Latest Prototype](https://github.com/MateSteinforth/led-rhombicosidodecahedron/releases/tag/latest-prototype)
release. That stable page shows the current PNG previews and STL downloads;
Git history remains the version history.

## Physical iteration workflow

1. Print the current model and record the physical fit result.
2. Discuss one focused correction and change the canonical source file.
3. Wait for the OpenSCAD workflow to succeed.
4. Inspect the previews on the **Latest Prototype** release from a phone.
5. If the edit is correct, download and print the current STL; otherwise,
   correct the source and render again.
6. Repeat without creating numbered source or generated-file copies.
