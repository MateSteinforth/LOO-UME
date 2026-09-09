#!/usr/bin/env python3
"""Apply guarded I2S DMA allocation recovery to an isolated NeoPixelBus tree."""
from hashlib import sha256
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
DEFAULT = ROOT / "build/firmware-source/.pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575"
FILES = {
 "method": ("src/internal/methods/ESP/ESP32/Core_2_x/NeoEsp32I2sXMethod.h", "f6a609b5a611d97c65c17cd811de6441917c8bf4dc61f9cf9fbdfdc383b5a39a"),
 "driver": ("src/internal/methods/ESP/ESP32/Core_2_x/Esp32_i2s.c", "e1198bafdda408f85a4f723e740f225e3ab7306fccb56ec031a616ae57118a46"),
 "api": ("src/internal/methods/ESP/ESP32/Core_2_x/Esp32_i2s.h", "81f617d581588a3a32bd8184238dbef4940ad9e406eb01eb7a5895c36adff852"),
}
NL = "\n"
def once(s, old, new):
 if s.count(old) != 1: raise RuntimeError(f"Expected one source match: {old[:70]!r}")
 return s.replace(old, new)
def rx(s, old, new):
 s, n = re.subn(old, new, s, count=1, flags=re.S)
 if n != 1: raise RuntimeError(f"Expected one source pattern: {old[:70]!r}")
 return s
def method(s):
 s = s.replace("void Construct(const uint8_t busNumber, uint16_t nsBitSendTime)", "bool Construct(const uint8_t busNumber, uint16_t nsBitSendTime)")
 if s.count("bool Construct(const uint8_t busNumber, uint16_t nsBitSendTime)") != 2: raise RuntimeError("Expected two contexts")
 old = r'I2sBuffer = static_cast<uint8_t\*>\(heap_caps_malloc\(I2sBufferSize, MALLOC_CAP_DMA\)\);\s*if \(I2sBuffer == nullptr\)\s*\{\s*log_e\("send buffer memory allocation failure \(size %u\)",\s*I2sBufferSize\);\s*\}\s*memset\(I2sBuffer, 0x00, I2sBufferSize\);'
 new = 'I2sBuffer = static_cast<uint8_t*>(heap_caps_malloc(I2sBufferSize, MALLOC_CAP_DMA));' + NL + '            if (I2sBuffer == nullptr) { log_e("send buffer memory allocation failure (size %u)", I2sBufferSize); I2sBufferSize = 0; return false; }' + NL + '            memset(I2sBuffer, 0x00, I2sBufferSize);'
 s = rx(s, old, new); s = rx(s, old, new)
 s = s.replace("            i2sInit(", "            if (!i2sInit(", 1)
 s = rx(s, r'                I2sBuffer,\s*I2sBufferSize\);\s*\}\s*\}\s*\n\s*void Destruct\(const uint8_t busNumber\)', '                I2sBuffer,' + NL + '                I2sBufferSize)) { heap_caps_free(I2sBuffer); I2sBuffer = nullptr; I2sBufferSize = 0; return false; }' + NL + '        }' + NL + '        return true;' + NL + '    }' + NL + NL + '    void Destruct(const uint8_t busNumber)')
 s = rx(s, r'if \(I2sEditBuffer == nullptr\)\s*\{\s*log_e\("edit buffer memory allocation failure \(size %u\)",\s*I2sBufferSize\);\s*\}\s*memset\(I2sEditBuffer, 0x00, I2sBufferSize\);\s*\n\s*i2sInit\(', 'if (I2sEditBuffer == nullptr) { log_e("edit buffer memory allocation failure (size %u)", I2sBufferSize); heap_caps_free(I2sBuffer); I2sBuffer = nullptr; I2sBufferSize = 0; return false; }' + NL + '            memset(I2sEditBuffer, 0x00, I2sBufferSize);' + NL + NL + '            if (!i2sInit(')
 s = rx(s, r'                I2sBuffer,\s*I2sBufferSize\);\s*\}\s*\}\s*\n\s*void Destruct\(const uint8_t busNumber\)', '                I2sBuffer,' + NL + '                I2sBufferSize)) { free(I2sEditBuffer); heap_caps_free(I2sBuffer); I2sEditBuffer = nullptr; I2sBuffer = nullptr; I2sBufferSize = 0; return false; }' + NL + '        }' + NL + '        return true;' + NL + '    }' + NL + NL + '    void Destruct(const uint8_t busNumber)')
 s = s.replace("        if (I2sBuffer == nullptr)\n        {\n            return;\n        }", "        if (I2sBuffer == nullptr)\n        {\n            MuxMap.Reset();\n            return;\n        }")
 s = once(s, "    void DeregisterMuxBus(uint8_t pin)\n    {", "    void DeregisterMuxBus(uint8_t pin)\n    {\n        if (_muxId == s_context.MuxMap.InvalidMuxId) return;")
 s = once(s, "    void Initialize(uint8_t pin, uint16_t nsBitSendTime, bool invert)", "    bool Initialize(uint8_t pin, uint16_t nsBitSendTime, bool invert)")
 s = once(s, "        s_context.Construct(T_BUS::I2sBusNumber, nsBitSendTime);\n        i2sSetPins(T_BUS::I2sBusNumber, pin, _muxId, s_context.MuxMap.MuxBusDataSize, invert);", "        if (_muxId == s_context.MuxMap.InvalidMuxId || !s_context.Construct(T_BUS::I2sBusNumber, nsBitSendTime)) return false;\n        i2sSetPins(T_BUS::I2sBusNumber, pin, _muxId, s_context.MuxMap.MuxBusDataSize, invert);\n        return true;")
 s = once(s, "    void Initialize()\n    {\n        _bus.Initialize(_pin, T_SPEED::BitSendTimeNs, T_INVERT::Inverted);\n\n        _data = static_cast<uint8_t*>(malloc(_sizeData));\n        if (_data == nullptr)\n        {\n            log_e(\"front buffer memory allocation failure\");\n        }\n        // data cleared later in Begin()\n    }\n", "    bool Initialize()\n    {\n        _data = static_cast<uint8_t*>(malloc(_sizeData));\n        if (_data == nullptr) { log_e(\"front buffer memory allocation failure\"); _bus.DeregisterMuxBus(_pin); return false; }\n        if (!_bus.Initialize(_pin, T_SPEED::BitSendTimeNs, T_INVERT::Inverted)) { free(_data); _data = nullptr; _bus.DeregisterMuxBus(_pin); return false; }\n        return true;\n    }\n")
 s = once(s, "        return _bus.IsWriteDone();", "        return _data == nullptr || _bus.IsWriteDone();")
 s = once(s, "        _bus()\n    {", "        _bus(),\n        _data(nullptr)\n    {")
 return once(s, "    void Update(bool)\n    {\n        _bus.FillBuffers", "    void Update(bool)\n    {\n        if (_data == nullptr) return;\n        _bus.FillBuffers")
