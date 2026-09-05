# ESP32 setup and maintenance

FIRM-011 selects an ESP32-DevKitC V4 with an ESP32-WROOM-32E-N4 module. The
firmware uses WLED commit `d9b9a846561227351ad929e3109781daadb7bed2`. The
reviewed target is `orbital_esp32dev`, based on upstream `esp32dev`. The binary
is not committed to `main`.

`build-receipt.json` records the exact tool versions, build-input hashes, and
the size and SHA-256 of the application and complete USB-installer images. The
complete image contains the bootloader, partition table, boot application, and
WLED application at their reviewed ESP32 offsets. Compiled images stay off
`main`. The Electron release stages the receipt-bound complete image from the
`esp32-firmware-improv-rmt4-v1` release before packaging.

Build `2609051` uses 128 RMT symbols per output. Four outputs use all 512
symbols on the classic ESP32. The earlier 192-symbol allocation permitted only
two outputs. The ESP32 target label remains unchanged for Wi-Fi update validation.
See [RMT4_REBUILD.md](RMT4_REBUILD.md) for the exact patch and test procedure.

## Set up from the local editor

Open **Fabrication**, then select **Set up ESP32**. The staged complete image
must match
`build-receipt.json`; otherwise select the matching full-flash `.bin` file.
The workflow:

1. requests the operator-selected CP2102 serial device;
2. detects a classic ESP32, erases it, flashes the complete image, and verifies
   the written bytes;
3. provisions the entered Wi-Fi credentials over Improv Serial without saving
   or logging them;
4. derives one configuration from the loaded one-to-41-panel simulator,
   including its LED count, up to four outputs, GPIOs, ledmap, and WLED current
   values;
5. sets `loo-ume.local`, saves the selected animation as standalone preset 1,
   and selects it for boot;
6. restarts WLED and reads the target, LED count, buses, mDNS name, preset,
   boot state, and current state back; and
7. sends the exact mapped preview through finite-time DDP while the editor is
   open.

The configured behavior is that WLED leaves realtime mode 2.5 seconds after
preview traffic stops and resumes the saved native animation. Changes to
effect, palette, speed, or intensity update the same standalone boot preset.
The operator physically confirmed timeout/resume, reconnect, effect updates,
tab-close fallback, and power-cycle restoration on the three-panel sculpture.

The local production server serves a complete image only from the ignored
`build/firmware/` directory. The bytes must match the tracked receipt. The
Electron package includes the verified release image at this location. The
expected file is
`build/firmware/wled-orbital-esp32dev-full-flash.bin`.

The setup has no configuration dropdown. It copies the loaded sculpture up to
the complete 41-panel, four-output authority.

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

This smoke test does not prove all 2,624 addresses. No complete observation is
planned. Electrical approval is outside repository scope.

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
command does not record physical observation evidence.

## Install the exact mapping with all LED rails disconnected

On 2026-09-05, the operator confirmed LED output on GPIOs 16, 17, 21, and 22 with build `2609051`.
This result confirms four outputs on the tested ESP32. Complete sculpture address parity and extended stability remain untested.

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

Electrical design and protection are external operator responsibilities.
