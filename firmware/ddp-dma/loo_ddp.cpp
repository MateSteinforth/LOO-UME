#include "wled.h"
#include "loo_ddp.h"
#include "loo_dma_status.h"

static portMUX_TYPE ddpMux = portMUX_INITIALIZER_UNLOCKED;
static void lockDdp() { portENTER_CRITICAL(&ddpMux); }
static void unlockDdp() { portEXIT_CRITICAL(&ddpMux); }
static DdpFrames frames(lockDdp, unlockDdp);

// The main loop owns presentation state. JSON reads only atomic counters.
static bool submitting = false;
static bool inFlight = false;
static size_t configuredBytes = 0;
static uint32_t observedComplete = 0;
static uint32_t lastPresentedUs = 0;
static uint32_t lastCompletedUs = 0;
static uint32_t serviceStartUs = 0;
static std::atomic<uint32_t> presented{0}, txCompleted{0}, aborted{0};
static std::atomic<uint32_t> failedShow{0}, unsupported{0};
static std::atomic<uint32_t> paintBlocked{0};
static std::atomic<uint32_t> maxPresentGapUs{0}, maxCompleteGapUs{0};
static std::atomic<uint32_t> maxPaintUs{0}, currentFrameBytes{0};

static void recordMaximum(std::atomic<uint32_t>& counter, uint32_t value) {
  if (value > counter.load()) counter.store(value);
}

void looDdpReceive(const uint8_t* packet, size_t length, uint32_t sender) {
  // The receiver does not access segments, buses, or runtime configuration.
  frames.receive(packet, length, sender, micros());
}

void looDdpExit() {
  frames.discard();
  observedComplete = frames.stats().complete;
  if (inFlight) aborted.fetch_add(1);
  inFlight = false;
}

void looDdpReset() {
  frames.configure(0);
  configuredBytes = 0;
  currentFrameBytes.store(0);
  if (inFlight) aborted.fetch_add(1);
  inFlight = false;
}

bool looDdpShowAllowed() {
  return submitting || realtimeMode != REALTIME_MODE_DDP || realtimeOverride;
}

bool looDdpSubmitting() { return submitting; }

void looDdpDidShow() {
  if (!submitting) {
    if (inFlight) aborted.fetch_add(1);
    inFlight = false;
    return;
  }
  const uint32_t now = micros();
  if (presented.load()) recordMaximum(maxPresentGapUs, now - lastPresentedUs);
  recordMaximum(maxPaintUs, now - serviceStartUs);
  lastPresentedUs = now;
  presented.fetch_add(1);
  inFlight = true;
}

void looDdpService() {
  const size_t total = size_t(strip.getLengthTotal()) * 3;
  if (total != configuredBytes) {
    looDdpReset();
    if (frames.configure(total)) configuredBytes = total;
    currentFrameBytes.store(configuredBytes);
  }
  const uint32_t now = micros();
  frames.expire(now);
  const bool outputReady = BusManager::canAllShow();
  if (inFlight && outputReady) {
    if (txCompleted.load()) recordMaximum(maxCompleteGapUs, now - lastCompletedUs);
    lastCompletedUs = now;
    txCompleted.fetch_add(1);
    inFlight = false;
  }
  if (realtimeOverride) {
    looDdpExit();
    return;
  }
  if (!configuredBytes && realtimeMode == REALTIME_MODE_DDP) {
    exitRealtime();
    return;
  }
  if (!frames.hasReady()) return;
  if (loo_dma_requested.load() &&
      (loo_dma_failure.load() || loo_dma_active_lanes.load() != 4)) {
    unsupported.fetch_add(1);
    looDdpExit();
    if (realtimeMode == REALTIME_MODE_DDP) exitRealtime();
    return;
  }

  // A complete frame stops autonomous refresh while the previous output finishes.
  const auto received = frames.stats().complete;
  if (received != observedComplete) {
    observedComplete = received;
    realtimeLock(realtimeTimeoutMs, REALTIME_MODE_DDP);
  }
  if (!outputReady) return;
  if (!strip.beginDdpFrame()) {
    paintBlocked.fetch_add(1);
    return;
  }
  const auto frame = frames.take(now);
  if (!frame.pixels) { strip.endDdpFrame(); return; }
  realtimeIP = IPAddress(frame.sender);
  if (useMainSegmentOnly) {
    strip.getMainSegment().freeze = true;
  }
  serviceStartUs = micros();
  for (size_t i = 0; i < frame.size / 3; ++i) {
    setRealtimePixel(i + DMXAddress / 3, frame.pixels[3*i], frame.pixels[3*i+1], frame.pixels[3*i+2], 0);
  }
  const auto before = presented.load();
  submitting = true;
  strip.show();
  submitting = false;
  strip.endDdpFrame();
  if (presented.load() == before) failedShow.fetch_add(1);
  frames.release();
}

void looDdpJson(JsonObject root) {
  const auto stats = frames.stats();
  JsonObject value = root.createNestedObject("loo_ddp");
  value["packets"] = stats.packets;
  value["complete"] = stats.complete;
  value["invalid"] = stats.invalid;
  value["incomplete"] = stats.incomplete;
  value["superseded"] = stats.superseded;
  value["expired"] = stats.expired;
  value["staging_discards"] = stats.stagingDiscards;
  value["ready_discards"] = stats.readyDiscards;
  value["sequence_gaps"] = stats.sequenceGaps;
  value["last_complete_us"] = stats.lastCompleteUs;
  value["max_receive_gap_us"] = stats.maxReceiveGapUs;
  value["presented"] = presented.load();
  value["tx_completed"] = txCompleted.load();
  value["tx_aborted_or_unobserved"] = aborted.load();
  value["failed_show"] = failedShow.load();
  value["unsupported"] = unsupported.load();
  value["paint_blocked"] = paintBlocked.load();
  value["max_present_gap_us"] = maxPresentGapUs.load();
  value["max_complete_gap_us"] = maxCompleteGapUs.load();
  value["max_paint_us"] = maxPaintUs.load();
  value["frame_bytes"] = currentFrameBytes.load();
  value["queue_storage_bytes"] = 3 * DdpFrames::Capacity;
}