def driver(s):
 s = once(s, "    size_t dma_count;\n\n    volatile uint32_t is_sending_data;", "    size_t dma_count;\n    size_t data_size;\n\n    volatile uint32_t is_sending_data;")
 if s.count("NULL, NULL, I2S_DMA_BLOCK_COUNT_DEFAULT, I2s_Is_Idle") != 3: raise RuntimeError("Unexpected I2S initializer count")
 s = s.replace("NULL, NULL, I2S_DMA_BLOCK_COUNT_DEFAULT, I2s_Is_Idle", "NULL, NULL, I2S_DMA_BLOCK_COUNT_DEFAULT, 0, I2s_Is_Idle")
 s = once(s, "    size_t dmaCount = I2S[bus_num].dma_count;\n", "    size_t dmaCount = I2S[bus_num].dma_count;\n    if (dataSize < silenceSize * (I2S_DMA_SILENCE_BLOCK_COUNT_FRONT + I2S_DMA_SILENCE_BLOCK_COUNT_BACK)) return false;\n")
 s = once(s, "void i2sInit(uint8_t bus_num, ", "bool i2sInit(uint8_t bus_num, ")
 s = once(s, "    if (bus_num >= NEO_I2S_COUNT) \n    {\n        return;\n    }\n\n    I2S[bus_num].dma_count = dma_count + ", "    if (bus_num >= NEO_I2S_COUNT || data == NULL || dataSize == 0)\n    {\n        return false;\n    }\n\n    I2S[bus_num].data_size = dataSize;\n    I2S[bus_num].dma_count = dma_count + ")
 s = once(s, "    if (!i2sInitDmaItems(bus_num, data, dataSize, parallel_mode, bytesPerSample))\n    {\n        return;\n    }\n", "    if (!i2sInitDmaItems(bus_num, data, dataSize, parallel_mode, bytesPerSample))\n    {\n        I2S[bus_num].dma_count = I2S_DMA_BLOCK_COUNT_DEFAULT; I2S[bus_num].data_size = 0;\n        return false;\n    }\n")
 s = once(s, "    esp_intr_disable(I2S[bus_num].isr_handle);", "    if (I2S[bus_num].isr_handle != NULL) esp_intr_disable(I2S[bus_num].isr_handle);")
 s = once(s, "    esp_intr_alloc(i2sIntSource, ESP_INTR_FLAG_IRAM | ESP_INTR_FLAG_LEVEL1, &i2sDmaISR, &I2S[bus_num], &I2S[bus_num].isr_handle);\n    //  enable send intr\n", "    if (esp_intr_alloc(i2sIntSource, ESP_INTR_FLAG_IRAM | ESP_INTR_FLAG_LEVEL1, &i2sDmaISR, &I2S[bus_num], &I2S[bus_num].isr_handle) != ESP_OK) { I2S[bus_num].isr_handle = NULL; i2sDeinitDmaItems(bus_num); I2S[bus_num].dma_count = I2S_DMA_BLOCK_COUNT_DEFAULT; I2S[bus_num].data_size = 0; return false; }\n    //  enable send intr\n")
 s = once(s, "    esp_intr_enable(I2S[bus_num].isr_handle);\n}\n\nvoid i2sDeinit(uint8_t bus_num) \n{\n    i2sDeinitDmaItems(bus_num);\n}\n", "    esp_intr_enable(I2S[bus_num].isr_handle);\n    return true;\n}\n\nvoid i2sDeinit(uint8_t bus_num)\n{\n    if (bus_num >= NEO_I2S_COUNT) return;\n    if (I2S[bus_num].isr_handle != NULL) { esp_intr_disable(I2S[bus_num].isr_handle); esp_intr_free(I2S[bus_num].isr_handle); I2S[bus_num].isr_handle = NULL; }\n    I2S[bus_num].bus->int_ena.val = 0; I2S[bus_num].bus->out_link.stop = 1; I2S[bus_num].bus->conf.tx_start = 0;\n    i2sDeinitDmaItems(bus_num); I2S[bus_num].dma_count = I2S_DMA_BLOCK_COUNT_DEFAULT; I2S[bus_num].data_size = 0; I2S[bus_num].is_sending_data = I2s_Is_Idle;\n}\n\nsize_t i2sDmaDataBytes(uint8_t bus_num) { return bus_num < NEO_I2S_COUNT ? I2S[bus_num].data_size : 0; }\nsize_t i2sDmaDescriptorBytes(uint8_t bus_num) { return bus_num < NEO_I2S_COUNT ? I2S[bus_num].dma_count * sizeof(lldesc_t) : 0; }\nsize_t i2sLargestDmaBlock(void) { return heap_caps_get_largest_free_block(MALLOC_CAP_DMA); }\n")
 return stop_dma_before_free(s)
