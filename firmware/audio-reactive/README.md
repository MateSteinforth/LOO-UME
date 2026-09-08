# AudioReactive firmware with four outputs

**Rejected diagnostic:** build 2609082 produced severe physical flicker despite
confirmed stopped I2S capture during DDP. The controller was rolled back to
2609051, with identity, LED configuration and mapping verified. Do not install
or promote this build as a fix. Source and tests are retained as negative evidence.

FIRM-020 builds a separate classic ESP32 variant with AudioReactive enabled.
It retains WLED commit `d9b9a846561227351ad929e3109781daadb7bed2` and the FIRM-019 RMT patch.
Each LED output requests 128 symbols. Four outputs fit the 512-symbol RMT memory.
The FIRM-026 build number is `2609082`. The release name remains `ESP32` for Wi-Fi updates.
It keeps the original RMT priority; the rejected priority-3 experiment is not included.
Improv and the existing 1D effects remain available. The variant keeps 2D effects disabled.

This variant does not replace LOO/UME's bundled firmware.
Its application and complete USB images have a separate receipt in this directory.
Build and receipt checks passed; validated OTA installed 2609082 on 2026-09-08.
Device read-back confirmed stopped capture in DDP, running capture and processing
in a temporary native Gravimeter check, then stopped capture on DDP resume.
LED/realtime configuration, mapping and presets were preserved. DDP pixel integrity
and physical microphone response still require operator confirmation on this build.

## DDP microphone suspension

The original AudioReactive disable path suspended FFT but left I2S capture running.
The operator confirmed that GPIO 16 flicker disappeared on non-audio build 2609051.
This build stops the legacy I2S receiver during DDP, including main-segment mode,
and skips local audio processing. Native audio resumes after DDP ends if audio
remains enabled. Manual disable and OTA also stop capture. DMA buffers and pin
reservations remain allocated so switching does not require flash writes or reboot.
The read timeout is bounded at 50 ms so a stopped capture cannot block indefinitely.
The status field `u["I2S capture"]` reports `running`, `stopped for DDP`, `stopped`
or `unavailable`. DDP takes priority over local audio even with audio sync enabled.

This is verified for the selected Generic I2S/INMP441 target only. Analog microphone
and other controller variants are outside this test. The pinned legacy driver
stops RX DMA and disables its interrupt in `i2s_stop()`:
[ESP-IDF 5.3.4 source](https://github.com/espressif/esp-idf/blob/v5.3.4/components/driver/deprecated/i2s_legacy.c).

Rollback image: `/home/mate/Documents/led-rhombicosidodecahedron/build/firmware-rmt4-2609051/wled-orbital-esp32dev.bin`.
Use the application image with validated OTA; do not use the full-flash USB image for OTA.

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

After an authorized update, verify build `2609082` in `/json/info`.
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
node firmware/audio-reactive/patch-ddp-capture.mjs build/firmware-source
node firmware/audio-reactive/test-ddp-capture.mjs
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
