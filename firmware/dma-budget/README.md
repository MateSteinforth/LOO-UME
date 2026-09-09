# DMA memory accounting correction

Firmware2609097 corrects the memory estimate for the supported four-output DMA group.
Firmware2609096 counts front buffers and DMA again through `getBusSize()`.
The fourth output becomes a placeholder before initialization completes.
The group then releases all DMA outputs and reports failure2.

The correction counts segment storage, global pixels, front buffers, and bus objects once.
It adds100 bytes for each NeoPixelBus object, as the existing estimate does.
It counts the common encoded DMA buffer once, including its reset tail.
It reserves1024 bytes for descriptors.
The existing memory limit and allocation checks remain active.
Failure3 now identifies memory-estimate rejection.
Other output configurations retain the existing estimate.

The source, audio processing, and DDP receiver otherwise match firmware2609096.
Physical acceptance requires active DMA, smooth DDP, standalone audio effects, and restart checks.
A successful build does not establish physical acceptance.

## Attended device result

The controller accepted firmware2609097 and started all four DMA lanes.
Read-back reports51408 allocated DMA bytes,192 descriptor bytes, and failure0.
DDP is active. The LED map and brightness128 match the backup.
Physical flash observation, standalone audio, and restart persistence remain pending.

Apply the patch to an independent copy of the preserved2609096 source:

```sh
python3 firmware/dma-budget/patch.py build/firmware-source
```

Build with the isolated PlatformIO environment described in `firmware/ddp-dma/README.md`.
Verify the image against the preserved source:

```sh
python3 firmware/dma-budget/verify.py /tmp/loo-ume-ddp-dma-frames/build/firmware-source
python3 firmware/dma-budget/test-budget.py /tmp/loo-ume-ddp-dma-frames/build/firmware-source
python3 firmware/ddp-dma/test-service.py build/firmware-source
```

Private controller backups and observation records remain under `build/attended/`.
Do not commit exported controller settings.
