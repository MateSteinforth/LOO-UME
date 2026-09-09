# Guarded DMA output candidate

FIRM-036 prepares a candidate for four-output DMA testing on classic ESP32.
It does not establish smooth DDP or flicker-free physical output.
The operator reports quiet periods of 7–10 seconds before flashing returns.
Keep the live controller unchanged until attended testing resumes.

## Candidate boundary

The candidate starts from audio firmware 2609085 and uses build ID 2609095.
It retains the original DDP receiver, microphone code, audio settings, and RMT callback.
It does not change the default output driver.
The RMT comparison path retains its original encoded reset interval.
The existing parallel DMA path uses I2S1 and its selected WS2812 reset interval.
The microphone uses I2S0.

This diagnostic accepts DMA only for four WS2812 RGB outputs.
Each output must contain 1–704 pixels and have no skipped pixels.
All four outputs must select `drv:1` together.
Unsupported DMA configurations produce an explicit failure and no active output group.
The original `drv:0` configuration remains available for recovery.

Initialization checks the front buffer, DMA buffer, descriptors, and interrupt allocation.
If one lane fails, WLED releases the complete output group.
The patch preserves requested configuration for diagnosis and later correction.
Configuration read-back alone does not prove successful DMA initialization.

`/json/info` contains `loo_dma`:

- `requested` identifies a requested DMA configuration.
- `failure` is zero on success, one for unsupported configuration, or two for initialization failure.
- `active_lanes` must be four before a DMA test.
- `required_buffer_bytes` reports the calculated encoded buffer size.
- `allocated_buffer_bytes` and `descriptor_bytes` report actual driver allocations.
- `free_before` and `largest_before` describe DMA-capable memory before bus initialization.
- `free_now` and `largest_now` describe DMA-capable memory at the information request.

These values describe software state. They do not measure physical LED output.
Read them before and after a test. Do not poll during visual observation.

## Memory budget

| Allocation | Bytes | Status |
| --- | ---: | --- |
| Encoded DMA buffer for the 704-pixel lane | 51,408 | Required contiguous DMA block |
| Four RGB front buffers, 2,624 pixels | 7,872 | Separate allocations |
| DMA descriptors | Reported at runtime | Separate DMA allocation |
| Three prospective DDP frame buffers | 23,616 | Not allocated by this candidate |
| WLED framebuffers, network, audio, and task stacks | Additional | Runtime headroom remains unverified |

The three known buffer categories total 82,896 bytes before descriptors and other runtime allocations.
Total free heap does not prove that a 51,408-byte contiguous DMA block is available.
Audio and later DDP buffering need separate runtime capacity checks.

## Isolated build

Use the exact WLED and NeoPixelBus commits from the audio baseline receipt.
Preserve the baseline source and both recovery images.
Copy the baseline source into `build/firmware-source` in this task worktree.
Copy the pinned toolchain into `build/firmware-core` and its Python packages into `build/firmware-python`.
Use private copies, not writable links to another task's toolchain.
Use `firmware/audio-reactive/platformio.ini` as `platformio_override.ini`.

Apply the guarded patches to the copied audio 2609085 source:

```bash
python3 firmware/dma-output/patch.py \
  build/firmware-source/.pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575
python3 firmware/dma-output/patch-wled.py build/firmware-source \
  build/firmware-source/.pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575
```

Generate `compiledb` before the final build. Use a fresh build cache.

```bash
env PATH="$PWD/build/firmware-python/bin:$PATH" \
  PLATFORMIO_CORE_DIR="$PWD/build/firmware-core" \
  PLATFORMIO_BUILD_CACHE_DIR="$PWD/build/dma-cache" \
  PYTHONPATH="$PWD/build/firmware-python" \
  python3 -m platformio run --project-dir build/firmware-source \
  --environment orbital_esp32dev --target compiledb
```

Repeat that command without `--target compiledb` to compile the candidate.
Run the verifier with the preserved audio source as its argument:

```bash
python3 firmware/dma-output/verify.py \
  /tmp/loo-ume-audio-rmt-iram/build/firmware-source
```

The verifier compares patched bytes, unchanged receiver/audio code, compiler flags, tool versions, and compiled symbols.
It writes an OTA application image under `build/firmware-dma-output/` and a checked receipt beside this document.
It does not install the image.

## Host verification

Run the method and descriptor tests against the preserved, unpatched NeoPixelBus directory.
Run the WLED test against the preserved audio source directory.

```bash
python3 firmware/dma-output/test-driver.py \
  /tmp/loo-ume-audio-rmt-iram/build/firmware-source/.pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575
python3 firmware/dma-output/test-descriptors.py \
  /tmp/loo-ume-audio-rmt-iram/build/firmware-source/.pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575
python3 firmware/dma-output/test-wled.py \
  /tmp/loo-ume-audio-rmt-iram/build/firmware-source
```

The tests execute patched source with host allocator, register, and scheduler substitutes.
They check 140 method failures, 20 descriptor/interrupt retry cycles, exact three-step encoding, reset bytes, and transfer ownership.
The WLED test checks complete-group failure propagation and the RMT path.
AddressSanitizer and UndefinedBehaviorSanitizer check the method and descriptor tests.
Allocation accounting checks leaks because LeakSanitizer cannot run under this host's process tracing.
These tests do not emulate ESP32 electrical behavior or prove network recovery on a device.

## Deferred physical checks

First complete FIRM-035's saved configuration restoration with the operator present.
Then follow FIRM-038 and FIRM-039 in `TASKS.md`.
Keep the same brightness, source, addressing, and frame rate for the RMT/DMA comparison.
Leave audio capture uninitialized for that first output comparison.
Restore the saved microphone settings before FIRM-041.

Observe each comparison after 90 seconds of settling.
State the start and end of each 60-second count.
Repeat at five minutes if behavior changes with time.
Record quiet periods and recurring flashes separately.
Moving DDP, standalone audio, transitions, and sustained playback remain separate acceptance checks.
