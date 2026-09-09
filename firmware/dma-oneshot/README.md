# DMA frame completion

Firmware2609098 removes an interrupt deadline from the selected I2S1 parallel output.
The previous descriptor chain can repeat data if its completion interrupt arrives late.
The interrupt then reports idle while DMA can still read that repeated data.
The mono-buffer encoder can overwrite the live buffer.
This source defect can explain corruption, but its relation to the observedPC05 flashes remains unproved.

## Descriptor changes

Two descriptor banks share the same encoded pixel buffer.
Each bank ends at the other bank's silent gate.
A silent gate reads zero bytes and points to itself until the next explicit start.
The completion interrupt records idle without changing descriptor links.
A delayed interrupt therefore cannot cause data to repeat.

Before each start, software closes the destination gate and records the sending state.
A memory barrier orders those writes before software opens the current gate.
A stale gate fetch adds silence instead of repeating data.
The existing reset tail remains intact.
At704 pixels, the descriptor allocation increases from192 to384 bytes.
The encoded buffer remains51408 bytes. The existing1024-byte descriptor reserve covers both banks.
The WLED guard still requires four RGB outputs with no skipped pixels and at most704 pixels per output.

The ESP32 manual defines the completion interrupt mode and the current and next descriptor registers.
See [Espressif ESP32 Technical Reference Manual, chapter22](https://documentation.espressif.com/esp32_technical_reference_manual_en.pdf).
The host test models descriptor traversal. It does not model the electrical output or prove physical flash suppression.

## Build and verification

Preserve `build/firmware-source` and the firmware2609097 artifact.
Copy that source to `build/firmware-oneshot-source` before applying this patch.

```sh
python3 firmware/dma-oneshot/patch.py build/firmware-oneshot-source
```

Build the `orbital_esp32dev` environment with the task's isolated PlatformIO toolchain.
Generate its compilation database with the `compiledb` target.
Then run:

```sh
python3 firmware/dma-oneshot/verify.py
python3 firmware/dma-oneshot/test-write.py build/firmware-source build/firmware-oneshot-source
```

The task board records the current device version and physical observations.
Successful host tests do not complete DDP, standalone audio, or restart acceptance.

## Device status

Firmware2609098 has not been installed.
The operator reported severe moving-pattern corruption and dropped frames with2609097.
Original non-audio firmware2609051 was restored with RMT, unchanged mapping, and brightness128.
The operator reported improvement during recovery. Final read-back reports active DDP and47FPS.
Do not infer that this uninstalled correction meets throughput or physical acceptance requirements.
