# WLED WASM technical notes

## Pinned upstream

- Repository: [wled/WLED](https://github.com/wled/WLED)
- Generation authority: long-lived `generate/wled-simulator` branch.
- Investigated revision: `d9b9a846561227351ad929e3109781daadb7bed2`
- WLED source version at that revision: `2607201`
- License: EUPL-1.2. WLED's `fastled_slim` dependency retains its MIT
  license.

That branch retains the unmodified WLED submodule, selected C++ effect bodies,
pinned Emscripten toolchain, sync check, and rebuild procedure. Normal `main`
retains only the checked-in JavaScript/WASM runtime and its exact integrity
receipt.

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
- Selected effect bodies are a pinned snapshot. On `generate/wled-simulator`,
  `npm run check:wled` compares 37 local effect/helper bodies against the
  pinned upstream and rejects a revision mismatch. Updating WLED still requires
  reviewing compatibility changes and moving only reviewed runtime bytes plus
  their receipt back to `main`.
- The default preview contains 2,624 LEDs: 30 square-face and 11
  pentagon-centre 8 x 8 grids. The face frame is vertex-up and the north-pole
  pentagon is intentionally unpopulated. Northern centre panels present their
  top edge toward the polar edge; southern panels present their bottom edge.
  The 66 mm face edge, separate square/pentagon plane distances, 66 x 65 mm PCB
  envelopes, and canonical centre-panel recess/offset remain represented.
- The renderer uses opaque PCB depth surfaces plus depth-writing, normal-blended
  circular LED sprites offset 2.4 mm along the panel normal. Display colors use
  a 2x render-only intensity multiplier. This avoids coplanar depth fighting and
  rear-visible LEDs without changing mapping or DDP bytes.
- Logical effect indices are sorted by UV latitude/longitude so WLED Scan
  progresses north-to-south. Physical indices now come from the exact four-output
  route drawn by the wiring overlay. `HardwareMapping.ts` produces
  `map[logicalIndex] = physicalIndex`, which is both rendered and exported.
  The browser compiles the same contract from the loaded Schema 2 project and
  rejects a generated panel-map or ledmap mismatch. A full-frame round-trip test
  proves equivalence.
- The 11/10/10/10 route, GPIOs 16–19, and installed quarter turns are authored
  assumptions. The one-panel test measured front-view DIN/pixel 0 at top-left,
  straight left-to-right rows progressing downward, pixel 63/DOUT at
  bottom-right, and GRB/WLED order 0. The profile stores the mirrored back-view
  convention. Exact complete-sculpture parity still needs as-built evidence,
  but the mapping-ready exporter can emit the guarded deployment contract.
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
- Connect browser Web Audio analysis to the existing audio input structure
  before enabling audio-reactive effects.
- Implement `LIVE-010` as a bounded local MadMapper Art-Net-to-mapped-DDP bridge
  outside the effect engine and renderer. Keep the current physical mapping as
  its only address authority.
