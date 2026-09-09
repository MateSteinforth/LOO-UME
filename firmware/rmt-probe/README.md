# RMT output diagnostic 2609094

This is a measurement build based on non-audio2609093. It retains the300us
reset,128symbols per output,40MHz RMT clock, original DDP receiver, original
output scheduling and configured output lengths. It is not a flicker fix.

The operator reported fewer flashes while2609093 was still running during
preparation. Before that, the estimate was one flash every2–3seconds onGPIO16
andGPIO22. This is a changing baseline, not a measured zero-flash result.

## Build and provenance

Start from the verified2609093 generated source and its installed dependencies
in an isolated build directory. Run `patch.py`, then `patch-idf.py` with the
exact original driver and private header. Generate the PlatformIO compilation
database, build `orbital_esp32dev`, run `test-probe.py` and `verify.py`.

The SDK package is5.3.4.260127 and declares Tasmota ESP-IDF commit
`b3b492ffc273f17f4ed3c83c19ed110cd6c73c7a`. Fetch source from
`https://github.com/tasmota/esp-idf` at that commit. The patch script pins hashes
of `components/esp_driver_rmt/src/rmt_tx.c` and `rmt_private.h`.
Vanilla IDF5.3.4 differs; do not use the earlier audit copy as an override.

The private ABI is checked with compile-time size and offset assertions,
validated against the installed archive disassembly. The actual target uses
`dio_qspi`; its RMT/PM configuration matches the independently checked
`qio_qspi` configuration. The shared SDK stays unchanged.

WLED builds the local driver with LTO. The final link map must attribute all
eight public TX symbols to the local source and omit the original archive's
`rmt_tx.c.obj`. LTO may emit merged objects. Probe ISR functions are retained
explicitly in IRAM. Counters and anomaly storage are in internal DRAM. The
verifier follows reachable Xtensa basic blocks: linear disassembly can decode
unreachable jump padding as false instructions.

The build receipt pins the image, ELF, inputs and three preserved fallbacks.
The original2609085 image remains the audio fallback. Its microphone settings
must be restored from the private audio cold-off restore file when returning
to audio; disabled/type255 settings do not constitute an audio test.

## Runtime commands

POST `/json/state` with:

```json
{"rmtprobe":{"enabled":true,"crc":false}}
```

This arms timing-only collection. Read `/json/info` before and after a test;
its `rmtprobe` field contains counters for the actual channel-to-GPIO mapping.
Each command resets a generation at each output's next transaction.
`enabled:false` disables collection without flashing. `crc:true` additionally
checks transmitted pixel buffers in task context. Settings are volatile.

CRC checks run after a successful wait, before buffer reuse, and immediately
before the next submit. No checksum, logging, network I/O or allocation runs
in a refill ISR. Each output retains at most eight anomaly records and saves
at most two per transaction. Event fields are stamp, transaction, cycle count,
entry gap, entry status, exit status, target end, write offset and reason bits.
Reasons:1=gap over160us,2=provisional target-half entry,4=invalid cursor decode.

## Interpretation and observation protocol

First collect timing only. CRC can stagger output starts and reduce concurrent
refill pressure, so perform checksum measurements separately and do not use
their apparent improvement to exonerate the timing hypothesis. Even timing
probes add work; compare enabled and disabled operation on the same binary.
Recompilation and layout changes also limit comparisons with2609093.

Allow90seconds to settle, announce the start of a60-second observation, then
announce its end and request physical feedback. Keep Solid, sender FPS,
brightness and settings fixed. Do not poll the controller or subscribe to
preview during the observation. Use absolute clock deadlines after any user
interruption. A shorter or longer actual window must be labelled accurately.

Counters are approximate across fields because reading does not stop the ISR.
Events reject an inconsistent stamp. Callback gaps over80us alone do not prove
underrun. Gaps over160us exclude preload, EOF/reset and transaction boundaries.
The TX cursor decode remains provisional until the expected alternate64/0
positions are observed. A target-half count is not a proven underrun count.
Raw error samples can repeat sticky status; zero errors do not exclude stale
wrapped reads. Probe cost maxima measure entry or exit separately; encode
duration includes entry-probe work. Counter wrap must be considered for long
tests. CPU frequency is captured when collection is armed and reported again
in telemetry.

Stable buffers together with validated late-entry evidence support stale RMT
memory reads. Neither measurement proves that every physical flash has this
cause or excludes a downstream fault. A Solid test cannot assess frame drops.
Motion and audio remain separate required outcomes after this diagnosis.

The review found no installation blocker. It also identified negative-result
limits: this probe does not measure start-to-first-threshold delay, and a reader
that enters the target half during encoding can evade the entry classification.
Zero anomaly counts therefore cannot rule out refill lateness.
