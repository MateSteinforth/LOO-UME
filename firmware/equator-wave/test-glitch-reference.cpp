#include "GlitchAudio.h"
#define PROGMEM
#include "EquatorMapping.h"
#include <stdio.h>

struct Frame {
  const char* name;
  uint8_t effect;
  uint8_t bass;
  uint8_t mid;
  uint8_t treble;
  uint8_t speed;
  uint8_t intensity;
  uint32_t color;
  uint32_t seed;
  uint32_t now;
  bool reset;
};

int main() {
  const Frame frames[] = {
      {"packet-silence-white", 0, 0, 0, 0, 128, 180, 0xffffff, 0x1a2b3c4d, 48, true},
      {"packet-bass-red", 0, 230, 0, 0, 128, 180, 0xff0000, 0x1a2b3c4d, 48, true},
      {"packet-mid-white", 0, 0, 230, 0, 128, 180, 0xffffff, 0x1a2b3c4d, 48, true},
      {"packet-treble-red", 0, 0, 0, 250, 128, 180, 0xff0000, 0x1a2b3c4d, 48, true},
      {"packet-later-white", 0, 220, 170, 210, 128, 180, 0xffffff, 0x1a2b3c4d, 480, false},
      {"packet-silence-decay-red", 0, 0, 0, 0, 128, 180, 0xff0000, 0x1a2b3c4d, 600, false},
      {"packet-silence-black-white", 0, 0, 0, 0, 128, 180, 0xffffff, 0x1a2b3c4d, 1400, false},
      {"packet-fast-white", 0, 220, 170, 210, 255, 255, 0xffffff, 0x5a5a5a5a, 960, true},
      {"rain-silence-red", 1, 0, 0, 0, 128, 180, 0xff0000, 0x1a2b3c4d, 48, true},
      {"rain-bass-white", 1, 230, 0, 0, 128, 180, 0xffffff, 0x1a2b3c4d, 48, true},
      {"rain-mid-red", 1, 0, 230, 0, 128, 180, 0xff0000, 0x1a2b3c4d, 48, true},
      {"rain-treble-white", 1, 0, 0, 250, 128, 180, 0xffffff, 0x1a2b3c4d, 48, true},
      {"rain-later-red", 1, 220, 170, 210, 128, 180, 0xff0000, 0x1a2b3c4d, 2400, false},
      {"rain-silence-decay-white", 1, 0, 0, 0, 128, 180, 0xffffff, 0x1a2b3c4d, 2520, false},
      {"rain-silence-black-red", 1, 0, 0, 0, 128, 180, 0xff0000, 0x1a2b3c4d, 3400, false},
      {"rain-slow-red", 1, 220, 170, 210, 8, 40, 0xff0000, 0x5a5a5a5a, 960, true},
      {"gates-silence-white", 2, 0, 0, 0, 128, 180, 0xffffff, 0x1a2b3c4d, 48, true},
      {"gates-bass-red", 2, 230, 0, 0, 128, 180, 0xff0000, 0x1a2b3c4d, 48, true},
      {"gates-mid-white", 2, 0, 230, 0, 128, 180, 0xffffff, 0x1a2b3c4d, 48, true},
      {"gates-treble-red", 2, 0, 0, 250, 128, 180, 0xff0000, 0x1a2b3c4d, 48, true},
      {"gates-later-white", 2, 220, 170, 210, 128, 180, 0xffffff, 0x1a2b3c4d, 480, false},
      {"gates-silence-decay-red", 2, 0, 0, 0, 128, 180, 0xff0000, 0x1a2b3c4d, 600, false},
      {"gates-silence-black-white", 2, 0, 0, 0, 128, 180, 0xffffff, 0x1a2b3c4d, 1400, false},
      {"gates-fast-white", 2, 220, 170, 210, 255, 255, 0xffffff, 0x5a5a5a5a, 960, true},
  };
  puts("{\"renderer\":\"glitch-audio-v1\",\"coordinateCount\":656,\"coordinates\":[");
  for (uint16_t sample = 0; sample < 656; ++sample) {
    const uint16_t index = uint16_t(sample * 4U);
    const auto& point = EQUATOR_COORDINATES[index];
    printf("%s[%u,%d,%u]", sample ? "," : "", point.longitude, point.height, index);
  }
  puts("],\"frames\":[");
  loo_glitch::State state;
  for (uint8_t frame = 0; frame < sizeof(frames) / sizeof(frames[0]); ++frame) {
    const Frame& input = frames[frame];
    if (input.reset) {
      loo_glitch::reset(state, input.seed);
      loo_glitch::advance(state, 0, 0, 0, 0, input.speed, input.intensity);
    }
    loo_glitch::advance(state, input.now, input.bass, input.mid, input.treble, input.speed, input.intensity);
    printf("%s{\"name\":\"%s\",\"reset\":%s,\"input\":{\"effect\":%u,\"now\":%u,\"bass\":%u,\"mid\":%u,\"treble\":%u,\"speed\":%u,\"intensity\":%u,\"primaryColor\":%u,\"seed\":%u},\"pixels\":[",
           frame ? "," : "", input.name, input.reset ? "true" : "false", input.effect, input.now, input.bass, input.mid, input.treble,
           input.speed, input.intensity, input.color, input.seed);
    for (uint16_t sample = 0; sample < 656; ++sample) {
      const uint16_t index = uint16_t(sample * 4U);
      const auto& point = EQUATOR_COORDINATES[index];
      printf("%s%u", sample ? "," : "", loo_glitch::pixel(state, input.effect, point.longitude, point.height, index, input.color));
    }
    puts("]}");
  }
  puts("]}");
}
