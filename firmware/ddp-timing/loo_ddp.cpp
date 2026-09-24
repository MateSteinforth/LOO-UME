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

// FIRM-044 presentation mode and timing. Overlap is not saved: each boot waits for every transmission.
enum : uint8_t { PhaseIdle = 0, PhasePaint = 1, PhaseWire = 2 };
static std::atomic<bool> overlapRequested{false};
static std::atomic<uint8_t> phase{PhaseIdle};
static std::atomic<uint32_t> lastShownUs{0};
static std::atomic<uint32_t> wireEstimateUs{0};
static uint32_t lastServiceEndUs = 0;
static bool presentedInSession = false;

static constexpr uint32_t TimingEdgesUs[] = {500, 1000, 2000, 4000, 6000, 8000, 12000, 16000, 20000,
                                             24000, 28000, 32000, 36000, 40000, 50000, 67000, 100000};
static constexpr size_t TimingBins = sizeof(TimingEdgesUs) / sizeof(TimingEdgesUs[0]) + 1;

struct TimingHistogram {
  uint32_t count = 0, maxUs = 0;
  uint64_t sumUs = 0;
  uint32_t bins[TimingBins] = {};
  void add(uint32_t us) {
    ++count;
    sumUs += us;
    if (us > maxUs) maxUs = us;
    size_t bin = 0;
    while (bin + 1 < TimingBins && us > TimingEdgesUs[bin]) ++bin;
    ++bins[bin];
  }
};

struct Timing {
  uint32_t sinceMs = 0, complete = 0, presented = 0, overlapped = 0;
  uint32_t replacedLoop = 0, replacedPaint = 0, replacedWire = 0;
  TimingHistogram arrival, assembly, waitIdle, waitBusy, paint, show, latency, wire, present, loop;
};

static portMUX_TYPE timingMux = portMUX_INITIALIZER_UNLOCKED;
static Timing timing;
struct TimingGuard {
  TimingGuard() { portENTER_CRITICAL(&timingMux); }
  ~TimingGuard() { portEXIT_CRITICAL(&timingMux); }
};

static void recordMaximum(std::atomic<uint32_t>& counter, uint32_t value) {
  if (value > counter.load()) counter.store(value);
}

// A negative modular age comes from a time sample taken before a newer event.
static uint32_t positiveAge(uint32_t now, uint32_t then) {
  const uint32_t value = now - then;
  return value < 0x80000000u ? value : 0;
}

static bool overlapActive() { return overlapRequested.load() && !loo_dma_requested.load(); }

// WS2812 RGB at 800 kHz sends 24 bits of 1.25 us per pixel.
// The 300 us margin covers a 50 to 300 us reset and the staggered channel starts.
static uint32_t estimateWireUs() {
  uint32_t longest = 0;
  for (size_t i = 0; i < BusManager::getNumBusses(); ++i) {
    const Bus* bus = BusManager::getBus(i);
    if (bus && bus->getLength() > longest) longest = bus->getLength();
  }
  return longest * 30u + 300u;
}

// Records main-loop time outside the service while DDP owns the output.
struct ServiceScope {
  ~ServiceScope() { lastServiceEndUs = realtimeMode == REALTIME_MODE_DDP ? micros() : 0; }
};

void looDdpReceive(const uint8_t* packet, size_t length, uint32_t sender) {
  // The receiver does not access segments, buses, or runtime configuration.
  const uint8_t state = phase.load();
  const auto receipt = frames.receive(packet, length, sender, micros(), state);
  if (!receipt.complete) return;
  const uint32_t sinceShown = positiveAge(micros(), lastShownUs.load());
  TimingGuard guard;
  ++timing.complete;
  if (receipt.intervalUs) timing.arrival.add(receipt.intervalUs);
  timing.assembly.add(receipt.assemblyUs);
  if (!receipt.replaced) return;
  // The replaced frame waited for a paint, for a serialized transmission, or for the main loop.
  if (state == PhasePaint) ++timing.replacedPaint;
  else if (state == PhaseWire && !overlapActive() && sinceShown < wireEstimateUs.load()) ++timing.replacedWire;
  else ++timing.replacedLoop;
}

void looDdpExit() {
  frames.discard();
  observedComplete = frames.stats().complete;
  if (inFlight) aborted.fetch_add(1);
  inFlight = false;
  phase.store(PhaseIdle);
  presentedInSession = false;
}

void looDdpReset() {
  frames.configure(0);
  configuredBytes = 0;
  currentFrameBytes.store(0);
  if (inFlight) aborted.fetch_add(1);
  inFlight = false;
  phase.store(PhaseIdle);
  presentedInSession = false;
}

bool looDdpShowAllowed() {
  return submitting || realtimeMode != REALTIME_MODE_DDP || realtimeOverride;
}

bool looDdpSubmitting() { return submitting; }

void looDdpDidShow() {
  if (!submitting) {
    if (inFlight) aborted.fetch_add(1);
    inFlight = false;
    phase.store(PhaseIdle);
    return;
  }
  const uint32_t now = micros();
  if (inFlight) {
    // RMT overlap: the driver waited for the previous transmission before it started this one.
    if (txCompleted.load()) recordMaximum(maxCompleteGapUs, now - lastCompletedUs);
    lastCompletedUs = now;
    txCompleted.fetch_add(1);
  }
  if (presented.load()) recordMaximum(maxPresentGapUs, now - lastPresentedUs);
  if (presentedInSession) {
    TimingGuard guard;
    timing.present.add(now - lastPresentedUs);
  }
  presentedInSession = true;
  recordMaximum(maxPaintUs, now - serviceStartUs);
  lastPresentedUs = now;
  lastShownUs.store(now);
  presented.fetch_add(1);
  inFlight = true;
}

