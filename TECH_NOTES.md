# WLED WASM technical notes

## Pinned upstream

- Repository: [wled/WLED](https://github.com/wled/WLED)
- Git submodule: `wled/upstream`
- Investigated revision: `d9b9a846561227351ad929e3109781daadb7bed2`
- WLED source version at that revision: `2607201`
- License: EUPL-1.2. WLED's `fastled_slim` dependency retains its MIT
  license.

The submodule is intentionally unmodified. The first milestone extracts a small
reviewable set of 1D effect bodies into `wasm/src/wled_effects.inc`. Those
bodies are verbatim C++ from `wled00/FX.cpp`; effect metadata declarations are
not included.

## Dependency investigation

### Portable C++

- Selected 1D effect bodies in `wled00/FX.cpp`.
- Fixed-point trigonometry in `wled00/wled_math.cpp`.
- Beat helpers in `wled00/util.cpp`.
- Color blending and palette interpolation in `wled00/colors.cpp`.
- `wled00/src/dependencies/fastled_slim`, compiled directly from the submodule.
- The seven standard FastLED palette tables in `wled00/palettes.cpp`.

### Arduino-specific compatibility

The portable host replaces only the pieces selected effects actually use:

- `millis()` reads the explicit time supplied to `wled_tick(timeMs)`.
- `PROGMEM` and `pgm_read_*` are no-ops/direct reads in linear WASM memory.
- Arduino `byte`, `map()`, and min/max behavior use fixed-width C++ types.
- `hw_random()`, `hw_random8()`, and `hw_random16()` use a seeded xorshift
  generator. `wled_reset(seed)` makes random-capable effects reproducible.
- WLED's Segment runtime fields (`speed`, `intensity`, `palette`,
  `colors`, `step`, `aux0`, `aux1`, and `call`) live in one portable
  Segment instance.

### ESP32-specific dependencies

The production `WS2812FX` and `Segment` implementations eventually touch
bus management, PSRAM allocation, ESP heap metrics, frame scheduling, and
platform locks. None of those are compiled for this milestone. They are
replaced by a `std::vector<uint32_t>` framebuffer and a single-threaded
explicit tick.

### Explicitly excluded

Wi-Fi, ESPAsyncWebServer, JSON/network APIs, filesystem, GPIO, RMT/I2S LED
drivers, OTA, mDNS, Ethernet, DDP/Art-Net, presets, usermods, transitions, and
firmware service scheduling are not part of the WASM target.

## Pixel interception point

In upstream WLED, effects call `Segment::setPixelColor()` in `FX_fcn.cpp`.
The call applies Segment geometry and eventually writes through
`setPixelColorRaw()` to WLED's global pixel buffer.

The simulation host keeps that same effect-facing interception point:
`Segment::setPixelColor()` writes a packed `0x00RRGGBB` value into a guarded
virtual framebuffer. Invalid writes are rejected and counted by
`wled_get_oob_write_count()`.

## Current compromises

- This is a deliberately small Segment-compatible host, not the full
  `WS2812FX` class.
- Thirty standard 1D effects are exposed. 2D, particle, transition,
  multi-segment, custom palette, and audio-reactive paths are unsupported.
- Palette IDs are a compact simulator registry: Default plus WLED's seven
  FastLED palettes. They are not claimed to equal every firmware palette ID.
- Selected effect bodies are a pinned snapshot. `npm run check:wled` compares
  37 local effect/helper bodies against `wled/upstream/wled00/FX.cpp` and
  rejects an unexpected submodule revision. Updating WLED still requires
  reviewing compatibility changes.
- The default preview groups all 2,688 LEDs into 30 square-face and 12
  pentagon-centre 8 x 8 grids. It now uses the 66 mm common face edge, separate
  square/pentagon plane distances, 66 x 65 mm PCB envelopes, and the canonical
  centre-panel 234 degree rotation, 9.62/-7.04 mm offset, and 0.70 mm recess.
  Global face numbering and the equivalent open edge selected for each
  pentagon copy remain generated rather than measured.
- The renderer uses opaque PCB depth surfaces plus depth-writing, normal-blended
  circular LED sprites. This deliberately avoids transparent-shell/additive
  sorting artifacts that made front LEDs appear dim.
- Synthetic row-major logical/physical indices are not physical wiring facts.
  The Fibonacci sphere remains only as a fallback for arbitrary LED counts.
- The audio setter stores volume, peak, and up to 64 FFT bins. No current effect
  consumes them; this is the future adapter seam.
- Emscripten memory may grow after a resize. JavaScript deliberately reacquires
  the `HEAPU32` view every frame.

## Upstream coupling points

1. `wled00/FX.cpp`: selected effect bodies and expected Segment fields.
2. `wled00/FX_fcn.cpp`: reference semantics for palette selection and the
   `setPixelColor()` interception boundary.
3. `wled00/colors.cpp` and `palettes.cpp`: blending and palette tables.
4. `wled00/wled_math.cpp` and `util.cpp`: deterministic fixed-point timing
   helpers.
5. `wled00/src/dependencies/fastled_slim`: directly compiled portable color
   and waveform primitives.

## Next expansion steps

- Port more non-audio 1D effects by dependency clusters while retaining the
  source-sync invariant.
- Add a 2D Segment adapter and feed equirectangular UV dimensions.
- Replace generated panel transforms and synthetic indices with measured
  canonical panel orientation, physical chain order, connector positions, UV,
  and XYZ data.
- Connect browser Web Audio analysis to the existing audio input structure
  before enabling audio-reactive effects.
- Add an optional DDP/Art-Net consumer of the same packed framebuffer, outside
  the effect engine and renderer.
