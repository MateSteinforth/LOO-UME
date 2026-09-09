#!/usr/bin/env python3
"""Exercise the actual probe C code with a deterministic host clock and CRC."""
from pathlib import Path
import subprocess
import tempfile

here = Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix="loo-rmt-probe-test-") as directory:
    root = Path(directory)
    (root / 'esp_attr.h').write_text('#define IRAM_ATTR\n#define DRAM_ATTR\n')
    (root / 'esp_cpu.h').write_text('extern unsigned clock_cycles;\nstatic inline unsigned esp_cpu_get_cycle_count(void) { return clock_cycles; }\n')
    (root / 'esp_rom_crc.h').write_text('''#include <stdint.h>
#include <stddef.h>
static inline uint32_t esp_rom_crc32_le(uint32_t crc, const uint8_t *p, size_t n) {
  crc = ~crc;
  while (n--) { crc ^= *p++; for (unsigned b=0;b<8;b++) crc=(crc>>1)^((crc&1)?0xedb88320u:0); }
  return ~crc;
}
''')
    (root / 'test.c').write_text('''#include "loo_rmt_probe.h"
#include <assert.h>
#include <stdio.h>
unsigned clock_cycles;
static lp_snapshot_t s;
static void refill(unsigned delta, unsigned cursor, unsigned end, int data) {
  clock_cycles += delta;
  unsigned token=loo_probe_threshold_begin(0,cursor<<12,0,end,end==64?0:64,data);
  clock_cycles+=100;
  loo_probe_threshold_end(0,token,(cursor+1)<<12);
}
int main(void) {
  unsigned char a[]={0x32,0xff,1,0x32,0xff,1}, b[]={0x32,0xff,1,0x32,0xff,1};
  loo_probe_register(0,16); loo_probe_set_control(3,160); loo_probe_start(0);
  loo_probe_before(16,a,sizeof(a)); loo_probe_result(16,0);
  loo_probe_before(16,b,sizeof(b));
  loo_probe_snapshot(0,&s); assert(s.payload.checks==1 && !s.payload.mutations && !s.payload.changed);
  b[2]^=0x80; loo_probe_before(16,a,sizeof(a));
  loo_probe_snapshot(0,&s); assert(s.payload.mutations==1 && s.payload.checks==2);
  loo_probe_before(16,b,sizeof(b));
  loo_probe_snapshot(0,&s); assert(s.payload.changed==1);
  loo_probe_result(16,1); loo_probe_wait_result(16,1);
  loo_probe_snapshot(0,&s); assert(s.payload.transmit_errors==1 && s.payload.wait_errors==1);
  // Normal alternate halves calibrate at64/0. A90us gap alone is not overrun.
  refill(1000,65,64,1); refill(160*90,1,128,1);
  loo_probe_snapshot(0,&s); assert(!s.timing.gaps_over_ring && !s.timing.target_half_entries);
  refill(160*170,3,64,1);
  loo_probe_snapshot(0,&s); assert(s.timing.gaps_over_ring==1 && s.timing.target_half_entries==1);
  assert(s.events[0].reason==3 && s.timing.half0_min==3 && s.timing.half1_min==1);
  refill(160*170,3,64,1); refill(160*170,3,64,1);
  loo_probe_snapshot(0,&s); assert(s.timing.anomalies==2); // Bounded to2 per TX.
  refill(160*500,3,64,0); refill(160*500,65,64,1);
  loo_probe_snapshot(0,&s); assert(s.timing.gaps_over_ring==3); // EOF gaps excluded.
  loo_probe_done(0);
  for(unsigned n=0;n<8;n++) { loo_probe_start(0); refill(1000,3,64,1); }
  loo_probe_snapshot(0,&s); assert(s.timing.anomalies==10 && s.events[0].stamp==9);
  loo_probe_set_control(0,160); loo_probe_start(0); refill(160*500,3,64,1);
  loo_probe_before(16,a,sizeof(a)); loo_probe_snapshot(0,&s);
  assert(!s.timing.thresholds && !s.payload.submits);
  loo_probe_set_control(3,160); loo_probe_start(0); loo_probe_before(16,a,sizeof(a));
  loo_probe_forget(16); loo_probe_before(16,(const void*)1,99);
  loo_probe_snapshot(0,&s); assert(!s.gpio_plus_one);
  puts("PASS: stable/mutated payload, submit changes, errors, reset/off, lifetime, half calibration, gap classification, EOF exclusion, bounded ring");
}
''')
    subprocess.run(['cc', '-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', '-I'+str(root), '-I'+str(here), str(here/'loo_rmt_probe.c'), str(root/'test.c'), '-o', str(root/'test')], check=True)
    subprocess.run([str(root/'test')], check=True)
