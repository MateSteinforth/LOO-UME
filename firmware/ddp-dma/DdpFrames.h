#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>

class DdpFrames {
public:
  static constexpr size_t Capacity = 2624u * 3u;
  static constexpr size_t HeaderSize = 10;
  static constexpr size_t MaxPayload = 1440;

  struct Frame { const uint8_t* pixels = nullptr; size_t size = 0; uint32_t sender = 0; };
  struct Stats {
    uint32_t packets = 0, complete = 0, invalid = 0, incomplete = 0;
    uint32_t superseded = 0, expired = 0, sequenceGaps = 0;
    uint32_t stagingDiscards = 0, readyDiscards = 0;
    uint32_t lastCompleteUs = 0, maxReceiveGapUs = 0;
  };

  DdpFrames(void (*lock)(), void (*unlock)()) : lock_(lock), unlock_(unlock) {}

  bool configure(size_t totalBytes) {
    Guard guard(*this);
    if (totalBytes > Capacity || totalBytes == 0 || totalBytes % 3) {
      discardLocked(); total_ = 0; return false;
    }
    if (total_ != totalBytes) { discardLocked(); total_ = totalBytes; }
    return true;
  }

  void receive(const uint8_t* packet, size_t length, uint32_t sender, uint32_t nowUs) {
    Guard guard(*this);
    expireLocked(nowUs, 100000);
    ++stats_.packets;
    if (!validPacket(packet, length)) { reject(sender); return; }
    const uint32_t offset = (uint32_t(packet[4]) << 24) | (uint32_t(packet[5]) << 16) |
                            (uint32_t(packet[6]) << 8) | packet[7];
    const size_t count = (size_t(packet[8]) << 8) | packet[9];
    const uint8_t sequence = packet[1];
    const bool push = packet[0] == 0x41;
    if (!total_ || offset % 3 || count % 3 || !count || count > MaxPayload ||
        offset > total_ || count > total_ - offset) { reject(sender); return; }

    if (offset == 0) {
      if (assembling_) discardAssembly(true);
      assembling_ = true; stagingSender_ = sender; nextOffset_ = 0; zeroSequence_ = sequence == 0;
      nextSequence_ = zeroSequence_ ? 0 : sequence; staging_ = availableStaging();
    }
    if (!assembling_ || sender != stagingSender_ || offset != nextOffset_ ||
        (zeroSequence_ ? sequence != 0 : sequence != nextSequence_)) {
      if (assembling_ && sender == stagingSender_) {
        if (!zeroSequence_ && sequence != nextSequence_) ++stats_.sequenceGaps;
        reject(sender);
      } else {
        ++stats_.invalid;
      }
      return;
    }

    std::memcpy(buffers_[staging_].data() + offset, packet + HeaderSize, count);
    nextOffset_ += count;
    lastAssemblyUs_ = nowUs;
    if (!zeroSequence_) nextSequence_ = next(sequence);
    const bool full = nextOffset_ == total_;
    if (push != full) {
      reject(sender);
      return;
    }
    if (!full) return;
    if (ready_ >= 0) { ++stats_.superseded; ++stats_.readyDiscards; }
    ready_ = staging_;
    readySender_ = sender;
    readySize_ = total_;
    readyAtUs_ = nowUs;
    clearAssembly();
    ++stats_.complete;
    if (stats_.lastCompleteUs) {
      const uint32_t gap = elapsed(nowUs, stats_.lastCompleteUs);
      if (gap > stats_.maxReceiveGapUs) stats_.maxReceiveGapUs = gap;
    }
    stats_.lastCompleteUs = nowUs;
  }

  void expire(uint32_t nowUs, uint32_t timeoutUs = 100000) {
    Guard guard(*this);
    expireLocked(nowUs, timeoutUs);
  }

  void discard() { Guard guard(*this); discardLocked(); }
  bool hasReady() { Guard guard(*this); return ready_ >= 0; }
  Frame take(uint32_t) {
    Guard guard(*this);
    if (reading_ >= 0 || ready_ < 0) return {};
    reading_ = ready_; readingSender_ = readySender_; readingSize_ = readySize_; ready_ = -1;
    return {buffers_[reading_].data(), readingSize_, readingSender_};
  }
  void release() { Guard guard(*this); reading_ = -1; readingSize_ = 0; }
  Stats stats() { Guard guard(*this); return stats_; }

private:
  struct Guard { DdpFrames& q; Guard(DdpFrames& value) : q(value) { q.lock_(); } ~Guard() { q.unlock_(); } };
  static uint8_t next(uint8_t sequence) { return sequence == 15 ? 1 : uint8_t(sequence + 1); }
  static uint32_t elapsed(uint32_t now, uint32_t then) { return now - then; }
  bool validPacket(const uint8_t* p, size_t length) const {
    return p && length >= HeaderSize && (p[0] == 0x40 || p[0] == 0x41) &&
           p[1] <= 15 && p[2] == 0x0b && p[3] == 1 &&
           length == HeaderSize + ((size_t(p[8]) << 8) | p[9]);
  }
  int availableStaging() const {
    for (int i = 0; i < 3; ++i) if (i != ready_ && i != reading_) return i;
    return staging_; // reading and ready occupy at most two slots.
  }
  void clearAssembly() { assembling_ = false; nextOffset_ = 0; }
  void discardAssembly(bool incomplete) {
    if (!assembling_) return;
    if (incomplete) ++stats_.incomplete;
    ++stats_.stagingDiscards;
    clearAssembly();
  }
  void discardLocked() {
    discardAssembly(true);
    if (ready_ >= 0) { ++stats_.readyDiscards; ready_ = -1; readySize_ = 0; }
  }
  void reject(uint32_t sender) {
    ++stats_.invalid;
    if (assembling_ && sender == stagingSender_) discardAssembly(true);
  }
  void expireLocked(uint32_t nowUs, uint32_t timeoutUs) {
    if (assembling_ && elapsed(nowUs, lastAssemblyUs_) >= timeoutUs) {
      ++stats_.expired; discardAssembly(true);
    }
    if (ready_ >= 0 && elapsed(nowUs, readyAtUs_) >= timeoutUs) {
      ++stats_.expired; ++stats_.readyDiscards; ready_ = -1; readySize_ = 0;
    }
  }

  std::array<uint8_t, Capacity> buffers_[3]{};
  size_t total_ = 0, nextOffset_ = 0, readySize_ = 0, readingSize_ = 0;
  int staging_ = 0, ready_ = -1, reading_ = -1;
  bool assembling_ = false, zeroSequence_ = false;
  uint8_t nextSequence_ = 0;
  uint32_t stagingSender_ = 0, readySender_ = 0, readingSender_ = 0;
  uint32_t lastAssemblyUs_ = 0, readyAtUs_ = 0;
  Stats stats_{};
  void (*lock_)(); void (*unlock_)();
};
