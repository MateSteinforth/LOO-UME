#include "loo_rmt_probe.h"
#include "esp_attr.h"
#include "esp_cpu.h"
#include "esp_rom_crc.h"

// Aligned atomic32-bit accesses keep cross-core telemetry race-free. Each
// timing record has one driver-side writer; each payload record has one task
// writer. Snapshots are approximate across fields and never stop interrupts.
#define L(p) __atomic_load_n((p), __ATOMIC_RELAXED)
#define S(p, v) __atomic_store_n((p), (v), __ATOMIC_RELAXED)
#define INC(p) S((p), L(p) + 1)
static DRAM_ATTR uint32_t control_word;
static DRAM_ATTR uint32_t armed_cpu_mhz;
static DRAM_ATTR uint32_t gpio_slots[40];
static DRAM_ATTR uint32_t gpio_ids[LP_CHANNELS];
static DRAM_ATTR lp_timing_t timings[LP_CHANNELS];
static DRAM_ATTR lp_payload_t payloads[LP_CHANNELS];
static DRAM_ATTR lp_event_t events[LP_CHANNELS][LP_EVENTS];
typedef struct {
  uint32_t control, prior_entry, have_prior, pending_event, saved_this_frame;
  uint32_t event_status, event_gap, event_end, event_off, event_reason;
} timing_private_t;
typedef struct {
  uint32_t control, pending, pending_crc, have_first;
  const uint8_t *data;
  size_t size;
} payload_private_t;
static DRAM_ATTR timing_private_t timing_private[LP_CHANNELS];
static DRAM_ATTR payload_private_t payload_private[LP_CHANNELS];

static inline void IRAM_ATTR maximum(uint32_t *p, uint32_t v) {
  if (v > L(p)) S(p, v);
}
static inline void IRAM_ATTR minimum(uint32_t *p, uint32_t v) {
  if (v < L(p)) S(p, v);
}
static void IRAM_ATTR clear_words(void *record, size_t size) {
  uint32_t *p = record;
  for (size_t i = 0; i < size / sizeof(uint32_t); ++i) S(&p[i], 0);
}

uint32_t loo_probe_control(void) { return L(&control_word); }
void loo_probe_set_control(uint32_t flags, uint32_t cpu_mhz) {
  S(&armed_cpu_mhz, cpu_mhz);
  // Every command starts a new generation at each channel's next transaction.
  uint32_t next = ((L(&control_word) & ~3u) + 4u) | (flags & 3u);
  S(&control_word, next);
}
void loo_probe_register(unsigned channel, unsigned gpio) {
  if (channel >= LP_CHANNELS || gpio >= 40) return;
  uint32_t previous = L(&gpio_ids[channel]);
  if (previous && previous <= 40) S(&gpio_slots[previous - 1], 0);
  payload_private[channel].pending = 0;
  payload_private[channel].control = ~L(&control_word);
  timing_private[channel].control = ~L(&control_word);
  S(&gpio_ids[channel], gpio + 1);
  S(&gpio_slots[gpio], channel + 1);
}

void IRAM_ATTR __attribute__((noinline)) loo_probe_start(unsigned channel) {
  if (channel >= LP_CHANNELS) return;
  timing_private_t *p = &timing_private[channel];
  lp_timing_t *s = &timings[channel];
  uint32_t command = L(&control_word);
  if (p->control != command) {
    clear_words(s, sizeof(*s));
    clear_words(events[channel], sizeof(events[channel]));
    S(&s->half0_min, UINT32_MAX);
    S(&s->half1_min, UINT32_MAX);
    S(&s->cpu_mhz, L(&armed_cpu_mhz));
    S(&s->control, command);
    p->control = command;
  }
  p->have_prior = 0;
  p->pending_event = 0;
  p->saved_this_frame = 0;
  if (command & 1u) INC(&s->transactions);
}

