#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <map>
#include <string>
#include <vector>

using byte = uint8_t;

constexpr byte REALTIME_MODE_INACTIVE = 0;
constexpr byte REALTIME_MODE_DDP = 5;
constexpr byte REALTIME_MODE_GENERIC = 1;
constexpr byte REALTIME_OVERRIDE_NONE = 0;
constexpr byte REALTIME_OVERRIDE_ONCE = 1;
constexpr byte CALL_MODE_WS_SEND = 1;
#define BLACK 0

constexpr uint32_t RGBW32(byte red, byte green, byte blue, byte white) {
  return (uint32_t(red) << 24) | (uint32_t(green) << 16) | (uint32_t(blue) << 8) | white;
}

class IPAddress {
public:
  IPAddress() = default;
  IPAddress(uint32_t value) : value_(value) {}
  operator uint32_t() const { return value_; }
  byte& operator[](size_t index) { return bytes_[index]; }
private:
  uint32_t value_ = 0;
  std::array<byte, 4> bytes_{};
};

extern std::map<std::string, uint32_t> jsonValues;

struct JsonObject {
  JsonObject createNestedObject(const char*) { return {}; }
  struct Slot {
    std::string key;
    template <typename T> Slot& operator=(const T& value) {
      jsonValues[key] = uint32_t(value);
      return *this;
    }
  };
  Slot operator[](const char* key) { return {key}; }
};

struct portMUX_TYPE {};
#define portMUX_INITIALIZER_UNLOCKED portMUX_TYPE{}
#define portENTER_CRITICAL(value) ((void)(value))
#define portEXIT_CRITICAL(value) ((void)(value))

uint32_t micros();
uint32_t millis();
void realtimeLock(uint32_t timeout, byte mode);
void exitRealtime();
void setRealtimePixel(uint16_t logical, byte red, byte green, byte blue, byte white);

extern byte realtimeMode;
extern byte realtimeOverride;
extern uint32_t realtimeTimeout;
extern uint32_t realtimeTimeoutMs;
extern IPAddress realtimeIP;
extern bool useMainSegmentOnly;
extern byte bri;
extern byte briT;
extern byte briLast;
extern bool arlsForceMaxBri;
extern bool e131NewData;
extern bool udpConnected;
extern unsigned notificationCount;
extern unsigned udpNumRetries;
extern uint32_t notificationSentTime;
extern byte notificationSentCallMode;
extern uint16_t DMXAddress;
extern int arlsOffset;

struct Segment {
  bool freeze = false;
  void clear() { ++clears; }
  void stopTransition() { ++stoppedTransitions; }
  unsigned stoppedTransitions = 0;
  unsigned clears = 0;
};

class FakeStrip {
public:
  size_t getLengthTotal() const { return length; }
  Segment& getMainSegment() { return main; }
  Segment& getSegment(size_t) { return main; }
  size_t getSegmentsNum() const { return 1; }
  uint32_t getLastShow() const { return lastShowMs; }
  void setBrightness(byte value, bool) { brightness = value; }
  void fill(uint32_t) { ++fills; }
  void trigger() { ++triggers; }
  void setRealtimePixelColor(unsigned pixel, uint32_t color) {
    if (pixel >= length) return;
    ++realtimeWrites;
    logical[pixel] = {byte(color >> 24), byte(color >> 16), byte(color >> 8)};
  }
  bool beginDdpFrame();
  void endDdpFrame();
  void show();

  size_t length = 2624;
  Segment main;
  std::vector<std::array<byte, 3>> logical;
  std::vector<uint16_t> map;
  std::vector<std::vector<byte>> wireSnapshots;
  uint32_t paintUs = 0;
  bool rejectShow = false;
  bool pixelsAvailable = true;
  bool suspended = false;
  bool servicing = false;
  bool suspendBeforeShow = false;
  unsigned realtimeWrites = 0;
  unsigned nativeServices = 0;
  uint32_t lastShowMs = 0;
  byte brightness = 0;
  unsigned fills = 0;
  unsigned triggers = 0;
};

extern FakeStrip strip;

namespace BusManager {
bool canAllShow();
void show();
}

void notify(byte, bool);
void updateInterfaces(byte);