void looDdpService() {
  const size_t total = size_t(strip.getLengthTotal()) * 3;
  if (total != configuredBytes) {
    looDdpReset();
    if (frames.configure(total)) configuredBytes = total;
    currentFrameBytes.store(configuredBytes);
    wireEstimateUs.store(estimateWireUs());
  }
  const uint32_t now = micros();
  if (lastServiceEndUs && realtimeMode == REALTIME_MODE_DDP) {
    TimingGuard guard;
    timing.loop.add(now - lastServiceEndUs);
  }
  ServiceScope scope;
  frames.expire(now);
  const bool outputReady = BusManager::canAllShow();
  if (inFlight && outputReady) {
    if (txCompleted.load()) recordMaximum(maxCompleteGapUs, now - lastCompletedUs);
    lastCompletedUs = now;
    txCompleted.fetch_add(1);
    inFlight = false;
    phase.store(PhaseIdle);
    TimingGuard guard;
    timing.wire.add(now - lastPresentedUs);
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
  // By default, painting waits for the previous transmission. With RMT overlap, painting starts now.
  // The RMT driver keeps the transmitting buffer unchanged and starts this frame after that transmission.
  if (!outputReady && !overlapActive()) return;
  if (!strip.beginDdpFrame()) {
    paintBlocked.fetch_add(1);
    return;
  }
  phase.store(PhasePaint);
  const auto frame = frames.take(now);
  if (!frame.pixels) {
    strip.endDdpFrame();
    phase.store(inFlight ? PhaseWire : PhaseIdle);
    return;
  }
  const uint32_t takenUs = micros();
  realtimeIP = IPAddress(frame.sender);
  if (useMainSegmentOnly) {
    strip.getMainSegment().freeze = true;
  }
  serviceStartUs = takenUs;
  for (size_t i = 0; i < frame.size / 3; ++i) {
    setRealtimePixel(i + DMXAddress / 3, frame.pixels[3*i], frame.pixels[3*i+1], frame.pixels[3*i+2], 0);
  }
  const uint32_t paintedUs = micros();
  const bool previousInFlight = inFlight;
  const auto before = presented.load();
  submitting = true;
  strip.show();
  submitting = false;
  strip.endDdpFrame();
  const uint32_t shownUs = micros();
  const bool shown = presented.load() != before;
  if (!shown) failedShow.fetch_add(1);
  phase.store(inFlight ? PhaseWire : PhaseIdle);
  frames.release();
  TimingGuard guard;
  (frame.tag == PhaseIdle ? timing.waitIdle : timing.waitBusy).add(positiveAge(takenUs, frame.readyAtUs));
  timing.paint.add(paintedUs - takenUs);
  if (!shown) return;
  ++timing.presented;
  if (previousInFlight) ++timing.overlapped;
  timing.show.add(shownUs - paintedUs);
  timing.latency.add(positiveAge(shownUs, frame.readyAtUs));
}

void looDdpControl(int overlap, bool resetTiming) {
  if (overlap >= 0) overlapRequested.store(overlap != 0);
  if (!resetTiming) return;
  TimingGuard guard;
  timing = Timing{};
  timing.sinceMs = millis();
}

static void addHistogram(JsonObject parent, const char* name, const TimingHistogram& histogram) {
  JsonObject value = parent.createNestedObject(name);
  value["n"] = histogram.count;
  value["avg_us"] = histogram.count ? uint32_t(histogram.sumUs / histogram.count) : 0u;
  value["max_us"] = histogram.maxUs;
  JsonArray bins = value.createNestedArray("bins");
  for (uint32_t bin : histogram.bins) bins.add(bin);
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
  value["overlap_requested"] = overlapRequested.load();
  value["overlap_active"] = overlapActive();

  // JSON serialization holds WLED's JSON buffer lock, so one static copy is enough.
  static Timing snapshot;
  {
    TimingGuard guard;
    snapshot = timing;
  }
  JsonObject t = value.createNestedObject("timing");
  t["since_ms"] = snapshot.sinceMs;
  t["now_ms"] = millis();
  t["wire_estimate_us"] = wireEstimateUs.load();
  t["complete"] = snapshot.complete;
  t["presented"] = snapshot.presented;
  t["overlapped"] = snapshot.overlapped;
  t["replaced_loop"] = snapshot.replacedLoop;
  t["replaced_paint"] = snapshot.replacedPaint;
  t["replaced_wire"] = snapshot.replacedWire;
  JsonArray edges = t.createNestedArray("edges_us");
  for (uint32_t edge : TimingEdgesUs) edges.add(edge);
  addHistogram(t, "arrival", snapshot.arrival);
  addHistogram(t, "assembly", snapshot.assembly);
  addHistogram(t, "wait_idle", snapshot.waitIdle);
  addHistogram(t, "wait_busy", snapshot.waitBusy);
  addHistogram(t, "paint", snapshot.paint);
  addHistogram(t, "show", snapshot.show);
  addHistogram(t, "latency", snapshot.latency);
  addHistogram(t, "wire", snapshot.wire);
  addHistogram(t, "present", snapshot.present);
  addHistogram(t, "loop", snapshot.loop);
}
