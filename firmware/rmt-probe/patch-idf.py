#!/usr/bin/env python3
"""Instrument the exact packaged IDF driver, without changing the shared SDK."""
from pathlib import Path
import hashlib
import sys

root = Path(__file__).resolve().parents[2]
driver, private = map(Path, sys.argv[1:])
assert hashlib.sha256(driver.read_bytes()).hexdigest() == "26227799fa83cfcc155e8e591e91d87822308519291bb8689007d7b0aa281f79"
assert hashlib.sha256(private.read_bytes()).hexdigest() == "bf0e0256bbcc87129d532a4d4d8606e2f3bf818c50ccec96637514357a2d89d2"
source = driver.read_text()

def once(old, new):
    global source
    assert source.count(old) == 1, old
    source = source.replace(old, new)

assertions = '''
#include "loo_rmt_probe.h"
_Static_assert(sizeof(rmt_tx_trans_desc_t) == 28, "SDK descriptor ABI");
_Static_assert(sizeof(rmt_tx_channel_t) == 132, "SDK TX channel ABI");
'''
for typ, field, offset in [
    ("rmt_channel_t", "group", 16), ("rmt_channel_t", "hw_mem_base", 44),
    *[("rmt_tx_channel_t", f, o) for f, o in [
        ("mem_off", 80), ("mem_end", 84), ("ping_pong_symbols", 88),
        ("queue_size", 92), ("num_trans_inflight", 96), ("trans_queues", 100),
        ("cur_trans", 112), ("user_data", 116), ("on_trans_done", 120),
        ("dma_nodes", 124), ("dma_nodes_nc", 128), ("trans_desc_pool", 132)]]
]:
    assertions += f'_Static_assert(offsetof({typ}, {field}) == {offset}, "SDK {field} ABI");\n'
once('#include "rmt_private.h"', '#include "rmt_private.h"\n' + assertions)
once('    ESP_RETURN_ON_FALSE(channel_id >= 0, ESP_ERR_NOT_FOUND, TAG, "no free tx channels");',
     '    ESP_RETURN_ON_FALSE(channel_id >= 0, ESP_ERR_NOT_FOUND, TAG, "no free tx channels");\n'
     '    loo_probe_register(channel_id, config->gpio_num);')
once('    // update current transaction\n    tx_chan->cur_trans = t;',
     '    loo_probe_start(channel_id);\n    // update current transaction\n    tx_chan->cur_trans = t;')
once('static bool IRAM_ATTR rmt_isr_handle_tx_threshold(rmt_tx_channel_t *tx_chan)',
     'static bool IRAM_ATTR rmt_isr_handle_tx_threshold(rmt_tx_channel_t *tx_chan, uint32_t raw_error)')
start = source.index('static bool IRAM_ATTR rmt_isr_handle_tx_threshold(')
end = source.index('static bool IRAM_ATTR rmt_isr_handle_tx_done(', start)
original = source[start:end]
hooked = original.replace('    size_t encoded_symbols = t->transmitted_symbol_num;', '''    unsigned channel_id = tx_chan->base.channel_id;
    rmt_dev_t *hw = tx_chan->base.group->hal.regs;
    uint32_t probe_begin = loo_probe_threshold_begin(channel_id,
        hw->status_ch[channel_id], raw_error, tx_chan->mem_end, tx_chan->mem_off,
        !t->flags.encoding_done && t->transmitted_symbol_num < t->payload_bytes * 8);
    size_t encoded_symbols = t->transmitted_symbol_num;''')
hooked = hooked.replace('    t->transmitted_symbol_num = encoded_symbols;',
    '    loo_probe_threshold_end(channel_id, probe_begin, hw->status_ch[channel_id]);\n'
    '    t->transmitted_symbol_num = encoded_symbols;')
once(original, hooked)
start = source.index('static bool IRAM_ATTR rmt_isr_handle_tx_done(')
end = source.index('#if SOC_RMT_SUPPORT_TX_LOOP_COUNT', start)
original = source[start:end]
hooked = original.replace('        trans_desc = tx_chan->cur_trans;',
    '        loo_probe_done(channel->channel_id);\n        trans_desc = tx_chan->cur_trans;')
once(original, hooked)
once('    uint32_t status = rmt_ll_tx_get_interrupt_status(hal->regs, channel_id);',
     '    uint32_t raw_error = rmt_ll_tx_get_interrupt_status_raw(hal->regs, channel_id) & RMT_LL_EVENT_TX_ERROR(channel_id);\n'
     '    uint32_t status = rmt_ll_tx_get_interrupt_status(hal->regs, channel_id);')
once('rmt_isr_handle_tx_threshold(tx_chan))', 'rmt_isr_handle_tx_threshold(tx_chan, raw_error))')
out = root / 'build/firmware-source/wled00'
(out / 'loo_probe_rmt_tx.c').write_text(source)
(out / 'rmt_private.h').write_bytes(private.read_bytes())
print('Exact IDF driver instrumented; shared SDK remains untouched.')
