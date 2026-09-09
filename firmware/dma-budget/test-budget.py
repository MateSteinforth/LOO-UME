#!/usr/bin/env python3
"""Run the real WLED bus-budget loop with minimal host bus objects."""
import importlib.util
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


HERE = Path(__file__).resolve().parent
SOURCE = Path(sys.argv[1]).resolve()


def between(text, first, last):
    start = text.index(first)
    end = text.index(last, start)
    return text[start:end]


def patch_copy(source, destination):
    (destination / "wled00").mkdir(parents=True)
    for name in ("FX_fcn.cpp", "wled.h"):
        shutil.copyfile(source / "wled00" / name, destination / "wled00" / name)
    spec = importlib.util.spec_from_file_location("budget_patch", HERE / "patch.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.apply(destination)


def make_program(source):
    fx = (source / "wled00" / "FX_fcn.cpp").read_text()
    wrapper = (SOURCE / "wled00" / "bus_wrapper.h").read_text()
    manager = (SOURCE / "wled00" / "bus_manager.cpp").read_text()
    loop = between(fx, "  unsigned mem = 0; // memory estimation", "  DEBUG_PRINTF_P(PSTR(\"Estimated buses")
    config_mem = between(manager, "size_t BusConfig::memUsage() const {", "\n}\n\nint BusManager::add") + "\n}"
    assert "size += (_useParallelI2S)" in wrapper
    assert "PixelsSize()*4" in wrapper
    assert "case I_32_RN_NEO_3" in wrapper
    assert "mem += sizeof(BusDigital) + PolyBus::memUsage" in config_mem
    data_size = between(wrapper, "  static unsigned getDataSize", "\n  static unsigned memUsage")
    i2s_case = re.search(r"^\s*case I_32_I2_NEO_3:.*$", data_size, re.M).group(0)
    rmt_case = re.search(r"^\s*case I_32_RN_NEO_3:.*$", data_size, re.M).group(0)
    types = sorted(set(re.findall(r"B_[A-Za-z0-9_]+", i2s_case + rmt_case)))
    classes = "\n".join(f"struct {name} {{ unsigned PixelsSize() const {{ return testPixels; }} }};" for name in types)
    # The test executes the exact loop. These small objects replace only WLED
    # allocation and hardware classes. The selected getDataSize case statements
    # are extracted from WLED, then compiled below.
    return r'''
#include <cassert>
#include <cstddef>
#include <cstdio>
#include <memory>
#include <vector>
#define WLED_HAS_PARALLEL_I2S
#ifndef BUS_OBJECT_BYTES
#define BUS_OBJECT_BYTES 64
#endif

constexpr unsigned MAX_LED_MEMORY = 85 * 1024;
constexpr int ERR_NORAM = 1;
constexpr int I_32_I2_NEO_3 = 10;
constexpr int I_32_RN_NEO_3 = 11;
unsigned testPixels;
bool _useParallelI2S = true;
''' + classes + r'''
struct Atomic { unsigned value = 0; unsigned load() const { return value; } void store(unsigned v) { value = v; } };
struct BusDigital { unsigned char object[BUS_OBJECT_BYTES]; unsigned count = 0, iType = 0; bool placeholder = false; bool isOk() const { return !placeholder; } bool isPlaceholder() const { return placeholder; } size_t getBusSize() const; };
struct PolyBus {
  static unsigned getDataSize(void* busPtr, unsigned busType) {
    unsigned size = 100;
    testPixels = static_cast<BusDigital*>(busPtr)->count * 3;
    switch (busType) {
''' + i2s_case + "\n" + rmt_case + r'''
    }
    return size;
  }
  static unsigned memUsage(unsigned count, unsigned type) {
    unsigned size = count * 3;
    switch (type) { case I_32_I2_NEO_3: break; default: size *= 2; break; }
    return size;
  }
};
struct Bus {
  static bool isVirtual(unsigned) { return false; }
  static bool isDigital(unsigned type) { return type == 1; }
  static bool is2Pin(unsigned) { return false; }
  static bool isOnOff(unsigned) { return false; }
  static unsigned getNumberOfChannels(unsigned) { return 0; }
  static unsigned hasRGB(unsigned) { return 1; }
  static unsigned hasWhite(unsigned) { return 0; }
  static unsigned hasCCT(unsigned) { return 0; }
  static unsigned is16bit(unsigned) { return 0; }
};
struct BusConfig {
  unsigned type = 1, count = 0, skipAmount = 0, driverType = 0, iType = 0; unsigned char pins[1] = {};
  size_t memUsage() const;
};
struct BusNetwork {}; struct BusOnOff {}; struct BusPwm {};
''' + config_mem + r'''
size_t BusDigital::getBusSize() const { return sizeof(BusDigital) + (isOk() ? PolyBus::getDataSize((void*)this, iType) : 0); }
namespace BusManager {
  std::vector<std::unique_ptr<BusDigital>> busses;
  unsigned getI(unsigned, const unsigned char*, unsigned driver) { return driver ? I_32_I2_NEO_3 : I_32_RN_NEO_3; }
  int add(const BusConfig& bus, bool placeholder) { auto result = std::unique_ptr<BusDigital>(new BusDigital); result->count = bus.count; result->iType = bus.iType; result->placeholder = placeholder; busses.emplace_back(std::move(result)); return int(busses.size()) - 1; }
}
bool looDmaRequested, looDmaAllowed, useParallelI2S = true;
Atomic loo_dma_failure, loo_dma_required;
int errorFlag, digitalCount;
#define DEBUG_PRINTF_P(...)
#define PSTR(x) x
struct Result { unsigned placeholders, failure, estimated; };
Result run(bool requested, bool allowed, unsigned driver, unsigned required, const unsigned counts[4]) {
  looDmaRequested = requested; looDmaAllowed = allowed; loo_dma_required.store(required);
  loo_dma_failure.store(0); errorFlag = 0; digitalCount = 4; BusManager::busses.clear();
  std::vector<BusConfig> busConfigs;
  for (unsigned i = 0; i != 4; ++i) { BusConfig bus; bus.count = counts[i]; bus.driverType = driver; busConfigs.push_back(bus); }
''' + loop + r'''
  unsigned placeholders = 0;
  for (const auto& bus : BusManager::busses) placeholders += bus->placeholder;
  return {placeholders, loo_dma_failure.load(), mem + I2SdmaMem};
}
int main() {
  const unsigned normal[4] = {704, 640, 640, 640};
  const unsigned huge_dma[4] = {704, 640, 640, 640};
  Result good = run(true, true, 1, 51408, normal);
  Result rmt = run(false, false, 0, 0, normal);
  Result unsupported = run(true, false, 1, 51408, normal);
  Result budget = run(true, true, 1, 60000, huge_dma);
  std::printf("%u,%u,%u %u,%u,%u %u,%u,%u %u,%u,%u\n", good.placeholders, good.failure, good.estimated, rmt.placeholders, rmt.failure, rmt.estimated, unsupported.placeholders, unsupported.failure, unsupported.estimated, budget.placeholders, budget.failure, budget.estimated);
}
'''


def run(source, directory, name, object_bytes):
    program = directory / f"{name}.cpp"
    binary = directory / name
    program.write_text(make_program(source))
    subprocess.run(["c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", f"-DBUS_OBJECT_BYTES={object_bytes}", program, "-o", binary], check=True)
    return subprocess.check_output([binary], text=True).strip()


with tempfile.TemporaryDirectory() as temporary:
    directory = Path(temporary)
    patched = directory / "patched"
    patch_copy(SOURCE, patched)
    for object_bytes in (0, 64, 128):
        before = run(SOURCE, directory, f"before-{object_bytes}", object_bytes)
        after = run(patched, directory, f"after-{object_bytes}", object_bytes)
        before_parts = before.split()
        after_parts = after.split()
        # Original estimate creates a false placeholder in a valid four-output DMA group.
        assert int(before_parts[0].split(",")[0]) > 0, before
        # Patched group has four real outputs. The correct required DMA reserve is included once.
        assert after_parts[0].startswith("0,0,"), after
        # RMT does not enter the guarded path. Its complete result is bit-for-bit unchanged.
        assert before_parts[1] == after_parts[1], (before, after)
        # Invalid group stays rejected. A valid group beyond the budget sets failure 3.
        assert after_parts[2].startswith("4,1,"), after
        assert after_parts[3].split(",")[0] != "0" and after_parts[3].split(",")[1] == "3", after
    print("budget harness passed")
