#!/usr/bin/env python3
"""Correct the guarded DMA memory estimate in firmware2609096."""
import hashlib
from pathlib import Path
import sys

HASHES = {
    "FX_fcn.cpp": "327375f403c461823ed4f92ea83ffab0f3713b9f939590f1e4e5bc23cba40521",
    "wled.h": "efe1d51499dccc13b90f7cad8dbe6adff1e755d4b621cfe2fdc480352ddbcc08",
}


def once(text, before, after):
    if text.count(before) != 1:
        raise ValueError(f"Unexpected source anchor: {before}")
    return text.replace(before, after)


def apply(source):
    outputs = {}
    for name, digest in HASHES.items():
        data = (source / "wled00" / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != digest:
            raise ValueError(f"Unexpected source: {name}")
        outputs[name] = data.decode()
    text = outputs["FX_fcn.cpp"]
    text = once(text,
        "    mem += busMemUsage;",
        """    // The guarded group counts each front buffer and object once.
    if (looDmaRequested && looDmaAllowed) busMemUsage += 100;
    mem += busMemUsage;""")
    text = once(text,
        "    if (mem + I2SdmaMem > MAX_LED_MEMORY + 1024)",
        """    // Include the reset tail and reserve 1 KiB for DMA descriptors.
    if (looDmaRequested && looDmaAllowed) I2SdmaMem = loo_dma_required.load() + 1024;
    if (mem + I2SdmaMem > MAX_LED_MEMORY + ((looDmaRequested && looDmaAllowed) ? 0 : 1024))""")
    text = once(text,
        "      use_placeholder = true;\n    }\n    if (BusManager::add",
        "      use_placeholder = true;\n      if (looDmaRequested && looDmaAllowed) loo_dma_failure.store(3);\n    }\n    if (BusManager::add")
    text = once(text,
        "      mem += BusManager::busses.back()->getBusSize();",
        """      // The legacy estimate includes front buffers and DMA again.
      if (!(looDmaRequested && looDmaAllowed)) mem += BusManager::busses.back()->getBusSize();""")
    outputs["FX_fcn.cpp"] = text
    outputs["wled.h"] = once(outputs["wled.h"], "#define VERSION 2609096", "#define VERSION 2609097")
    for name, text in outputs.items():
        (source / "wled00" / name).write_text(text)


if __name__ == "__main__":
    apply(Path(sys.argv[1]))
