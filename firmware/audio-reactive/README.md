# AudioReactive firmware with four outputs

**Rejected diagnostic:** the operator reported substantially worse DDP flicker on
build 2609081. The controller was rolled back to 2609061, with device identity and
LED configuration verified. Do not install or promote this priority-3 build.

FIRM-020 builds a separate classic ESP32 variant with AudioReactive enabled.
It retains WLED commit `d9b9a846561227351ad929e3109781daadb7bed2` and the FIRM-019 RMT patch.
Each LED output requests 128 symbols. Four outputs fit the 512-symbol RMT memory.
FIRM-024 tests RMT interrupt priority 3 with build number `2609081`.
The release name remains `ESP32` for Wi-Fi updates.
Only the interrupt priority and reported build number change from build `2609061`.
The original build remains available in `/tmp/loo-ume-firmware-audioreactive/build/firmware-audioreactive/` for rollback.
This is a diagnostic build, not a confirmed correction for DDP pixel corruption.
The operator reports smooth standalone output and DDP corruption on the chain
containing SQ-24 and PC-08. Temporary full-strip realtime mode helped, but did not
remove the problem. Disabling audio alone did not remove it.

Espressif documents that delayed RMT encoder service can repeat old data:
[ESP-IDF 5.3.4 RMT documentation](https://docs.espressif.com/projects/esp-idf/en/v5.3.4/esp32/api-reference/peripherals/rmt.html).
This build explicitly requests priority 3 to test that hypothesis. It does not
add DDP frame assembly or promise that all network frames are received.
Improv and the existing 1D effects remain available. The variant keeps 2D effects disabled.

This variant does not replace LOO/UME's bundled firmware.
Its application and complete USB images have a separate receipt in this directory.
Build 2609081 compiled and passed receipt checks. Validated OTA installation on
the operator's controller succeeded on 2026-09-08. LED configuration, mapping and
presets matched the pre-update backup. DDP pixel integrity and microphone response
on this diagnostic build still require operator confirmation.

## INMP441 connections

Disconnect power before wiring the microphone.

| INMP441 pin | ESP32 connection |
| ----------- | ---------------- |
| VDD         | 3.3 V            |
| GND         | GND              |
| SD          | GPIO 32          |
| WS          | GPIO 26          |
| SCK         | GPIO 27          |
| L/R         | GND              |

These are proposed defaults for an INMP441. It does not need MCLK.
Keep microphone wires short. Connect the microphone signals directly to the ESP32; they use 3.3 V.
These pins do not overlap LED GPIOs 16, 17, 21, and 22.
Saved AudioReactive settings can override the compiled defaults.

## Installation and physical checks

Use `wled-audioreactive-rmt4-esp32.bin` with WLED's Wi-Fi firmware updater.
Use `wled-audioreactive-rmt4-esp32-full-flash.bin` for USB flashing at address zero.
A complete USB installation needs normal project configuration afterward.
The current LOO/UME receipt check does not accept this separate variant for guarded USB flashing.

After an authorized update, verify build `2609081` in `/json/info`.
Compare LED GPIOs, lengths, mapping, and current settings with the saved project.
Keep the LED buses on the RMT driver. Audio uses I2S0; an I2S LED driver can conflict with audio input.
In AudioReactive settings, select Generic I2S and confirm SD 32, WS 26, SCK 27, and MCLK -1.
After a microphone configuration change, restart the ESP32.
Select a 1D audio effect, such as Gravimeter, and check its response to sound and silence.
Test all four chains with static colors and moving effects while audio input is active.
Check for flicker, pauses, reduced frame rate, and unexpected restarts.
Repeat after a power cycle. Build checks do not establish physical stability.

## Rebuild

Use a separate task worktree and the pinned tool versions in `build-receipt.json`.
Save the archive from `https://codeload.github.com/wled/WLED/tar.gz/d9b9a846561227351ad929e3109781daadb7bed2` as `build/wled-source.tar.gz`.
Its SHA-256 is `42f12c1b286030301dde811079386e99cbe6590989c7b45daa323bb0495fa8d1`.
Extract it into `build/firmware-source` with one leading path component removed.

Install the upstream `requirements.txt` and `uv==0.12.5` into `build/firmware-toolchain/python` with the pinned pip zipapp.
See [the four-output build procedure](../RMT4_REBUILD.md) for the tool layout.
Create `build/firmware-toolchain/core/penv` with uv. Install `uv==0.12.5` into that environment too.
Set the environment before PlatformIO commands:

```bash
export PATH="$PWD/build/firmware-toolchain/python/bin:$PATH"
export PYTHONPATH="$PWD/build/firmware-toolchain/python"
export PLATFORMIO_CORE_DIR="$PWD/build/firmware-toolchain/core"
export PLATFORMIO_BUILD_CACHE_DIR="$PWD/build/firmware-toolchain/cache"
```

For clean sources, run these commands once:

```bash
cp firmware/audio-reactive/platformio.ini build/firmware-source/platformio_override.ini
node firmware/audio-reactive/patch-build-id.mjs build/firmware-source
python3 -m platformio pkg install --project-dir build/firmware-source --environment orbital_esp32dev
node firmware/patch-rmt.mjs build/firmware-source/.pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575
node firmware/audio-reactive/patch-rmt-priority.mjs build/firmware-source/.pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575
python3 -m platformio run --project-dir build/firmware-source --environment orbital_esp32dev --target compiledb
python3 -m platformio run --project-dir build/firmware-source --environment orbital_esp32dev
```

Generate the compilation database before the final build. That target can remove existing build files.
Use a fresh build cache when header dependency files are missing. Cached objects do not necessarily restore those files.
Do not reapply patches to patched files; both patch scripts reject unexpected input.
Create the installation images and receipt:

```bash
mkdir -p build/firmware-audioreactive
cp build/firmware-source/.pio/build/orbital_esp32dev/firmware.bin build/firmware-audioreactive/wled-audioreactive-rmt4-esp32.bin
build/firmware-toolchain/core/penv/bin/python -m esptool --chip esp32 merge-bin \
  --output build/firmware-audioreactive/wled-audioreactive-rmt4-esp32-full-flash.bin \
  --flash-mode dio --flash-freq 40m --flash-size 4MB \
  0x1000 build/firmware-source/.pio/build/orbital_esp32dev/bootloader.bin \
  0x8000 build/firmware-source/.pio/build/orbital_esp32dev/partitions.bin \
  0xe000 build/firmware-toolchain/core/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin \
  0x10000 build/firmware-source/.pio/build/orbital_esp32dev/firmware.bin
node firmware/audio-reactive/create-receipt.mjs
```

The receipt checks headers, tool versions, microphone flags, compiled audio symbols, and application bytes inside the USB image.
Keep binaries outside Git. Preserve the receipt and build log with the delivered images.
