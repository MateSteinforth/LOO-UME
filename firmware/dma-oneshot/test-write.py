#!/usr/bin/env python3
"""Compile the pinned I2S lifecycle and model only delayed hardware traversal."""
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

RELATIVE = Path(".pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575/src/internal/methods/ESP/ESP32/Core_2_x/Esp32_i2s.c")
PINNED_SHA256 = "b682e8271727fe9ba7499c39f1eaf8673883a94cf3320563f475ae228d576782"
BASELINE = Path(sys.argv[1] if len(sys.argv) > 1 else "build/firmware-source").resolve()
OPTIONAL_PATCHED = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else None

def extract(text, name):
    found = re.search(r"^(?:inline )?(?:void|bool) (?:IRAM_ATTR )?" + re.escape(name) + r"\([^)]*\)\s*\{", text, re.M)
    if not found:
        raise ValueError(f"cannot extract {name}")
    opening = text.index("{", found.start())
    depth, cursor = 1, opening + 1
    while depth:
        depth += (text[cursor] == "{") - (text[cursor] == "}")
        cursor += 1
    return text[found.start():cursor]

def build(source, directory, name, pinned):
    raw = (source / RELATIVE).read_bytes()
    if pinned and hashlib.sha256(raw).hexdigest() != PINNED_SHA256:
        raise ValueError("unexpected pinned Esp32_i2s.c SHA-256")
    text = raw.decode()
    actual = "\n".join(extract(text, function) for function in
                         ("dmaItemInit", "i2sInitDmaItems", "i2sWriteDone", "i2sDmaISR", "i2sWrite"))
    prefix = r'''
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstdio>
#define IRAM_ATTR
#define NEO_I2S_COUNT 2
#define I2S_DMA_SILENCE_SIZE 4
#define I2S_DMA_SILENCE_BLOCK_COUNT_FRONT 2
#define I2S_DMA_SILENCE_BLOCK_COUNT_BACK 1
#define I2S_DMA_MAX_DATA_LEN 4092
#define MALLOC_CAP_DMA 1
#define I2s_Is_Idle 0
#define I2s_Is_Sending 1
#define log_e(...) ((void)0)
struct lldesc_t { unsigned owner, eof, sosf, offset, size, length; uint8_t* buf; struct { lldesc_t* stqe_next; } qe; };
struct Status { unsigned out_eof = 0; unsigned val = 0; };
struct Clear { unsigned val = 0; };
struct i2s_dev_t { Status int_st; Clear int_clr; };
struct i2s_bus_t { i2s_dev_t* bus; int unused[4]; void* isr_handle; lldesc_t* dma_items; size_t dma_count; unsigned is_sending_data; bool one_shot; uint8_t active_bank; };
i2s_dev_t devices[2];
i2s_dev_t& device = devices[0];
i2s_bus_t I2S[2] = {{&devices[0], {0, 0, 0, 0}, nullptr, nullptr, 0, I2s_Is_Idle, false, 0}, {&devices[1], {0, 0, 0, 0}, nullptr, nullptr, 0, I2s_Is_Idle, false, 0}};
bool failAllocate = false;
void* heap_caps_malloc(size_t bytes, int) { return failAllocate ? nullptr : std::malloc(bytes); }
void heap_caps_free(void* pointer) { std::free(pointer); }
'''
    tests = r'''
// Hardware traversal reads each next pointer when it leaves the descriptor.
// This does not model DMA descriptor prefetch or CPU-cache effects.
static lldesc_t* advance(lldesc_t* item) { return item->qe.stqe_next; }
int main() {
  uint8_t data[51408] = {};
  I2S[0].dma_count = 16;
  assert(i2sInitDmaItems(0, data, sizeof(data), true, 1));
  lldesc_t* first = I2S[0].dma_items;
  lldesc_t* eof = first + 2;
  while (!eof->eof) ++eof;
  lldesc_t* back = eof->qe.stqe_next;
  assert(back->qe.stqe_next == first);
  assert(i2sWrite(0));
  assert(first[1].qe.stqe_next == first + 2);
  // EOF interrupt is delayed: hardware reaches a second data pass first.
  lldesc_t* current = eof;
  current = advance(current); assert(current == back);
  current = advance(current); assert(current == first);
  current = advance(current); assert(current == first + 1);
  current = advance(current); assert(current == first + 2);
  assert(!i2sWriteDone(0));
  // The real ISR now makes the first silent bank loop and reports idle.
  device.int_st.out_eof = 1; device.int_st.val = 1;
  i2sDmaISR(&I2S[0]);
  assert(i2sWriteDone(0));
  assert(first[1].qe.stqe_next == first);
  assert(current->buf == data);
  data[0] = 0xa5;  // Producer reuse after the real i2sWriteDone result.
  assert(current->buf[0] == 0xa5);
  while (!current->eof) current = advance(current);
  current = advance(current); assert(current == back);
  current = advance(current); assert(current == first);
  current = advance(current); assert(current == first + 1);
  current = advance(current); assert(current == first);
  heap_caps_free(I2S[0].dma_items);
  puts("PASS: compiled pinned lifecycle exposes reuse during repeated data");
}
'''
    cpp, binary = directory / f"{name}.cpp", directory / name
    patched = "one_shot" in text
    if patched:
        tests = r'''
static lldesc_t* advance(lldesc_t* item) { return item->qe.stqe_next; }
int main() {
  uint8_t data[51408] = {};
  auto& output = I2S[1]; output.one_shot = true; output.active_bank = 0; output.dma_count = 32;
  assert(!i2sInitDmaItems(1, data, 96, true, 1));
  failAllocate = true; assert(!i2sInitDmaItems(1, data, sizeof(data), true, 1)); failAllocate = false;
  assert(i2sInitDmaItems(1, data, sizeof(data), true, 1));
  lldesc_t* first = output.dma_items; const size_t bankSize = 16;
  assert(first[0].qe.stqe_next == first && first[bankSize].qe.stqe_next == first + bankSize);
  assert(i2sWrite(1)); assert(!i2sWrite(1));
  lldesc_t* current = first;
  current = advance(current); while (!current->eof) current = advance(current);
  current = advance(current); assert(current == first + bankSize - 1);
  current = advance(current); assert(current == first + bankSize);
  // With EOF withheld, the closed destination gate cannot reach data again.
  for (unsigned step = 0; step != 10000; ++step) assert(advance(current) == current);
  assert(!i2sWriteDone(1));
  lldesc_t* savedLinks[32]; for (unsigned i = 0; i != 32; ++i) savedLinks[i] = first[i].qe.stqe_next;
  output.is_sending_data = I2s_Is_Idle; devices[1].int_st.out_eof = 1; devices[1].int_st.val = 1;
  i2sDmaISR(&output); for (unsigned i = 0; i != 32; ++i) assert(savedLinks[i] == first[i].qe.stqe_next);
  // An EOF at the last data block permits a new bank before the old back tail.
  output.is_sending_data = I2s_Is_Sending; lldesc_t* oldEof = first + 2; while (!oldEof->eof) ++oldEof;
  devices[1].int_st.out_eof = 1; devices[1].int_st.val = 1; i2sDmaISR(&output); assert(i2sWriteDone(1));
  assert(i2sWrite(1)); assert(output.active_bank == 0);
  current = advance(oldEof); assert(current == first + bankSize - 1); current = advance(current); assert(current == first + bankSize);
  // Rebuild the first bank for the standard delayed-ISR traversal below.
  heap_caps_free(output.dma_items); output.dma_items = nullptr; output.active_bank = 0; output.dma_count = 32; output.is_sending_data = I2s_Is_Idle;
  assert(i2sInitDmaItems(1, data, sizeof(data), true, 1)); first = output.dma_items;
  assert(i2sWrite(1)); current = first; current = advance(current); while (!current->eof) current = advance(current);
  current = advance(current); current = advance(current); assert(current == first + bankSize);
  devices[1].int_st.out_eof = 1; devices[1].int_st.val = 1; i2sDmaISR(&output);
  assert(i2sWriteDone(1) && current->buf != data);
  data[0] = 0xa5; assert(current->buf[0] == 0);
  for (unsigned frame = 0; frame != 4; ++frame) {
    uint8_t prior = output.active_bank; assert(i2sWrite(1));
    assert(output.active_bank == uint8_t(1 - prior));
    lldesc_t* gate = first + prior * bankSize;
    current = advance(gate); while (!current->eof) current = advance(current);
    current = advance(current); assert(current == first + prior * bankSize + bankSize - 1);
    current = advance(current); assert(current == first + output.active_bank * bankSize);
    devices[1].int_st.out_eof = 1; devices[1].int_st.val = 1; i2sDmaISR(&output); assert(i2sWriteDone(1));
  }
  heap_caps_free(output.dma_items); output.dma_items = nullptr;
  output.active_bank = 0; output.one_shot = true; output.dma_count = 8;
  assert(i2sInitDmaItems(1, data, 792, true, 1));
  assert(output.dma_items[0].qe.stqe_next == output.dma_items);
  assert(output.dma_items[4].qe.stqe_next == output.dma_items + 4);
  heap_caps_free(output.dma_items); output.dma_items = nullptr;
  assert(i2sInitDmaItems(1, data, 97, true, 1));
  heap_caps_free(output.dma_items); output.dma_items = nullptr;
  I2S[0].one_shot = false; I2S[0].dma_count = 16;
  assert(i2sInitDmaItems(0, data, sizeof(data), true, 1));
  assert(i2sWrite(0)); device.int_st.out_eof = 1; device.int_st.val = 1; i2sDmaISR(&I2S[0]);
  assert(i2sWriteDone(0) && I2S[0].dma_items[1].qe.stqe_next == I2S[0].dma_items);
  heap_caps_free(I2S[0].dma_items);
  puts("PASS: compiled repaired two-bank graph closes destination before reuse");
}
'''
    cpp.write_text(prefix + actual + tests)
    subprocess.run(["c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-fsanitize=address,undefined", "-fno-omit-frame-pointer", cpp, "-o", binary], check=True)
    environment = dict(os.environ)
    environment["ASAN_OPTIONS"] = environment.get("ASAN_OPTIONS", "") + ":detect_leaks=0"
    subprocess.run([binary], check=True, env=environment)

with tempfile.TemporaryDirectory() as temporary:
    directory = Path(temporary)
    build(BASELINE, directory, "pinned", True)
    if OPTIONAL_PATCHED:
        # A repaired graph can have different traversal. This proves it compiles
        # from the supplied source, but needs its own expected graph test.
        build(OPTIONAL_PATCHED, directory, "patched", False)
print("dynamic next-pointer reads are modeled; DMA prefetch and cache behavior are outside this host test")
