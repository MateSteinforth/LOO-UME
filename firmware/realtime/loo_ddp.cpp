#include "wled.h"
#include "loo_ddp.h"

static portMUX_TYPE frameMux = portMUX_INITIALIZER_UNLOCKED;
static void lockFrames() { portENTER_CRITICAL(&frameMux); }
static void unlockFrames() { portEXIT_CRITICAL(&frameMux); }
static LooDdpFrames frames(lockFrames, unlockFrames);

void looDdpReceive(const uint8_t* packet, size_t length) {
  frames.receive(packet, length, size_t(strip.getLengthTotal())*3, micros());
}

void looDdpService() {
  // Claim realtime ownership before waiting: native refresh otherwise keeps buses busy.
  if (frames.hasReady() && !realtimeOverride) realtimeLock(realtimeTimeoutMs, REALTIME_MODE_DDP);
  // Do not wait on a bus or hold a lock while copying/painting pixels.
  if (!BusManager::canAllShow() || millis()-strip.getLastShow() <= 15) return;
  auto frame=frames.take();
  if (!frame.pixels) return;
  if (realtimeOverride) { frames.release(false, micros()); return; }
  realtimeLock(realtimeTimeoutMs, REALTIME_MODE_DDP);
  for (size_t i=0; i<frame.size/3; ++i)
    setRealtimePixel(i, frame.pixels[3*i], frame.pixels[3*i+1], frame.pixels[3*i+2], 0);
  strip.show();
  frames.release(true, micros());
}

LooDdpFrames::Stats looDdpStats() { return frames.stats(); }
