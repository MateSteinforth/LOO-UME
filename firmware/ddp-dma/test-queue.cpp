#include "DdpFrames.h"
#include <algorithm>
#include <array>
#include <atomic>
#include <cassert>
#include <mutex>
#include <thread>
#include <vector>

static std::mutex mutex;
static void lock() { mutex.lock(); }
static void unlock() { mutex.unlock(); }
static std::vector<uint8_t> packet(size_t offset, size_t count, uint8_t seq, bool push, uint8_t value) {
  std::vector<uint8_t> p(10 + count, value);
  p[0] = push ? 0x41 : 0x40; p[1] = seq; p[2] = 0x0b; p[3] = 1;
  p[4] = offset >> 24; p[5] = offset >> 16; p[6] = offset >> 8; p[7] = offset;
  p[8] = count >> 8; p[9] = count; return p;
}
static uint8_t send(DdpFrames& q, uint32_t sender, uint8_t seq, uint8_t value, uint32_t now, size_t total = DdpFrames::Capacity) {
  for (size_t offset = 0; offset < total; offset += DdpFrames::MaxPayload) {
    const size_t count = std::min(DdpFrames::MaxPayload, total - offset);
    auto p = packet(offset, count, seq, offset + count == total, value);
    q.receive(p.data(), p.size(), sender, now++);
    if (seq) seq = seq == 15 ? 1 : seq + 1;
  }
  return seq;
}
static void check(DdpFrames::Frame f, uint8_t value) {
  assert(f.pixels && f.size == DdpFrames::Capacity);
  for (size_t i = 0; i < f.size; ++i) assert(f.pixels[i] == value);
}
static std::array<std::vector<uint8_t>, 6> six(uint8_t sequence, uint8_t value) {
  std::array<std::vector<uint8_t>, 6> result;
  for (size_t i = 0, offset = 0; i < result.size(); ++i, offset += DdpFrames::MaxPayload) {
    const size_t count = std::min(DdpFrames::MaxPayload, DdpFrames::Capacity - offset);
    result[i] = packet(offset, count, sequence, i + 1 == result.size(), value);
    if (sequence) sequence = sequence == 15 ? 1 : sequence + 1;
  }
  return result;
}
static void receiveAll(DdpFrames& q, const std::array<std::vector<uint8_t>, 6>& parts, uint32_t sender, uint32_t now) {
  for (size_t i = 0; i < parts.size(); ++i) q.receive(parts[i].data(), parts[i].size(), sender, now + i);
}
int main() {
  DdpFrames q(lock, unlock);
  assert(!q.configure(0)); assert(!q.configure(2)); assert(!q.configure(DdpFrames::Capacity + 3));
  assert(q.configure(DdpFrames::Capacity));
  {
    DdpFrames f(lock, unlock);
    assert(f.configure(DdpFrames::Capacity));
    const auto good = six(1, 0x91);
    const uint32_t before = f.stats().complete;
    // No final PUSH and an early PUSH cannot publish a six-packet frame.
    auto noPush = good; noPush[5][0] = 0x40; receiveAll(f, noPush, 1, 1000); assert(f.stats().complete == before && !f.hasReady());
    for (size_t early = 0; early < 5; ++early) {
      auto parts = good; parts[early][0] = 0x41; receiveAll(f, parts, 2 + early, 2000 + early * 20);
      assert(f.stats().complete == before && !f.hasReady());
    }
    // A dropped, duplicated, or reordered nonzero fragment invalidates its candidate.
    for (size_t bad = 0; bad < 6; ++bad) {
      for (int mode = 0; mode < 3; ++mode) {
        if (bad == 0 && mode != 0) continue; // offset zero means a defined restart.
        if (bad == 5 && mode != 0) continue; // final-fragment cases are below.
        auto parts = good; const uint32_t sender = 20 + bad * 3 + mode;
        for (size_t i = 0; i < 6; ++i) {
          if (mode == 0 && i == bad) continue;
          if (mode == 2 && i == bad && bad + 1 < 6) continue;
          f.receive(parts[i].data(), parts[i].size(), sender, 3000 + sender * 10 + i);
          if (mode == 1 && i == bad && bad > 0) f.receive(parts[i].data(), parts[i].size(), sender, 3001 + sender * 10 + i);
          if (mode == 2 && i == bad + 1 && bad + 1 < 6) f.receive(parts[bad].data(), parts[bad].size(), sender, 3002 + sender * 10 + i);
        }
        assert(f.stats().complete == before && !f.hasReady());
        f.discard();
      }
    }
    // The final fragment can fail before it publishes: missing PUSH is a duplicate-equivalent
    // terminal fault, and delivering it before fragment four is an ordering fault.
    for (size_t i = 0; i < 5; ++i) f.receive(good[i].data(), good[i].size(), 79, 3900 + i);
    auto finalWithoutPush = good[5]; finalWithoutPush[0] = 0x40;
    f.receive(finalWithoutPush.data(), finalWithoutPush.size(), 79, 3905);
    f.receive(good[5].data(), good[5].size(), 79, 3906);
    assert(f.stats().complete == before && !f.hasReady());
    f.discard();
    for (size_t i = 0; i < 4; ++i) f.receive(good[i].data(), good[i].size(), 78, 3910 + i);
    f.receive(good[5].data(), good[5].size(), 78, 3914);
    f.receive(good[4].data(), good[4].size(), 78, 3915);
    assert(f.stats().complete == before && !f.hasReady());
    f.discard();
    auto malformed = good[0];
    for (const auto change : {0, 2, 3}) {
      auto p = malformed; p[change] = change == 0 ? 0x42 : uint8_t(p[change] + 1);
      f.receive(p.data(), p.size(), 80, 4000 + change); assert(f.stats().complete == before);
    }
    auto sequence16 = malformed; sequence16[1] = 16; f.receive(sequence16.data(), sequence16.size(), 80, 4010);
    auto zeroCount = packet(0, 0, 1, false, 0); f.receive(zeroCount.data(), zeroCount.size(), 80, 4011);
    auto longCount = packet(0, 1441, 1, false, 0); f.receive(longCount.data(), longCount.size(), 80, 4012);
    auto zero = six(0, 0x55); zero[1][1] = 1; receiveAll(f, zero, 81, 4020); assert(f.stats().complete == before);
    auto mixed = six(1, 0x56); mixed[1][1] = 0; receiveAll(f, mixed, 82, 4030); assert(f.stats().complete == before);
    receiveAll(f, good, 90, 5000); assert(f.stats().complete == before + 1); check(f.take(5006), 0x91); f.release();
    receiveAll(f, good, 91, 7000); assert(f.stats().maxReceiveGapUs >= 2000 && f.stats().lastCompleteUs == 7005);
    f.discard();
    receiveAll(f, good, 92, 0xfffffff0u); f.expire(90000); assert(f.hasReady()); f.expire(110000); assert(!f.hasReady());
    receiveAll(f, good, 93, 120000); auto heldConfig = f.take(120006); assert(!f.configure(0)); check(heldConfig, 0x91); f.release();
  }
  uint8_t seq = send(q, 7, 14, 0x11, 1); check(q.take(10), 0x11); q.release();
  send(q, 7, 0, 0x22, 20); check(q.take(30), 0x22); q.release();
  auto first = packet(0, 1440, 1, false, 1); q.receive(first.data(), first.size(), 1, 40);
  auto lost = packet(2880, 1440, 3, false, 1); q.receive(lost.data(), lost.size(), 1, 41);
  auto duplicate = packet(1440, 1440, 2, false, 1); q.receive(duplicate.data(), duplicate.size(), 1, 42);
  // A rejected duplicate must make every later suffix unusable until offset zero restarts.
  for (size_t offset = 2880; offset < DdpFrames::Capacity; offset += 1440) {
    const size_t count = std::min(size_t(1440), DdpFrames::Capacity - offset);
    auto suffix = packet(offset, count, uint8_t(offset / 1440 + 1), offset + count == DdpFrames::Capacity, 1);
    q.receive(suffix.data(), suffix.size(), 1, 50 + offset);
  }
  assert(!q.hasReady());
  // A malformed foreign sender cannot erase the active sender's candidate.
  auto foreignStart = packet(0, 1440, 1, false, 0x2a);
  q.receive(foreignStart.data(), foreignStart.size(), 90, 70);
  q.receive(first.data(), first.size() - 1, 91, 71);
  for (size_t offset = 1440; offset < DdpFrames::Capacity; offset += 1440) {
    const size_t count = std::min(size_t(1440), DdpFrames::Capacity - offset);
    auto rest = packet(offset, count, uint8_t(offset / 1440 + 1), offset + count == DdpFrames::Capacity, 0x2a);
    q.receive(rest.data(), rest.size(), 90, 72 + offset);
  }
  check(q.take(80), 0x2a); q.release();
  q.receive(first.data(), first.size(), 2, 60);
  q.receive(lost.data(), lost.size(), 2, 61); // reordered current-sender packet rejects this candidate
  assert(!q.hasReady());
  q.receive(first.data(), first.size() - 1, 9, 43);
  auto early = packet(0, 3, 1, true, 1); q.receive(early.data(), early.size(), 9, 44);
  auto missing = packet(0, 3, 1, false, 1); q.receive(missing.data(), missing.size(), 9, 45);
  auto oversized = packet(0, 1441, 1, false, 1); q.receive(oversized.data(), oversized.size(), 9, 46);
  assert(q.stats().invalid >= 4);
  seq = send(q, 3, seq, 0x33, 100); auto held = q.take(110); check(held, 0x33);
  seq = send(q, 3, seq, 0x44, 120); seq = send(q, 3, seq, 0x55, 130);
  check(held, 0x33); assert(q.stats().superseded >= 1); q.release(); check(q.take(140), 0x55); q.release();
  auto restart = packet(0, 1440, 1, false, 9); q.receive(restart.data(), restart.size(), 20, 200);
  q.expire(299999); assert(q.stats().expired >= 1);
  send(q, 5, 1, 0x66, 0xfffffff0u); q.expire(90000); assert(q.hasReady()); q.expire(110000); assert(!q.hasReady());
  send(q, 6, 1, 0x77, 120000); auto old = q.take(120100); check(old, 0x77);
  assert(q.configure(6)); check(old, 0x77); q.release();
  auto tiny0 = packet(0, 3, 1, false, 0x88), tiny1 = packet(3, 3, 2, true, 0x88);
  q.receive(tiny0.data(), tiny0.size(), 6, 130000); q.receive(tiny1.data(), tiny1.size(), 6, 130001);
  auto tiny = q.take(130002); assert(tiny.size == 6); q.release();
  assert(!q.configure(0)); q.receive(tiny0.data(), tiny0.size(), 6, 130003); assert(!q.hasReady());
  assert(q.configure(DdpFrames::Capacity));
  std::atomic<bool> producerDone{false};
  std::thread a([&] {
    for (unsigned n = 0; n < 128; ++n) send(q, 100 + n, 1, uint8_t(n), 200000 + n * 10);
    producerDone = true;
  });
  std::thread b([&] {
    while (!producerDone || q.hasReady()) {
      auto frame = q.take(0);
      if (!frame.pixels) { std::this_thread::yield(); continue; }
      const uint8_t value = frame.pixels[0];
      for (size_t i = 0; i < frame.size; ++i) assert(frame.pixels[i] == value);
      q.release();
    }
  });
  a.join(); b.join();
}
