# Software architecture

This document records a hardware and firmware proposal. The repository does not
contain production controller firmware, network transport, or audio-reactive
behavior. Implementation can start after the exact controller board and pins
are selected and one panel establishes the three mapping facts listed below.
The active milestone is static simulator-to-device address and RGB parity;
networking, audio, and custom effects remain later work.

## Hardware baseline

- 41 rigid `WS2812B-64` panels: 8 x 8 RGB pixels, 5 V, 64 pixels each.
- 2,624 pixels total: 30 square-face panels and 11 pentagon-centre panels.
- The north-pole pentagonal opening is intentionally unpopulated.
- The proposed controller is one ESP32-class device with WLED, Ethernet, an I2S
  microphone, and four level-shifted data outputs. The exact board and GPIO
  assignments are not yet selected.
- Four data outputs remain planned. Their revised panel counts and lengths
  must be assigned with the physical chain; the obsolete 42-panel split must
  not be reused.
- Two independent 5 V / 40 A power domains each feed two outputs. Grounds are
  common; positive rails remain separate.

The two-domain statement is a proposal, not an approved full-brightness design.
At the conservative 60 mA profile value, 2,624 pixels can require 157.44 A and
the draft 11-panel output alone can require 42.24 A. Two 40 A supplies cannot
support conservative unrestricted full white. `HR-015` and `PWR-010` must define
and verify the actual operating envelope before the complete sculpture is
energized.

The proposed power system would use fused parallel branches. Panel `V+` and
`V-` pass-through pads must not carry the accumulated current of a long chain.
Any future WLED per-output brightness limit would be a secondary safeguard, not
a substitute for correct wiring and fusing.

## Operating modes

In the proposal, WLED would load a saved custom audio-reactive preset at startup.
An incoming DDP or Art-Net stream would take realtime control. WLED would return
to the standalone preset when that stream stops. Controls would expose power,
brightness, preset, and realtime override through WLED's normal web UI and JSON
API. The proposed realtime input would use wired Ethernet.

Future custom effects would belong in a WLED usermod, not in patched WLED core
files. A production build would pin its WLED release.

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
checks for GPIOs, chain order, panel pixel order, and installed orientation all
pass. DIN/DOUT corner assignment is already measured in the panel profile. The
current route generator covers data only and assumes the controller is near the
sculpture top; it does not generate the power branches described above.

Production output also needs a WLED bus contract. For each output, it records
the global start index, length, GPIO, LED type, color order, reversal policy,
level shifter, and power domain. The deployed device must report the same
values, pinned firmware identity, current limit, and ledmap hash. The browser
WASM host cannot supply that proof.

The production policy fixes WLED bus reversal to false. The authored panel route
and ledmap are the only direction authorities. Deployment identity hashes the
exact bytes of each emitted file and a versioned canonical manifest of paths,
sizes, and file hashes.

The panel JSON carries the provisional back-view addressing rule: pixel 0 at
bottom-left, left-to-right first row, then alternating rows upward. It derives
pixel 56 at top-right and pixel 63 at top-left. Keep the status provisional
until a numbered diagnostic test confirms the rule and RGB color order. Panel
placement, orientation, output assignment, and chain position also remain data
rather than effect-code constants.

## Build and CI

A future firmware CI job would validate the 41-panel/2,624-pixel map, build the
usermod against a pinned WLED release with PlatformIO, and upload the flashable
binary plus its build metadata as artifacts. It would not flash hardware.
Firmware binaries and device credentials must not be committed.

A future implementation would belong under `firmware/` and would contain the
pinned WLED build configuration, sculpture usermod, canonical mapping data, map
generator, and mapping tests. The current directory contains instructions only.
See `firmware/AGENTS.md` before changing it.

The first firmware slice is `FIRM-011`: build and deploy only the minimum pinned
WLED target needed for mapping proof. `DIAG-010` supplies deterministic local
test frames, and `PROOF-010` then checks every address and RGB channel. DDP,
Art-Net, Ethernet, microphone, audio, presets, and custom effects remain under
later `FIRM-010` work.
