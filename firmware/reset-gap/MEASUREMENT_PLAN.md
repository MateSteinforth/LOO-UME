# Measure the remaining output corruption

This is the reviewed design for a future diagnostic, not an implemented probe.
Current controller2609093 remains unchanged. The operator's latest estimate is
one flash every2–3seconds onGPIO16 andGPIO22, other chains clean, during Solid.
Earlier estimates ranged from1–2seconds to3–5seconds; GPIO22/PC02 was predominant.
The 300us reset did not establish a zero-flash result. Frame drops remain a
separate unresolved outcome; uniform frames cannot reveal them.

## Explicit feedback protocol

The operator requested clear timing because immediate observations can miss
later improvements. Announce the firmware/settings change, then allow90seconds
to settle before a60-second observation. State the start and stop point before
the count and ask for feedback only after that window. Keep source, sender FPS,
brightness and controller settings fixed; leave preview subscriptions and
polling closed. Ask for counts by GPIO, or label interval estimates as estimates.
If behavior changes over time, repeat the same window at a stated later point
(for example5minutes after restart) before classifying stability. A settling
period is an observation convention, not proof that startup effects have ended.

In this run, a count was announced at08:10:28UTC. A sleep interrupted by user
input returned early, but the next wall-clock check was already78seconds after
the announced start. The assistant initially said the count was still running
before checking the clock. The stop was therefore late. Retain the operator's
reported2–3second interval as an estimate; do not fabricate60-second totals.
On interruption, recheck the absolute deadline before saying a window remains
open. Do not infer remaining time from the sleep tool's elapsed time alone.

## Falsifiable mechanism

The matching [Espressif RMT FAQ](https://docs.espressif.com/projects/esp-idf/en/v5.3.4/esp32/api-reference/peripherals/rmt.html#faq)
warns that delayed encoding can make the transmitter read stale memory. This
is a specific hypothesis, not a measured failure in the sculpture.

The driver preloads128symbols, then refills64-symbol halves with wrapping
enabled. Reused words can be from128symbols earlier. Since128 modulo24 is8,
stale words can rotate RGB byte phase even for identical Solid pixels. For
example, repeated GRB bytes32/ff/01 can expose stale bytes01/32/ff at the same
stream position. This illustrates a predicted color signature, not a decoded
wire trace. Actual brightness/gamma output bytes may differ.

## Separate payload integrity from refill timing

1. In NeoPixelBus task context, fingerprint the tested output buffer immediately
   before `rmt_transmit()`. Retain that pointer and CRC as the sending buffer.
   After `rmt_tx_wait_all_done()` succeeds, compare the same bytes before reuse.
   Count pre-submit changes during a fixed Solid/pattern and mutations during
   transmission. Measure this work's cost; even task-context CRC can alter
   spacing between transmissions. Do no CRC in the refill ISR.
2. In the exact matching IDF transmitter, use fixed per-channel DRAM counters:
   transaction sequence, threshold count, TX-done count, handler entry/exit
   cycle counts, raw error status, `mem_end`, `mem_off`, and read-only channel
   status snapshots. Retain a small bounded anomaly ring and expose it from
   task context. No ISR logging, allocation, serial output or network output.
3. Calibrate the cursor interpretation on clean frames before classifying late
   service. A validated reader position already inside the unrefilled target
   half at handler entry strongly supports stale consumption. An exit snapshot
   alone cannot prove it: the writer may have remained ahead of the reader.

The public RMT channel handle is opaque. Probe the matching private driver where
the actual channel ID and registers are available. Do not assume GPIO order is
channel order or silently replace the SDK driver with a different revision.
The installed SDK reports5.3.4.260127; validate any source-level probe against
the installed library/configuration and its ABI before compiling a replacement.
Preserve the original shared toolchain and use an isolated build.

## Interpret counters conservatively

- A callback gap over80us is not proof of a missed refill: the previous handler
  may have refilled promptly and the next handler may still have time remaining.
- A gap over160us between consecutive threshold handlers in the same continuous
  transaction is much stronger evidence of a full ring circuit. Exclude initial
  preload, EOF/reset, transaction boundaries and counter wrap; pair it with the
  cursor state. Cycle conversion also requires a known stable CPU frequency.
- Sticky threshold bits can coalesce. Callback counts do not count every
  hardware threshold crossing.
- A zero TX-error count does not clear this hypothesis: wrapped stale reads need
  not be illegal hardware addresses.
- Stable submitted buffers plus validated late-entry evidence support refill
  failure. Changed submitted bytes or in-flight mutations direct investigation
  back into the rendering/bus path. Neither result alone identifies every
  visible flash or excludes downstream signal faults.
- Compare probe-enabled and probe-disabled operation on the same binary when
  possible. Added code, memory and measurements can change timing. A quiet
  software preview is not an electrical measurement.

## Exact source reference points from the independent review

Matching IDF5.3.4 `rmt_tx.c` was inspected at
`/tmp/loo-ume-firmware-ddp-audit/build/idf-source/rmt_tx.c`:

- Lines322–330: half threshold and wrap enabled.
- Lines722–730:128-symbol preload, then next `mem_end=64`.
- Lines899–913: half refill and `mem_end` toggle.
- Lines1049–1073: enabled interrupt status is read and cleared before handling.

SDK headers are below
`build/firmware-toolchain/core/packages/framework-arduinoespressif32/tools/esp32-arduino-libs/esp32/include/`:

- `hal/esp32/include/hal/rmt_ll.h:582`: `rmt_ll_tx_get_status_word()` is one
  read-only volatile32-bit load, but is explicitly in the deprecated section.
- `soc/esp32/include/soc/rmt_reg.h:1036`: field names put TX read cursor in
  bits21:12 and RX/APB write cursor in bits9:0; the English comments are swapped.
  The RX helper's use of low10bits supports provisionally interpreting TX as
  `((status >> 12) & 0x3ff) - channel * 64`. Validate actual relative positions
  near64/0 on alternate thresholds before relying on this interpretation.
- `rmt_ll.h:26`: ordinary TX interrupt mask excludes TX_ERROR; raw status reads
  can include it. Do not count a sticky raw error repeatedly as independent
  events or clear driver-owned status from an unrelated observer.

The completed review establishes a measurement approach. It does not establish
an underrun, implementation readiness, or a new firmware fix.
