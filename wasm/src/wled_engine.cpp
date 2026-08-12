#include "wled_wasm.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <vector>

#include "fastled_slim.h"

using byte = std::uint8_t;
using std::max;

namespace {

constexpr std::uint32_t BLACK = 0x000000;
constexpr std::uint32_t ULTRAWHITE = 0xFFFFFFFF;
constexpr std::uint32_t WHITE = 0xFFFFFF;
constexpr std::uint32_t FRAMETIME = 1000 / 42;
constexpr std::uint8_t paletteBlend = 0;
constexpr bool PALETTE_SOLID_WRAP = true;
constexpr std::uint32_t MAX_LED_COUNT = 200000;

constexpr std::uint32_t rgbw32(std::uint8_t r, std::uint8_t g, std::uint8_t b, std::uint8_t w = 0) {
  return (std::uint32_t(w) << 24U) | (std::uint32_t(r) << 16U) | (std::uint32_t(g) << 8U) | std::uint32_t(b);
}

constexpr std::uint8_t red(std::uint32_t color) { return std::uint8_t(color >> 16U); }
constexpr std::uint8_t green(std::uint32_t color) { return std::uint8_t(color >> 8U); }
constexpr std::uint8_t blue(std::uint32_t color) { return std::uint8_t(color); }

std::vector<std::uint32_t> g_pixels;
std::uint32_t g_oob_writes = 0;
std::uint32_t g_rng_state = 0x1A2B3C4D;
std::uint32_t g_effect_id = 8;

struct AudioInput {
  float volume = 0.0F;
  float peak = 0.0F;
  std::array<float, 64> fft{};
  std::uint32_t bin_count = 0;
} g_audio;

struct StripClock {
  std::uint32_t now = 0;
} strip;

long map(long value, long in_min, long in_max, long out_min, long out_max) {
  if (in_max == in_min) return out_min;
  return (value - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

std::uint32_t millis() {
  return strip.now;
}

// Exact integer approximation used by current WLED wled_math.cpp.
std::int16_t sin16_t(std::uint16_t theta) {
  int scale = 1;
  if (theta > 0x7FFF) {
    theta = 0xFFFF - theta;
    scale = -1;
  }
  std::uint32_t precal = theta * (0x7FFF - theta);
  std::uint64_t numerator = std::uint64_t(precal) * (4 * 0x7FFF);
  std::int32_t denominator = 1342095361 - precal;
  std::int16_t result = numerator / denominator;
  return result * scale;
}

std::uint8_t sin8_t(std::uint8_t theta) {
  std::int32_t sin16 = sin16_t(std::uint16_t(theta) * 257);
  sin16 += 0x7FFF + 128;
  return std::min(sin16, std::int32_t(0xFFFF)) >> 8;
}

std::uint16_t beat88(std::uint16_t beats_per_minute_88, std::uint32_t timebase = 0) {
  return ((millis() - timebase) * beats_per_minute_88 * 280) >> 16;
}

std::uint16_t beat16(std::uint16_t beats_per_minute, std::uint32_t timebase = 0) {
  if (beats_per_minute < 256) beats_per_minute <<= 8;
  return beat88(beats_per_minute, timebase);
}

std::uint8_t beat8(std::uint16_t beats_per_minute, std::uint32_t timebase = 0) {
  return beat16(beats_per_minute, timebase) >> 8;
}

std::uint8_t beatsin8_t(
  std::uint16_t beats_per_minute,
  std::uint8_t lowest = 0,
  std::uint8_t highest = 255,
  std::uint32_t timebase = 0,
  std::uint8_t phase_offset = 0
) {
  std::uint8_t beat = beat8(beats_per_minute, timebase);
  std::uint8_t beatsin = sin8_t(beat + phase_offset);
  std::uint8_t rangewidth = highest - lowest;
  std::uint8_t scaledbeat = scale8(beatsin, rangewidth);
  return lowest + scaledbeat;
}

std::uint16_t beatsin16_t(
  std::uint16_t beats_per_minute,
  std::uint16_t lowest = 0,
  std::uint16_t highest = 65535,
  std::uint32_t timebase = 0,
  std::uint16_t phase_offset = 0
) {
  std::uint16_t beat = beat16(beats_per_minute, timebase);
  std::uint16_t beatsin = sin16_t(beat + phase_offset) + 32768;
  std::uint16_t rangewidth = highest - lowest;
  std::uint16_t scaledbeat = scale16(beatsin, rangewidth);
  return lowest + scaledbeat;
}

// Exact current WLED channel-pair blend implementation.
std::uint32_t color_blend(std::uint32_t color1, std::uint32_t color2, std::uint8_t blend) {
  constexpr std::uint32_t TWO_CHANNEL_MASK = 0x00FF00FF;
  std::uint32_t rb1 =  color1       & TWO_CHANNEL_MASK;
  std::uint32_t wg1 = (color1 >> 8) & TWO_CHANNEL_MASK;
  std::uint32_t rb2 =  color2       & TWO_CHANNEL_MASK;
  std::uint32_t wg2 = (color2 >> 8) & TWO_CHANNEL_MASK;
  std::uint32_t rb3 = ((((rb1 << 8) | rb2) + (rb2 * blend) - (rb1 * blend)) >> 8) &  TWO_CHANNEL_MASK;
  std::uint32_t wg3 = ((((wg1 << 8) | wg2) + (wg2 * blend) - (wg1 * blend)))      & ~TWO_CHANNEL_MASK;
  return rb3 | wg3;
}

std::uint32_t color_fade(std::uint32_t color, std::uint8_t amount, bool video = false) {
  if (color == BLACK || amount == 0) return 0;
  if (amount == 255) return color;
  const std::uint32_t scale = amount + 1U;
  std::uint8_t r = (red(color) * scale) >> 8U;
  std::uint8_t g = (green(color) * scale) >> 8U;
  std::uint8_t b = (blue(color) * scale) >> 8U;
  if (video) {
    if (red(color) && !r) r = 1;
    if (green(color) && !g) g = 1;
    if (blue(color) && !b) b = 1;
  }
  return rgbw32(r, g, b);
}

// Seven standard FastLED palettes copied from current WLED palettes.cpp.
const std::array<CRGBPalette16, 7> PALETTES = {
  CRGBPalette16(
    CRGB(0x9B00D5), CRGB(0xBD00B8), CRGB(0xDA0092), CRGB(0xF3005C),
    CRGB(0xF45500), CRGB(0xDC8F00), CRGB(0xD5B400), CRGB(0xD5D500),
    CRGB(0xD59B00), CRGB(0xEF6600), CRGB(0xF90044), CRGB(0xE10086),
    CRGB(0xC400B0), CRGB(0xA300CF), CRGB(0x7600E8), CRGB(0x0032FC)
  ),
  CRGBPalette16(
    CRGB::Blue, CRGB::DarkBlue, CRGB::DarkBlue, CRGB::DarkBlue,
    CRGB::DarkBlue, CRGB::DarkBlue, CRGB::DarkBlue, CRGB::DarkBlue,
    CRGB::Blue, CRGB::DarkBlue, CRGB::SkyBlue, CRGB::SkyBlue,
    CRGB::LightBlue, CRGB::White, CRGB::LightBlue, CRGB::SkyBlue
  ),
  CRGBPalette16(
    CRGB::Black, CRGB::Maroon, CRGB::Black, CRGB::Maroon,
    CRGB::DarkRed, CRGB::DarkRed, CRGB::Maroon, CRGB::DarkRed,
    CRGB::DarkRed, CRGB::DarkRed, CRGB::Red, CRGB::Orange,
    CRGB::White, CRGB::Orange, CRGB::Red, CRGB::DarkRed
  ),
  CRGBPalette16(
    CRGB::MidnightBlue, CRGB::DarkBlue, CRGB::MidnightBlue, CRGB::Navy,
    CRGB::DarkBlue, CRGB::MediumBlue, CRGB::SeaGreen, CRGB::Teal,
    CRGB::CadetBlue, CRGB::Blue, CRGB::DarkCyan, CRGB::CornflowerBlue,
    CRGB::Aquamarine, CRGB::SeaGreen, CRGB::Aqua, CRGB::LightSkyBlue
  ),
  CRGBPalette16(
    CRGB::DarkGreen, CRGB::DarkGreen, CRGB::DarkOliveGreen, CRGB::DarkGreen,
    CRGB::Green, CRGB::ForestGreen, CRGB::OliveDrab, CRGB::Green,
    CRGB::SeaGreen, CRGB::MediumAquamarine, CRGB::LimeGreen, CRGB::YellowGreen,
    CRGB::LightGreen, CRGB::LawnGreen, CRGB::MediumAquamarine, CRGB::ForestGreen
  ),
  CRGBPalette16(
    CRGB(0xFF0000), CRGB(0xEB7000), CRGB(0xD59B00), CRGB(0xD5BA00),
    CRGB(0xD5D500), CRGB(0x9CEB00), CRGB(0x00FF00), CRGB(0x00EB70),
    CRGB(0x00D59B), CRGB(0x009CD4), CRGB(0x0000FF), CRGB(0x7000EB),
    CRGB(0x9B00D5), CRGB(0xBA00BB), CRGB(0xD5009B), CRGB(0xEB0072)
  ),
  CRGBPalette16(
    CRGB(0xFF0000), CRGB(0x000000), CRGB(0xD59B00), CRGB(0x000000),
    CRGB(0xD5D500), CRGB(0x000000), CRGB(0x00FF00), CRGB(0x000000),
    CRGB(0x00D59B), CRGB(0x000000), CRGB(0x0000FF), CRGB(0x000000),
    CRGB(0x9B00D5), CRGB(0x000000), CRGB(0xD5009B), CRGB(0x000000)
  )
};

std::uint32_t color_from_fastled_palette(
  const CRGBPalette16 &palette,
  unsigned index,
  std::uint8_t brightness,
  TBlendType blend_type
) {
  if (blend_type == LINEARBLEND_NOWRAP) index = (index * 0xF0) >> 8;
  unsigned hi4 = byte(index) >> 4;
  unsigned lo4 = index & 0x0F;
  const CRGB *entry = &(palette[0]) + hi4;
  unsigned r = entry->r;
  unsigned g = entry->g;
  unsigned b = entry->b;
  if (lo4 && blend_type != NOBLEND) {
    entry = hi4 == 15 ? &(palette[0]) : entry + 1;
    unsigned f2 = lo4 << 4;
    unsigned f1 = 256 - f2;
    r = (r * f1 + unsigned(entry->r) * f2) >> 8;
    g = (g * f1 + unsigned(entry->g) * f2) >> 8;
    b = (b * f1 + unsigned(entry->b) * f2) >> 8;
  }
  if (brightness < 255) {
    std::uint32_t scale = brightness + 1;
    r = (r * scale) >> 8;
    g = (g * scale) >> 8;
    b = (b * scale) >> 8;
  }
  return rgbw32(r, g, b);
}

std::uint32_t next_random() {
  std::uint32_t x = g_rng_state;
  x ^= x << 13U;
  x ^= x >> 17U;
  x ^= x << 5U;
  g_rng_state = x;
  return x;
}

std::uint8_t hw_random8() {
  return std::uint8_t(next_random() >> 24U);
}

std::uint32_t hw_random() {
  return next_random();
}

std::uint8_t hw_random8(std::uint32_t upperlimit) {
  return (std::uint32_t(hw_random8()) * upperlimit) >> 8U;
}

std::uint16_t hw_random16(std::uint32_t upperlimit) {
  return (std::uint32_t(std::uint16_t(next_random() >> 16U)) * upperlimit) >> 16U;
}

std::uint8_t get_random_wheel_index(std::uint8_t pos) {
  std::uint8_t r = 0;
  std::uint8_t distance = 0;
  do {
    r = hw_random8();
    const std::uint8_t x = std::uint8_t(std::abs(int(pos) - int(r)));
    const std::uint8_t y = 255 - x;
    distance = std::min(x, y);
  } while (distance < 42);
  return r;
}

struct Segment {
  std::uint8_t speed = 128;
  std::uint8_t intensity = 128;
  std::uint8_t palette = 6;
  std::uint32_t colors[3] = {0xFF7A18, 0x050816, 0x2DD4BF};
  std::uint32_t step = 0;
  std::uint16_t aux0 = 0;
  std::uint16_t aux1 = 0;
  std::uint32_t call = 0;
  bool check2 = false;

  unsigned vLength() const {
    return g_pixels.size();
  }

  void setPixelColor(int index, std::uint32_t color) {
    if (index < 0 || std::size_t(index) >= g_pixels.size()) {
      ++g_oob_writes;
      return;
    }
    g_pixels[std::size_t(index)] = color;
  }

  void fill(std::uint32_t color) {
    std::fill(g_pixels.begin(), g_pixels.end(), color);
  }

  std::uint32_t color_wheel(std::uint8_t pos) const {
    if (palette) return color_from_palette(pos, false, true, 0);
    std::uint8_t rgb[4] = {};
    hsv2rgb_rainbow(std::uint16_t(pos) << 8U, 255, 255, rgb, true);
    return rgbw32(rgb[2], rgb[1], rgb[0]);
  }

  std::uint32_t color_from_palette(
    std::uint16_t index,
    bool mapping,
    bool moving,
    std::uint8_t color_slot,
    std::uint8_t brightness = 255
  ) const {
    const std::uint32_t fallback = colors[std::min<std::uint8_t>(color_slot, 2)];
    if (palette == 0 && color_slot < 3) return color_fade(fallback, brightness, true);
    unsigned palette_index = index;
    if (mapping && vLength()) palette_index = std::min((unsigned(index) * 255U) / vLength(), 255U);
    const TBlendType blend = moving ? LINEARBLEND : LINEARBLEND_NOWRAP;
    const std::size_t selected = palette == 0 ? 0 : std::min<std::size_t>(palette - 1, PALETTES.size() - 1);
    return color_from_fastled_palette(PALETTES[selected], palette_index, brightness, blend);
  }

  void fade_out(std::uint8_t rate) {
    rate = (256-rate) >> 1;
    const int mappedRate = 256 / (rate + 1);
    for (std::uint32_t &pixel : g_pixels) {
      std::uint32_t color = pixel;
      if (color == colors[1]) continue;
      for (int i = 0; i < 32; i += 8) {
        std::uint8_t c2 = colors[1] >> i;
        std::uint8_t c1 = color >> i;
        int delta = (c2 - c1) * mappedRate / 256;
        if (delta == 0) delta += (c2 == c1) ? 0 : (c2 > c1) ? 1 : -1;
        color &= ~(0xFFU << i);
        color |= std::uint32_t((c1 + delta) & 0xFF) << i;
      }
      pixel = color;
    }
  }
} g_segment;

std::uint8_t sin_gap(std::uint16_t input) {
  if (input & 0x100) return 0;
  return sin8_t(input + 192);
}

#define SEGMENT g_segment
#define SEGENV g_segment
#define SEGCOLOR(index) (g_segment.colors[(index)])
#define SEGLEN (g_segment.vLength())
#define FX_FALLBACK_STATIC { mode_static(); return; }

#include "wled_effects.inc"

using EffectFunction = void (*)();

struct EffectEntry {
  const char *name;
  EffectFunction function;
};

constexpr std::array<EffectEntry, 30> EFFECTS = {{
  {"Solid", mode_static},
  {"Blink", mode_blink},
  {"Strobe", mode_strobe},
  {"Wipe", mode_color_wipe},
  {"Sweep", mode_color_sweep},
  {"Breathe", mode_breath},
  {"Fade", mode_fade},
  {"Colorloop", mode_rainbow},
  {"Rainbow", mode_rainbow_cycle},
  {"Scan", mode_scan},
  {"Scan Dual", mode_dual_scan},
  {"Theater", mode_theater_chase},
  {"Theater Rainbow", mode_theater_chase_rainbow},
  {"Running", mode_running_lights},
  {"Saw", mode_saw},
  {"Bpm", mode_bpm},
  {"Solid Pattern", mode_static_pattern},
  {"Solid Pattern Tri", mode_tri_static_pattern},
  {"Blink Rainbow", mode_blink_rainbow},
  {"Strobe Rainbow", mode_strobe_rainbow},
  {"Twinkle", mode_twinkle},
  {"Sparkle", mode_sparkle},
  {"Sparkle Dark", mode_flash_sparkle},
  {"Sparkle+", mode_hyper_sparkle},
  {"Strobe Mega", mode_multi_strobe},
  {"Sinelon", mode_sinelon},
  {"Sinelon Dual", mode_sinelon_dual},
  {"Sinelon Rainbow", mode_sinelon_rainbow},
  {"Glitter", mode_glitter},
  {"Solid Glitter", mode_solid_glitter}
}};

constexpr std::array<const char *, 8> PALETTE_NAMES = {
  "Default", "Party", "Cloud", "Lava", "Ocean", "Forest", "Rainbow", "Rainbow Bands"
};

void reset_runtime() {
  g_segment.step = 0;
  g_segment.aux0 = 0;
  g_segment.aux1 = 0;
  g_segment.call = 0;
  strip.now = 0;
}

} // namespace

extern "C" {

int wled_init(std::uint32_t led_count) {
  return wled_resize(led_count);
}

int wled_resize(std::uint32_t led_count) {
  if (led_count == 0 || led_count > MAX_LED_COUNT) return 0;
  try {
    g_pixels.assign(led_count, 0);
  } catch (...) {
    return 0;
  }
  g_oob_writes = 0;
  reset_runtime();
  return 1;
}

void wled_reset(std::uint32_t seed) {
  g_rng_state = seed ? seed : 1;
  std::fill(g_pixels.begin(), g_pixels.end(), 0);
  g_oob_writes = 0;
  reset_runtime();
}

void wled_set_effect(std::uint32_t effect_id) {
  const std::uint32_t next = std::min<std::uint32_t>(effect_id, EFFECTS.size() - 1);
  if (next != g_effect_id) {
    g_effect_id = next;
    reset_runtime();
  }
}

void wled_set_speed(std::uint8_t value) {
  g_segment.speed = value;
}

void wled_set_intensity(std::uint8_t value) {
  g_segment.intensity = value;
}

void wled_set_palette(std::uint8_t palette_id) {
  g_segment.palette = std::min<std::uint8_t>(palette_id, PALETTE_NAMES.size() - 1);
}

void wled_set_primary_color(std::uint8_t r, std::uint8_t g, std::uint8_t b) {
  g_segment.colors[0] = rgbw32(r, g, b);
}

void wled_set_secondary_color(std::uint8_t r, std::uint8_t g, std::uint8_t b) {
  g_segment.colors[1] = rgbw32(r, g, b);
}

void wled_set_audio(float volume, float peak, const float *fft_bins, std::uint32_t bin_count) {
  g_audio.volume = volume;
  g_audio.peak = peak;
  g_audio.bin_count = std::min<std::uint32_t>(bin_count, g_audio.fft.size());
  std::fill(g_audio.fft.begin(), g_audio.fft.end(), 0.0F);
  if (fft_bins && g_audio.bin_count) {
    std::copy_n(fft_bins, g_audio.bin_count, g_audio.fft.begin());
  }
}

void wled_tick(std::uint32_t time_ms) {
  if (g_pixels.empty()) return;
  strip.now = time_ms;
  EFFECTS[g_effect_id].function();
  ++g_segment.call;
}

std::uint32_t *wled_get_pixel_buffer() {
  return g_pixels.data();
}

std::uint32_t wled_get_led_count() {
  return g_pixels.size();
}

std::uint32_t wled_get_effect_count() {
  return EFFECTS.size();
}

const char *wled_get_effect_name(std::uint32_t effect_id) {
  return effect_id < EFFECTS.size() ? EFFECTS[effect_id].name : "";
}

std::uint32_t wled_get_palette_count() {
  return PALETTE_NAMES.size();
}

const char *wled_get_palette_name(std::uint32_t palette_id) {
  return palette_id < PALETTE_NAMES.size() ? PALETTE_NAMES[palette_id] : "";
}

std::uint32_t wled_get_oob_write_count() {
  return g_oob_writes;
}

}
