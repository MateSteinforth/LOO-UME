#pragma once
#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define LP_CHANNELS 8
#define LP_EVENTS 8
#define LP_TIMING_FIELDS(X) \
 X(control) X(cpu_mhz) X(transactions) X(thresholds) X(done) \
 X(max_gap_cycles) X(gaps_over_ring) X(max_encode_cycles) \
 X(target_half_entries) X(invalid_cursor) X(raw_error_samples) \
 X(half0_samples) X(half1_samples) X(half0_min) X(half0_max) \
 X(half1_min) X(half1_max) X(anomalies) X(last_status) X(last_end_status) \
 X(last_mem_end) X(last_mem_off) X(max_probe_cycles)
#define LP_PAYLOAD_FIELDS(X) \
 X(control) X(submits) X(checks) X(changed) X(mutations) X(first_crc) \
 X(last_crc) X(last_post_crc) X(cost_max_cycles) X(cost_total_cycles) \
 X(transmit_errors) X(wait_errors) X(bytes)
#define LP_U32(name) uint32_t name;
typedef struct { LP_TIMING_FIELDS(LP_U32) uint32_t cursor_bins[16]; } lp_timing_t;
typedef struct { LP_PAYLOAD_FIELDS(LP_U32) } lp_payload_t;
#undef LP_U32
typedef struct {
  uint32_t stamp, transaction, cycles, gap_cycles, status, end_status;
  uint32_t mem_end, mem_off, reason;
} lp_event_t;
typedef struct {
  uint32_t gpio_plus_one;
  lp_timing_t timing;
  lp_payload_t payload;
  lp_event_t events[LP_EVENTS];
} lp_snapshot_t;

uint32_t loo_probe_control(void);
void loo_probe_set_control(uint32_t flags, uint32_t cpu_mhz);
void loo_probe_snapshot(unsigned channel, lp_snapshot_t *out);
void loo_probe_register(unsigned channel, unsigned gpio);
void loo_probe_forget(unsigned gpio);
void loo_probe_start(unsigned channel);
uint32_t loo_probe_threshold_begin(unsigned channel, uint32_t status,
  uint32_t raw_error, unsigned mem_end, unsigned mem_off, int data_phase);
void loo_probe_threshold_end(unsigned channel, uint32_t begin, uint32_t status);
void loo_probe_done(unsigned channel);
void loo_probe_before(unsigned gpio, const void *data, size_t size);
void loo_probe_result(unsigned gpio, int result);
void loo_probe_wait_result(unsigned gpio, int result);

#ifdef __cplusplus
}
#endif
