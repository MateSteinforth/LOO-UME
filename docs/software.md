# Software architecture

This document records the agreed design. Firmware implementation starts after
the exact controller board and pins are selected and one panel establishes the
three mapping facts listed below.

## Hardware baseline

- 41 rigid `WS2812B-64` panels: 8 x 8 RGB pixels, 5 V, 64 pixels each.
- 2,624 pixels total: 30 square-face panels and 11 pentagon-centre panels.
- The north-pole pentagonal opening is intentionally unpopulated.
- One ESP32-class controller running WLED, with Ethernet, an I2S microphone,
  and four level-shifted data outputs. The exact board and GPIO assignments are
  not yet selected.
- Four data outputs remain planned. Their revised panel counts and lengths
  must be assigned with the physical chain; the obsolete 42-panel split must
  not be reused.
- Two independent 5 V / 40 A power domains each feed two outputs. Grounds are
  common; positive rails remain separate.

Power is injected through fused parallel branches. Panel `V+` and `V-`
pass-through pads must not carry the accumulated current of a long chain.
WLED per-output brightness limiting is a secondary safeguard, not a substitute
for correct wiring and fusing.

## Operating modes

At startup WLED loads a saved custom audio-reactive preset. An incoming DDP or
Art-Net stream takes realtime control; when the stream times out, WLED returns
to the standalone preset. Controls must expose power, brightness, preset, and
realtime override through WLED's normal web UI and JSON API. Wired Ethernet is
preferred for realtime input.

Custom effects belong in a WLED usermod, not in patched WLED core files. Pin
the WLED release used for production builds.

## Mapping

The canonical map has one record per LED and joins:

- panel ID and panel-local `(x, y)`;
- world-space `(x, y, z)` and equirectangular `(u, v)`;
- controller output, chain position, and physical wire index.

External renderers sample their image at each LED's UV coordinate and send RGB
values in physical wire order. The browser and generator now share the same
`map[logicalIndex] = physicalIndex` contract. The generated provisional map is
round-trip tested against the renderer for all 2,624 LEDs.

A production `ledmap.json` is deliberately not emitted while any hardware
field is provisional. The guarded exporter unlocks only after the readiness
checks for GPIOs, chain order, DIN/DOUT assignment, panel pixel order, and
installed orientation all pass.

The panel's RGB color order, pixel-zero corner, and row/column serpentine order
remain bench-test facts. Do not encode them as final until a real panel passes
a numbered diagnostic test. Panel placement, orientation, output assignment,
and chain position also remain data rather than effect-code constants.

## Build and CI

CI will validate the 41-panel/2,624-pixel map, build the usermod against a
pinned WLED release with PlatformIO, and upload the flashable binary plus its
build metadata as artifacts. It will not flash hardware. Firmware binaries and
device credentials are never committed.

The implementation belongs under `firmware/` and will contain the pinned WLED
build configuration, sculpture usermod, canonical mapping data, map generator,
and mapping tests. See `firmware/AGENTS.md` before changing it.
