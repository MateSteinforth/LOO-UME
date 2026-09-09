#include "DdpFrames.h"

#include <array>
#include <cassert>
#include <cstdint>
#include <cstdio>

static void lock() {}
static void unlock() {}

static std::array<uint8_t, 13> packet(uint8_t flags, uint32_t offset, uint8_t value) {
  return {flags, 1, 0x0b, 1,
          uint8_t(offset >> 24), uint8_t(offset >> 16), uint8_t(offset >> 8), uint8_t(offset),
          0, 3, value, uint8_t(value + 1), uint8_t(value + 2)};
}

static void receive(DdpFrames& frames, uint8_t flags, uint32_t offset, uint32_t now) {
  const auto p = packet(flags, offset, uint8_t(offset));
  frames.receive(p.data(), p.size(), 0x01020304, now);
}

int main() {
  // `nowUs` is normally sampled before the guard. A concurrent receiver can
  // publish at 200 before this stale main-loop expiry call acquires that guard.
  {
    DdpFrames frames(lock, unlock);
    assert(frames.configure(3));
    receive(frames, 0x41, 0, 200);
    assert(frames.hasReady());
    frames.expire(199);  // Stale pre-lock clock: unsigned elapsed wraps.
    const auto stats = frames.stats();
    assert(!frames.hasReady());
    assert(stats.expired == 1 && stats.readyDiscards == 1);
  }
  {
    DdpFrames frames(lock, unlock);
    assert(frames.configure(6));
    receive(frames, 0x40, 0, 200);
    frames.expire(199);  // Same stale timestamp while assembly is active.
    const auto stats = frames.stats();
    assert(stats.expired == 1 && stats.incomplete == 1 && stats.stagingDiscards == 1);
  }
  {
    DdpFrames frames(lock, unlock);
    assert(frames.configure(3));
    receive(frames, 0x41, 0, 200);
    frames.expire(100200);  // Exact timeout is a real expiry.
    assert(!frames.hasReady() && frames.stats().expired == 1);
  }
  {
    DdpFrames frames(lock, unlock);
    assert(frames.configure(3));
    receive(frames, 0x41, 0, 0xfffffff0u);
    frames.expire(0x20u);  // Normal uint32 wrap: elapsed is 48 us.
    assert(frames.hasReady() && frames.stats().expired == 0);
    frames.expire(0x000186a0u);  // 100016 us after 0xfffffff0.
    assert(!frames.hasReady() && frames.stats().expired == 1);
  }
  std::puts("PASS: current header reproduces stale-clock expiry and accepts normal wrap");
}
