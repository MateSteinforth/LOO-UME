# Four-output firmware maintenance

FIRM-019 keeps WLED at `d9b9a846561227351ad929e3109781daadb7bed2`.
It keeps NeoPixelBus at `76afe832f74b0738a3fa1bba0caf389ade9e7693`.
The target remains classic ESP32, with the tool versions in `build-receipt.json`.
This maintenance build is separate from normal application setup and simulator builds.

## Correction

The pinned Core-3 RMT driver requests 192 symbols for each output.
Classic ESP32 hardware has eight 64-symbol blocks. Two requests fit; three do not.
`patch-rmt.mjs` changes this request to 128 symbols. Four outputs then fit exactly.
GPIO selection, pulse timing, DMA mode, queue depth, and current limits do not change.
The smaller buffer needs more frequent encoder service. Physical timing checks remain necessary.

`patch-build-id.mjs` changes the reported build number from `2607201` to `2609051`.
Both scripts reject source bytes that differ from the pinned original headers.
Keep the `ESP32` release name. WLED rejects a different target name during a Wi-Fi update.
Do not disable firmware validation to bypass that check.

## Isolated build layout

Use a new task worktree. Keep all generated inputs and outputs under `build/`.
Prepare these directories with the exact versions from the receipt:

- `build/firmware-source`: the pinned WLED checkout or an archive of that commit.
- `build/firmware-source/.pio/libdeps`: resolved dependencies, including the pinned NeoPixelBus checkout.
- `build/firmware-toolchain/core`: the pinned PlatformIO platform, packages, and Python environment.
- `build/firmware-toolchain/python`: PlatformIO Core 6.1.18 and its Python dependencies.
- `build/firmware-toolchain/uv`: uv 0.12.5.

The verified FIRM-019 build used private copies of the existing pinned maintenance caches.
It did not modify the earlier firmware recovery worktree.
For a fresh toolchain installation, verify the receipt versions before compiling.
Do not use an unpinned dependency update as a replacement for a missing cache.

Copy the override and apply both patches once to clean sources:

```bash
cp firmware/wled-platformio.ini build/firmware-source/platformio_override.ini
node firmware/patch-build-id.mjs build/firmware-source
node firmware/patch-rmt.mjs \
  build/firmware-source/.pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575
```

Run the build from the task worktree:

```bash
PATH="$PWD/build/firmware-toolchain/uv/bin:$PWD/build/firmware-toolchain/python/bin:$PATH" \
PLATFORMIO_CORE_DIR="$PWD/build/firmware-toolchain/core" \
PLATFORMIO_BUILD_CACHE_DIR="$PWD/build/firmware-toolchain/cache" \
PYTHONPATH="$PWD/build/firmware-toolchain/python" \
python3 -m platformio run --project-dir build/firmware-source \
  --environment orbital_esp32dev
```

Create the two installation images:

```bash
mkdir -p build/firmware-rmt4
cp build/firmware-source/.pio/build/orbital_esp32dev/firmware.bin \
  build/firmware-rmt4/wled-orbital-esp32dev.bin
build/firmware-toolchain/core/penv/bin/python -m esptool --chip esp32 merge-bin \
  --output build/firmware-rmt4/wled-orbital-esp32dev-full-flash.bin \
  --flash-mode dio --flash-freq 40m --flash-size 4MB \
  0x1000 build/firmware-source/.pio/build/orbital_esp32dev/bootloader.bin \
  0x8000 build/firmware-source/.pio/build/orbital_esp32dev/partitions.bin \
  0xe000 build/firmware-toolchain/core/packages/framework-arduinoespressif32/tools/partitions/boot_app0.bin \
  0x10000 build/firmware-source/.pio/build/orbital_esp32dev/firmware.bin
node firmware/create-rmt4-receipt.mjs
node scripts/verify-packaged-firmware.mjs firmware/build-receipt.json \
  build/firmware-rmt4/wled-orbital-esp32dev-full-flash.bin
```

The receipt generator checks the patched driver, compiled dependency path, override,
toolchain versions, and image hashes. It records both patch-script hashes.
Run the deployment tests after each receipt change. Keep the pinned image-size check synchronized.

## Physical test

Use the application image for WLED's Wi-Fi updater. Use the complete image only for USB flashing at address zero.
Keep only the intended ESP32 powered. Verify its MAC address before an update.
After restart, check `/json/info`: `vid` must be `2609051`, and `release` must be `ESP32`.
Compare the GPIOs, output lengths, and current limits with the pre-update settings.

1. Apply a solid red frame to the complete configured segment at brightness 16.
2. Observe all four chains through their level shifters.
3. Repeat with green, blue, and off.
4. Run a moving effect on all four chains.
5. Check for flicker, pauses, controller restarts, and RMT errors.
6. Power-cycle the controller and repeat the observation.
7. Restore the previous animation state.

Record operator observations separately from configuration read-back and firmware checks.
This test checks four-output operation. It does not prove all 2,624 physical addresses.
