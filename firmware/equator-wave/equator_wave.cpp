#include "wled.h"
#include "EquatorWave.h"
#include "GlitchAudio.h"
#include "EquatorMapping.h"
#include <new>

static void mode_equator_wave() {
  // A partial segment cannot use the complete sculpture coordinate table.
  if (SEGLEN != EQUATOR_LED_COUNT || SEGMENT.start != 0 ||
      !SEGENV.allocateData(sizeof(loo_equator::State))) {
    SEGMENT.fill(0);
    return;
  }
  auto* state = reinterpret_cast<loo_equator::State*>(SEGENV.data);
  if (SEGENV.call == 0) {
    new (state) loo_equator::State{};
    loo_equator::reset(*state);
  }
  uint8_t bass = 0;
  uint8_t treble = 0;
  um_data_t* audio = nullptr;
  if (UsermodManager::getUMData(&audio, USERMOD_ID_AUDIOREACTIVE) && audio && audio->u_data[2]) {
    const auto* bins = static_cast<const uint8_t*>(audio->u_data[2]);
    bass = (uint16_t(bins[0]) + bins[1] + bins[2]) / 3;
    uint16_t sum = 0;
    for (uint8_t i = 10; i < 16; ++i) sum += bins[i];
    treble = sum / 6;
  }
  loo_equator::advance(*state, strip.now, bass, treble, SEGMENT.speed, SEGMENT.intensity);
  for (uint16_t i = 0; i < EQUATOR_LED_COUNT; ++i) {
    const auto& point = EQUATOR_COORDINATES[i];
    SEGMENT.setPixelColor(i, loo_equator::pixel(*state, point.longitude, point.height, i, SEGCOLOR(0)));
  }
}

static const char EQUATOR_EFFECT[] PROGMEM = "Equator Wave@Speed,Sensitivity;Wave;;;";

static void mode_glitch_audio(uint8_t effect) {
  // A partial segment cannot use the complete sculpture coordinate table.
  if (SEGLEN != EQUATOR_LED_COUNT || SEGMENT.start != 0 ||
      !SEGENV.allocateData(sizeof(loo_glitch::State))) {
    SEGMENT.fill(0);
    return;
  }
  auto* state = reinterpret_cast<loo_glitch::State*>(SEGENV.data);
  if (SEGENV.call == 0) {
    new (state) loo_glitch::State{};
    loo_glitch::reset(*state);
  }
  uint8_t bass = 0;
  uint8_t mid = 0;
  uint8_t treble = 0;
  um_data_t* audio = nullptr;
  if (UsermodManager::getUMData(&audio, USERMOD_ID_AUDIOREACTIVE) && audio && audio->u_data[2]) {
    const auto* bins = static_cast<const uint8_t*>(audio->u_data[2]);
    bass = (uint16_t(bins[0]) + bins[1] + bins[2]) / 3;
    uint16_t midSum = 0;
    for (uint8_t i = 3; i < 10; ++i) midSum += bins[i];
    mid = midSum / 7;
    uint16_t trebleSum = 0;
    for (uint8_t i = 10; i < 16; ++i) trebleSum += bins[i];
    treble = trebleSum / 6;
  }
  loo_glitch::advance(*state, strip.now, bass, mid, treble, SEGMENT.speed, SEGMENT.intensity);
  for (uint16_t i = 0; i < EQUATOR_LED_COUNT; ++i) {
    const auto& point = EQUATOR_COORDINATES[i];
    SEGMENT.setPixelColor(i, loo_glitch::pixel(*state, effect, point.longitude, point.height, i, SEGCOLOR(0)));
  }
}

static void mode_packet_fault() { mode_glitch_audio(0); }
static void mode_bit_rain() { mode_glitch_audio(1); }
static void mode_spectral_gates() { mode_glitch_audio(2); }

static const char PACKET_FAULT_EFFECT[] PROGMEM = "Packet Fault@Speed,Sensitivity;Glitch;;;";
static const char BIT_RAIN_EFFECT[] PROGMEM = "Bit Rain@Speed,Sensitivity;Glitch;;;";
static const char SPECTRAL_GATES_EFFECT[] PROGMEM = "Spectral Gates@Speed,Sensitivity;Glitch;;;";

class EquatorWaveUsermod : public Usermod {
public:
  void setup() override {
    strip.addEffect(255, &mode_equator_wave, EQUATOR_EFFECT);
    strip.addEffect(255, &mode_packet_fault, PACKET_FAULT_EFFECT);
    strip.addEffect(255, &mode_bit_rain, BIT_RAIN_EFFECT);
    strip.addEffect(255, &mode_spectral_gates, SPECTRAL_GATES_EFFECT);
  }
  void loop() override {}
  void addToJsonInfo(JsonObject& root) override {
    JsonObject info = root.createNestedObject("equatorWave");
    info["mappingSha256"] = EQUATOR_MAPPING_SHA256;
    info["ledCount"] = EQUATOR_LED_COUNT;
    info["renderer"] = "equator-wave-v1";
    JsonObject audioArt = root.createNestedObject("audioArt");
    audioArt["renderer"] = "glitch-audio-v1";
    audioArt["mappingSha256"] = EQUATOR_MAPPING_SHA256;
    audioArt["ledCount"] = EQUATOR_LED_COUNT;
  }
};

static EquatorWaveUsermod equatorWaveUsermod;
REGISTER_USERMOD(equatorWaveUsermod);