uint32_t IRAM_ATTR __attribute__((noinline)) loo_probe_threshold_begin(unsigned channel, uint32_t status,
    uint32_t raw_error, unsigned mem_end, unsigned mem_off, int data_phase) {
  uint32_t now = esp_cpu_get_cycle_count();
  if (channel >= LP_CHANNELS) return now;
  timing_private_t *p = &timing_private[channel];
  if (!(p->control & 1u)) return now;
  lp_timing_t *s = &timings[channel];
  INC(&s->thresholds);
  S(&s->last_status, status);
  S(&s->last_mem_end, mem_end);
  S(&s->last_mem_off, mem_off);
  if (raw_error) INC(&s->raw_error_samples); // Sticky samples, not unique errors.
  p->pending_event = 0;
  if (!data_phase) { p->have_prior = 0; return now; }
  uint32_t gap = p->have_prior ? now - p->prior_entry : 0;
  if (p->have_prior) maximum(&s->max_gap_cycles, gap);
  p->prior_entry = now;
  p->have_prior = 1;
  uint32_t reason = 0;
  uint32_t mhz = L(&s->cpu_mhz);
  if (mhz && gap > 160u * mhz) { INC(&s->gaps_over_ring); reason |= 1u; }

  // Provisional TX cursor decode: keep raw status and histogram for calibration.
  // This counter is called target_half_entries, not proven underruns.
  uint32_t cursor = ((status >> 12) & 0x3ffu) - channel * 64u;
  if (cursor >= 128u || (mem_end != 64u && mem_end != 128u) ||
      (mem_off != 0u && mem_off != 64u)) {
    INC(&s->invalid_cursor);
    reason |= 4u;
  } else {
    INC(&s->cursor_bins[cursor / 8u]);
    if (mem_end == 64u) {
      INC(&s->half0_samples); minimum(&s->half0_min, cursor); maximum(&s->half0_max, cursor);
      if (cursor < 64u) { INC(&s->target_half_entries); reason |= 2u; }
    } else {
      INC(&s->half1_samples); minimum(&s->half1_min, cursor); maximum(&s->half1_max, cursor);
      if (cursor >= 64u) { INC(&s->target_half_entries); reason |= 2u; }
    }
  }
  if (reason && p->saved_this_frame < 2u) {
    p->pending_event = 1;
    p->event_status = status; p->event_gap = gap;
    p->event_end = mem_end; p->event_off = mem_off; p->event_reason = reason;
  }
  maximum(&s->max_probe_cycles, esp_cpu_get_cycle_count() - now);
  return now;
}

void IRAM_ATTR __attribute__((noinline)) loo_probe_threshold_end(unsigned channel, uint32_t begin, uint32_t status) {
  uint32_t now = esp_cpu_get_cycle_count();
  if (channel >= LP_CHANNELS) return;
  timing_private_t *p = &timing_private[channel];
  if (!(p->control & 1u)) return;
  lp_timing_t *s = &timings[channel];
  maximum(&s->max_encode_cycles, now - begin); // Includes entry-probe work.
  S(&s->last_end_status, status);
  if (p->pending_event) {
    uint32_t index = L(&s->anomalies);
    lp_event_t *event = &events[channel][index % LP_EVENTS];
    S(&event->stamp, 0); // A snapshot must see the same nonzero stamp twice.
    __atomic_thread_fence(__ATOMIC_RELEASE);
    S(&event->transaction, L(&s->transactions));
    S(&event->cycles, begin); S(&event->gap_cycles, p->event_gap);
    S(&event->status, p->event_status); S(&event->end_status, status);
    S(&event->mem_end, p->event_end); S(&event->mem_off, p->event_off);
    S(&event->reason, p->event_reason);
    __atomic_store_n(&event->stamp, index + 1u, __ATOMIC_RELEASE);
    INC(&s->anomalies);
    p->saved_this_frame++;
  }
  maximum(&s->max_probe_cycles, esp_cpu_get_cycle_count() - now);
}
void IRAM_ATTR __attribute__((noinline)) loo_probe_done(unsigned channel) {
  if (channel < LP_CHANNELS && (timing_private[channel].control & 1u))
    INC(&timings[channel].done);
}

