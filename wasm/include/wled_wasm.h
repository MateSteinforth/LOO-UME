#pragma once

#include <cstdint>

#if defined(__EMSCRIPTEN__)
#include <emscripten/emscripten.h>
#define WLED_WASM_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define WLED_WASM_EXPORT
#endif

extern "C" {

WLED_WASM_EXPORT int wled_init(std::uint32_t led_count);
WLED_WASM_EXPORT int wled_resize(std::uint32_t led_count);
WLED_WASM_EXPORT void wled_reset(std::uint32_t seed);
WLED_WASM_EXPORT void wled_set_effect(std::uint32_t effect_id);
WLED_WASM_EXPORT void wled_set_speed(std::uint8_t value);
WLED_WASM_EXPORT void wled_set_intensity(std::uint8_t value);
WLED_WASM_EXPORT void wled_set_palette(std::uint8_t palette_id);
WLED_WASM_EXPORT void wled_set_primary_color(std::uint8_t r, std::uint8_t g, std::uint8_t b);
WLED_WASM_EXPORT void wled_set_secondary_color(std::uint8_t r, std::uint8_t g, std::uint8_t b);
WLED_WASM_EXPORT void wled_set_audio(float volume, float peak, const float *fft_bins, std::uint32_t bin_count);
WLED_WASM_EXPORT void wled_tick(std::uint32_t time_ms);

WLED_WASM_EXPORT std::uint32_t *wled_get_pixel_buffer();
WLED_WASM_EXPORT std::uint32_t wled_get_led_count();
WLED_WASM_EXPORT std::uint32_t wled_get_effect_count();
WLED_WASM_EXPORT const char *wled_get_effect_name(std::uint32_t effect_id);
WLED_WASM_EXPORT std::uint32_t wled_get_palette_count();
WLED_WASM_EXPORT const char *wled_get_palette_name(std::uint32_t palette_id);
WLED_WASM_EXPORT std::uint32_t wled_get_oob_write_count();

}
