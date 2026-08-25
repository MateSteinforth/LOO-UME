# ESP32 deployment

FIRM-011 selects an ESP32-DevKitC V4 with an ESP32-WROOM-32E-N4 module. The
firmware is WLED commit `d9b9a846561227351ad929e3109781daadb7bed2`, built as
`orbital_esp32dev` from upstream `esp32dev`. The binary is generated only on
the `generate/wled-firmware` branch. It is not committed to `main`.

`build-receipt.json` records the exact tool versions, build-input hashes, and
the size and SHA-256 of the application and complete USB-installer images. The
complete image contains the bootloader, partition table, boot application, and
WLED application at their reviewed ESP32 offsets. Compiled images stay off
`main`.

## Set up from the local editor

Open **Advanced tools**, then select **Set up ESP32** in Chrome or Edge on the
loopback desktop page. The staged complete image must match
`build-receipt.json`; otherwise select the matching full-flash `.bin` file.
The workflow:

1. requests the operator-selected CP2102 serial device;
2. detects a classic ESP32, erases it, flashes the complete image, and verifies
   the written bytes;
3. provisions the entered Wi-Fi credentials over Improv Serial without saving
   or logging them;
4. sets `loo-ume.local`, applies the 64-pixel smoke configuration, and sends
   the current simulator state; and
5. reads the live WLED target, LED count, buses, mDNS name, and ledmap back.

The local production server serves a complete image only from the ignored
`build/firmware/` directory and only when its bytes match the tracked receipt.
The generation branch creates that file as
`build/firmware/wled-orbital-esp32dev-full-flash.bin`.

The same setup path contains receipt and read-back support for the complete
installation configuration. Its UI option stays unavailable until the full
sculpture power gate is complete.

## Command-line fallback

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
4. Apply the partial smoke configuration through the WLED JSON API. Replace
   `<device-ip>` with the current device address:

   ```bash
   curl -fS -H 'Content-Type: application/json' --data-binary \
     @firmware/one-panel-smoke-cfg.json http://<device-ip>/json/cfg
   ```

   This keeps the existing Wi-Fi and mDNS settings while it limits the target
   to 64 pixels and 1,000 mA. Do not restore this partial file as `cfg.json`.
5. Set a low brightness. Check off, red, green, blue, and a slow moving pixel.
   Record the board label, panel ID, fuse, supply limit, observed colors, and
   result before the full deployment files are installed.

This smoke test does not approve the full sculpture power system and does not
prove all 2,624 addresses. Those results belong to `PWR-010` and `PROOF-010`.

After this smoke test passes, generate the deterministic one-pixel diagnostic
plan without contacting the device:

```bash
npm run diagnostics:hardware
```

To send a small reviewed range, give the device URL, start frame, count, and
the explicit safety confirmation. For example:

```bash
npm run diagnostics:hardware -- --host http://wled.local --start 0 --count 3 --confirm-one-pixel-output
```

Each frame uses brightness 32 and lights one pixel in one RGB channel. The
command does not record the observation and does not complete `PROOF-010`.

## Install the exact mapping with all LED rails disconnected

From `main`, generate the guarded installation files:

```bash
npm run generate:mapping:hardware
```

Confirm that the deployment manifest, firmware receipt, and actual binary
hashes agree. With all LED power rails disconnected, install the ledmap through
the WLED mapping page. Apply `wled/cfg.json` through `/json/cfg`, as shown for
the smoke configuration, so network settings are not replaced. The
configuration selects GPIO 16, 17, 18, and 19 with lengths 704, 640, 640, and
640. The generated package also contains the exact route/mapping manifest,
one-panel smoke configuration, and firmware receipt.

Do not energize the complete 41-panel sculpture until `PWR-010` passes.