static int slot(unsigned gpio) {
  return gpio < 40 ? (int)L(&gpio_slots[gpio]) - 1 : -1;
}
void loo_probe_forget(unsigned gpio) {
  int channel = slot(gpio);
  if (channel >= 0 && channel < LP_CHANNELS) {
    payload_private[channel].pending = 0;
    S(&gpio_slots[gpio], 0);
    S(&gpio_ids[channel], 0);
  }
}
void loo_probe_before(unsigned gpio, const void *data, size_t size) {
  int channel = slot(gpio);
  if (channel < 0 || channel >= LP_CHANNELS) return;
  payload_private_t *p = &payload_private[channel];
  lp_payload_t *s = &payloads[channel];
  uint32_t command = L(&control_word);
  if (!(command & 1u) && !p->pending && p->control == command) return;
  uint32_t begin = esp_cpu_get_cycle_count();
  if (p->pending) {
    uint32_t after = esp_rom_crc32_le(0, p->data, p->size);
    S(&s->last_post_crc, after); INC(&s->checks);
    if (after != p->pending_crc) INC(&s->mutations);
    p->pending = 0;
  }
  if (p->control != command) {
    clear_words(s, sizeof(*s));
    p->control = command; p->have_first = 0;
    S(&s->control, command);
  }
  if (!(command & 1u)) return;
  INC(&s->submits); S(&s->bytes, (uint32_t)size);
  if (command & 2u) {
    uint32_t crc = esp_rom_crc32_le(0, data, size);
    if (!p->have_first) { S(&s->first_crc, crc); p->have_first = 1; }
    if (crc != L(&s->first_crc)) INC(&s->changed);
    S(&s->last_crc, crc);
    p->data = data; p->size = size; p->pending_crc = crc; p->pending = 1;
  }
  uint32_t cost = esp_cpu_get_cycle_count() - begin;
  maximum(&s->cost_max_cycles, cost);
  S(&s->cost_total_cycles, L(&s->cost_total_cycles) + cost);
}
void loo_probe_result(unsigned gpio, int result) {
  int channel = slot(gpio);
  if (channel < 0 || channel >= LP_CHANNELS || !result) return;
  if (payload_private[channel].control & 1u) INC(&payloads[channel].transmit_errors);
  payload_private[channel].pending = 0;
}
void loo_probe_wait_result(unsigned gpio, int result) {
  int channel = slot(gpio);
  if (channel >= 0 && channel < LP_CHANNELS && result && (L(&control_word) & 1u))
    INC(&payloads[channel].wait_errors);
}

static void copy_words(void *out, const void *in, size_t size) {
  uint32_t *dst = out; const uint32_t *src = in;
  for (size_t i = 0; i < size / sizeof(uint32_t); ++i) dst[i] = L(&src[i]);
}
void loo_probe_snapshot(unsigned channel, lp_snapshot_t *out) {
  if (channel >= LP_CHANNELS) return;
  out->gpio_plus_one = L(&gpio_ids[channel]);
  copy_words(&out->timing, &timings[channel], sizeof(out->timing));
  copy_words(&out->payload, &payloads[channel], sizeof(out->payload));
  for (unsigned i = 0; i < LP_EVENTS; ++i) {
    uint32_t stamp = __atomic_load_n(&events[channel][i].stamp, __ATOMIC_ACQUIRE);
    copy_words(&out->events[i], &events[channel][i], sizeof(lp_event_t));
    __atomic_thread_fence(__ATOMIC_ACQUIRE);
    if (!stamp || stamp != __atomic_load_n(&events[channel][i].stamp, __ATOMIC_ACQUIRE))
      out->events[i].stamp = 0;
  }
}
