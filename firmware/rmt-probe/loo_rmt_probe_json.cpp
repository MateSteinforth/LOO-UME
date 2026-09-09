#include "wled.h"
#include "loo_rmt_probe.h"
#include "esp32-hal-cpu.h"

void looProbeRead(JsonObject root) {
  JsonObject request = root["rmtprobe"];
  if (request.isNull()) return;
  uint32_t flags = loo_probe_control() & 3u;
  if (request["enabled"].is<bool>())
    flags = (flags & ~1u) | (request["enabled"].as<bool>() ? 1u : 0u);
  if (request["crc"].is<bool>())
    flags = (flags & ~2u) | (request["crc"].as<bool>() ? 2u : 0u);
  loo_probe_set_control(flags, getCpuFrequencyMhz());
}

void looProbeInfo(JsonObject root) {
  JsonObject probe = root.createNestedObject("rmtprobe");
  uint32_t control = loo_probe_control();
  probe["control"] = control;
  probe["enabled"] = bool(control & 1u);
  probe["crc"] = bool(control & 2u);
  probe["cpu_mhz_now"] = getCpuFrequencyMhz();
  probe["cursor_decode"] = "provisional";
  JsonArray channels = probe.createNestedArray("channels");
  for (unsigned i = 0; i < LP_CHANNELS; ++i) {
    lp_snapshot_t snapshot = {};
    loo_probe_snapshot(i, &snapshot);
    if (!snapshot.gpio_plus_one) continue;
    JsonObject channel = channels.createNestedObject();
    channel["channel"] = i;
    channel["gpio"] = snapshot.gpio_plus_one - 1u;
    JsonObject timing = channel.createNestedObject("timing");
    #define LP_ADD_TIMING(name) timing[#name] = snapshot.timing.name;
    LP_TIMING_FIELDS(LP_ADD_TIMING)
    #undef LP_ADD_TIMING
    JsonArray histogram = timing.createNestedArray("cursor_bins");
    for (unsigned bin = 0; bin < 16; ++bin) histogram.add(snapshot.timing.cursor_bins[bin]);
    JsonObject payload = channel.createNestedObject("payload");
    #define LP_ADD_PAYLOAD(name) payload[#name] = snapshot.payload.name;
    LP_PAYLOAD_FIELDS(LP_ADD_PAYLOAD)
    #undef LP_ADD_PAYLOAD
    JsonArray eventList = channel.createNestedArray("events");
    for (unsigned j = 0; j < LP_EVENTS; ++j) {
      const lp_event_t &event = snapshot.events[j];
      if (!event.stamp) continue;
      JsonArray e = eventList.createNestedArray();
      e.add(event.stamp); e.add(event.transaction); e.add(event.cycles);
      e.add(event.gap_cycles); e.add(event.status); e.add(event.end_status);
      e.add(event.mem_end); e.add(event.mem_off); e.add(event.reason);
    }
  }
}
