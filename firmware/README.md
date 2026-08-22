# ESP32 deployment

FIRM-011 selects an ESP32-DevKitC V4 with an ESP32-WROOM-32E-N4 module. The
firmware is WLED commit `d9b9a846561227351ad929e3109781daadb7bed2`, built as
`orbital_esp32dev` from upstream `esp32dev`. The binary is generated only on
the `generate/wled-firmware` branch. It is not committed to `main`.

`build-receipt.json` records the exact tool versions, build-input hashes,
binary size, and binary SHA-256. The guarded installation package includes
that receipt. Verify that the obtained binary has the same size and SHA-256
before flashing it.

## Flash with the LED power disconnected

Use the generation branch and an explicit serial port. The build does not
store a Wi-Fi name, password, hostname, or device secret.

In a worktree that has `generate/wled-firmware` checked out, run:

```bash
git submodule update --init wled/upstream
sh scripts/build-wled-firmware.sh
sh scripts/flash-wled-firmware.sh /dev/ttyUSB0
```

Replace the port only after you identify the attached ESP32. Do not connect an
LED power rail during the initial flash.

## Smoke-test one fused panel

1. Keep the complete sculpture disconnected. Power off before each wiring
   change.
2. Connect one 64-pixel panel to a current-limited 5 V supply through its own
   fuse. Join controller ground and panel ground. Drive DIN from GPIO 16
   through the selected 3.3 V to 5 V level shifter.
3. Start WLED and set its Wi-Fi details locally. Do not add them to this
   repository.
4. Upload `one-panel-smoke-cfg.json` as `cfg.json` in the WLED file upload
   page. This limits the target to 64 pixels and 1,000 mA.
5. Set a low brightness. Check off, red, green, blue, and a slow moving pixel.
   Record the board label, panel ID, fuse, supply limit, observed colors, and
   result before the full deployment files are installed.

This smoke test does not approve the full sculpture power system and does not
prove all 2,624 addresses. Those results belong to `PWR-010` and `PROOF-010`.

## Install the exact mapping with all LED rails disconnected

From `main`, generate the guarded installation files:

```bash
npm run generate:mapping:hardware
```

Confirm that the deployment manifest, firmware receipt, and actual binary
hashes agree. With all LED power rails disconnected, upload
`wled/ledmap.json` as `ledmap.json`, then upload `wled/cfg.json` as `cfg.json`.
The configuration selects GPIO 16, 17, 18, and 19 with lengths 704, 640, 640,
and 640. The generated package also contains the exact route/mapping manifest,
one-panel smoke configuration, and firmware receipt.

Do not energize the complete 41-panel sculpture until `PWR-010` passes.
