# Firmware instructions

These rules apply under `firmware/`.

## Architecture

- Follow `docs/software.md` as the software and electrical baseline.
- Preserve one WLED controller, four data outputs, 41 panels, and 2,624 pixels
  unless an explicit architecture decision changes them.
- Keep each output inside one power domain. Never join the two positive rails.
- Treat brightness limiting as software protection in addition to physical
  fuses and correctly sized wiring.

## WLED changes

- The minimum target is ESP32-DevKitC V4 with ESP32-WROOM-32E-N4 and LED GPIOs
  16, 17, 18, and 19. Keep Ethernet, microphone, and audio features disabled
  until their hardware and pins are selected explicitly.
- Implement sculpture effects as a self-registering WLED usermod; do not patch
  WLED core for an effect.
- Pin the upstream WLED release or commit and make upgrades explicit.
- Keep effect code non-blocking and avoid `delay()` in runtime hooks.
- Never commit Wi-Fi credentials, device secrets, or exported live-device
  configuration containing them.
- Treat compiled binaries as CI artifacts, not source files.

## Mapping and verification

- Keep geometry, panel orientation, and wiring order in canonical mapping data;
  generate derived WLED and renderer files from it.
- Never guess the panel color order, pixel-zero corner, or serpentine direction.
  Record them only after a numbered physical-panel test.
- Validate that all 41 panels contribute exactly 64 unique pixels and all
  2,624 wire indices are unique and contiguous. Validate output lengths against
  the approved physical chain once assigned; do not reuse the obsolete
  42-panel split.
- Compile the exact CI target and report the produced firmware artifact; do not
  claim hardware validation without testing a real controller and panel.
