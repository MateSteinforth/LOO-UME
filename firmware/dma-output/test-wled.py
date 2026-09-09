#!/usr/bin/env python3
"""Test the patched WLED initialization boundary with injected bus failures."""
import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("patch_wled", HERE / "patch-wled.py")
patch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)
baseline = Path(sys.argv[1])
npb = baseline / ".pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575"

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    source = root / "source"
    library = root / "library"
    (source / "wled00").mkdir(parents=True)
    (library / "src").mkdir(parents=True)
    for name in ("bus_wrapper.h", "bus_manager.cpp", "FX_fcn.cpp", "wled.h"):
        shutil.copyfile(baseline / "wled00" / name, source / "wled00" / name)
    shutil.copyfile(npb / "src/NeoPixelBus.h", library / "src/NeoPixelBus.h")
    patch.apply(source, library)
    try:
        patch.apply(source, library)
        raise AssertionError("Repeated patch was accepted")
    except ValueError:
        pass
    text = (source / "wled00/FX_fcn.cpp").read_text()
    gate = text[text.index("  bool looDmaRequested"):text.index("  unsigned i2sBusCount")]
    gate = gate[:gate.index("  #if")]
    start = text.index("  bool looDmaFailed")
    end = text.index("  BusManager::initializeABL();", start)
    body = text[start:end]
    cpp = r'''
#include <cassert>
#include <atomic>
#include <cstdint>
#include <vector>
#include <iostream>
#define TYPE_WS2812_RGB 22
#define MALLOC_CAP_DMA 1
#define ERR_NORAM 1
#define MAX_LEDS 65535
std::atomic<unsigned> loo_dma_requested{0}, loo_dma_active_lanes{0}, loo_dma_failure{0};
std::atomic<unsigned> loo_dma_required{0}, loo_dma_free_before{0}, loo_dma_largest_before{0};
std::atomic<unsigned> loo_dma_allocated{0}, loo_dma_descriptors{0};
unsigned i2sDmaDataBytes(unsigned) { return 51408; }
unsigned i2sDmaDescriptorBytes(unsigned) { return 192; }
unsigned heap_caps_get_free_size(int) { return 100000; }
unsigned heap_caps_get_largest_free_block(int) { return 60000; }
struct Config { unsigned driverType=1, type=22, count=640, skipAmount=0; };
struct Bus {
  bool ok=true, placeholder=false, fail=false;
  unsigned begins=0, cleans=0, start=0, length=640;
  virtual ~Bus() = default;
  void begin() { ++begins; if (fail) ok=false; }
  bool isOk() { return ok; }
  bool isPlaceholder() { return placeholder; }
  bool isDigital() { return true; }
  unsigned getStart() { return start; }
  unsigned getLength() { return length; }
  bool hasWhite() { return false; }
  bool isOffRefreshRequired() { return false; }
  bool isPWM() { return false; }
  void setBrightness(unsigned) {}
};
struct BusDigital : Bus { void cleanup() { ++cleans; ok=false; } };
namespace BusManager {
std::vector<Bus*> buses;
unsigned getNumBusses() { return buses.size(); }
Bus* getBus(unsigned i) { return buses[i]; }
}
unsigned errorFlag=0, _length=0, bri=128;
bool _hasWhiteChannel=false, _isOffRefreshRequired=false;
unsigned scaledBri(unsigned b) { return b; }
std::vector<Config> busConfigs;
void initialize() {
''' + gate + body + r'''
}
int main() {
  for (int failure=-1; failure<4; ++failure) {
    BusDigital buses[4];
    BusManager::buses.clear(); busConfigs.assign(4, Config{}); errorFlag=0;
    busConfigs[0].count=704;
    for (unsigned i=0; i<4; ++i) {
      buses[i].start=i==0 ? 0 : 704+(i-1)*640;
      buses[i].length=i==0 ? 704 : 640;
      buses[i].fail=static_cast<int>(i)==failure;
      BusManager::buses.push_back(&buses[i]);
    }
    initialize();
    assert(loo_dma_required==51408);
    assert(_length==(failure<0 ? 2624U : 0U));
    assert(loo_dma_active_lanes==(failure<0 ? 4U : 0U));
    for (auto& bus:buses) { assert(bus.begins==1); assert(bus.cleans==(failure<0 ? 0U : 1U)); }
    if (failure>=0) assert(errorFlag==ERR_NORAM && loo_dma_failure==2);
    if (failure<0) {
      busConfigs[2].driverType=0;
      initialize();
      assert(_length==0 && loo_dma_active_lanes==0 && errorFlag==ERR_NORAM);
    }
  }
  BusDigital rmt;
  rmt.length=64;
  BusManager::buses={&rmt}; busConfigs={Config{0,22,64,0}}; errorFlag=0;
  initialize();
  assert(_length==64 && rmt.begins==1 && rmt.cleans==0 && errorFlag==0);
  assert(loo_dma_requested==0 && loo_dma_active_lanes==0);
  for (unsigned variant=0; variant<4; ++variant) {
    BusDigital buses[4];
    BusManager::buses.clear(); busConfigs.assign(4, Config{});
    for (auto& bus:buses) BusManager::buses.push_back(&bus);
    if (variant==0) busConfigs[0].count=705;
    if (variant==1) busConfigs[0].skipAmount=1;
    if (variant==2) busConfigs[0].type=30;
    if (variant==3) busConfigs[0].count=0;
    initialize();
    assert(_length==0 && loo_dma_active_lanes==0 && loo_dma_failure!=0);
  }
  std::cout << "PASS: four lanes, each failed lane, group cleanup, RMT, and DMA config bounds\n";
}
'''
    harness = root / "test.cpp"
    harness.write_text(cpp)
    subprocess.run(["c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", str(harness), "-o", str(root / "test")], check=True)
    subprocess.run([str(root / "test")], check=True)
