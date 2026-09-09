#!/usr/bin/env python3
"""Execute the pinned descriptor and interrupt lifetime code with host SDK stubs."""
import importlib.util
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("dma_patch", HERE / "patch.py")
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)
baseline = Path(sys.argv[1])
raw = (baseline / patch.FILES["driver"][0]).read_bytes()
assert patch.sha256(raw).hexdigest() == patch.FILES["driver"][1]
driver = patch.driver(raw.decode())


def function(name):
    start = re.search(r"^(?:inline )?(?:void|bool|size_t) " + name + r"\(", driver, re.MULTILINE).start()
    opening = driver.index("{", start)
    depth = 1
    cursor = opening + 1
    while depth:
        depth += (driver[cursor] == "{") - (driver[cursor] == "}")
        cursor += 1
    return driver[start:cursor]


names = ["dmaItemInit", "i2sInitDmaItems", "i2sDeinitDmaItems", "i2sInit", "i2sDeinit", "i2sDmaDataBytes", "i2sDmaDescriptorBytes"]
actual = "\n".join(function(name) for name in names)
# Host pointers have 64 bits. The target register has 32 bits.
actual = actual.replace("(uint32_t)(&I2S[bus_num].dma_items[0])", "(uintptr_t)(&I2S[bus_num].dma_items[0])")
fields = set(re.findall(r"(?:i2s->\w+|conf2|lc_conf|fifo_conf|conf1|conf_chan|conf)\.(\w+)", actual))
registers = set(re.findall(r"i2s->(\w+)\.", actual))
prefix = r'''
#include <cassert>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <set>
#include <iostream>
#define NEO_I2S_COUNT 2
#define I2S_DMA_BLOCK_COUNT_DEFAULT 0
#define I2S_DMA_SILENCE_SIZE 4
#define I2S_DMA_SILENCE_BLOCK_COUNT_FRONT 2
#define I2S_DMA_SILENCE_BLOCK_COUNT_BACK 1
#define I2S_DMA_MAX_DATA_LEN 4092
#define MALLOC_CAP_DMA 1
#define PERIPH_I2S0_MODULE 0
#define PERIPH_I2S1_MODULE 1
#define ETS_I2S0_INTR_SOURCE 0
#define ETS_I2S1_INTR_SOURCE 1
#define ESP_INTR_FLAG_IRAM 1
#define ESP_INTR_FLAG_LEVEL1 2
#define ESP_OK 0
#define I2s_Is_Idle 0
#define log_e(...) ((void)0)
using i2s_tx_chan_mod_t=int;
using i2s_tx_fifo_mod_t=int;
using intr_handle_t=void*;
struct lldesc_t { unsigned owner, eof, sosf, offset, size, length; uint8_t* buf; struct { lldesc_t* stqe_next; } qe; };
unsigned resetWrites=0;
struct ResetField { ResetField& operator=(unsigned) { ++resetWrites; return *this; } };
''' + "struct Register { " + "; ".join("ResetField out_rst" if field == "out_rst" else f"uintptr_t {field}=0" for field in sorted(fields | {"val", "stop", "tx_start"})) + "; };\n" + "struct i2s_dev_t { " + "; ".join(f"Register {register}" for register in sorted(registers | {"int_ena", "out_link", "conf"})) + "; };\n" + r'''
struct Bus { i2s_dev_t* bus; intr_handle_t isr_handle=nullptr; lldesc_t* dma_items=nullptr; size_t dma_count=0, data_size=0; unsigned is_sending_data=0; };
i2s_dev_t devices[2];
Bus I2S[2]={{&devices[0]}, {&devices[1]}};
bool failAllocate=false, failInterrupt=false;
unsigned liveInterrupts=0, freeCalls=0;
std::set<void*> allocations;
void* heap_caps_malloc(size_t size, int) {
  if (failAllocate) return nullptr;
  void* result=std::malloc(size); assert(result); allocations.insert(result); return result;
}
void heap_caps_free(void* pointer) {
  if (!pointer) return;
  assert(allocations.erase(pointer)==1);
  for (auto& bus:I2S) if (bus.dma_items==pointer) {
    assert(bus.bus->conf.tx_start==0);
    assert(bus.isr_handle==nullptr);
  }
  ++freeCalls; std::free(pointer);
}
void periph_module_enable(int) {}
void esp_intr_disable(intr_handle_t handle) { assert(handle); }
void esp_intr_enable(intr_handle_t handle) { assert(handle); }
void esp_intr_free(intr_handle_t handle) { assert(handle); assert(liveInterrupts); --liveInterrupts; }
void i2sDmaISR(void*) {}
int esp_intr_alloc(int, int, void(*)(void*), void*, intr_handle_t* handle) {
  if (failInterrupt) return -1;
  *handle=reinterpret_cast<void*>(uintptr_t(1)); ++liveInterrupts; return ESP_OK;
}
int i2sSetSampleRate(uint8_t, uint16_t, uint16_t, bool, size_t) { return ESP_OK; }
'''
tests = r'''
int main() {
  uint8_t data[51408]={};
  auto init=[&]() { return i2sInit(1,true,1,3,1250,0,0,13,data,sizeof(data)); };
  for (unsigned attempt=0; attempt<20; ++attempt) {
    failAllocate=true; assert(!init()); failAllocate=false;
    assert(allocations.empty() && liveInterrupts==0 && i2sDmaDataBytes(1)==0);
    failInterrupt=true; assert(!init()); failInterrupt=false;
    assert(allocations.empty() && liveInterrupts==0 && i2sDmaDataBytes(1)==0);
    assert(init()); assert(allocations.size()==1 && liveInterrupts==1);
    assert(i2sDmaDataBytes(1)==51408);
    assert(i2sDmaDescriptorBytes(1)==16*sizeof(lldesc_t));
    assert(I2S[0].dma_items==nullptr && I2S[0].isr_handle==nullptr);
    auto first=I2S[1].dma_items;
    size_t sourceBytes=0;
    for (auto item=first+2; item->buf==data+sourceBytes; ++item) {
      assert(item<first+16);
      assert(item->length<=4092);
      assert(item->buf>=data && item->buf+item->length<=data+sizeof(data));
      sourceBytes+=item->length;
      if (item->eof) break;
    }
    assert(sourceBytes==sizeof(data)-96);
    unsigned previousResets=resetWrites;
    i2sDeinit(1);
    assert(resetWrites==previousResets+2);
    assert(allocations.empty() && liveInterrupts==0);
    assert(i2sDmaDataBytes(1)==0 && i2sDmaDescriptorBytes(1)==0);
    i2sDeinit(1);
  }
  assert(!i2sInit(1,true,1,3,1250,0,0,1,data,1));
  assert(allocations.empty());
  std::cout << "PASS: executed descriptor/IRQ failures, 20 retries, bounded descriptor chain, I2S0 isolation, and teardown\n";
}
'''
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    (root / "test.cpp").write_text(prefix + actual + tests)
    subprocess.run(["c++", "-std=gnu++17", "-Wall", "-Wextra", "-Werror", "-fsanitize=address,undefined", "-fno-omit-frame-pointer", str(root / "test.cpp"), "-o", str(root / "test")], check=True)
    # LeakSanitizer cannot run under this host's process tracing.
    # Allocation counters above check leaks. Address and UB checks remain active.
    environment = dict(os.environ)
    environment["ASAN_OPTIONS"] = environment.get("ASAN_OPTIONS", "") + ":detect_leaks=0"
    subprocess.run([str(root / "test")], check=True, env=environment)
