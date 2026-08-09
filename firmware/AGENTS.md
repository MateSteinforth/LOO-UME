# Firmware instructions

These rules apply under `firmware/`.

## Architecture

- Follow `docs/software.md` as the software and electrical baseline.
- Preserve one WLED controller, four data outputs, 42 panels, and 2,688 pixels
  unless an explicit architecture decision changes them.
- Keep each output inside one power domain. Never join the two positive rails.
- Treat brightness limiting as software protection in addition to physical
  fuses and correctly sized wiring.

## WLED changes

- Do not add a board-specific build until the controller board, Ethernet
  interface, microphone pins, and four LED GPIOs are confirmed.
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
- Validate that all 42 panels contribute exactly 64 unique pixels, all 2,688
  wire indices are unique and contiguous, and output lengths match the approved
  704/640/704/640 split.
- Compile the exact CI target and report the produced firmware artifact; do not
  claim hardware validation without testing a real controller and panel.
