#pragma once

#include <stdint.h>

// The browser and ESP32 compile this same integer renderer.
namespace loo_equator {

struct State {
  uint32_t seed;
  uint32_t epoch;
  uint32_t previous;
  uint32_t elapsed;
  uint16_t phase;
  uint16_t bass;
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

inline int32_t sine(uint16_t phase) {
  const int32_t x = phase < 32768 ? phase : int32_t(phase) - 65536;
  const int32_t magnitude = x < 0 ? -x : x;
  return int32_t((int64_t(4) * x * (32768 - magnitude)) / 32768);
}

inline uint16_t level(uint8_t input, uint8_t intensity) {
  uint32_t value = uint32_t(input) * (64 + intensity) / 192;
  value = value > 255 ? 255 : value;
  return value > 16 ? uint16_t(value - 16) : 0;
}

inline uint16_t envelope(uint16_t previous, uint16_t target, uint32_t delta, uint32_t release) {
  if (target >= previous) return target;
  if (delta >= release) return target;
  // Round the decay upward so silence reaches zero.
  return previous - uint16_t(((previous - target) * delta + release - 1) / release);
}

inline void advance(State& state, uint32_t now, uint8_t bass, uint8_t treble,
                    uint8_t speed, uint8_t intensity) {
  if (!state.started) {
    state.started = true;
    state.epoch = now;
    state.previous = now;
  }
  const uint32_t delta = now - state.previous;
  state.previous = now;
  state.elapsed = now - state.epoch;
  state.phase = uint16_t(state.elapsed * (8U + speed / 4U));
  state.bass = envelope(state.bass, level(bass, intensity), delta, 280);
  state.treble = envelope(state.treble, level(treble, intensity), delta, 100);
}

inline uint32_t pixel(const State& state, uint16_t longitude, int16_t height,
                      uint32_t logicalIndex, uint32_t primaryColor) {
  if (!state.started) return 0;
  const int32_t amplitude = int32_t(state.bass) * 72;
  const int32_t waveHeight = sine(uint16_t(longitude + state.phase)) * amplitude / 32768;
  int32_t distance = int32_t(height) - waveHeight;
  if (distance < 0) distance = -distance;
  constexpr int32_t width = 1800;
  const uint32_t strength = state.bass * 2U > 255 ? 255 : state.bass * 2U;
  const uint32_t wave = distance < width ? strength * (width - distance) / width : 0;
  const uint32_t bucket = state.elapsed / 120;
  const uint32_t random = hash(logicalIndex ^ state.seed ^ (bucket * 0x9e3779b9U));
  const uint32_t sparkle = (random & 4095U) < state.treble / 8U
      ? uint32_t(state.treble) * (120 - state.elapsed % 120) / 120 : 0;
  uint32_t color = 0;
  for (uint8_t shift = 0; shift < 24; shift += 8) {
    const uint32_t channel = ((primaryColor >> shift) & 255U) * wave / 255 + sparkle;
    color |= (channel > 255 ? 255 : channel) << shift;
  }
  return color;
}

} // namespace loo_equator
