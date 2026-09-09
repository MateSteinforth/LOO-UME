#!/usr/bin/env python3
"""Apply the bounded four-output DMA diagnostic to the pinned audio source."""
import hashlib
from pathlib import Path
import sys


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError(f"Expected one source anchor: {old[:80]}")
    return text.replace(old, new)


def apply(source, npb):
    paths = {
        source / "wled00/bus_wrapper.h": "9ef350581fd91e07bb37dc4a44ebc3c88366ce695fb671ba102d2ebfc1d6cd09",
        source / "wled00/bus_manager.cpp": "8b187c883891df745054876c55a21fd9df01d524073ed3a3baac0b8ea17ce1ef",
        source / "wled00/FX_fcn.cpp": "8c9ae6859b238ce8a789c82a269d1a600543879235ff69d93ae17a21e9cde982",
        source / "wled00/wled.h": "f027a11833bd4f6a687adfa2455dc515f71ffa9f229fb842bb4ff1a28b21603b",
        npb / "src/NeoPixelBus.h": "49d87b433e5b422b5adb6e216bd2f0a77b771d788a5c0d20a4d0089fadd432ca",
    }
    texts = {}
    for path, expected in paths.items():
        data = path.read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError(f"Unexpected pinned source: {path}")
        texts[path] = data.decode()

    path = npb / "src/NeoPixelBus.h"
    texts[path] = replace_once(texts[path], "    void Begin()\n", """    bool BeginChecked()
    {
        if (!_method.Initialize()) return false;
        ClearTo(0);
        return true;
    }

    void Begin()
""")
    path = source / "wled00/bus_wrapper.h"
    texts[path] = replace_once(texts[path], "  static void begin(void* busPtr,", "  static bool begin(void* busPtr,")
    texts[path] = replace_once(texts[path],
        "case I_32_I2_NEO_3: if (_useParallelI2S) (static_cast<B_32_IP_NEO_3*>(busPtr))->Begin(); else (static_cast<B_32_I2_NEO_3*>(busPtr))->Begin(); break;",
        "case I_32_I2_NEO_3: if (_useParallelI2S) return (static_cast<B_32_IP_NEO_3*>(busPtr))->BeginChecked(); else (static_cast<B_32_I2_NEO_3*>(busPtr))->Begin(); break;")
    texts[path] = replace_once(texts[path],
        "    }\n  }\n\n  static void* create(",
        "    }\n    return true;\n  }\n\n  static void* create(")

    path = source / "wled00/bus_manager.cpp"
    texts[path] = replace_once(texts[path],
        "  PolyBus::begin(_busPtr, _iType, _pins, _frequencykHz);",
        "  if (!PolyBus::begin(_busPtr, _iType, _pins, _frequencykHz)) _valid = false;")

    path = source / "wled00/FX_fcn.cpp"
    texts[path] = replace_once(texts[path], '#include "wled.h"', '#include "wled.h"\n#include "loo_dma_status.h"')
    texts[path] = replace_once(texts[path],
        "  unsigned digitalCount = 0;",
        """  unsigned digitalCount = 0;
  bool looDmaRequested = false;
  bool looDmaAllowed = busConfigs.size() == 4;
  unsigned looDmaLongest = 0;
  for (const auto &bus : busConfigs) {
    looDmaRequested |= bus.driverType == 1;
    looDmaAllowed &= bus.driverType == 1 && bus.type == TYPE_WS2812_RGB
      && bus.count > 0 && bus.count <= 704 && bus.skipAmount == 0;
    if (bus.count > looDmaLongest) looDmaLongest = bus.count;
  }
  loo_dma_requested.store(looDmaRequested);
  loo_dma_active_lanes.store(0);
  loo_dma_failure.store(0);
  loo_dma_required.store(looDmaRequested ? (looDmaLongest * 3 + 30) * 24 : 0);
  loo_dma_free_before.store(heap_caps_get_free_size(MALLOC_CAP_DMA));
  loo_dma_largest_before.store(heap_caps_get_largest_free_block(MALLOC_CAP_DMA));
""")
    texts[path] = replace_once(texts[path],
        "    bool use_placeholder = false;",
        """    bool use_placeholder = looDmaRequested && !looDmaAllowed;
    if (use_placeholder) {
      errorFlag = ERR_NORAM;
      loo_dma_failure.store(1);
    }""")
    texts[path] = replace_once(texts[path],
        "  _length = 0;\n  for (size_t i=0; i<BusManager::getNumBusses(); i++) {",
        """  bool looDmaFailed = looDmaRequested && !looDmaAllowed;
  for (size_t i = 0; i < BusManager::getNumBusses(); i++) {
    Bus *bus = BusManager::getBus(i);
    if (!bus) continue;
    bus->begin();
    if (looDmaRequested && (!bus->isOk() || bus->isPlaceholder())) looDmaFailed = true;
  }
  if (looDmaRequested && BusManager::getNumBusses() != 4) looDmaFailed = true;
  if (looDmaFailed) {
    for (size_t i = 0; i < BusManager::getNumBusses(); i++) {
      Bus *bus = BusManager::getBus(i);
      if (bus && bus->isDigital() && !bus->isPlaceholder()) static_cast<BusDigital*>(bus)->cleanup();
    }
    errorFlag = ERR_NORAM;
    if (loo_dma_failure.load() == 0) loo_dma_failure.store(2);
  }
  _length = 0;
  loo_dma_allocated.store(i2sDmaDataBytes(1));
  loo_dma_descriptors.store(i2sDmaDescriptorBytes(1));
  if (looDmaRequested && !looDmaFailed) loo_dma_active_lanes.store(4);
  for (size_t i=0; i<BusManager::getNumBusses(); i++) {
    if (looDmaFailed) break;""")
    texts[path] = replace_once(texts[path],
        "    // This must be done after all buses have been created, as some kinds (parallel I2S) interact\n    bus->begin();\n",
        "    // All buses have completed initialization above.\n")

    path = source / "wled00/wled.h"
    texts[path] = replace_once(texts[path], "#define VERSION 2609085", "#define VERSION 2609095")
    for path, text in texts.items():
        path.write_text(text)
    here = Path(__file__).resolve().parent
    for name in ("loo_dma_status.h", "loo_dma_status.cpp"):
        (source / "wled00" / name).write_bytes((here / name).read_bytes())


if __name__ == "__main__":
    apply(Path(sys.argv[1]), Path(sys.argv[2]))