def stop_dma_before_free(s):
 return once(s,
  "    i2sDeinitDmaItems(bus_num); I2S[bus_num].dma_count = I2S_DMA_BLOCK_COUNT_DEFAULT; I2S[bus_num].data_size = 0; I2S[bus_num].is_sending_data = I2s_Is_Idle;",
  "    I2S[bus_num].bus->lc_conf.out_rst = 1; I2S[bus_num].bus->lc_conf.out_rst = 0;\n    i2sDeinitDmaItems(bus_num); I2S[bus_num].dma_count = I2S_DMA_BLOCK_COUNT_DEFAULT; I2S[bus_num].data_size = 0; I2S[bus_num].is_sending_data = I2s_Is_Idle;")
def api(s):
 s = once(s, "void i2sInit(uint8_t bus_num, ", "bool i2sInit(uint8_t bus_num, ")
 return once(s, "void i2sDeinit(uint8_t bus_num);", "void i2sDeinit(uint8_t bus_num);\nsize_t i2sDmaDataBytes(uint8_t bus_num);\nsize_t i2sDmaDescriptorBytes(uint8_t bus_num);\nsize_t i2sLargestDmaBlock(void);")
def apply(root):
 p, t = {}, {}
 for k, (rel, digest) in FILES.items():
  p[k] = root / rel; raw = p[k].read_bytes()
  if sha256(raw).hexdigest() != digest: raise RuntimeError(f"Unexpected pinned source: {p[k]}")
  t[k] = raw.decode()
 out = {"method": method(t["method"]), "driver": driver(t["driver"]), "api": api(t["api"])}
 for k, value in out.items(): p[k].write_text(value)
 return {k: sha256(value.encode()).hexdigest() for k, value in out.items()}
if __name__ == "__main__":
 if len(sys.argv) > 2: raise SystemExit("Usage: patch.py [NeoPixelBus directory]")
 print(apply(Path(sys.argv[1]) if len(sys.argv) == 2 else DEFAULT))
