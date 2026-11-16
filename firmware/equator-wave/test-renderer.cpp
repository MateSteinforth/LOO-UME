#include "EquatorWave.h"
#define PROGMEM
#include "EquatorMapping.h"
#include <assert.h>
#include <stdio.h>

int main() {
  loo_equator::State state;
  loo_equator::reset(state);
  loo_equator::advance(state, 0, 0, 0, 128, 128);
  assert(loo_equator::pixel(state, 0, 0, 0, 0xff7a18) == 0);
  loo_equator::advance(state, 24, 220, 0, 128, 128);
  const int16_t waveHeight = loo_equator::sine(state.phase) * int32_t(state.bass) * 72 / 32768;
  assert(loo_equator::pixel(state, 0, waveHeight, 0, 0xff7a18) != 0);
  assert(loo_equator::pixel(state, 0, 32767, 0, 0xff7a18) == 0);
  loo_equator::advance(state, 1000, 0, 0, 128, 128);
  assert(state.bass == 0 && state.treble == 0);
  loo_equator::reset(state);
  loo_equator::advance(state, 0xfffffff0, 220, 200, 128, 128);
  loo_equator::advance(state, 8, 0, 0, 128, 128);
  assert(state.elapsed == 24);
  assert(state.bass > 0 && state.treble > 0);

  loo_equator::reset(state);
  puts("{\"frames\":[");
  for (unsigned frame = 0; frame < 100; ++frame) {
    const uint32_t now = frame * 24;
    const uint8_t bass = frame >= 2 && frame < 12 ? 220 : 0;
    const uint8_t treble = frame >= 10 && frame < 16 ? 240 : 0;
    loo_equator::advance(state, now, bass, treble, 128, 128);
    uint32_t checksum = 2166136261U;
    unsigned lit = 0;
    for (uint32_t i = 0; i < EQUATOR_LED_COUNT; ++i) {
      const auto& point = EQUATOR_COORDINATES[i];
      const uint32_t color = loo_equator::pixel(state, point.longitude, point.height, i, 0xff7a18);
      checksum = (checksum ^ color) * 16777619U;
      if (color) ++lit;
    }
    printf("%s{\"time\":%u,\"bass\":%u,\"treble\":%u,\"checksum\":%u,\"lit\":%u,\"pixels\":[", frame ? "," : "", now, bass, treble, checksum, lit);
    bool first = true;
    for (uint32_t i = 0; i < EQUATOR_LED_COUNT; ++i) {
      const auto& point = EQUATOR_COORDINATES[i];
      const uint32_t color = loo_equator::pixel(state, point.longitude, point.height, i, 0xff7a18);
      if (!color) continue;
      printf("%s[%u,%u]", first ? "" : ",", i, color);
      first = false;
    }
    puts("]}");
  }
  puts("]}");
}
