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

The sculpture JSON is the authored assembly contract. For triangle faces it
describes the opening population, the closure template, handedness, flat print
surface, and all three adjacent square-panel interfaces. The generated SCAD
entrypoint includes the physically tested triangle source and asserts that its
fit constants still agree with the central panel profile and opening policy.

The files under `parts/` remain the canonical, physically tested geometry
templates while this migration proceeds. Git records design history, GitHub
Actions creates print artifacts and checks generated/canonical CSG parity, and
physical-test issues record real-world validation. New closure generators can
replace templates incrementally only after print and assembly verification.
