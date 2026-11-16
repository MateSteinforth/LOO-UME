# Equator Wave firmware

Firmware 2609101 adds a self-registering audio effect to the accepted 2609099 source.
The candidate is built but not installed. Preserve the accepted binary and device settings before an OTA test.
The artifact is `build/firmware-equator-wave/wled-equator-wave-2609101.bin` in the task worktree.
Use this application image with WLED's OTA updater. It is not a complete USB installation image.

Read [the effect and parity contract](../../docs/AUDIO_EFFECTS.md) before a device test.
The generated table uses `sculptures/rhombicosidodecahedron/sculpture.json`.
Do not assume that another loaded project has the same positions or logical order.

## Build

Use an isolated copy of the preserved 2609099 source, Python environment, and pinned PlatformIO toolchain under `build/`.
The preparation script verifies the prior receipt before it changes the build ID and selects the new usermod.
It rejects a source copy that already contains the effect.

```sh
node --import tsx scripts/generate-equator-mapping.ts sculptures/rhombicosidodecahedron/sculpture.json build/equator-mapping
python3 firmware/equator-wave/prepare.py build/firmware-source build/equator-mapping
env PATH="$PWD/build/firmware-python/bin:$PATH" \
  PLATFORMIO_CORE_DIR="$PWD/build/firmware-core" \
  PLATFORMIO_BUILD_CACHE_DIR="$PWD/build/equator-cache" \
  PYTHONPATH="$PWD/build/firmware-python" \
  python3 -m platformio run --project-dir build/firmware-source --environment orbital_esp32dev
```

Repeat the PlatformIO command with `--target compiledb` to record compilation inputs.
Run `python3 firmware/equator-wave/verify.py` to verify the source, linked symbols, and image.
The verifier writes the build receipt and copies the OTA artifact.

## Checks

```sh
c++ -std=c++17 -Wall -Wextra -Werror -fsanitize=address,undefined \
  -Ifirmware/equator-wave -Ibuild/equator-mapping \
  firmware/equator-wave/test-renderer.cpp -o build/test-equator-renderer
ASAN_OPTIONS=detect_leaks=0 build/test-equator-renderer
npx vitest run tests/equator-mapping.test.ts tests/equator-runtime.test.ts tests/equator-standalone.test.ts
c++ -std=c++17 -Wall -Wextra -Werror -Ibuild/firmware-source/wled00 \
  firmware/ddp-expiry/test-expiry.cpp -o build/test-expiry
build/test-expiry
python3 firmware/ddp-dma/test-service.py build/firmware-source
```

The host renderer emits the reference frames in `tests/fixtures/equator-wave-reference.json`.
Regenerate that fixture when the shared renderer intentionally changes.
AddressSanitizer and UndefinedBehaviorSanitizer check the native renderer.
LeakSanitizer is disabled for this allocation-free harness because the restricted host prevents its process inspection.
The browser tests compare all RGB values against the native reference frames.
These checks do not establish physical microphone calibration or flicker-free LED output.
