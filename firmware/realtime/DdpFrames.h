#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>

// One receiver task writes staging; one main-loop consumer holds reading.
// Only metadata changes under the supplied lock. Pixel copies never hold it.
class LooDdpFrames {
public:
  static constexpr size_t Capacity = 2624 * 3;
  struct Stats {
    uint32_t packets=0, complete=0, rejected=0, incomplete=0, replaced=0, submitted=0;
    uint32_t sequenceGaps=0, receiveGapsOver40ms=0, submitGapsOver40ms=0;
    uint32_t maxReceiveGapUs=0, maxSubmitGapUs=0, lastReceiveUs=0, lastSubmitUs=0;
  };
  struct Frame { const uint8_t* pixels; size_t size; };
  LooDdpFrames(void (*lock)(), void (*unlock)()) : lock_(lock), unlock_(unlock) {}

  void receive(const uint8_t* p, size_t length, size_t total, uint32_t now) {
    { Guard g(*this); ++stats_.packets; }
    if (length < 10 || total == 0 || total > Capacity || total % 3 ||
        (p[0] & ~1u) != 0x40 || p[2] != 0x0b || p[3] != 1) { reject(); return; }
    const size_t offset = (uint32_t(p[4])<<24) | (uint32_t(p[5])<<16) | (uint32_t(p[6])<<8) | p[7];
    const size_t count = (size_t(p[8])<<8) | p[9];
    const uint8_t sequence = p[1] & 15;
    const bool push = p[0] & 1;
    if (!count || count % 3 || offset % 3 || offset > total || count > total-offset || count != length-10) { reject(); return; }
    if (offset == 0) {
      Guard g(*this);
      if (assembling_) ++stats_.incomplete;
      if (lastSequence_ && sequence && sequence != next(lastSequence_)) ++stats_.sequenceGaps;
      assembling_ = true; nextOffset_ = 0; nextSequence_ = sequence; total_ = total;
    }
    if (!assembling_ || total_ != total || offset != nextOffset_ || sequence != nextSequence_) { reject(); return; }
    std::memcpy(buffers_[staging_].data()+offset, p+10, count);
    nextOffset_ += count;
    nextSequence_ = next(sequence);
    lastSequence_ = sequence;
    if (push != (nextOffset_ == total)) {
      if (push || nextOffset_ == total) reject();
      return;
    }
    if (!push) return;
    assembling_ = false;
    Guard g(*this);
    if (stats_.complete) {
      const uint32_t gap = now-stats_.lastReceiveUs;
      if (gap > stats_.maxReceiveGapUs) stats_.maxReceiveGapUs=gap;
      if (gap > 40000) ++stats_.receiveGapsOver40ms;
    }
    stats_.lastReceiveUs=now; ++stats_.complete;
    sizes_[staging_] = total;
    int spare = ready_;
    if (spare >= 0) ++stats_.replaced;
    else for (int i=0; i<3; ++i) if (i != staging_ && i != reading_) { spare=i; break; }
    ready_=staging_; staging_=spare;
  }

  bool hasReady() { Guard g(*this); return ready_ >= 0; }
  Frame take() {
    Guard g(*this);
    if (ready_ < 0 || reading_ >= 0) return {nullptr, 0};
    reading_=ready_; ready_=-1;
    return {buffers_[reading_].data(), sizes_[reading_]};
  }
  void release(bool submitted, uint32_t now) {
    Guard g(*this);
    if (reading_ < 0) return;
    if (submitted) {
      if (stats_.submitted) {
        const uint32_t gap=now-stats_.lastSubmitUs;
        if (gap > stats_.maxSubmitGapUs) stats_.maxSubmitGapUs=gap;
        if (gap > 40000) ++stats_.submitGapsOver40ms;
      }
      stats_.lastSubmitUs=now; ++stats_.submitted;
    }
    reading_=-1;
  }
  Stats stats() { Guard g(*this); return stats_; }
private:
  struct Guard { LooDdpFrames& owner; Guard(LooDdpFrames& o):owner(o){owner.lock_();} ~Guard(){owner.unlock_();} };
  static uint8_t next(uint8_t s) { return s ? s%15+1 : 0; }
  void reject() { Guard g(*this); ++stats_.rejected; if(assembling_) ++stats_.incomplete; assembling_=false; }
  std::array<uint8_t, Capacity> buffers_[3]{};
  size_t sizes_[3]{};
  int staging_=0, ready_=-1, reading_=-1;
  bool assembling_=false;
  size_t nextOffset_=0, total_=0;
  uint8_t nextSequence_=0, lastSequence_=0;
  Stats stats_{};
  void (*lock_)(); void (*unlock_)();
};
