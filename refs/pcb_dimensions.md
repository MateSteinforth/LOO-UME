# PCB dimensions and fit notes

The LED panels are rectangular, not perfectly square.

| Measurement | Value |
| --- | ---: |
| Long side | 66.0 mm |
| Short side | 65.0 mm |
| PCB thickness | 0.8 mm |
| Corner-hole centre from each adjacent edge | 8.0 mm |
| Middle-hole offset from an outer hole on the 66 mm side | 25.0 mm |
| PCB hole preview diameter | 2.8 mm |
| Printed M2 pilot diameter | 1.6 mm |
| Screw lead-in diameter | 3.2 mm |
| Screw lead-in depth | 0.7 mm |

## Electrical orientation

Viewed from the back with the three mounting holes vertical:

- DIN is at the bottom-left corner.
- DOUT is at the top-right corner.
- The corner assignment is measured; exact pad centres and electrical keep-out
  envelopes remain to be measured.
- Pixel order is JSON-driven and provisional: pixel 0 is bottom-left beside DIN,
  the first row runs left-to-right, and rows snake upward. This derives pixel 56
  at top-right and pixel 63 at top-left; DOUT remains at top-right.

## Provisional power design

These values are photo-derived or conservative design assumptions, not bench
measurements:

- V+ and V- are available at both the DIN and DOUT ends, allowing independent
  feed-through or injection.
- Use 3.84 A at 5 V per 64-pixel panel as the conservative maximum
  (64 × 60 mA). Actual panel current may be lower.
- Use at least 0.75 mm² / approximately AWG 18 for short single-panel 5 V and
  ground leads; shared feeds require separate sizing.
- Limit voltage drop to 5%, keeping at least 4.75 V at the panel under load.
- Plan one fuse per small panel group, sized to protect the external wire. The
  panel count per fuse remains undefined until the power topology is designed.
- Current generated wiring covers data only and assumes the controller is near
  the sculpture top.

## Physically tested corrections

- Move printed pilot centres 0.20 mm farther from the filler edge.
- Move the panel seating surface by 0.50 mm for better outside-face alignment.
- Triangle mounting tabs use the handedness opposite the electrical connector
  corners.
- The triangle face is 2.0 mm thick for rigidity.

Record future measurements with the printer, material, layer height, source
commit, photographs, and an explicit pass/fail result.
