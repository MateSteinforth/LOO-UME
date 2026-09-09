#include "DdpFrames.h"

#include <array>
#include <cassert>
#include <cstdint>
#include <cstdio>

static void lock() {}
static void unlock() {}

static std::array<uint8_t, 13> packet(uint8_t flags, uint32_t offset, uint8_t value) {
  return {flags, 0, 0x0b, 1,
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
    assert(frames.hasReady());
    assert(stats.expired == 0 && stats.readyDiscards == 0);
  }
  {
    DdpFrames frames(lock, unlock);
    assert(frames.configure(6));
    receive(frames, 0x40, 0, 200);
    frames.expire(199);  // Same stale timestamp while assembly is active.
    const auto stats = frames.stats();
    assert(stats.expired == 0 && stats.incomplete == 0 && stats.stagingDiscards == 0);
    receive(frames, 0x41, 3, 201);
    assert(frames.hasReady() && frames.stats().complete == 1);
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
    receive(frames, 0x41, 0, 200);
    frames.receive(nullptr, 0, 0x05060708, 199);
    assert(frames.hasReady() && frames.stats().expired == 0);
  }
  {
    DdpFrames frames(lock, unlock);
    assert(frames.configure(6));
    receive(frames, 0x40, 0, 200);
    frames.receive(nullptr, 0, 0x05060708, 199);
    assert(frames.stats().expired == 0 && frames.stats().stagingDiscards == 0);
    receive(frames, 0x41, 3, 201);
    assert(frames.hasReady() && frames.stats().complete == 1);
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
  {
    DdpFrames frames(lock, unlock);
    assert(frames.configure(3));
    receive(frames, 0x41, 0, 0x20u);
    frames.expire(0xfffffff0u);  // A stale sample across clock wrap.
    assert(frames.hasReady() && frames.stats().expired == 0);
    frames.expire(0x20u + 99999u);
    assert(frames.hasReady());
    frames.expire(0x20u + 100000u);
    assert(!frames.hasReady());
  }
  std::puts("PASS: fresh frames survive stale clocks; real expiry and wrap remain correct");
}
