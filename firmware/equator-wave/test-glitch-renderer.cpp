#include "GlitchAudio.h"
#define PROGMEM
#include "EquatorMapping.h"
#include <assert.h>
#include <stdio.h>

static void checkMonochrome(uint32_t color, uint32_t primary) {
  for (unsigned shift = 0; shift < 24; shift += 8) {
    if (((primary >> shift) & 255U) == 0U) assert(((color >> shift) & 255U) == 0U);
  }
}

int main() {
  loo_glitch::State state;
  loo_glitch::reset(state);
  loo_glitch::advance(state, 0, 0, 0, 0, 128, 128);
  for (uint8_t effect = 0; effect < 3; ++effect) assert(loo_glitch::pixel(state, effect, 0, 0, 0, 0xff0000) == 0);
  loo_glitch::advance(state, 24, 220, 160, 200, 128, 180);
  bool lit[3] = {};
  for (uint16_t i = 0; i < EQUATOR_LED_COUNT; ++i) {
    const auto& point = EQUATOR_COORDINATES[i];
    for (uint8_t effect = 0; effect < 3; ++effect) {
      const uint32_t color = loo_glitch::pixel(state, effect, point.longitude, point.height, i, 0xff0000);
      checkMonochrome(color, 0xff0000);
      lit[effect] = lit[effect] || color != 0;
    }
  }
  assert(lit[0] && lit[1] && lit[2]);
  bool upperRain = false;
  bool lowerRain = false;
  loo_glitch::reset(state);
  loo_glitch::advance(state, 0, 230, 0, 0, 128, 180);
  uint16_t rainLongitude = 0;
  bool foundColumn = false;
  for (uint16_t i = 0; i < EQUATOR_LED_COUNT; ++i) {
    const auto& point = EQUATOR_COORDINATES[i];
    if (loo_glitch::pixel(state, 1, point.longitude, point.height, i, 0xffffff)) {
      rainLongitude = point.longitude;
      foundColumn = true;
      break;
    }
  }
  assert(foundColumn);
  // One fixed column must cross both regions, regardless of other column offsets.
  for (uint32_t now = 0; now <= 6000; now += 120) {
    loo_glitch::advance(state, now, 230, 0, 0, 128, 180);
    for (int32_t height = -30000; height <= 30000; height += 1500) {
      if (loo_glitch::pixel(state, 1, rainLongitude, int16_t(height), 0, 0xffffff) == 0) continue;
      upperRain = upperRain || height > 12000;
      lowerRain = lowerRain || height < -12000;
    }
  }
  assert(upperRain && lowerRain);
  loo_glitch::advance(state, 7000, 0, 0, 0, 128, 180);
  assert(state.bass == 0 && state.mid == 0 && state.treble == 0);
  loo_glitch::reset(state);
  loo_glitch::advance(state, 0xfffffff0, 200, 160, 120, 255, 255);
  loo_glitch::advance(state, 8, 0, 0, 0, 255, 255);
  assert(state.elapsed == 24);
  puts("glitch renderer checks passed");
}
