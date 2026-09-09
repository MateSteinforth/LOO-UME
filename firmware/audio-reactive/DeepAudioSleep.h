#pragma once
#include <atomic>

// Main loop requests; only the sample worker touches the microphone driver.
class DeepAudioSleep {
public:
  enum State { Running, Unloaded, Fault };
  bool request(bool off) { return wantedOff.exchange(off) != off; }
  bool requested() const { return wantedOff.load(); }
  State state() const { return current.load(); }
  template<class Source> bool service(Source& source) {
    const bool off = requested();
    if (!source.deepSetDriver(!off)) {
      current.store(Fault);
      return false; // Wait for a new request; do not repeatedly install/uninstall.
    }
    current.store(off ? Unloaded : Running);
    return !off && !requested();
  }
private:
  std::atomic<bool> wantedOff{false};
  std::atomic<State> current{Running};
};
