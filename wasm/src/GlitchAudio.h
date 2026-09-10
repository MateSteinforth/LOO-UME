#pragma once

#include <stdint.h>

// The browser and ESP32 compile this same integer renderer.
namespace loo_glitch {

struct State {
  uint32_t seed;
  uint32_t epoch;
  uint32_t previous;
  uint32_t elapsed;
  uint16_t phase;
  uint16_t bass;
  uint16_t mid;
  uint16_t treble;
  bool started;
};

inline void reset(State& state, uint32_t seed = 0x1a2b3c4d) {
  state = {};
  state.seed = seed;
}

inline uint32_t hash(uint32_t value) {
  value ^= value >> 16;
  value *= 0x7feb352dU;
  value ^= value >> 15;
  value *= 0x846ca68bU;
  return value ^ (value >> 16);
}

inline uint16_t level(uint8_t input, uint8_t intensity) {
  uint32_t value = uint32_t(input) * (64U + intensity) / 192U;
  value = value > 255U ? 255U : value;
  return value > 12U ? uint16_t(value - 12U) : 0;
}

inline uint16_t envelope(uint16_t previous, uint16_t target, uint32_t delta, uint32_t release) {
  if (target >= previous) return target;
  if (delta >= release) return target;
  return previous - uint16_t(((uint32_t(previous - target) * delta) + release - 1U) / release);
}

inline void advance(State& state, uint32_t now, uint8_t bass, uint8_t mid, uint8_t treble,
                    uint8_t speed, uint8_t intensity) {
  if (!state.started) {
    state.started = true;
    state.epoch = now;
    state.previous = now;
  }
  const uint32_t delta = now - state.previous;
  state.previous = now;
  state.elapsed = now - state.epoch;
  state.phase = uint16_t(state.elapsed * (4U + speed / 3U));
  state.bass = envelope(state.bass, level(bass, intensity), delta, 360U);
  state.mid = envelope(state.mid, level(mid, intensity), delta, 240U);
  state.treble = envelope(state.treble, level(treble, intensity), delta, 100U);
}

inline uint32_t scaleColor(uint32_t color, uint8_t strength) {
  // Preserve a deliberate red primary. All other saved WLED colors select white.
  const bool red = (color & 0x00ffffU) == 0U && ((color >> 16) & 255U) != 0U;
  return red ? uint32_t(strength) << 16 : uint32_t(strength) * 0x010101U;
}

inline uint8_t maximum(uint16_t first, uint16_t second, uint16_t third) {
  uint16_t value = first > second ? first : second;
  value = value > third ? value : third;
  return value > 255U ? 255U : uint8_t(value);
}

inline uint8_t packetFault(const State& state, uint16_t longitude, int16_t height,
                           uint32_t logicalIndex) {
  const uint16_t band = uint16_t((int32_t(height) + 32768) / 9000);
  const uint16_t shifted = uint16_t(int32_t(height) + int32_t(state.phase / 16U) * (18 + state.bass / 16U));
  const uint16_t stripe = uint16_t((shifted + 32768) / 9000);
  const bool horizontalBand = (stripe % 3U) == 0U || (band % 5U) == 2U;
  const uint16_t gapWidth = uint16_t(3200U + state.mid * 24U);
  const uint16_t gapPosition = uint16_t((uint32_t(longitude) + state.phase * 3U) % 16000U);
  const bool largeGap = gapPosition < gapWidth;
  const uint32_t random = hash(logicalIndex ^ state.seed ^ (state.elapsed / 60U));
  const bool error = (random & 1023U) < state.treble / 5U;
  if (!horizontalBand || largeGap) return error ? uint8_t(state.treble) : 0;
  const uint16_t strength = uint16_t(state.bass) + state.mid / 3U + (error ? state.treble / 2U : 0U);
  return strength > 255U ? 255U : uint8_t(strength);
}

inline uint8_t bitRain(const State& state, uint16_t longitude, int16_t height,
                       uint32_t logicalIndex) {
  const uint16_t column = longitude / 8192U;
  const uint32_t random = hash(column ^ state.seed);
  // Positive height is top. The wrapped phase moves each head down through all heights.
  const int32_t fall = int32_t(uint16_t(65535U - state.phase - (random & 65535U)));
  const int32_t y = int32_t(height) + 32768;
  const uint16_t trail = uint16_t(6000U + state.mid * 80U);
  int32_t distance = y - fall;
  if (distance < 0) distance += 65536;
  const bool wideColumn = ((longitude + (random >> 14)) % 8192U) < uint16_t(3000U + state.bass * 12U);
  const bool block = distance < uint16_t(2000U + state.bass * 18U);
  const bool trailPixel = distance < trail;
  const bool edge = distance + 180 > int32_t(trail) && distance < int32_t(trail) + 180;
  const bool brokenEdge = edge && ((hash(logicalIndex ^ state.seed ^ (state.elapsed / 48U)) & 255U) < state.treble);
  if (!wideColumn || (!block && !trailPixel && !brokenEdge)) return 0;
  const uint16_t strength = block ? uint16_t(state.bass) + state.mid / 3U : state.mid;
  return maximum(strength, brokenEdge ? state.treble : 0U, 0U);
}

inline uint8_t spectralGates(const State& state, uint16_t longitude, int16_t height,
                             uint32_t) {
  const uint16_t moving = uint16_t(int32_t(height) + int32_t(state.phase / 11U));
  const uint16_t shutter = uint16_t((moving + 32768) % 14000U);
  const uint16_t opening = uint16_t(1500U + state.bass * 32U);
  const bool horizontalOpening = shutter < opening;
  const uint16_t cut = uint16_t((uint32_t(longitude) + state.phase * 2U) % 9800U);
  const uint16_t cutWidth = uint16_t(1600U + state.mid * 26U);
  const bool verticalCut = cut < cutWidth;
  const uint32_t gateTile = uint32_t(longitude / 8192U) ^
      (uint32_t(int32_t(height) + 32768) / 7000U << 8) ^ (state.elapsed / 120U);
  const bool interruption = (hash(gateTile ^ state.seed) & 511U) < state.treble / 3U;
  if ((!horizontalOpening && !verticalCut) || interruption) return 0;
  return maximum(state.bass, state.mid, state.treble / 3U);
}

inline uint32_t pixel(const State& state, uint8_t effect, uint16_t longitude, int16_t height,
                      uint32_t logicalIndex, uint32_t primaryColor) {
  if (!state.started || (state.bass == 0U && state.mid == 0U && state.treble == 0U)) return 0;
  uint8_t strength = 0;
  if (effect == 0U) strength = packetFault(state, longitude, height, logicalIndex);
  else if (effect == 1U) strength = bitRain(state, longitude, height, logicalIndex);
  else if (effect == 2U) strength = spectralGates(state, longitude, height, logicalIndex);
  return scaleColor(primaryColor, strength);
}

} // namespace loo_glitch
