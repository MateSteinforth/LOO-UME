# Mechanical architecture

The sculpture uses the 30 square faces of a rhombicosidodecahedron for the
original LED panels. Eleven pentagonal openings receive one additional
65 x 66 mm LED panel; the north-pole pentagon remains unpopulated. This produces
41 panels and 2,624 LEDs at 64 LEDs per panel.

The mechanical source is divided into three independently printable parts:

- The triangle filler closes a triangular opening and mounts three adjacent
  outer panels without covering their electrical connector corners.
- The pentagon U-frame mounts four surrounding outer panels and supports three
  sides of the added centre panel while staying inside the pentagon footprint.
- The rounded middle-panel connector supplies the remaining two-hole connection
  between the centre panel and its neighbouring angled outer panel.

OpenSCAD source is canonical. Git records design history, GitHub Actions creates
print artifacts, and physical-test issues record real-world validation.
